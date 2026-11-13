// Rutas de programas de servicio social: catalogos
const express = require('express');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { esIdValido, esEnteroEnRango } = require('../validaciones');

const router = express.Router();

// Candado extra: deja pasar solo si el usuario es Jefe de Oficina de SS.
function soloJefeOficina(req, res, next) {
    if (req.usuario.rol !== 'Jefe de Oficina de SS') {
        return res.status(403).json({ success: false, mensaje: 'Solo el Jefe de Oficina de SS puede hacer esto' });
    }
    next();
}

// Revisa que el id de la URL sea un numero antes de ir a la base.
function revisarId(req, res, next) {
    if (!esIdValido(req.params.id)) {
        return res.status(400).json({ success: false, mensaje: 'El id del programa no es válido' });
    }
    next();
}

// Valores permitidos en las listas del formulario.
const ESTATUS = ['pendiente', 'aprobado', 'rechazado'];
const ORIGENES = ['banco', 'propuesta'];
const PLANES = [ 'Plan Nuevo', 'Plan Viejo'];


const LARGOS = {
    folio: 50, nombre: 150, tipo: 50, area: 100,
    responsable: 100, puesto: 100, horario: 255, motivo: 300
};

// Revisa y limpia lo que llega del formulario.
function validarPrograma(cuerpo) {
    const texto = (v) => (v === undefined || v === null) ? '' : String(v).trim();

    const datos = {
        folio: texto(cuerpo.folio),
        nombre: texto(cuerpo.nombre),
        tipo: texto(cuerpo.tipo),
        estatus: texto(cuerpo.estatus).toLowerCase() || 'pendiente',
        origen: texto(cuerpo.origen) || 'banco',
        plan: texto(cuerpo.plan),
        area: texto(cuerpo.area),
        responsable: texto(cuerpo.responsable),
        puesto: texto(cuerpo.puesto),
        actividades: texto(cuerpo.actividades),
        objetivo: texto(cuerpo.objetivo),
        horario: texto(cuerpo.horario),
        motivo: texto(cuerpo.motivo),
        horas: cuerpo.horas,
        cupo: cuerpo.cupo,
        idDependencia: cuerpo.idDependencia,
        idPeriodo: cuerpo.idPeriodo
    };

    if (!datos.nombre || !datos.tipo) {
        return { error: 'El nombre y el tipo del programa son obligatorios' };
    }
    for (const campo in LARGOS) {
        if (datos[campo].length > LARGOS[campo]) {
            return { error: `El campo "${campo}" no puede pasar de ${LARGOS[campo]} caracteres` };
        }
    }
    if (!esEnteroEnRango(datos.horas, 1, 1000)) {
        return { error: 'Las horas deben ser un número entero entre 1 y 1000' };
    }
    if (!esEnteroEnRango(datos.cupo, 1, 500)) {
        return { error: 'El cupo debe ser un número entero entre 1 y 500' };
    }
    if (!ESTATUS.includes(datos.estatus)) {
        return { error: 'El estatus debe ser: ' + ESTATUS.join(', ') };
    }
    if (!ORIGENES.includes(datos.origen)) {
        return { error: 'El origen no es válido' };
    }
    if (datos.plan && !PLANES.includes(datos.plan)) {
        return { error: 'El plan educativo no es válido' };
    }
    if (datos.idDependencia && !esIdValido(datos.idDependencia)) {
        return { error: 'La dependencia no es válida' };
    }
    if (datos.idPeriodo && !esIdValido(datos.idPeriodo)) {
        return { error: 'El periodo no es válido' };
    }
    if (datos.estatus === 'rechazado' && !datos.motivo) {
        return { error: 'Escribe el motivo del rechazo' };
    }

    datos.horas = Number(datos.horas);
    datos.cupo = Number(datos.cupo);
    datos.idDependencia = datos.idDependencia ? Number(datos.idDependencia) : null;
    datos.idPeriodo = datos.idPeriodo ? Number(datos.idPeriodo) : null;
    return { datos };
}

// Pasa al prod
function agregarCampos(peticion, datos) {
    const nulo = (v) => (v === '' ? null : v);
    return peticion
        .input('folio', sql.VarChar(50), nulo(datos.folio))
        .input('nombre', sql.VarChar(150), datos.nombre)
        .input('tipo', sql.VarChar(50), datos.tipo)
        .input('origen', sql.VarChar(20), datos.origen)
        .input('plan', sql.VarChar(50), nulo(datos.plan))
        .input('area', sql.VarChar(100), nulo(datos.area))
        .input('responsable', sql.VarChar(100), nulo(datos.responsable))
        .input('puesto', sql.VarChar(100), nulo(datos.puesto))
        .input('actividades', sql.VarChar(sql.MAX), nulo(datos.actividades))
        .input('objetivo', sql.VarChar(sql.MAX), nulo(datos.objetivo))
        .input('horario', sql.VarChar(255), nulo(datos.horario))
        .input('horas', sql.Int, datos.horas)
        .input('cupo', sql.Int, datos.cupo)
        .input('id_dependencia', sql.Int, datos.idDependencia)
        .input('id_periodo', sql.Int, datos.idPeriodo);
}

// Catalogo de dependencias para el formulario.
router.get('/dependencias', verificarSesion, async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request().execute('sp_ListarDependencias');
        res.json(resultado.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener dependencias');
    }
});

// Catalogo de periodos escolares para el formulario.
router.get('/periodos', verificarSesion, async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request().execute('sp_ListarPeriodos');
        res.json(resultado.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener periodos');
    }
});

// Ver todos los programas (la busqueda se hace en la pagina sobre esta lista).
router.get('/programas', async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request().execute('sp_ListarProgramas');
        res.json(resultado.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener programas');
    }
});

// Ver un programa con todos sus datos (para editarlo).
router.get('/programas/:id', revisarId, async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request()
            .input('id_programa', sql.Int, Number(req.params.id))
            .execute('sp_ObtenerPrograma');
        res.json(resultado.recordset[0]);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener el programa');
    }
});

// Crear un programa 
router.post('/programas', verificarSesion, soloJefeOficina, async (req, res) => {
    const { error, datos } = validarPrograma({ ...req.body, estatus: 'pendiente', motivo: '' });
    if (error) {
        return res.status(400).json({ success: false, mensaje: error });
    }

    try {
        const pool = await getPool();
        const resultado = await agregarCampos(pool.request(), datos)
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .execute('sp_CrearPrograma');

        res.status(201).json({
            success: true,
            mensaje: 'Programa creado',
            id_programa: resultado.recordset[0].id_programa
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al crear el programa');
    }
});

// Actualizar un programa que ya existe.
router.put('/programas/:id', verificarSesion, soloJefeOficina, revisarId, async (req, res) => {
    const { error, datos } = validarPrograma(req.body);
    if (error) {
        return res.status(400).json({ success: false, mensaje: error });
    }

    try {
        const pool = await getPool();
        await agregarCampos(pool.request(), datos)
            .input('id_programa', sql.Int, Number(req.params.id))
            .input('estatus', sql.VarChar(50), datos.estatus)
            .input('motivo', sql.VarChar(300), datos.motivo || null)
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .execute('sp_ActualizarPrograma');

        res.json({ success: true, mensaje: 'Programa actualizado' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al actualizar el programa');
    }
});

// Borrar un programa 
router.delete('/programas/:id', verificarSesion, soloJefeOficina, revisarId, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id_programa', sql.Int, Number(req.params.id))
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .execute('sp_EliminarPrograma');

        res.json({ success: true, mensaje: 'Programa borrado' });
    } catch (err) {
        responderErrorSql(res, err, 'Error al borrar el programa');
    }
});

module.exports = router;
