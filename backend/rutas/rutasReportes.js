// Reporte de alumnos activos que no han entregado su reporte bimestral (CU12).
// Disponible como seccion para cualquier usuario con sesion iniciada.
// Usa consultas parametrizadas directas y sp_RegistrarBitacora para funcionar
// sin requerir permisos de CREATE PROCEDURE en Azure SQL.
const express = require('express');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { esIdValido, esEnteroEnRango } = require('../validaciones');

const router = express.Router();

// Todas las rutas /api/reportes piden sesion activa.
router.use('/reportes', verificarSesion);

// Consulta parametrizada del reporte (misma logica de sql/06_reporte_bimestral.sql).
const SQL_REPORTE = `
    if @id_periodo is null
        select @id_periodo = id_periodo from periodos_escolares where estatus_activo_pe = 1;

    if @id_periodo is null
        throw 50404, N'No hay un periodo escolar activo', 1;

    declare @nombre_periodo varchar(50) = (select nombre_periodo from periodos_escolares where id_periodo = @id_periodo);
    if @nombre_periodo is null
        throw 50404, N'El periodo seleccionado no existe', 1;

    declare @inicio date, @limite date;
    select @inicio = fecha_inicio_cr, @limite = fecha_limite_cr
    from calendario_reportes
    where id_periodo = @id_periodo and numero_bimestre = @bimestre;

    declare @tipo varchar(50) = 'reporte_bimestral_' + cast(@bimestre as varchar(1));

    declare @alumnos table (
        numero_control varchar(20),
        nombre_completo varchar(320),
        correo varchar(100),
        carrera varchar(100),
        semestre int,
        programa varchar(150),
        institucion varchar(150),
        estatus_reporte varchar(50),
        comentario varchar(max)
    );

    insert into @alumnos
    select e.numero_control,
           ltrim(rtrim(e.nombrees + ' ' + e.apellido_paterno_es + ' ' + isnull(e.apellido_materno_es, ''))),
           u.correousu,
           e.carrera,
           e.semestre,
           p.nombre_programa,
           d.nombre_empresa_de,
           isnull(ult.estatus, 'sin entrega'),
           ult.comentario
    from expedientes x
    inner join estudiantes e on e.numero_control = x.numero_control
    inner join usuarios u on u.id_usuario = e.id_usuario
    left join programas_ss p on p.id_programa = x.id_programa
    left join dependencias d on d.id_dependencia = p.id_dependencia
    outer apply (
        select top 1 doc.estatus_validacion_do as estatus, doc.observaciones_doc as comentario
        from documentos doc
        where doc.id_expediente = x.id_expediente
          and doc.tipo_documento = @tipo
        order by doc.version_doc desc, doc.id_documento desc
    ) ult
    where x.estatus_ex = 'activo'
      and x.id_periodo = @id_periodo
      and (@carrera is null or e.carrera = @carrera);

    select @nombre_periodo as periodo,
           @bimestre as bimestre,
           @inicio as fecha_inicio,
           @limite as fecha_limite,
           @carrera as carrera,
           count(*) as total_activos,
           isnull(sum(case when estatus_reporte in ('pendiente', 'aceptado') then 1 else 0 end), 0) as entregados,
           isnull(sum(case when estatus_reporte in ('pendiente', 'aceptado') then 0 else 1 end), 0) as sin_entregar
    from @alumnos;

    select numero_control, nombre_completo, correo, carrera, semestre, programa, institucion,
           estatus_reporte, comentario
    from @alumnos
    where estatus_reporte not in ('pendiente', 'aceptado')
    order by carrera, nombre_completo;
`;

// Carreras para el filtro de la pantalla.
router.get('/reportes/carreras', async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            select distinct carrera
            from estudiantes
            where carrera is not null
            order by carrera
        `);
        res.json(r.recordset.map(fila => fila.carrera));
    } catch (err) {
        responderErrorSql(res, err, 'Error al listar carreras');
    }
});

// Alumnos sin reporte bimestral.
// Parametros en la URL: bimestre (1 a 3, obligatorio), periodo (id, opcional: si no viene se usa el activo)
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
        const pool = await getPool();
        const r = await pool.request()
            .input('id_periodo', sql.Int, periodo ? Number(periodo) : null)
            .input('bimestre', sql.Int, Number(bimestre))
            .input('carrera', sql.VarChar(100), carreraLimpia || null)
            .query(SQL_REPORTE);

        const resumen = r.recordsets[0][0];
        const alumnos = r.recordsets[1];

        // Registra la consulta en la bitacora usando el procedimiento existente.
        try {
            await pool.request()
                .input('id_usuario', sql.Int, req.usuario.id_usuario)
                .input('accion', sql.VarChar(255), 'Reporte de alumnos sin reporte bimestral')
                .input('detalles', sql.VarChar(sql.MAX),
                    `${resumen.periodo}, bimestre ${resumen.bimestre}, carrera: ${resumen.carrera || 'todas'}`)
                .execute('sp_RegistrarBitacora');
        } catch (errBit) {
            console.error('No se pudo registrar en la bitacora:', errBit.message);
        }

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
