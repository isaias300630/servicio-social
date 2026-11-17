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

// ---------------------------------------------------------------------
// CU13 / RF-13: Administrar periodos escolares (solo Administrador)
// ---------------------------------------------------------------------

const SQL_LISTAR_PERIODOS_ADMIN = `
    select p.id_periodo,
           p.nombre_periodo,
           p.fecha_inicio_pe as fecha_inicio,
           p.fecha_fin_pe as fecha_fin,
           p.estatus_activo_pe as activo,
           (select count(*) from expedientes x where x.id_periodo = p.id_periodo) as expedientes,
           (select count(*) from programas_ss pr where pr.id_periodo = p.id_periodo) as programas,
           c1.fecha_inicio_cr as b1_inicio, c1.fecha_limite_cr as b1_limite,
           c2.fecha_inicio_cr as b2_inicio, c2.fecha_limite_cr as b2_limite,
           c3.fecha_inicio_cr as b3_inicio, c3.fecha_limite_cr as b3_limite
    from periodos_escolares p
    left join calendario_reportes c1 on c1.id_periodo = p.id_periodo and c1.numero_bimestre = 1
    left join calendario_reportes c2 on c2.id_periodo = p.id_periodo and c2.numero_bimestre = 2
    left join calendario_reportes c3 on c3.id_periodo = p.id_periodo and c3.numero_bimestre = 3
    order by p.estatus_activo_pe desc, p.fecha_inicio_pe desc, p.id_periodo desc;
`;

const SQL_GUARDAR_PERIODO = `
    set nocount on;
    set xact_abort on;

    if @id_periodo is not null and not exists (select 1 from periodos_escolares where id_periodo = @id_periodo)
        throw 50404, N'El periodo escolar no existe', 1;

    if exists (
        select 1 from periodos_escolares
        where lower(nombre_periodo) = lower(@nombre)
          and (@id_periodo is null or id_periodo <> @id_periodo)
    )
        throw 50409, N'Ya existe un periodo escolar con ese nombre', 1;

    declare @otro_activo_id int, @otro_activo_nombre varchar(50);
    select top 1 @otro_activo_id = id_periodo, @otro_activo_nombre = nombre_periodo
    from periodos_escolares
    where estatus_activo_pe = 1
      and (@id_periodo is null or id_periodo <> @id_periodo);

    if @activo = 1 and @otro_activo_id is not null and isnull(@confirmar, 0) = 0
    begin
        select 'confirmar' as estado, @otro_activo_nombre as periodo_actual;
        return;
    end

    begin try
        begin tran;

            if @activo = 1 and @otro_activo_id is not null
            begin
                update periodos_escolares
                set estatus_activo_pe = 0
                where estatus_activo_pe = 1
                  and (@id_periodo is null or id_periodo <> @id_periodo);
            end

            declare @es_nuevo bit = 0;
            if @id_periodo is null
            begin
                set @es_nuevo = 1;
                insert into periodos_escolares (nombre_periodo, fecha_inicio_pe, fecha_fin_pe, estatus_activo_pe)
                values (@nombre, @fecha_inicio, @fecha_fin, @activo);

                set @id_periodo = scope_identity();
            end
            else
            begin
                update periodos_escolares
                set nombre_periodo = @nombre,
                    fecha_inicio_pe = @fecha_inicio,
                    fecha_fin_pe = @fecha_fin,
                    estatus_activo_pe = @activo
                where id_periodo = @id_periodo;
            end

            declare @b int = 1;
            while @b <= 3
            begin
                declare @ini_b date = dateadd(month, 2 * (@b - 1), @fecha_inicio);
                declare @lim_b date = dateadd(day, 7, dateadd(month, 2 * @b, @fecha_inicio));

                if exists (select 1 from calendario_reportes where id_periodo = @id_periodo and numero_bimestre = @b)
                begin
                    update calendario_reportes
                    set fecha_inicio_cr = @ini_b,
                        fecha_limite_cr = @lim_b
                    where id_periodo = @id_periodo and numero_bimestre = @b;
                end
                else
                begin
                    insert into calendario_reportes (id_periodo, numero_bimestre, fecha_inicio_cr, fecha_limite_cr)
                    values (@id_periodo, @b, @ini_b, @lim_b);
                end

                set @b = @b + 1;
            end

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (
                @id_admin,
                case when @es_nuevo = 1 then 'Alta de periodo escolar' else 'Actualizacion de periodo escolar' end,
                concat('Periodo ', @nombre, ' (', convert(varchar(10), @fecha_inicio, 23), ' a ',
                       convert(varchar(10), @fecha_fin, 23), ') - ',
                       case when @activo = 1 then 'Activo' else 'Inactivo' end)
            );

        commit tran;

        select 'ok' as estado, @id_periodo as id_periodo;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
`;

function validarCuerpoPeriodo(cuerpo) {
    const nombre = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre.trim() : '';
    const fechaInicio = typeof cuerpo?.fecha_inicio === 'string' ? cuerpo.fecha_inicio.trim() : '';
    const fechaFin = typeof cuerpo?.fecha_fin === 'string' ? cuerpo.fecha_fin.trim() : '';
    const activo = cuerpo?.activo === true || cuerpo?.activo === 1 || cuerpo?.activo === '1' || cuerpo?.activo === 'true';
    const confirmar = Boolean(cuerpo?.confirmar_cambio_activo);

    if (!esTextoValido(nombre, 50) || !fechaInicio || !fechaFin) {
        return { error: 'Todos los campos del periodo escolar son obligatorios' };
    }
    if (!esFechaValida(fechaInicio) || !esFechaValida(fechaFin)) {
        return { error: 'Las fechas de inicio y término deben tener un formato válido (AAAA-MM-DD)' };
    }
    if (fechaFin <= fechaInicio) {
        return { error: 'La fecha de término debe ser posterior a la fecha de inicio' };
    }

    return {
        datos: {
            nombre,
            fechaInicio: new Date(fechaInicio + 'T00:00:00Z'),
            fechaFin: new Date(fechaFin + 'T00:00:00Z'),
            activo: activo ? 1 : 0,
            confirmar: confirmar ? 1 : 0
        }
    };
}

// Lista todos los periodos con sus 3 bimestres calculados.
router.get('/periodos', verificarSesion, soloAdministrador, async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request().query(SQL_LISTAR_PERIODOS_ADMIN);
        res.json(resultado.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener periodos escolares');
    }
});

// Registra un nuevo periodo escolar y calcula sus 3 reportes bimestrales.
router.post('/periodos', verificarSesion, soloAdministrador, async (req, res) => {
    const { error, datos } = validarCuerpoPeriodo(req.body);
    if (error) {
        return res.status(400).json({ success: false, mensaje: error });
    }

    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_periodo', sql.Int, null)
            .input('nombre', sql.VarChar(50), datos.nombre)
            .input('fecha_inicio', sql.Date, datos.fechaInicio)
            .input('fecha_fin', sql.Date, datos.fechaFin)
            .input('activo', sql.Bit, datos.activo)
            .input('confirmar', sql.Bit, datos.confirmar)
            .input('id_admin', sql.Int, req.usuario.id_usuario)
            .query(SQL_GUARDAR_PERIODO);

        const fila = r.recordset[0];
        if (fila.estado === 'confirmar') {
            return res.status(409).json({
                success: false,
                requiereConfirmacion: true,
                periodoActual: fila.periodo_actual,
                mensaje: `El periodo "${fila.periodo_actual}" está actualmente como Activo. ¿Deseas cerrarlo y dejar únicamente "${datos.nombre}" como Activo?`
            });
        }

        res.status(201).json({
            success: true,
            id_periodo: fila.id_periodo,
            mensaje: 'Periodo escolar guardado y configurado correctamente'
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al registrar periodo escolar');
    }
});

// Actualiza un periodo escolar existente y recalcula sus 3 reportes bimestrales.
router.put('/periodos/:id', verificarSesion, soloAdministrador, async (req, res) => {
    if (!esIdValido(req.params.id)) {
        return res.status(400).json({ success: false, mensaje: 'El id del periodo no es válido' });
    }
    const { error, datos } = validarCuerpoPeriodo(req.body);
    if (error) {
        return res.status(400).json({ success: false, mensaje: error });
    }

    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_periodo', sql.Int, Number(req.params.id))
            .input('nombre', sql.VarChar(50), datos.nombre)
            .input('fecha_inicio', sql.Date, datos.fechaInicio)
            .input('fecha_fin', sql.Date, datos.fechaFin)
            .input('activo', sql.Bit, datos.activo)
            .input('confirmar', sql.Bit, datos.confirmar)
            .input('id_admin', sql.Int, req.usuario.id_usuario)
            .query(SQL_GUARDAR_PERIODO);

        const fila = r.recordset[0];
        if (fila.estado === 'confirmar') {
            return res.status(409).json({
                success: false,
                requiereConfirmacion: true,
                periodoActual: fila.periodo_actual,
                mensaje: `El periodo "${fila.periodo_actual}" está actualmente como Activo. ¿Deseas cerrarlo y dejar únicamente "${datos.nombre}" como Activo?`
            });
        }

        res.json({
            success: true,
            id_periodo: fila.id_periodo,
            mensaje: 'Periodo escolar guardado y configurado correctamente'
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al actualizar periodo escolar');
    }
});

module.exports = router