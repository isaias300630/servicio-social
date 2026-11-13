// Rutas de acceso: login (con JWT) y alta de alumnos desde el formulario.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../db');
const { responderErrorSql } = require('../errores');
const { esCorreoInstitucional, esTextoValido, esEnteroEnRango } = require('../validaciones');

const router = express.Router();

// Alta de alumno desde el formulario del curso de induccion.
router.post('/webhook/forms', async (req, res) => {
    // Si hay clave secreta configurada, solo aceptamos peticiones que la traigan (las del Apps Script).
    if (process.env.CLAVE_FORMS && req.headers['x-clave-forms'] !== process.env.CLAVE_FORMS) {
        return res.status(401).json({ success: false, mensaje: 'No autorizado' });
    }

    const { nControl, nombre, apePaterno, apeMaterno, correo, carrera, semestre } = req.body;

    // Datos obligatorios 
    if (!nControl || !esTextoValido(nombre, 100) || !esTextoValido(apePaterno, 100) || !esTextoValido(carrera, 100) || !correo) {
        return res.status(400).json({ success: false, mensaje: 'Faltan datos obligatorios' });
    }

    // Numero de control: 8 digitos, a veces con una letra al inicio.
    const numeroControl = String(nControl).trim().toUpperCase();
    if (!/^[A-Z]?\d{8}$/.test(numeroControl)) {
        return res.status(400).json({ success: false, mensaje: 'El número de control no es válido' });
    }

    const correoAlumno = String(correo).trim().toLowerCase();
    if (!esCorreoInstitucional(correoAlumno)) {
        return res.status(400).json({ success: false, mensaje: 'El correo debe terminar en @culiacan.tecnm.mx' });
    }

    if (!esEnteroEnRango(semestre, 1, 15)) {
        return res.status(400).json({ success: false, mensaje: 'El semestre no es válido' });
    }

    try {
        // Contrasena por defecto, cifrada antes de guardarse.
        const contrasenaCifrada = await bcrypt.hash('12345', 10);

        // Plan segun el anio del numero de control 
        const anio = parseInt(numeroControl.replace(/^[A-Z]/, '').substring(0, 2));
        const planEstudios = anio >= 23 ? 'Plan Nuevo' : 'Plan Viejo';

        const pool = await getPool();
        await pool.request()
            .input('numero_control', sql.VarChar(20), numeroControl)
            .input('correo', sql.VarChar(100), correoAlumno)
            .input('password', sql.VarChar(255), contrasenaCifrada)
            .input('nombre', sql.VarChar(100), nombre.trim())
            .input('paterno', sql.VarChar(100), apePaterno.trim())
            .input('materno', sql.VarChar(100), apeMaterno ? String(apeMaterno).trim() : null)
            .input('carrera', sql.VarChar(100), carrera.trim())
            .input('semestre', sql.Int, Number(semestre))
            .input('plan_estudios', sql.VarChar(50), planEstudios)
            .execute('sp_RegistrarAlumno');

        console.log(`Alumno ${numeroControl} registrado (${planEstudios}).`);
        res.status(201).json({ success: true, mensaje: 'Registro exitoso' });
    } catch (err) {
        responderErrorSql(res, err, 'Error guardando alumno');
    }
});

// Login para todos los roles.
router.post('/login', async (req, res) => {
    const { correo_institucional, password } = req.body;

    if (!correo_institucional || !password) {
        return res.status(400).json({ success: false, mensaje: 'Faltan el correo o la contraseña' });
    }

    const correoLogin = String(correo_institucional).trim().toLowerCase();
    if (!esCorreoInstitucional(correoLogin)) {
        return res.status(400).json({ success: false, mensaje: 'Usa tu correo institucional' });
    }

    try {
        const pool = await getPool();
        const resultado = await pool.request()
            .input('correo', sql.VarChar(100), correoLogin)
            .execute('sp_ValidarLogin');

        // No existe el correo o el usuario esta inactivo.
        if (resultado.recordset.length === 0) {
            return res.status(401).json({ success: false, mensaje: 'Correo o contraseña incorrectos' });
        }

        const usuario = resultado.recordset[0];

        // Comparamos la contrasena escrita contra la cifrada guardada.
        const contrasenaCorrecta = await bcrypt.compare(String(password), usuario.contrausu);
        if (!contrasenaCorrecta) {
            return res.status(401).json({ success: false, mensaje: 'Correo o contraseña incorrectos' });
        }

        // Token de sesion (dura 8 horas).
        const token = jwt.sign(
            { id_usuario: usuario.id_usuario, rol: usuario.rol, numero_control: usuario.numero_control },
            process.env.CLAVE_SECRETA,
            { expiresIn: '8h' }
        );

        // Registra el acceso en la bitacora (si falla, el usuario entra de todos modos).
        try {
            await pool.request()
                .input('id_usuario', sql.Int, usuario.id_usuario)
                .input('accion', sql.VarChar(255), 'Inicio de sesion')
                .input('detalles', sql.VarChar(sql.MAX), 'Ingresó como ' + usuario.rol)
                .execute('sp_RegistrarBitacora');
        } catch (errBitacora) {
            console.error('No se pudo registrar el acceso en la bitacora:', errBitacora.message);
        }

        res.json({
            success: true,
            mensaje: 'Inicio de sesión exitoso',
            token: token,
            nombre: usuario.nombre_completo,
            rol: usuario.rol,
            numero_control: usuario.numero_control || 'N/A'
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error en el login');
    }
});

module.exports = router;
