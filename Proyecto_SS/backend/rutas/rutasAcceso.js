// Rutas de acceso: login (con JWT) y alta de alumnos desde el formulario.
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql, getPool } = require('../db');

const router = express.Router();

// Alta de alumno desde el formulario institucional.
router.post('/webhook/forms', async (req, res) => {
    try {
        const { nControl, nombre, apePaterno, apeMaterno, correo, carrera, semestre } = req.body;

        // Contrasena por defecto, cifrada antes de guardarse.
        const contrasenaCifrada = await bcrypt.hash('12345', 10);

        // Regla de negocio: plan viejo y nuevo
        const prefijoAnio = parseInt(nControl.substring(0, 2));
        const planEstudios = prefijoAnio >= 23 ? 'Plan Nuevo' : 'Plan Viejo';

        const pool = await getPool();
        await pool.request()
            .input('numero_control', sql.VarChar, nControl)
            .input('correo', sql.VarChar, correo)
            .input('password', sql.VarChar, contrasenaCifrada)
            .input('nombre', sql.VarChar, nombre)
            .input('paterno', sql.VarChar, apePaterno)
            .input('materno', sql.VarChar, apeMaterno)
            .input('carrera', sql.VarChar, carrera)
            .input('semestre', sql.Int, parseInt(semestre))
            .input('plan_estudios', sql.VarChar, planEstudios)
            .execute('sp_RegistrarAlumno');

        console.log(`Alumno ${nombre} registrado (${planEstudios}).`);
        res.status(200).json({ success: true, mensaje: 'Registro exitoso' });
    } catch (err) {
        console.error('Error guardando alumno:', err);
        res.status(500).json({ success: false, mensaje: 'Error interno del servidor' });
    }
});

// Login 
router.post('/login', async (req, res) => {
    const { correo_institucional, password } = req.body;

    // Validacion basica: que no vengan vacios.
    if (!correo_institucional || !password) {
        return res.status(400).json({ success: false, mensaje: 'Faltan el correo o la contrasena' });
    }

    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('correo', sql.VarChar, correo_institucional)
            .execute('sp_ValidarLogin');

        // Si no existe el correo o el usuario esta inactivo.
        if (result.recordset.length === 0) {
            return res.status(401).json({ success: false, mensaje: 'Correo o contrasena incorrectos o usuario inactivo' });
        }

        const usuario = result.recordset[0];

        // Comparamos la contrasena escrita contra la cifrada guardada.
        const contrasenaCorrecta = await bcrypt.compare(password, usuario.contrausu);
        if (!contrasenaCorrecta) {
            return res.status(401).json({ success: false, mensaje: 'Correo o contrasena incorrectos' });
        }

        // Generamos el token de sesion (dura 8 horas).
        const token = jwt.sign(
            {
                id_usuario: usuario.id_usuario,
                rol: usuario.rol,
                numero_control: usuario.numero_control
            },
            process.env.CLAVE_SECRETA,
            { expiresIn: '8h' }
        );

        res.json({
            success: true,
            mensaje: 'Inicio de sesion exitoso',
            token: token,
            nombre: usuario.nombre_completo,
            rol: usuario.rol,
            numero_control: usuario.numero_control || 'N/A'
        });
    } catch (err) {
        console.error('Error en el login:', err);
        res.status(500).json({ success: false, mensaje: 'Error interno en el servidor' });
    }
});

module.exports = router;
