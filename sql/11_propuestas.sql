-- CU06 (Propuesta Propia) y CU07 (Validar propuestas propias):
-- El alumno registra todos los datos de su propuesta propia (empresa + programa)
-- y el Jefe de Oficina de SS o el Jefe de Vinculacion la revisan para aprobarla o rechazarla.
-- Al aprobarse, se crea automaticamente el expediente activo del alumno que la propuso.


-- 1. Consulta la propuesta propia mas reciente del alumno y si ya tiene servicio activo.
create or alter procedure sp_MiPropuestaAlumno
    @id_usuario int
as
begin
    set nocount on;

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

    -- 1. Datos del alumno
    select @numero_control as numero_control, @nombre as nombre, @carrera as carrera,
           @semestre as semestre, @plan as plan_estudios, @induccion as induccion_completa,
           @tiene_expediente as tiene_servicio_activo;

    -- 2. Sus propuestas propias (la mas reciente primero)
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
end
go


-- 2. El alumno registra una propuesta propia con todos los datos de empresa y programa.
create or alter procedure sp_RegistrarPropuestaAlumno
    @id_usuario int,
    @nombre_empresa varchar(150),
    @area varchar(100),
    @nombre_titular varchar(100),
    @puesto_titular varchar(100),
    @nombre_responsable varchar(100),
    @puesto_responsable varchar(100),
    @origen_capital varchar(50),
    @nombre_programa varchar(150),
    @actividades varchar(max),
    @objetivo varchar(max),
    @alumnos_solicitados int,
    @horario_perfil varchar(255),
    @telefono_contacto varchar(20),
    @correo_contacto varchar(100),
    @domicilio varchar(255)
as
begin
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
end
go


-- 3. Lista las propuestas propias para el Jefe de Oficina de SS y el Jefe de Vinculacion.
create or alter procedure sp_ListarPropuestasPropias
as
begin
    set nocount on;

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
end
go


-- 4. El Jefe de Oficina de SS o Jefe de Vinculacion aprueba o rechaza una propuesta propia (CU07).
-- Si se aprueba y el alumno que la propuso aun no tiene servicio activo, se le crea su expediente activo.
create or alter procedure sp_DictaminarPropuestaPropia
    @id_programa int,
    @estatus varchar(20),
    @motivo varchar(300) = null,
    @id_usuario int
as
begin
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

    if isnull(@estatus, '') not in ('aprobado', 'rechazado')
        throw 50400, N'El dictamen debe ser aprobado o rechazado', 1;

    set @motivo = nullif(ltrim(rtrim(isnull(@motivo, ''))), '');
    if @estatus = 'rechazado' and @motivo is null
        throw 50400, N'Es obligatorio capturar el motivo del rechazo para notificar al alumno', 1;

    begin try
        begin tran;

            update programas_ss
            set estatus_pro = @estatus,
                motivo_rechazo = case when @estatus = 'rechazado' then @motivo else null end
            where id_programa = @id_programa
              and estatus_pro = 'pendiente';

            if @@rowcount = 0
                throw 50409, N'Solo se pueden dictaminar propuestas propias con estatus pendiente', 1;

            -- Si se aprueba, se inscribe automaticamente al alumno que la propuso en su programa.
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
end
go
