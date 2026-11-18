// Rutas del alumno: panel, datos de contacto, solicitud de programa y documentos PDF.
const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { esIdValido, esTextoValido } = require('../validaciones');

const router = express.Router();

// El PDF llega en memoria (maximo 5 MB) y de ahi se guarda en la base.
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('archivo');
const MENSAJE_PDF = 'Solo se permiten archivos en formato PDF con un peso máximo de 5 MB';

// Maximo 5 subidas a la vez (5 x 5 MB) para no llenar la memoria del servidor.
const MAXIMO_SUBIDAS = 5;
let subidasEnCurso = 0;

// Todas las rutas /api/alumno piden sesion de Alumno.
router.use('/alumno', verificarSesion, (req, res, next) => {
    if (req.usuario.rol !== 'Alumno') {
        return res.status(403).json({ success: false, mensaje: 'Solo los alumnos pueden hacer esto' });
    }
    next();
});

// Todo lo que muestra el panel: datos, programa, documentos y fechas de reportes.
router.get('/alumno/panel', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .execute('sp_PerfilAlumno');

        res.json({
            alumno: r.recordsets[0][0],
            programa: r.recordsets[1][0] || null,
            documentos: r.recordsets[2],
            calendario: r.recordsets[3],
            constancia: (r.recordsets[4] && r.recordsets[4][0]) || null
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al cargar el panel');
    }
});

// Actualiza telefono, domicilio y direccion.
router.put('/alumno/datos', async (req, res) => {
    const { telefono, domicilio, direccion } = req.body;

    if (!/^\d{10}$/.test(telefono)) {
        return res.status(400).json({ success: false, mensaje: 'El teléfono debe tener 10 dígitos' });
    }
    if (!esTextoValido(domicilio, 255) || !esTextoValido(direccion, 255)) {
        return res.status(400).json({ success: false, mensaje: 'Escribe tu domicilio y dirección' });
    }

    try {
        const pool = await getPool();
        await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .input('telefono', sql.VarChar(10), String(telefono))
            .input('domicilio', sql.VarChar(255), domicilio.trim())
            .input('direccion', sql.VarChar(255), direccion.trim())
            .execute('sp_ActualizarDatosAlumno');

        res.json({ success: true, mensaje: 'Datos actualizados correctamente' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al actualizar datos');
    }
});

// Programas que el alumno puede elegir.
router.get('/alumno/programas', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .execute('sp_ProgramasDisponibles');
        res.json(r.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al listar programas');
    }
});

// El alumno solicita un programa.
router.post('/alumno/solicitud', async (req, res) => {
    if (!esIdValido(req.body.id_programa)) {
        return res.status(400).json({ success: false, mensaje: 'Selecciona un programa válido' });
    }

    try {
        const pool = await getPool();
        await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .input('id_programa', sql.Int, Number(req.body.id_programa))
            .execute('sp_SolicitarPrograma');

        res.status(201).json({ success: true, mensaje: 'Solicitud de programa registrada correctamente' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al solicitar programa');
    }
});

// Sube un PDF. Llega como formulario con los campos "tipo" y "archivo".
router.post('/alumno/documentos', (req, res) => {
    if (subidasEnCurso >= MAXIMO_SUBIDAS) {
        return res.status(503).json({ success: false, mensaje: 'Hay muchas subidas en este momento, intenta de nuevo en unos segundos' });
    }
    subidasEnCurso++;
    res.on('close', () => subidasEnCurso--);

    subida(req, res, async (errSubida) => {
        const archivo = req.file;

        // Pasa de 5 MB, no es .pdf 
        if (errSubida || !archivo || !archivo.originalname.toLowerCase().endsWith('.pdf')
            || archivo.buffer.subarray(0, 4).toString() !== '%PDF') {
            return res.status(400).json({ success: false, mensaje: MENSAJE_PDF });
        }

        try {
            const pool = await getPool();
            await pool.request()
                .input('id_usuario', sql.Int, req.usuario.id_usuario)
                .input('tipo', sql.VarChar(50), req.body.tipo)
                .input('nombre_archivo', sql.VarChar(255), Buffer.from(archivo.originalname, 'latin1').toString('utf8'))
                .input('tamano', sql.Int, archivo.size)
                .input('contenido', sql.VarBinary(sql.MAX), archivo.buffer)
                .execute('sp_SubirDocumento');

            res.status(201).json({ success: true, mensaje: 'Documento subido correctamente' });
        } catch (err) {
            responderErrorSql(res, err, 'Error al subir documento');
        }
    });
});

// Regresa un PDF del alumno para verlo.
router.get('/alumno/documentos/:id', async (req, res) => {
    if (!esIdValido(req.params.id)) {
        return res.status(400).json({ success: false, mensaje: 'El id no es válido' });
    }

    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .input('id_documento', sql.Int, Number(req.params.id))
            .execute('sp_ObtenerArchivoAlumno');

        if (r.recordset.length === 0) {
            return res.status(404).json({ success: false, mensaje: 'Documento no encontrado' });
        }
        res.type('application/pdf').send(r.recordset[0].contenido_pdf);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener el archivo');
    }
});

module.exports = router;