// Rutas para validar los documentos de los alumnos (Jefe de Oficina y Jefe de Vinculacion).
const express = require('express');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { esIdValido, esEnteroEnRango } = require('../validaciones');

const router = express.Router();

// Todas las rutas 
router.use('/validacion', verificarSesion, (req, res, next) => {
    if (!['Jefe de Oficina de SS', 'Jefe de Vinculacion'].includes(req.usuario.rol)) {
        return res.status(403).json({ success: false, mensaje: 'Solo los jefes pueden validar documentos' });
    }
    next();
});

// Lista de documentos que esperan revision.
router.get('/validacion/pendientes', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().execute('sp_DocumentosPendientes');
        res.json(r.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al listar documentos pendientes');
    }
});

// Regresa el PDF para revisarlo.
router.get('/validacion/documentos/:id', async (req, res) => {
    if (!esIdValido(req.params.id)) {
        return res.status(400).json({ success: false, mensaje: 'El id no es válido' });
    }

    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_documento', sql.Int, Number(req.params.id))
            .execute('sp_ObtenerArchivoDocumento');

        if (r.recordset.length === 0 || !r.recordset[0].contenido_pdf) {
            return res.status(404).json({ success: false, mensaje: 'Documento no encontrado' });
        }
        res.type('application/pdf').send(r.recordset[0].contenido_pdf);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener el archivo');
    }
});

// Acepta o rechaza un documento: { estatus, comentario, porcentaje }
router.put('/validacion/documentos/:id', async (req, res) => {
    const { estatus, comentario, porcentaje } = req.body;
    const texto = String(comentario || '').trim();

    if (!esIdValido(req.params.id)) {
        return res.status(400).json({ success: false, mensaje: 'El id no es válido' });
    }
    if (estatus !== 'aceptado' && estatus !== 'rechazado') {
        return res.status(400).json({ success: false, mensaje: 'El estatus debe ser aceptado o rechazado' });
    }
    if (estatus === 'rechazado' && (texto.length === 0 || texto.length > 500)) {
        return res.status(400).json({ success: false, mensaje: 'Escribe qué le faltó al documento (máximo 500 caracteres)' });
    }
    // El porcentaje de creditos solo aplica al kardex y es opcional.
    if (porcentaje !== undefined && porcentaje !== null && porcentaje !== '' && !esEnteroEnRango(porcentaje, 0, 100)) {
        return res.status(400).json({ success: false, mensaje: 'El porcentaje de créditos debe ser de 0 a 100' });
    }

    try {
        const pool = await getPool();
        await pool.request()
            .input('id_documento', sql.Int, Number(req.params.id))
            .input('estatus', sql.VarChar(20), estatus)
            .input('comentario', sql.VarChar(500), texto || null)
            .input('porcentaje', sql.Int, porcentaje === undefined || porcentaje === null || porcentaje === '' ? null : Number(porcentaje))
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .execute('sp_ValidarDocumento');

        res.json({ success: true, mensaje: 'Estatus del documento actualizado correctamente' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al validar documento');
    }
});

module.exports = router;