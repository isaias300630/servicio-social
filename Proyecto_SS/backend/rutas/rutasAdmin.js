// Rutas del administrador: catalogo de roles y alta de personal.
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');

const router = express.Router();

// Correo institucional (misma lista que en rutasAcceso).
const DOMINIOS = ['culiacan.tecnm.mx'];
function esCorreoInstitucional(correo) {
    const c = (correo || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return false;
    return DOMINIOS.includes(c.split('@')[1]);
}
// Politica de contrasena: entre 10 y 64, una mayuscula y un numero.
const MIN_PASS = 10, MAX_PASS = 64;
function cumplePolitica(p) {
    if (typeof p !== 'string' || p.length < MIN_PASS || p.length > MAX_PASS) return false;
    return /[A-Z]/.test(p) && /\d/.test(p);
}
const MENSAJE_POLITICA = `La contraseña debe tener entre ${MIN_PASS} y ${MAX_PASS} caracteres, al menos una mayúscula y un número.`;
// Candado extra: deja pasar solo al Administrador.
function soloAdministrador(req, res, next) {
    if (req.usuario.rol !== 'Administrador') {
        return res.status(403).json({ success: false, mensaje: 'Solo el Administrador puede hacer esto' });
    }
    next();
}

// Catalogo de roles (sin incluir Alumno, que se da de alta por el forms).
router.get('/roles', verificarSesion, soloAdministrador, async (req, res) => {
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
        res.status(500).json({ success: false, mensaje: 'Error interno del servidor' });
    }
});

// Alta de personal (jefe de SS, jefe de vinculacion u otro admin).
router.post('/crear-usuario', verificarSesion, soloAdministrador, async (req, res) => {
    const { nombre, paterno, materno, correo, password, id_rol, departamento } = req.body;

    // Revisamos que no vengan vacios los datos obligatorios.
    if (!nombre || !paterno || !correo || !password || !id_rol) {
        return res.status(400).json({ success: false, mensaje: 'Faltan datos obligatorios' });
    }

    // El correo del personal debe ser institucional.
    const correoPersonal = (correo || '').trim().toLowerCase();
    if (!esCorreoInstitucional(correoPersonal)) {
        return res.status(400).json({ success: false, mensaje: 'El correo debe ser institucional.' });
    }

    
    // La contrasena debe cumplir la politica.
    if (!cumplePolitica(password)) {
        return res.status(400).json({ success: false, mensaje: MENSAJE_POLITICA });
    }

    try {
        // Ciframos la contrasena antes de guardarla.
        const contrasenaCifrada = await bcrypt.hash(password, 10);

        const pool = await getPool();
        await pool.request()
            .input('correo', sql.VarChar, correoPersonal)
            .input('password', sql.VarChar, contrasenaCifrada)
            .input('id_rol', sql.Int, parseInt(id_rol))
            .input('nombre', sql.VarChar, nombre)
            .input('paterno', sql.VarChar, paterno)
            .input('materno', sql.VarChar, materno)
            .input('depto', sql.VarChar, departamento)
            .execute('sp_RegistrarCoordinador');

        res.status(201).json({ success: true, mensaje: 'Usuario creado exitosamente.' });
    } catch (err) {
        // 2627 y 2601 son los errores de SQL cuando el correo ya existe.
        if (err.number === 2627 || err.number === 2601) {
            return res.status(409).json({ success: false, mensaje: 'Ese correo ya esta registrado' });
        }
        console.error('Error creando usuario:', err);
        res.status(500).json({ success: false, mensaje: 'Error al registrar el usuario' });
    }
});

module.exports = router;