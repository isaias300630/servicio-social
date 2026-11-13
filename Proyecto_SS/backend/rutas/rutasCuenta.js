// Cambiar contrasena. 
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');

const router = express.Router();

// Politica: entre 10 y 64 caracteres, una mayuscula y un numero.
function contrasenaValida(p) {
    return typeof p === 'string' && p.length >= 10 && p.length <= 64 && /[A-Z]/.test(p) && /\d/.test(p);
}

router.post('/cambiar-contrasena', verificarSesion, async (req, res) => {
    const { actual, nueva } = req.body;
    const id = req.usuario.id_usuario;   

    if (!actual || !nueva) {
        return res.status(400).json({ success: false, mensaje: 'Escribe tu contraseña actual y la nueva' });
    }
    if (!contrasenaValida(nueva)) {
        return res.status(400).json({ success: false, mensaje: 'La nueva contraseña debe tener entre 10 y 64 caracteres, una mayúscula y un número' });
    }

    try {
        const pool = await getPool();

        // Traemos su contrasena cifrada.
        const r = await pool.request()
            .input('id', sql.Int, id)
            .query('select contrausu from usuarios where id_usuario = @id and activo_usu = 1');

        if (r.recordset.length === 0) {
            return res.status(404).json({ success: false, mensaje: 'Usuario no encontrado' });
        }
        // La actual debe ser correcta.
        if (!await bcrypt.compare(actual, r.recordset[0].contrausu)) {
            return res.status(400).json({ success: false, mensaje: 'La contraseña actual es incorrecta' });
        }

        // Gaurda la nueva contraseña cifrada y lo anotamos en la bitacora 
        const hash = await bcrypt.hash(nueva, 10);
        await pool.request()
            .input('id', sql.Int, id)
            .input('hash', sql.VarChar, hash)
            .query(`
                set xact_abort on;
                begin tran;
                    update usuarios set contrausu = @hash where id_usuario = @id;
                    insert into bitacora_logs (id_usuario, accion, detalles)
                    values (@id, 'Cambio de contrasena', 'El usuario cambio su contrasena');
                commit;
            `);

        res.json({ success: true, mensaje: 'Contraseña actualizada correctamente' });
    } catch (err) {
        console.error('Error al cambiar la contrasena:', err);
        res.status(500).json({ success: false, mensaje: 'Error interno del servidor' });
    }
});

module.exports = router;