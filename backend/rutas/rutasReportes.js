// Reporte de alumnos activos que no han entregado su reporte bimestral (CU12).
// Solo lo usa el Jefe de Oficina de SS porque muestra datos personales de todos los alumnos.
const express = require('express');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { esIdValido, esEnteroEnRango } = require('../validaciones');

const router = express.Router();

// Todas las rutas /api/reportes piden sesion de Jefe de Oficina.
router.use('/reportes', verificarSesion, (req, res, next) => {
    if (req.usuario.rol !== 'Jefe de Oficina de SS' && req.usuario.rol !== 'Jefe de Vinculacion') {
        return res.status(403).json({ success: false, mensaje: 'Solo el Jefe de Oficina de SS puede ver este reporte' });
    }
    next();
});

// Carreras para el filtro de la pantalla.
router.get('/reportes/carreras', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().execute('sp_ListarCarreras');
        res.json(r.recordset.map(fila => fila.carrera));
    } catch (err) {
        responderErrorSql(res, err, 'Error al listar carreras');
    }
});

// Alumnos sin reporte bimestral.
// Parametros en la URL: bimestre (1 a 3, obligatorio), periodo (id, opcional: sin el se usa el activo)
// y carrera (opcional).
router.get('/reportes/sin-reporte-bimestral', async (req, res) => {
    const { bimestre, periodo, carrera } = req.query;

    if (!esEnteroEnRango(bimestre, 1, 3)) {
        return res.status(400).json({ success: false, mensaje: 'Selecciona el bimestre (1, 2 o 3)' });
    }
    if (periodo !== undefined && periodo !== '' && !esIdValido(periodo)) {
        return res.status(400).json({ success: false, mensaje: 'El periodo no es válido' });
    }
    const carreraLimpia = typeof carrera === 'string' ? carrera.trim() : '';
    if (carreraLimpia.length > 100) {
        return res.status(400).json({ success: false, mensaje: 'La carrera no es válida' });
    }

    try {
        // El procedimiento tambien deja la consulta en la bitacora.
        const pool = await getPool();
        const r = await pool.request()
            .input('id_periodo', sql.Int, periodo ? Number(periodo) : null)
            .input('bimestre', sql.Int, Number(bimestre))
            .input('carrera', sql.VarChar(100), carreraLimpia || null)
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .execute('sp_ReporteSinReporteBimestral');

        const resumen = r.recordsets[0][0];
        const alumnos = r.recordsets[1];

        res.json({
            success: true,
            resumen,
            alumnos,
            mensaje: alumnos.length === 0
                ? 'No se encontraron alumnos pendientes de entrega de reporte bimestral para el criterio seleccionado'
                : null
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al generar el reporte');
    }
});

module.exports = router;
