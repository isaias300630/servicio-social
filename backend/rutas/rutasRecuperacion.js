// Recuperacion de contrasena con codigo enviado al correo institucional.
// Guarda y verifica el estado del codigo directamente en Azure SQL (bitacora_logs),
// de modo que si el codigo se solicita en un servidor (ej. Codespace) y se verifica
// en otro (ej. Render o PC local), ambos comparten exactamente el mismo codigo.
//
// Flujo:
//   1. POST /api/recuperar-contrasena/solicitar    { correo }
//   2. POST /api/recuperar-contrasena/verificar    { correo, codigo }
//   3. POST /api/recuperar-contrasena/restablecer  { correo, codigo, nueva, confirmacion }
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const { responderErrorSql } = require('../errores');
const correoModulo = require('../correo');
const { esCorreoInstitucional, cumplePolitica, MENSAJE_POLITICA, DOMINIO } = require('../validaciones');

const router = express.Router();

// Reglas del codigo.
const DIGITOS_CODIGO = 6;
const MINUTOS_VIGENCIA = 15;   // el codigo vence a los 15 minutos
const MAXIMO_INTENTOS = 5;     // intentos para escribir el codigo antes de que deje de servir
const SEGUNDOS_ESPERA = 30;    // tiempo minimo entre una solicitud y otra
const MAXIMO_POR_HORA = 10;    // solicitudes de codigo por hora por usuario

// Clave fija para el HMAC del codigo para que cualquier servidor calcule el mismo hash.
const CLAVE_HMAC_CODIGO = 'recuperacion_ss_tecnm_culiacan_2026';

// Acciones en bitacora_logs para sincronizar entre servidores sin requerir CREATE TABLE.
const ACCION_GENERADO = 'Recuperacion: codigo generado';
const ACCION_FALLIDO  = 'Recuperacion: intento fallido';
const ACCION_USADO    = 'Recuperacion: contrasena restablecida';

const MENSAJE_SOLICITUD = 'Si el correo está registrado, recibirás un código para restablecer tu contraseña. ' +
    `Revisa tu bandeja de entrada y la carpeta de spam. El código vence en ${MINUTOS_VIGENCIA} minutos.`;

// Codigo numerico aleatorio seguro (ej. "048213").
function generarCodigo() {
    return crypto.randomInt(0, 10 ** DIGITOS_CODIGO).toString().padStart(DIGITOS_CODIGO, '0');
}

// El codigo nunca se guarda tal cual: se guarda su HMAC-SHA256 (64 caracteres hex).
function hashCodigo(correo, codigo) {
    return crypto
        .createHmac('sha256', CLAVE_HMAC_CODIGO)
        .update(`${correo}:${codigo}`)
        .digest('hex');
}

function leerCorreo(valor) {
    const correo = String(valor || '').trim().toLowerCase();
    return esCorreoInstitucional(correo) ? correo : null;
}

function leerCodigo(valor) {
    const codigo = String(valor || '').trim();
    return new RegExp(`^\\d{${DIGITOS_CODIGO}}$`).test(codigo) ? codigo : null;
}

async function registrarBitacora(pool, idUsuario, accion, detalles) {
    await pool.request()
        .input('id_usuario', sql.Int, idUsuario)
        .input('accion', sql.VarChar(255), accion)
        .input('detalles', sql.VarChar(sql.MAX), detalles)
        .execute('sp_RegistrarBitacora');
}

// Consulta en Azure SQL el ultimo codigo vigente del usuario y cuantos intentos lleva.
async function validarCodigoEnBD(pool, correo, codigo) {
    const usuRes = await pool.request()
        .input('correo', sql.VarChar(100), correo)
        .execute('sp_ValidarLogin');

    if (usuRes.recordset.length === 0) {
        return { error: 'El código no es válido o ya expiró. Solicita uno nuevo' };
    }

    const usuario = usuRes.recordset[0];

    // Busca el ultimo codigo generado en los ultimos 15 minutos (reloj del propio servidor SQL).
    const codRes = await pool.request()
        .input('id_usuario', sql.Int, usuario.id_usuario)
        .input('minutos', sql.Int, MINUTOS_VIGENCIA)
        .input('acc_gen', sql.VarChar(255), ACCION_GENERADO)
        .input('acc_fallo', sql.VarChar(255), ACCION_FALLIDO)
        .input('acc_usado', sql.VarChar(255), ACCION_USADO)
        .query(`
            declare @id_gen int, @hash_guardado varchar(max);

            select top 1
                @id_gen = id_log,
                @hash_guardado = detalles
            from bitacora_logs
            where id_usuario = @id_usuario
              and accion = @acc_gen
              and fecha_hora_bl > dateadd(minute, -@minutos, getdate())
            order by id_log desc;

            if @id_gen is null
            begin
                select 0 as existe;
                return;
            end

            declare @usado int = (
                select count(*) from bitacora_logs
                where id_usuario = @id_usuario and accion = @acc_usado and id_log > @id_gen
            );

            declare @intentos int = (
                select count(*) from bitacora_logs
                where id_usuario = @id_usuario and accion = @acc_fallo and id_log > @id_gen
            );

            select 1 as existe, @id_gen as id_gen, @hash_guardado as hash_guardado,
                   @usado as usado, @intentos as intentos;
        `);

    const estado = codRes.recordset[0];
    if (!estado || !estado.existe || estado.usado > 0 || estado.intentos >= MAXIMO_INTENTOS) {
        return { error: 'El código no es válido o ya expiró. Solicita uno nuevo' };
    }

    const hashRecibido = hashCodigo(correo, codigo);
    if (String(estado.hash_guardado).trim() !== hashRecibido) {
        const nuevosIntentos = estado.intentos + 1;
        await registrarBitacora(pool, usuario.id_usuario, ACCION_FALLIDO, `Intento fallido #${nuevosIntentos}`);
        const restantes = MAXIMO_INTENTOS - nuevosIntentos;
        return {
            error: restantes > 0
                ? `El código es incorrecto. Te quedan ${restantes} intento(s)`
                : 'El código es incorrecto y ya no es válido. Solicita uno nuevo'
        };
    }

    return { usuario };
}


// 1. Pedir el codigo. Se guarda su hash en Azure SQL y se manda por correo.
router.post('/recuperar-contrasena/solicitar', async (req, res) => {
    const correo = leerCorreo(req.body && req.body.correo);
    if (!correo) {
        return res.status(400).json({ success: false, mensaje: `Escribe tu correo institucional (@${DOMINIO})` });
    }

    try {
        const pool = await getPool();
        const consulta = await pool.request()
            .input('correo', sql.VarChar(100), correo)
            .execute('sp_ValidarLogin');

        if (consulta.recordset.length === 0) {
            return res.json({ success: true, mensaje: MENSAJE_SOLICITUD });
        }

        const usuario = consulta.recordset[0];

        // Revisa en la BD cuantas veces ha pedido codigo en el ultimo minuto / hora.
        const limRes = await pool.request()
            .input('id_usuario', sql.Int, usuario.id_usuario)
            .input('acc_gen', sql.VarChar(255), ACCION_GENERADO)
            .input('seg_espera', sql.Int, SEGUNDOS_ESPERA)
            .query(`
                select
                    sum(case when fecha_hora_bl > dateadd(second, -@seg_espera, getdate()) then 1 else 0 end) as recientes,
                    count(*) as en_hora
                from bitacora_logs
                where id_usuario = @id_usuario
                  and accion = @acc_gen
                  and fecha_hora_bl > dateadd(hour, -1, getdate());
            `);

        const { recientes, en_hora } = limRes.recordset[0];
        if ((recientes || 0) > 0 || (en_hora || 0) >= MAXIMO_POR_HORA) {
            return res.json({ success: true, mensaje: MENSAJE_SOLICITUD });
        }

        const codigo = generarCodigo();
        await registrarBitacora(pool, usuario.id_usuario, ACCION_GENERADO, hashCodigo(correo, codigo));

        // Se envia en segundo plano para responder de inmediato y pasar al paso 2 sin bloquear la pantalla.
        correoModulo.enviarCodigoRecuperacion(correo, usuario.nombre_completo, codigo, MINUTOS_VIGENCIA)
            .catch((errCorreo) => console.error('No se pudo enviar el correo de recuperación:', errCorreo.message));

        res.json({ success: true, mensaje: MENSAJE_SOLICITUD });
    } catch (err) {
        responderErrorSql(res, err, 'Error al solicitar código de recuperación');
    }
});


// 2. Revisar el codigo antes de mostrar el formulario de nueva contrasena.
router.post('/recuperar-contrasena/verificar', async (req, res) => {
    const correo = leerCorreo(req.body && req.body.correo);
    const codigo = leerCodigo(req.body && req.body.codigo);

    if (!correo || !codigo) {
        return res.status(400).json({
            success: false,
            mensaje: `Escribe tu correo institucional y el código de ${DIGITOS_CODIGO} dígitos que te llegó`
        });
    }

    try {
        const pool = await getPool();
        const { error } = await validarCodigoEnBD(pool, correo, codigo);
        if (error) {
            return res.status(400).json({ success: false, mensaje: error });
        }
        res.json({ success: true, mensaje: 'Código correcto. Ahora escribe tu nueva contraseña' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al verificar código de recuperación');
    }
});


// 3. Cambiar la contrasena usando el codigo. Aqui el codigo se marca como usado en Azure SQL.
router.post('/recuperar-contrasena/restablecer', async (req, res) => {
    const cuerpo = req.body || {};
    const correo = leerCorreo(cuerpo.correo);
    const codigo = leerCodigo(cuerpo.codigo);
    const { nueva, confirmacion } = cuerpo;

    if (!correo || !codigo) {
        return res.status(400).json({
            success: false,
            mensaje: `Escribe tu correo institucional y el código de ${DIGITOS_CODIGO} dígitos que te llegó`
        });
    }
    if (!nueva || !confirmacion) {
        return res.status(400).json({ success: false, mensaje: 'Escribe la nueva contraseña y su confirmación' });
    }
    if (nueva !== confirmacion) {
        return res.status(400).json({ success: false, mensaje: 'La nueva contraseña y su confirmación no coinciden' });
    }
    if (!cumplePolitica(nueva)) {
        return res.status(400).json({ success: false, mensaje: MENSAJE_POLITICA });
    }

    try {
        const pool = await getPool();
        const { error, usuario } = await validarCodigoEnBD(pool, correo, codigo);
        if (error) {
            return res.status(400).json({ success: false, mensaje: error });
        }

        // La nueva no puede ser igual a la que ya tiene.
        const actual = await pool.request()
            .input('id_usuario', sql.Int, usuario.id_usuario)
            .execute('sp_ObtenerContrasena');
        if (await bcrypt.compare(String(nueva), actual.recordset[0].contrausu)) {
            return res.status(400).json({ success: false, mensaje: 'La nueva contraseña debe ser diferente a la actual' });
        }

        const nuevaCifrada = await bcrypt.hash(nueva, 10);
        await pool.request()
            .input('id_usuario', sql.Int, usuario.id_usuario)
            .input('hash', sql.VarChar(255), nuevaCifrada)
            .execute('sp_CambiarContrasena');

        await registrarBitacora(pool, usuario.id_usuario, ACCION_USADO, 'La contraseña se restableció con código de recuperación');

        res.json({ success: true, mensaje: 'Contraseña restablecida correctamente. Ya puedes iniciar sesión' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al restablecer la contraseña');
    }
});

module.exports = router;
