// Cambiar contrasena. Sirve para cualquier usuario con sesion iniciada.
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { cumplePolitica, MENSAJE_POLITICA } = require('../validaciones');

const router = express.Router();

router.post('/cambiar-contrasena', verificarSesion, async (req, res) => {
    const { actual, nueva, confirmacion } = req.body;
    const idUsuario = req.usuario.id_usuario;

    if (!actual || !nueva) {
        return res.status(400).json({ success: false, mensaje: 'Escribe tu contraseña actual y la nueva' });
    }
    
    if (confirmacion !== undefined && nueva !== confirmacion) {
        return res.status(400).json({ success: false, mensaje: 'La nueva contraseña y su confirmación no coinciden' });
    }
    if (!cumplePolitica(nueva)) {
        return res.status(400).json({ success: false, mensaje: MENSAJE_POLITICA });
    }
    if (nueva === actual) {
        return res.status(400).json({ success: false, mensaje: 'La nueva contraseña debe ser diferente a la actual' });
    }

    try {
        const pool = await getPool();

        // Traemos su contrasena cifrada 
        const resultado = await pool.request()
            .input('id_usuario', sql.Int, idUsuario)
            .execute('sp_ObtenerContrasena');

        // La actual debe ser correcta.
        const actualCorrecta = await bcrypt.compare(String(actual), resultado.recordset[0].contrausu);
        if (!actualCorrecta) {
            return res.status(400).json({ success: false, mensaje: 'La contraseña actual es incorrecta' });
        }

        // Guardamos la nueva cifrada 
        const nuevaCifrada = await bcrypt.hash(nueva, 10);
        await pool.request()
            .input('id_usuario', sql.Int, idUsuario)
            .input('hash', sql.VarChar(255), nuevaCifrada)
            .execute('sp_CambiarContrasena');

        res.json({ success: true, mensaje: 'Contraseña actualizada correctamente' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al cambiar la contrasena');
    }
});

module.exports = router;
