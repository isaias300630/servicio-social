// Recuperacion de contrasena con codigo enviado al correo institucional.
// Usa los procedimientos almacenados que ya existen en la BD (sp_ValidarLogin,
// sp_ObtenerContrasena, sp_CambiarContrasena y sp_RegistrarBitacora), de modo que
// funciona con los permisos actuales del usuario de aplicacion sin requerir CREATE TABLE.
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
const { enviarCodigoRecuperacion } = require('../correo');
const { esCorreoInstitucional, cumplePolitica, MENSAJE_POLITICA, DOMINIO } = require('../validaciones');

const router = express.Router();

// Reglas del codigo.
const DIGITOS_CODIGO = 6;
const MINUTOS_VIGENCIA = 15;   // el codigo vence a los 15 minutos
const MAXIMO_INTENTOS = 5;     // intentos para escribir el codigo antes de que deje de servir
const SEGUNDOS_ESPERA = 60;    // tiempo minimo entre una solicitud y otra
const MAXIMO_POR_HORA = 5;     // solicitudes de codigo por hora por usuario

// Siempre se responde lo mismo al solicitar, exista o no el correo,
// para que nadie pueda averiguar que correos estan registrados.
const MENSAJE_SOLICITUD = 'Si el correo está registrado, recibirás un código para restablecer tu contraseña. ' +
    `Revisa tu bandeja de entrada y la carpeta de spam. El código vence en ${MINUTOS_VIGENCIA} minutos.`;

// Almacen en memoria de codigos activos por correo:
// correo -> { id_usuario, codigoHash, expiraEn, intentos, usado, historialSolicitudes: [timestamps] }
const codigosPorCorreo = new Map();

// Codigo numerico aleatorio seguro (ej. "048213").
function generarCodigo() {
    return crypto.randomInt(0, 10 ** DIGITOS_CODIGO).toString().padStart(DIGITOS_CODIGO, '0');
}

// El codigo nunca se guarda tal cual: se guarda su HMAC-SHA256 (64 caracteres hex).
function hashCodigo(correo, codigo) {
    return crypto
        .createHmac('sha256', process.env.CLAVE_SECRETA || 'servicio_social_tecnm_2026')
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

async function registrarBitacora(pool, idUsuario, detalles) {
    try {
        await pool.request()
            .input('id_usuario', sql.Int, idUsuario)
            .input('accion', sql.VarChar(255), 'Recuperacion de contrasena')
            .input('detalles', sql.VarChar(sql.MAX), detalles)
            .execute('sp_RegistrarBitacora');
    } catch (err) {
        console.error('No se pudo registrar en la bitacora:', err.message);
    }
}

// Revisa que el codigo sea valido y siga vigente.
async function validarCodigoEnMemoria(pool, correo, codigo) {
    const registro = codigosPorCorreo.get(correo);
    const ahora = Date.now();

    if (!registro || registro.usado || ahora >= registro.expiraEn || registro.intentos >= MAXIMO_INTENTOS) {
        return { error: 'El código no es válido o ya expiró. Solicita uno nuevo' };
    }

    const hashRecibido = hashCodigo(correo, codigo);
    if (registro.codigoHash !== hashRecibido) {
        registro.intentos += 1;
        if (registro.intentos >= MAXIMO_INTENTOS) {
            registro.usado = true;
        }
        const restantes = MAXIMO_INTENTOS - registro.intentos;
        await registrarBitacora(pool, registro.id_usuario, 'Se capturó un código de recuperación incorrecto');
        return {
            error: restantes > 0
                ? `El código es incorrecto. Te quedan ${restantes} intento(s)`
                : 'El código es incorrecto y ya no es válido. Solicita uno nuevo'
        };
    }

    return { registro };
}


// 1. Pedir el codigo. Se manda por correo.
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

        // Si el correo no existe o esta inactivo, respondemos igual sin hacer nada.
        if (consulta.recordset.length === 0) {
            return res.json({ success: true, mensaje: MENSAJE_SOLICITUD });
        }

        const usuario = consulta.recordset[0];
        const ahora = Date.now();
        const previo = codigosPorCorreo.get(correo);
        const historial = (previo ? previo.historialSolicitudes : []).filter(t => ahora - t < 3600 * 1000);
        const ultimaSolicitud = historial.length > 0 ? historial[historial.length - 1] : 0;

        // Limite de 1 por minuto y 5 por hora.
        if ((ahora - ultimaSolicitud < SEGUNDOS_ESPERA * 1000) || historial.length >= MAXIMO_POR_HORA) {
            await registrarBitacora(pool, usuario.id_usuario, 'Solicitud de código rechazada por exceso de solicitudes');
            return res.json({ success: true, mensaje: MENSAJE_SOLICITUD });
        }

        const codigo = generarCodigo();
        historial.push(ahora);

        codigosPorCorreo.set(correo, {
            id_usuario: usuario.id_usuario,
            codigoHash: hashCodigo(correo, codigo),
            expiraEn: ahora + MINUTOS_VIGENCIA * 60 * 1000,
            intentos: 0,
            usado: false,
            historialSolicitudes: historial
        });

        await registrarBitacora(pool, usuario.id_usuario, 'Se generó un código de recuperación');

        enviarCodigoRecuperacion(correo, usuario.nombre_completo, codigo, MINUTOS_VIGENCIA)
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
        const { error } = await validarCodigoEnMemoria(pool, correo, codigo);
        if (error) {
            return res.status(400).json({ success: false, mensaje: error });
        }
        res.json({ success: true, mensaje: 'Código correcto. Ahora escribe tu nueva contraseña' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al verificar código de recuperación');
    }
});


// 3. Cambiar la contrasena usando el codigo. Aqui el codigo se gasta.
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
        const { error, registro } = await validarCodigoEnMemoria(pool, correo, codigo);
        if (error) {
            return res.status(400).json({ success: false, mensaje: error });
        }

        // La nueva no puede ser igual a la que ya tiene.
        const actual = await pool.request()
            .input('id_usuario', sql.Int, registro.id_usuario)
            .execute('sp_ObtenerContrasena');
        if (await bcrypt.compare(String(nueva), actual.recordset[0].contrausu)) {
            return res.status(400).json({ success: false, mensaje: 'La nueva contraseña debe ser diferente a la actual' });
        }

        const nuevaCifrada = await bcrypt.hash(nueva, 10);
        await pool.request()
            .input('id_usuario', sql.Int, registro.id_usuario)
            .input('hash', sql.VarChar(255), nuevaCifrada)
            .execute('sp_CambiarContrasena');

        registro.usado = true;
        await registrarBitacora(pool, registro.id_usuario, 'La contraseña se restableció con código de recuperación');

        res.json({ success: true, mensaje: 'Contraseña restablecida correctamente. Ya puedes iniciar sesión' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al restablecer la contraseña');
    }
});

module.exports = router;
