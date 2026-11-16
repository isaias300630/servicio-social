// Rutas del administrador: catalogo de roles, alta de personal, resumen y bitacora.
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

// Numeros generales para el panel.
router.get('/resumen', verificarSesion, soloAdministrador, async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request().execute('sp_ResumenAdmin');
        res.json(resultado.recordset[0]);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener el resumen');
    }
});

// Opciones de los filtros de la bitacora.
router.get('/bitacora/filtros', verificarSesion, soloAdministrador, async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request().execute('sp_FiltrosBitacora');
        res.json({
            acciones: resultado.recordsets[0].map(fila => fila.accion),
            roles: resultado.recordsets[1]
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener los filtros');
    }
});

// Fecha en formato AAAA-MM-DD que si exista en el calendario.
function esFechaValida(texto) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
    const fecha = new Date(texto + 'T00:00:00Z');
    return !isNaN(fecha) && fecha.toISOString().slice(0, 10) === texto;
}

// Movimientos de la bitacora con filtros y por paginas.
router.get('/bitacora', verificarSesion, soloAdministrador, async (req, res) => {
    const { desde, hasta, accion, rol, texto } = req.query;
    const pagina = req.query.pagina ? Number(req.query.pagina) : 1;
    const tamano = req.query.tamano ? Number(req.query.tamano) : 25;

    // Cada filtro debe venir una sola vez (ej. ?accion=a&accion=b no se acepta).
    if ([desde, hasta, accion, rol, texto].some(v => v !== undefined && typeof v !== 'string')) {
        return res.status(400).json({ success: false, mensaje: 'Los filtros no son válidos' });
    }
    if ((desde && !esFechaValida(desde)) || (hasta && !esFechaValida(hasta))) {
        return res.status(400).json({ success: false, mensaje: 'Las fechas deben tener el formato AAAA-MM-DD' });
    }
    if (rol && !esIdValido(rol)) {
        return res.status(400).json({ success: false, mensaje: 'El rol no es válido' });
    }
    if ((accion && String(accion).length > 255) || (texto && String(texto).length > 100)) {
        return res.status(400).json({ success: false, mensaje: 'El texto de búsqueda es demasiado largo' });
    }
    if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(tamano) || tamano < 1 || tamano > 1000) {
        return res.status(400).json({ success: false, mensaje: 'La página o el tamaño no son válidos' });
    }

    try {
        const pool = await getPool();
        const resultado = await pool.request()
            .input('desde', sql.Date, desde ? new Date(desde + 'T00:00:00Z') : null)
            .input('hasta', sql.Date, hasta ? new Date(hasta + 'T00:00:00Z') : null)
            .input('accion', sql.VarChar(255), accion || null)
            .input('id_rol', sql.Int, rol ? Number(rol) : null)
            .input('texto', sql.VarChar(100), texto || null)
            .input('pagina', sql.Int, pagina)
            .input('tamano', sql.Int, tamano)
            .execute('sp_ConsultarBitacora');

        const total = resultado.recordsets[0][0].total;
        res.json({
            total,
            pagina,
            paginas: Math.max(1, Math.ceil(total / tamano)),
            movimientos: resultado.recordsets[1]
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al consultar la bitácora');
    }
});

module.exports = router