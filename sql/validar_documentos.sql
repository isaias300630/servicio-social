-- Validacion de documentos (CU11): el Jefe de Oficina o el Jefe de Vinculacion aceptan o rechazan los PDF de los alumnos.



-- Documentos que esperan revision, el mas antiguo primero.
create or alter procedure sp_DocumentosPendientes
as
begin
    set nocount on;

    select d.id_documento, d.tipo_documento, d.version_doc, d.nombre_archivo, d.fecha_subida_do as fecha_subida,
           e.numero_control, e.nombrees + ' ' + e.apellido_paterno_es + isnull(' ' + e.apellido_materno_es, '') as alumno,
           e.carrera, e.plan_estudios, p.nombre_programa
    from documentos d
    inner join estudiantes e on d.numero_control = e.numero_control
    left join expedientes x on d.id_expediente = x.id_expediente
    left join programas_ss p on x.id_programa = p.id_programa
    where d.estatus_validacion_do = 'pendiente'
    order by d.fecha_subida_do;
end
go

-- Regresa el PDF de cualquier alumno para que el jefe lo revise.
create or alter procedure sp_ObtenerArchivoDocumento
    @id_documento int
as
begin
    set nocount on;

    select nombre_archivo, contenido_pdf
    from documentos
    where id_documento = @id_documento;
end
go

-- Acepta o rechaza un documento pendiente. Al rechazar, el comentario es obligatorio.
create or alter procedure sp_ValidarDocumento
    @id_documento int,
    @estatus varchar(20),
    @comentario varchar(500),
    @porcentaje int,
    @id_usuario int
as
begin
    set nocount on;
    set xact_abort on;

    declare @estatus_actual varchar(50), @tipo varchar(50), @numero_control varchar(20);
    select @estatus_actual = estatus_validacion_do, @tipo = tipo_documento, @numero_control = numero_control
    from documentos where id_documento = @id_documento;

    if @estatus_actual is null
        throw 50404, N'Documento no encontrado', 1;

    if @estatus_actual <> 'pendiente'
        throw 50409, N'Solo se pueden validar documentos pendientes', 1;

    if isnull(@estatus, '') not in ('aceptado', 'rechazado')
        throw 50400, N'El estatus debe ser aceptado o rechazado', 1;

    if @estatus = 'rechazado' and len(isnull(@comentario, '')) = 0
        throw 50400, N'Escribe qué le faltó al documento', 1;

    begin tran;
        update documentos
        set estatus_validacion_do = @estatus,
            observaciones_doc = case when @estatus = 'rechazado' then @comentario end,
            fecha_revision_do = dateadd(hour, -7, getutcdate()),
            revisado_por = (select id_coordinador from coordinadores where id_usuario = @id_usuario)
        where id_documento = @id_documento and estatus_validacion_do = 'pendiente';

        -- Si otro jefe lo valido al mismo tiempo, no se vuelve a cambiar.
        if @@rowcount = 0
            throw 50409, N'Solo se pueden validar documentos pendientes', 1;

        -- Kardex del plan anterior: se guarda el porcentaje de creditos que reviso el jefe.
        if @tipo = 'kardex' and @estatus = 'aceptado'
            insert into kardex (id_documento, porcentaje_cred) values (@id_documento, @porcentaje);

        insert into bitacora_logs (id_usuario, accion, detalles)
        values (@id_usuario, 'Validacion de documento',
                @tipo + ' del alumno ' + @numero_control + ': ' + @estatus);
    commit tran;
end
go