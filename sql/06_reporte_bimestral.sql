-- CU12 / RF-12: reporte de alumnos activos que no han entregado su reporte bimestral.
-- Correr despues de 01 a 05. Se puede volver a correr completo.
-- Errores propios: 50400 = datos incorrectos, 50404 = no existe (igual que en los demas scripts).
--
-- Reglas:
--   * Se consideran alumnos con servicio activo (expedientes.estatus_ex = 'activo') del periodo indicado.
--   * El reporte cuenta como ENTREGADO solo si su version mas reciente esta 'pendiente' o 'aceptado'.
--   * Si no hay documento, o la version mas reciente esta 'rechazado', cuenta como NO entregado.


-- Carreras para el filtro de la pantalla.
create or alter procedure sp_ListarCarreras
as
begin
    set nocount on;

    select distinct carrera
    from estudiantes
    where carrera is not null
    order by carrera;
end
go


-- Regresa dos tablas:
--   1. Encabezado: periodo, bimestre, fechas del bimestre y totales (activos, entregados, omisos).
--   2. Los alumnos que NO han entregado, con el estatus de su ultimo intento.
-- @id_periodo en null usa el periodo activo. @carrera en null incluye todas las carreras.
-- @id_usuario es quien genera el reporte (para la bitacora).
create or alter procedure sp_ReporteSinReporteBimestral
    @id_periodo int,
    @bimestre int,
    @carrera varchar(100),
    @id_usuario int
as
begin
    set nocount on;

    if @id_periodo is null
        select @id_periodo = id_periodo from periodos_escolares where estatus_activo_pe = 1;

    if @id_periodo is null
        throw 50404, N'No hay un periodo escolar activo', 1;

    if @bimestre is null or @bimestre not between 1 and 3
        throw 50400, N'El bimestre debe ser 1, 2 o 3', 1;

    declare @nombre_periodo varchar(50) = (select nombre_periodo from periodos_escolares where id_periodo = @id_periodo);
    if @nombre_periodo is null
        throw 50404, N'El periodo seleccionado no existe', 1;

    declare @inicio date, @limite date;
    select @inicio = fecha_inicio_cr, @limite = fecha_limite_cr
    from calendario_reportes
    where id_periodo = @id_periodo and numero_bimestre = @bimestre;

    if @inicio is null
        throw 50404, N'El periodo no tiene calendario de reportes bimestrales', 1;

    set @carrera = nullif(ltrim(rtrim(@carrera)), '');

    declare @tipo varchar(50) = 'reporte_bimestral_' + cast(@bimestre as varchar(1));

    -- Todos los alumnos activos del periodo con el estatus de su reporte mas reciente.
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

    -- 1. Encabezado con los totales.
    select @nombre_periodo as periodo,
           @bimestre as bimestre,
           @inicio as fecha_inicio,
           @limite as fecha_limite,
           @carrera as carrera,
           count(*) as total_activos,
           isnull(sum(case when estatus_reporte in ('pendiente', 'aceptado') then 1 else 0 end), 0) as entregados,
           isnull(sum(case when estatus_reporte in ('pendiente', 'aceptado') then 0 else 1 end), 0) as sin_entregar
    from @alumnos;

    -- 2. Los alumnos omisos (sin documento, o con el ultimo rechazado).
    select numero_control, nombre_completo, correo, carrera, semestre, programa, institucion,
           estatus_reporte, comentario
    from @alumnos
    where estatus_reporte not in ('pendiente', 'aceptado')
    order by carrera, nombre_completo;

    insert into bitacora_logs (id_usuario, accion, detalles)
    values (@id_usuario, 'Reporte de alumnos sin reporte bimestral',
            concat(@nombre_periodo, ', bimestre ', @bimestre, ', carrera: ', isnull(@carrera, 'todas')));
end
go
