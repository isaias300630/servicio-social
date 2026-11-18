// CU06 (Propuesta Propia) y CU07 (Validar propuestas propias).
// Usa consultas parametrizadas directas contra las tablas existentes en Azure SQL
// (dependencias, programas_ss, estudiantes, expedientes, periodos_escolares y bitacora_logs).
const express = require('express');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');
const { responderErrorSql } = require('../errores');
const { esIdValido, esEnteroEnRango, esTextoValido } = require('../validaciones');

const router = express.Router();

const ROLES_JEFES = ['Jefe de Oficina de SS', 'Jefe de Vinculacion'];
const ORIGENES_CAPITAL = ['Público', 'Privado', 'Social'];

function soloAlumno(req, res, next) {
    if (req.usuario.rol !== 'Alumno') {
        return res.status(403).json({ success: false, mensaje: 'Solo los alumnos pueden hacer esto' });
    }
    next();
}

function soloJefes(req, res, next) {
    if (!ROLES_JEFES.includes(req.usuario.rol)) {
        return res.status(403).json({
            success: false,
            mensaje: 'Solo el Jefe de Oficina de SS o el Jefe de Vinculación pueden hacer esto'
        });
    }
    next();
}

function validarCuerpoPropuesta(cuerpo) {
    const limpiar = (v) => (typeof v === 'string' ? v.trim() : '');

    const datos = {
        nombre_empresa: limpiar(cuerpo?.nombre_empresa),
        area: limpiar(cuerpo?.area),
        nombre_titular: limpiar(cuerpo?.nombre_titular),
        puesto_titular: limpiar(cuerpo?.puesto_titular),
        nombre_responsable: limpiar(cuerpo?.nombre_responsable) || limpiar(cuerpo?.nombre_titular),
        puesto_responsable: limpiar(cuerpo?.puesto_responsable),
        origen_capital: limpiar(cuerpo?.origen_capital),
        nombre_programa: limpiar(cuerpo?.nombre_programa),
        actividades: limpiar(cuerpo?.actividades),
        objetivo: limpiar(cuerpo?.objetivo),
        alumnos_solicitados: cuerpo?.alumnos_solicitados,
        horario_perfil: limpiar(cuerpo?.horario_perfil),
        telefono_contacto: limpiar(cuerpo?.telefono_contacto),
        correo_contacto: limpiar(cuerpo?.correo_contacto).toLowerCase(),
        domicilio: limpiar(cuerpo?.domicilio)
    };

    // Si no especifican un nombre de proyecto aparte, se forma con el area y empresa.
    if (!datos.nombre_programa && datos.area && datos.nombre_empresa) {
        datos.nombre_programa = `Servicio Social en ${datos.area} - ${datos.nombre_empresa}`.slice(0, 150);
    }

    if (!esTextoValido(datos.nombre_empresa, 150)) {
        return { error: 'Escribe el nombre de la empresa o institución (máximo 150 caracteres)' };
    }
    if (!esTextoValido(datos.area, 100)) {
        return { error: 'Escribe el área o departamento (máximo 100 caracteres)' };
    }
    if (!esTextoValido(datos.nombre_titular, 100)) {
        return { error: 'Escribe el nombre de la persona titular de la empresa o jefe de departamento (máximo 100 caracteres)' };
    }
    if (!esTextoValido(datos.puesto_titular, 100)) {
        return { error: 'Escribe el puesto del titular (máximo 100 caracteres)' };
    }
    if (!esTextoValido(datos.nombre_responsable, 100)) {
        return { error: 'Escribe el nombre del responsable directo (máximo 100 caracteres)' };
    }
    if (!esTextoValido(datos.puesto_responsable, 100)) {
        return { error: 'Escribe el puesto del responsable (máximo 100 caracteres)' };
    }
    if (!ORIGENES_CAPITAL.includes(datos.origen_capital)) {
        return { error: 'Selecciona el origen de capital (Público, Privado o Social)' };
    }
    if (!esTextoValido(datos.nombre_programa, 150)) {
        return { error: 'Escribe el nombre del programa o proyecto (máximo 150 caracteres)' };
    }
    if (!esTextoValido(datos.actividades, 4000)) {
        return { error: 'Describe las actividades a realizar' };
    }
    if (!esTextoValido(datos.objetivo, 4000)) {
        return { error: 'Describe el objetivo de la propuesta' };
    }
    if (!esEnteroEnRango(datos.alumnos_solicitados, 1, 500)) {
        return { error: 'El número de alumnos que solicita debe ser un entero entre 1 y 500' };
    }
    if (!esTextoValido(datos.horario_perfil, 255)) {
        return { error: 'Escribe el horario y perfil requerido del alumno (máximo 255 caracteres)' };
    }
    if (!/^\d{10}$/.test(datos.telefono_contacto)) {
        return { error: 'El teléfono de contacto debe tener 10 dígitos numéricos' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo_contacto) || datos.correo_contacto.length > 100) {
        return { error: 'Escribe un correo de contacto válido (máximo 100 caracteres)' };
    }
    if (!esTextoValido(datos.domicilio, 255)) {
        return { error: 'Escribe el domicilio de la empresa o institución (máximo 255 caracteres)' };
    }

    datos.alumnos_solicitados = Number(datos.alumnos_solicitados);
    return { datos };
}

const SQL_MI_PROPUESTA = `
    declare @numero_control varchar(20), @nombre varchar(310), @carrera varchar(100),
            @semestre int, @plan varchar(50), @induccion bit;

    select @numero_control = numero_control,
           @nombre = nombrees + ' ' + apellido_paterno_es + isnull(' ' + apellido_materno_es, ''),
           @carrera = carrera,
           @semestre = semestre,
           @plan = plan_estudios,
           @induccion = isnull(induccion_completa, 0)
    from estudiantes
    where id_usuario = @id_usuario;

    if @numero_control is null
        throw 50404, N'Alumno no encontrado', 1;

    declare @tiene_expediente bit = case when exists (
        select 1 from expedientes where numero_control = @numero_control and estatus_ex = 'activo'
    ) then 1 else 0 end;

    select @numero_control as numero_control, @nombre as nombre, @carrera as carrera,
           @semestre as semestre, @plan as plan_estudios, @induccion as induccion_completa,
           @tiene_expediente as tiene_servicio_activo;

    select p.id_programa,
           p.numero_folio as folio,
           p.estatus_pro as estatus,
           p.numero_control_propone as numero_control,
           p.nombre_programa,
           d.nombre_empresa_de as nombre_empresa,
           p.area_departamento as area,
           d.nombre_titular_de as nombre_titular,
           d.puesto_titular_de as puesto_titular,
           p.nombre_responsable,
           p.puesto_responsable,
           d.origen_capital_de as origen_capital,
           p.actividades_realizar as actividades,
           p.objetivo,
           p.cupo_alumnos as alumnos_solicitados,
           p.horas_requeridas as horas,
           p.horario_perfil as horario_perfil,
           d.telefono_contacto_de as telefono_contacto,
           d.correo_contacto_de as correo_contacto,
           d.direccion_de as domicilio,
           p.motivo_rechazo,
           pe.nombre_periodo as periodo
    from programas_ss p
    left join dependencias d on p.id_dependencia = d.id_dependencia
    left join periodos_escolares pe on p.id_periodo = pe.id_periodo
    where p.numero_control_propone = @numero_control
      and p.origen_pro = 'propuesta'
    order by p.id_programa desc;
`;

const SQL_REGISTRAR_PROPUESTA = `
    set nocount on;
    set xact_abort on;

    declare @numero_control varchar(20), @plan varchar(50), @induccion bit;
    select @numero_control = numero_control, @plan = plan_estudios, @induccion = isnull(induccion_completa, 0)
    from estudiantes where id_usuario = @id_usuario;

    if @numero_control is null
        throw 50404, N'Alumno no encontrado', 1;

    if @induccion = 0
        throw 50400, N'Primero debes completar el curso de inducción', 1;

    if exists (select 1 from expedientes where numero_control = @numero_control and estatus_ex = 'activo')
        throw 50409, N'Ya cuentas con un servicio social activo', 1;

    if exists (select 1 from programas_ss
               where numero_control_propone = @numero_control
                 and origen_pro = 'propuesta'
                 and estatus_pro = 'pendiente')
        throw 50409, N'Ya tienes una propuesta propia en revisión. Espera el dictamen antes de enviar otra', 1;

    declare @id_periodo int = (select top 1 id_periodo from periodos_escolares where estatus_activo_pe = 1);
    if @id_periodo is null
        throw 50400, N'No hay un periodo escolar activo en este momento', 1;

    declare @hoy date = cast(dateadd(hour, -7, getutcdate()) as date);
    declare @id_dependencia int, @id_programa int, @folio varchar(50);

    begin try
        begin tran;

            insert into dependencias
                (nombre_empresa_de, origen_capital_de, nombre_titular_de, puesto_titular_de,
                 direccion_de, telefono_contacto_de, correo_contacto_de)
            values
                (@nombre_empresa, @origen_capital, @nombre_titular, @puesto_titular,
                 @domicilio, @telefono_contacto, @correo_contacto);

            set @id_dependencia = scope_identity();

            declare @prefijo varchar(20) = 'PP-' + cast(year(@hoy) as varchar(4)) + '-';
            declare @consecutivo int = 1 + (
                select count(*) from programas_ss with (updlock, holdlock)
                where numero_folio like @prefijo + '%'
            );
            set @folio = @prefijo + right('0000' + cast(@consecutivo as varchar(10)), 4);

            insert into programas_ss
                (id_dependencia, id_periodo, numero_control_propone, numero_folio,
                 nombre_programa, tipo_pro, estatus_pro, origen_pro, plan_educativo_pro,
                 area_departamento, nombre_responsable, puesto_responsable,
                 actividades_realizar, objetivo, horas_requeridas,
                 cupo_alumnos, cupo_disponible, horario_perfil)
            values
                (@id_dependencia, @id_periodo, @numero_control, @folio,
                 @nombre_programa, 'Propuesta propia', 'pendiente', 'propuesta', @plan,
                 @area, @nombre_responsable, @puesto_responsable,
                 @actividades, @objetivo, 500,
                 @alumnos_solicitados, @alumnos_solicitados, @horario_perfil);

            set @id_programa = scope_identity();

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Registro de propuesta propia',
                    concat('Folio ', @folio, ' - ', @nombre_empresa, ' (', @nombre_programa, ')'));

        commit tran;

        select @id_programa as id_programa, @folio as folio;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
`;

const SQL_LISTAR_PROPUESTAS = `
    select p.id_programa,
           p.numero_folio as folio,
           p.estatus_pro as estatus,
           p.numero_control_propone as numero_control,
           e.nombrees + ' ' + e.apellido_paterno_es + isnull(' ' + e.apellido_materno_es, '') as alumno,
           e.carrera,
           e.semestre,
           e.plan_estudios,
           p.nombre_programa,
           d.nombre_empresa_de as nombre_empresa,
           p.area_departamento as area,
           d.nombre_titular_de as nombre_titular,
           d.puesto_titular_de as puesto_titular,
           p.nombre_responsable,
           p.puesto_responsable,
           d.origen_capital_de as origen_capital,
           p.actividades_realizar as actividades,
           p.objetivo,
           p.cupo_alumnos as alumnos_solicitados,
           p.cupo_disponible,
           p.horas_requeridas as horas,
           p.horario_perfil as horario_perfil,
           d.telefono_contacto_de as telefono_contacto,
           d.correo_contacto_de as correo_contacto,
           d.direccion_de as domicilio,
           p.motivo_rechazo,
           pe.nombre_periodo as periodo
    from programas_ss p
    left join dependencias d on p.id_dependencia = d.id_dependencia
    left join estudiantes e on p.numero_control_propone = e.numero_control
    left join periodos_escolares pe on p.id_periodo = pe.id_periodo
    where p.origen_pro = 'propuesta'
    order by case when p.estatus_pro = 'pendiente' then 0 else 1 end, p.id_programa desc;
`;

const SQL_DICTAMINAR_PROPUESTA = `
    set nocount on;
    set xact_abort on;

    declare @estatus_actual varchar(50), @origen varchar(20), @numero_control varchar(20),
            @id_periodo int, @folio varchar(50), @nombre_programa varchar(150);

    select @estatus_actual = estatus_pro,
           @origen = origen_pro,
           @numero_control = numero_control_propone,
           @id_periodo = id_periodo,
           @folio = isnull(numero_folio, '#' + cast(id_programa as varchar(10))),
           @nombre_programa = nombre_programa
    from programas_ss
    where id_programa = @id_programa;

    if @estatus_actual is null or @origen <> 'propuesta'
        throw 50404, N'Propuesta propia no encontrada', 1;

    if @estatus_actual <> 'pendiente'
        throw 50409, N'Solo se pueden dictaminar propuestas propias con estatus pendiente', 1;

    begin try
        begin tran;

            update programas_ss
            set estatus_pro = @estatus,
                motivo_rechazo = case when @estatus = 'rechazado' then @motivo else null end
            where id_programa = @id_programa
              and estatus_pro = 'pendiente';

            if @@rowcount = 0
                throw 50409, N'Solo se pueden dictaminar propuestas propias con estatus pendiente', 1;

            -- Si se aprueba, inscribe automaticamente al alumno que propuso el programa.
            if @estatus = 'aprobado' and @numero_control is not null
               and not exists (select 1 from expedientes where numero_control = @numero_control and estatus_ex = 'activo')
            begin
                update programas_ss
                set cupo_disponible = case when cupo_disponible > 0 then cupo_disponible - 1 else 0 end
                where id_programa = @id_programa;

                insert into expedientes (numero_control, id_programa, id_periodo, fechainicio_ex, estatus_ex)
                values (@numero_control, @id_programa, @id_periodo, cast(dateadd(hour, -7, getutcdate()) as date), 'activo');
            end

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Dictamen de propuesta propia',
                    concat('Propuesta ', @folio, ' del alumno ', isnull(@numero_control, 'S/N'), ': ', @estatus));

        commit tran;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
`;

// 1. Alumno: consulta sus datos y sus propuestas propias.
router.get('/alumno/propuestas', verificarSesion, soloAlumno, async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(SQL_MI_PROPUESTA);

        res.json({
            alumno: r.recordsets[0][0],
            propuestas: r.recordsets[1]
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al consultar tu propuesta propia');
    }
});

// 2. Alumno: registra una propuesta propia.
router.post('/alumno/propuestas', verificarSesion, soloAlumno, async (req, res) => {
    const { error, datos } = validarCuerpoPropuesta(req.body);
    if (error) {
        return res.status(400).json({ success: false, mensaje: error });
    }

    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .input('nombre_empresa', sql.VarChar(150), datos.nombre_empresa)
            .input('area', sql.VarChar(100), datos.area)
            .input('nombre_titular', sql.VarChar(100), datos.nombre_titular)
            .input('puesto_titular', sql.VarChar(100), datos.puesto_titular)
            .input('nombre_responsable', sql.VarChar(100), datos.nombre_responsable)
            .input('puesto_responsable', sql.VarChar(100), datos.puesto_responsable)
            .input('origen_capital', sql.VarChar(50), datos.origen_capital)
            .input('nombre_programa', sql.VarChar(150), datos.nombre_programa)
            .input('actividades', sql.VarChar(sql.MAX), datos.actividades)
            .input('objetivo', sql.VarChar(sql.MAX), datos.objetivo)
            .input('alumnos_solicitados', sql.Int, datos.alumnos_solicitados)
            .input('horario_perfil', sql.VarChar(255), datos.horario_perfil)
            .input('telefono_contacto', sql.VarChar(20), datos.telefono_contacto)
            .input('correo_contacto', sql.VarChar(100), datos.correo_contacto)
            .input('domicilio', sql.VarChar(255), datos.domicilio)
            .query(SQL_REGISTRAR_PROPUESTA);

        const creada = r.recordset[0];
        res.status(201).json({
            success: true,
            id_programa: creada.id_programa,
            folio: creada.folio,
            mensaje: `Propuesta propia registrada correctamente con folio ${creada.folio}. Queda en estatus Pendiente de validación`
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al registrar la propuesta propia');
    }
});

// 3. Jefes (Oficina de SS y Vinculacion): lista todas las propuestas propias de alumnos.
router.get('/propuestas', verificarSesion, soloJefes, async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(SQL_LISTAR_PROPUESTAS);
        res.json(r.recordset);
    } catch (err) {
        responderErrorSql(res, err, 'Error al obtener propuestas propias');
    }
});

// 4. Jefes (Oficina de SS y Vinculacion): aprueba o rechaza una propuesta propia (CU07).
router.put('/propuestas/:id/dictamen', verificarSesion, soloJefes, async (req, res) => {
    if (!esIdValido(req.params.id)) {
        return res.status(400).json({ success: false, mensaje: 'El id de la propuesta no es válido' });
    }

    const estatus = typeof req.body?.estatus === 'string' ? req.body.estatus.trim().toLowerCase() : '';
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';

    if (estatus !== 'aprobado' && estatus !== 'rechazado') {
        return res.status(400).json({ success: false, mensaje: 'El dictamen debe ser aprobado o rechazado' });
    }
    if (estatus === 'rechazado' && (!motivo || motivo.length > 300)) {
        return res.status(400).json({
            success: false,
            mensaje: 'Es obligatorio capturar el motivo del rechazo para notificar al alumno (máximo 300 caracteres)'
        });
    }

    try {
        const pool = await getPool();
        await pool.request()
            .input('id_programa', sql.Int, Number(req.params.id))
            .input('estatus', sql.VarChar(20), estatus)
            .input('motivo', sql.VarChar(300), motivo || null)
            .input('id_usuario', sql.Int, req.usuario.id_usuario)
            .query(SQL_DICTAMINAR_PROPUESTA);

        res.json({
            success: true,
            mensaje: estatus === 'aprobado'
                ? 'Propuesta propia validada como Aprobada y asignada al alumno correctamente'
                : 'Propuesta propia rechazada correctamente. Se notificó el motivo al alumno'
        });
    } catch (err) {
        responderErrorSql(res, err, 'Error al dictaminar la propuesta propia');
    }
});

module.exports = router;
