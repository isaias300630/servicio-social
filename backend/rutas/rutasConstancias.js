// Constancias de terminacion del servicio social.

const express = require('express');
const multer = require('multer');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { esIdValido } = require('../validaciones');

const router = express.Router();

// El PDF llega en memoria (maximo 5 MB) y de ahi se guarda en la base
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('archivo');
const MENSAJE_PDF = 'Solo se permiten archivos en formato PDF con un peso máximo de 5 MB';

// Candado: solo el Jefe de Vinculacion sube constancias.
function soloVinculacion(req, res, next) {
    if (req.usuario.rol !== 'Jefe de Vinculacion') {
        return res.status(403).json({ success: false, mensaje: 'Solo el Jefe de Vinculación puede enviar constancias' });
    }
    next();
}

// Id entero positivo que cabe en un int de SQL.
function idCorrecto(valor) {
    return esIdValido(valor) && Number(valor) <= 2147483647;
}

// Alumnos con servicio activo y el estatus de sus requisitos.
router.get('/constancias/alumnos', verificarSesion, soloVinculacion, async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().execute('sp_AlumnosParaConstancia');
        res.json(r.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al listar alumnos');
    }
});

// Sube la constancia de un alumno. Llega como formulario con los campos "id_expediente" y "archivo".
router.post('/constancias', verificarSesion, soloVinculacion, (req, res) => {
    subida(req, res, async (errSubida) => {
        const archivo = req.file;

        // Pasa de 5 MB, no es .pdf 
        if (errSubida || !archivo || !archivo.originalname.toLowerCase().endsWith('.pdf')
            || archivo.buffer.subarray(0, 4).toString() !== '%PDF') {
            return res.status(400).json({ success: false, mensaje: MENSAJE_PDF });
        }
        if (!idCorrecto(req.body.id_expediente)) {
            return res.status(400).json({ success: false, mensaje: 'El servicio social no es válido' });
        }

        try {
            const pool = await getPool();
            const r = await pool.request()
                .input('id_usuario', sql.Int, req.usuario.id_usuario)
                .input('id_expediente', sql.Int, Number(req.body.id_expediente))
                .input('nombre_archivo', sql.VarChar(255), Buffer.from(archivo.originalname, 'latin1').toString('utf8'))
                .input('contenido', sql.VarBinary(sql.MAX), archivo.buffer)
                .execute('sp_SubirConstancia');

            const { id_constancia, folio, reemplazo } = r.recordset[0];
            res.status(201).json({
                success: true,
                mensaje: reemplazo ? `Constancia ${folio} reemplazada` : `Constancia enviada al alumno con folio ${folio}`,
                id_constancia,
                folio
            });
        } catch (err) {
            responderErrorSql(res, err, 'Error al subir la constancia');
        }
    });
});

// Regresa el PDF de una constancia para verlo o descargarlo.
router.get('/constancias/:id/pdf', verificarSesion, async (req, res) => {
    if (!idCorrecto(req.params.id)) {
        return res.status(400).json({ success: false, mensaje: 'La constancia no es válida' });
    }

    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .input('id_constancia', sql.Int, Number(req.params.id))
            .execute('sp_ObtenerArchivoConstancia');

        if (r.recordset.length === 0) {
            return res.status(404).json({ success: false, mensaje: 'Constancia no encontrada' });
        }
        res.type('application/pdf').send(r.recordset[0].contenido_pdf);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener la constancia');
    }
});

module.exports = router;