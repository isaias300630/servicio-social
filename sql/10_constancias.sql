-- Constancia de terminacion del servicio social.
-- El PDF se guarda en la base
if col_length('constancias_terminacion', 'contenido_pdf') is null
    alter table constancias_terminacion add contenido_pdf varbinary(max) null;
go

-- Un servicio social solo puede tener una constancia 
if not exists (select 1 from sys.indexes where name = 'ux_constancia_expediente')
    create unique index ux_constancia_expediente on constancias_terminacion (id_expediente);
go

-- Alumnos con servicio activo y como van con sus requisitos.
-- Por cada requisito regresa el estatus de la version mas nueva (null = no lo ha entregado).
create or alter procedure sp_AlumnosParaConstancia
as
begin
    set nocount on;

    select x.id_expediente,
           e.numero_control,
           e.nombrees + ' ' + e.apellido_paterno_es + isnull(' ' + e.apellido_materno_es, '') as alumno,
           e.carrera,
           p.nombre_programa as programa,
           d.nombre_empresa_de as institucion,
           p.horas_requeridas,
           r1.estatus as reporte1,
           r2.estatus as reporte2,
           r3.estatus as reporte3,
           ct.estatus as carta_terminacion,
           case when r1.estatus = 'aceptado' and r2.estatus = 'aceptado' and r3.estatus = 'aceptado'
                     and ct.estatus = 'aceptado' then 1 else 0 end as listo,
           c.id_constancia,
           c.folio_unico as folio,
           c.fecha_emision_ct as fecha,
           c.archivo_pdf as nombre_archivo
    from expedientes x
    inner join estudiantes e on x.numero_control = e.numero_control
    inner join programas_ss p on x.id_programa = p.id_programa
    left join dependencias d on p.id_dependencia = d.id_dependencia
    left join constancias_terminacion c on c.id_expediente = x.id_expediente
    outer apply (select top 1 estatus_validacion_do as estatus from documentos
                 where id_expediente = x.id_expediente and tipo_documento = 'reporte_bimestral_1'
                 order by version_doc desc) r1
    outer apply (select top 1 estatus_validacion_do as estatus from documentos
                 where id_expediente = x.id_expediente and tipo_documento = 'reporte_bimestral_2'
                 order by version_doc desc) r2
    outer apply (select top 1 estatus_validacion_do as estatus from documentos
                 where id_expediente = x.id_expediente and tipo_documento = 'reporte_bimestral_3'
                 order by version_doc desc) r3
    outer apply (select top 1 estatus_validacion_do as estatus from documentos
                 where id_expediente = x.id_expediente and tipo_documento = 'carta_terminacion'
                 order by version_doc desc) ct
    where x.estatus_ex = 'activo'
    order by case when c.id_constancia is null then 0 else 1 end, alumno;
end
go


-- Guarda el PDF de la constancia que sube el Jefe de Vinculacion.
create or alter procedure sp_SubirConstancia
    @id_usuario int,
    @id_expediente int,
    @nombre_archivo varchar(255),
    @contenido varbinary(max)
as
begin
    set nocount on;
    set xact_abort on;

    declare @id_jefe int = (select id_jefe from jefes_vinculacion where id_usuario = @id_usuario);
    if @id_jefe is null
        throw 50404, N'Tu cuenta no está registrada como Jefe de Vinculación', 1;

    if not exists (select 1 from expedientes where id_expediente = @id_expediente and estatus_ex = 'activo')
        throw 50404, N'El servicio social no existe o no está activo', 1;

    -- Requisitos que todavia no estan aceptados 
    declare @faltan nvarchar(300);
    select @faltan = string_agg(r.nombre, ', ')
    from (values ('reporte_bimestral_1', N'Reporte bimestral 1'),
                 ('reporte_bimestral_2', N'Reporte bimestral 2'),
                 ('reporte_bimestral_3', N'Reporte bimestral 3'),
                 ('carta_terminacion', N'Carta de terminación')) as r(tipo, nombre)
    where isnull((select top 1 estatus_validacion_do from documentos
                  where id_expediente = @id_expediente and tipo_documento = r.tipo
                  order by version_doc desc), '') <> 'aceptado';

    if @faltan is not null
    begin
        declare @mensaje nvarchar(400) = N'Faltan documentos por aceptar: ' + @faltan;
        throw 50400, @mensaje, 1;
    end

    declare @hoy date = cast(dateadd(hour, -7, getutcdate()) as date);
    declare @numero_control varchar(20) = (select numero_control from expedientes where id_expediente = @id_expediente);
    declare @id_constancia int, @folio varchar(100), @reemplazo bit = 0;

    begin tran;
        select @id_constancia = id_constancia, @folio = folio_unico
        from constancias_terminacion with (updlock, holdlock)
        where id_expediente = @id_expediente;

        if @id_constancia is not null
        begin
            -- Ya tenia constancia: se cambia el PDF y se conserva el folio.
            set @reemplazo = 1;
            update constancias_terminacion
            set archivo_pdf = @nombre_archivo, contenido_pdf = @contenido,
                fecha_emision_ct = @hoy, id_jefe = @id_jefe
            where id_constancia = @id_constancia;

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Constancia reemplazada', @folio + ' alumno ' + @numero_control);
        end
        else
        begin
            -- Primera vez: folio consecutivo del año 
            declare @prefijo varchar(20) = 'ITC-SS-' + cast(year(@hoy) as varchar(4)) + '-';
            declare @siguiente int = 1 + (select count(*) from constancias_terminacion with (updlock, holdlock)
                                          where folio_unico like @prefijo + '%');
            set @folio = @prefijo + right('0000' + cast(@siguiente as varchar(10)), 4);

            insert into constancias_terminacion
                (id_expediente, id_jefe, folio_unico, fecha_emision_ct, archivo_pdf, contenido_pdf, estatus_ct)
            values (@id_expediente, @id_jefe, @folio, @hoy, @nombre_archivo, @contenido, 'enviada');

            set @id_constancia = scope_identity();

            -- Se cierran las fechas y se completan las horas del programa.
            update x set x.fechafin_ex = @hoy, x.horas_acumuladas = p.horas_requeridas
            from expedientes x
            inner join programas_ss p on x.id_programa = p.id_programa
            where x.id_expediente = @id_expediente;

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Constancia enviada', @folio + ' alumno ' + @numero_control);
        end
    commit tran;

    select @id_constancia as id_constancia, @folio as folio, @reemplazo as reemplazo;
end
go


-- Regresa el PDF de la constancia.
create or alter procedure sp_ObtenerArchivoConstancia
    @id_usuario int,
    @id_constancia int
as
begin
    set nocount on;

    declare @rol varchar(50) = (select r.nombre_rol from usuarios u
                                inner join catalogo_roles r on u.id_rol = r.id_rol
                                where u.id_usuario = @id_usuario);

    select c.archivo_pdf as nombre_archivo, c.contenido_pdf
    from constancias_terminacion c
    inner join expedientes x on c.id_expediente = x.id_expediente
    inner join estudiantes e on x.numero_control = e.numero_control
    where c.id_constancia = @id_constancia
      and c.contenido_pdf is not null
      and (@rol <> 'Alumno' or e.id_usuario = @id_usuario);
end
go