// Recuperacion de contrasena con codigo enviado al correo institucional.
// Flujo:
//   1. POST /api/recuperar-contrasena/solicitar    { correo }
//   2. POST /api/recuperar-contrasena/verificar    { correo, codigo }              (opcional, para validar en la pantalla)
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

// Codigo numerico aleatorio seguro (ej. "048213").
function generarCodigo() {
    return crypto.randomInt(0, 10 ** DIGITOS_CODIGO).toString().padStart(DIGITOS_CODIGO, '0');
}

// El codigo nunca se guarda tal cual: se guarda su HMAC-SHA256 (64 caracteres hex).
// Se mezcla con el correo para que dos usuarios con el mismo codigo no tengan el mismo hash.
function hashCodigo(correo, codigo) {
    return crypto
        .createHmac('sha256', process.env.CLAVE_SECRETA)
        .update(`${correo}:${codigo}`)
        .digest('hex');
}

// Limpia y valida correo y codigo que llegan en el cuerpo.
function leerCorreo(valor) {
    const correo = String(valor || '').trim().toLowerCase();
    return esCorreoInstitucional(correo) ? correo : null;
}

function leerCodigo(valor) {
    const codigo = String(valor || '').trim();
    return new RegExp(`^\\d{${DIGITOS_CODIGO}}$`).test(codigo) ? codigo : null;
}

// Llama al procedimiento que revisa el codigo; regresa { id_recuperacion, id_usuario }.
async function verificarCodigo(pool, correo, codigo) {
    const resultado = await pool.request()
        .input('correo', sql.VarChar(100), correo)
        .input('codigo_hash', sql.Char(64), hashCodigo(correo, codigo))
        .input('maximo_intentos', sql.Int, MAXIMO_INTENTOS)
        .execute('sp_VerificarCodigoRecuperacion');
    return resultado.recordset[0];
}


// 1. Pedir el codigo. Se manda por correo.
router.post('/recuperar-contrasena/solicitar', async (req, res) => {
    const correo = leerCorreo(req.body && req.body.correo);
    if (!correo) {
        return res.status(400).json({ success: false, mensaje: `Escribe tu correo institucional (@${DOMINIO})` });
    }

    try {
        const codigo = generarCodigo();
        const pool = await getPool();
        const resultado = await pool.request()
            .input('correo', sql.VarChar(100), correo)
            .input('codigo_hash', sql.Char(64), hashCodigo(correo, codigo))
            .input('minutos_vigencia', sql.Int, MINUTOS_VIGENCIA)
            .input('segundos_espera', sql.Int, SEGUNDOS_ESPERA)
            .input('maximo_por_hora', sql.Int, MAXIMO_POR_HORA)
            .execute('sp_CrearCodigoRecuperacion');

        const fila = resultado.recordset[0];

        if (fila.resultado === 'ok') {
            // No se espera el envio: asi la respuesta tarda lo mismo exista o no el correo.
            // Si falla, no se le dice al usuario (para no revelar que el correo existe); queda en la consola.
            enviarCodigoRecuperacion(correo, fila.nombre, codigo, MINUTOS_VIGENCIA)
                .catch((errCorreo) => console.error('No se pudo enviar el correo de recuperación:', errCorreo.message));
        }

        res.json({ success: true, mensaje: MENSAJE_SOLICITUD });
    } catch (err) {
        responderErrorSql(res, err, 'Error al solicitar código de recuperación');
    }
});


// 2. Revisar el codigo antes de mostrar el formulario de nueva contrasena.
//    No gasta el codigo; solo confirma que es correcto (los errores si cuentan como intento).
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
        await verificarCodigo(pool, correo, codigo);
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

        // Revisa el codigo (si esta mal, suma un intento y responde el error).
        const { id_recuperacion, id_usuario } = await verificarCodigo(pool, correo, codigo);

        // La nueva no puede ser igual a la que ya tiene.
        const actual = await pool.request()
            .input('id_usuario', sql.Int, id_usuario)
            .execute('sp_ObtenerContrasena');
        if (await bcrypt.compare(String(nueva), actual.recordset[0].contrausu)) {
            return res.status(400).json({ success: false, mensaje: 'La nueva contraseña debe ser diferente a la actual' });
        }

        const nuevaCifrada = await bcrypt.hash(nueva, 10);
        await pool.request()
            .input('id_recuperacion', sql.Int, id_recuperacion)
            .input('hash', sql.VarChar(255), nuevaCifrada)
            .execute('sp_RestablecerContrasena');

        res.json({ success: true, mensaje: 'Contraseña restablecida correctamente. Ya puedes iniciar sesión' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al restablecer la contraseña');
    }
});

module.exports = router;
