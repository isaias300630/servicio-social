// Rutas del administrador: catalogo de roles y alta de personal.
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { esCorreoInstitucional, cumplePolitica, MENSAJE_POLITICA, esIdValido, esTextoValido } = require('../validaciones');

const router = express.Router();

// Candado extra: deja pasar solo al Administrador.
function soloAdministrador(req, res, next) {
    if (req.usuario.rol !== 'Administrador') {
        return res.status(403).json({ success: false, mensaje: 'Solo el Administrador puede hacer esto' });
    }
    next();
}

// Roles que se pueden asignar 
router.get('/roles', verificarSesion, soloAdministrador, async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request().execute('sp_ObtenerRoles');
        res.json(resultado.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener roles');
    }
});

// Alta de personal (Jefe de Oficina, Jefe de Vinculacion u otro Administrador).
router.post('/crear-usuario', verificarSesion, soloAdministrador, async (req, res) => {
    const { nombre, paterno, materno, correo, password, id_rol, departamento } = req.body;

    // Datos obligatorios.
    if (!esTextoValido(nombre, 100) || !esTextoValido(paterno, 100) || !correo || !password || !id_rol) {
        return res.status(400).json({ success: false, mensaje: 'Faltan datos obligatorios' });
    }
    if (!esCorreoInstitucional(correo)) {
        return res.status(400).json({ success: false, mensaje: 'El correo debe ser institucional (@culiacan.tecnm.mx)' });
    }
    // Politica de contrasenas.
    if (!cumplePolitica(password)) {
        return res.status(400).json({ success: false, mensaje: MENSAJE_POLITICA });
    }
    if (!esIdValido(id_rol)) {
        return res.status(400).json({ success: false, mensaje: 'El rol no es válido' });
    }

    try {
        const contrasenaCifrada = await bcrypt.hash(password, 10);

        // El procedimiento revisa que el rol exista y que el correo no este repetido.
        const pool = await getPool();
        await pool.request()
            .input('correo', sql.VarChar(100), correo.trim().toLowerCase())
            .input('password', sql.VarChar(255), contrasenaCifrada)
            .input('id_rol', sql.Int, Number(id_rol))
            .input('nombre', sql.VarChar(100), nombre.trim())
            .input('paterno', sql.VarChar(100), paterno.trim())
            .input('materno', sql.VarChar(100), materno ? String(materno).trim() : null)
            .input('depto', sql.VarChar(100), departamento ? String(departamento).trim() : null)
            .input('id_admin', sql.Int, req.usuario.id_usuario)
            .execute('sp_RegistrarPersonal');

        res.status(201).json({ success: true, mensaje: 'Usuario registrado correctamente' });
    } catch (err) {
        responderErrorSql(res, err, 'Error creando usuario');
    }
});

module.exports = router;
