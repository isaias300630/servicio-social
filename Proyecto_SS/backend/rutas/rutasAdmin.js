// Rutas del administrador: catalogo de roles y alta de personal.
const express = require('express');
const bcrypt = require('bcrypt');
const { sql, getPool } = require('../db');

const router = express.Router();

// Catalogo de roles 
router.get('/roles', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            select id_rol, nombre_rol
            from catalogo_roles
            where nombre_rol != 'Alumno'
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error al obtener roles:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Alta de personal (jefe de SS, jefe de vinculacion u otro admin).
router.post('/crear-usuario', async (req, res) => {
    const { nombre, paterno, materno, correo, password, id_rol, departamento } = req.body;

    // Validacion basica: que no vengan vacios los datos obligatorios.
    if (!nombre || !paterno || !correo || !password || !id_rol) {
        return res.status(400).json({ success: false, mensaje: 'Faltan datos obligatorios' });
    }

    try {
        // Ciframos la contrasena antes de guardarla.
        const contrasenaCifrada = await bcrypt.hash(password, 10);

        const pool = await getPool();
        await pool.request()
            .input('correo', sql.VarChar, correo)
            .input('password', sql.VarChar, contrasenaCifrada)
            .input('id_rol', sql.Int, parseInt(id_rol))
            .input('nombre', sql.VarChar, nombre)
            .input('paterno', sql.VarChar, paterno)
            .input('materno', sql.VarChar, materno)
            .input('depto', sql.VarChar, departamento)
            .execute('sp_RegistrarCoordinador');

        res.json({ success: true, mensaje: 'Usuario creado exitosamente.' });
    } catch (err) {
        console.error('Error creando usuario:', err);
        res.status(500).json({ success: false, mensaje: 'Error al registrar el usuario' });
    }
});

module.exports = router;
