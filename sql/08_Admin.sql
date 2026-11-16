-- Panel del Administrador: resumen del sistema y consulta de la bitacora de auditoria.

create or alter procedure sp_ResumenAdmin
as
begin
    set nocount on;

    declare @hoy_inicio datetime = dateadd(hour, 7, cast(cast(dateadd(hour, -7, getutcdate()) as date) as datetime));

    select
        (select count(*) from usuarios where activo_usu = 1) as usuarios_activos,
        (select count(*) from usuarios u inner join catalogo_roles r on u.id_rol = r.id_rol
          where r.nombre_rol = 'Alumno' and u.activo_usu = 1) as alumnos,
        (select count(*) from usuarios u inner join catalogo_roles r on u.id_rol = r.id_rol
          where r.nombre_rol <> 'Alumno' and u.activo_usu = 1) as personal,
        (select count(*) from programas_ss) as programas,
        (select count(*) from documentos where estatus_validacion_do = 'pendiente') as documentos_pendientes,
        (select count(*) from bitacora_logs where fecha_hora_bl >= @hoy_inicio) as movimientos_hoy,
        (select top 1 nombre_periodo from periodos_escolares where estatus_activo_pe = 1) as periodo_activo;
end
go


create or alter procedure sp_FiltrosBitacora
as
begin
    set nocount on;

    select distinct accion
    from bitacora_logs
    order by accion;

    select id_rol, nombre_rol
    from catalogo_roles
    order by id_rol;
end
go

-- Movimientos de la bitacora con filtros y por paginas, el mas reciente primero.
create or alter procedure sp_ConsultarBitacora
    @desde date,
    @hasta date,
    @accion varchar(255),
    @id_rol int,
    @texto varchar(100),
    @pagina int,
    @tamano int
as
begin
    set nocount on;

    if @pagina is null or @pagina < 1 set @pagina = 1;
    if @tamano is null or @tamano < 1 or @tamano > 1000 set @tamano = 25;

    if @desde is not null and @hasta is not null and @desde > @hasta
        throw 50400, N'La fecha inicial no puede ser mayor que la final', 1;

    declare @desde_utc datetime = case when @desde is null then null
                                       else dateadd(hour, 7, cast(@desde as datetime)) end;
    declare @hasta_utc datetime = case when @hasta is null then null
                                       else dateadd(hour, 7, dateadd(day, 1, cast(@hasta as datetime))) end;

    set @texto = nullif(ltrim(rtrim(@texto)), '');
    set @accion = nullif(ltrim(rtrim(@accion)), '');

    -- Movimientos que cumplen el filtro, con el nombre y rol de quien los hizo.
    select b.id_log,
           dateadd(hour, -7, b.fecha_hora_bl) as fecha_local,
           b.accion,
           -- El codigo de recuperacion (aunque este cifrado) no se muestra.
           case when b.accion = 'Recuperacion: codigo generado' then '(código de recuperación oculto)'
                else b.detalles end as detalles,
           u.correousu as correo,
           r.nombre_rol as rol,
           coalesce(
               e.nombrees + ' ' + e.apellido_paterno_es,
               c.nombreco + ' ' + c.apellido_paterno_co,
               j.nombreje + ' ' + j.apellido_paterno_je,
               ad.nombre_ad + isnull(' ' + ad.apellido_paterno_ad, ''),
               u.correousu,
               'Sistema'
           ) as usuario
    into #movimientos
    from bitacora_logs b
    left join usuarios u on b.id_usuario = u.id_usuario
    left join catalogo_roles r on u.id_rol = r.id_rol
    left join estudiantes e on u.id_usuario = e.id_usuario
    left join coordinadores c on u.id_usuario = c.id_usuario
    left join jefes_vinculacion j on u.id_usuario = j.id_usuario
    left join administradores ad on u.id_usuario = ad.id_usuario
    where (@desde_utc is null or b.fecha_hora_bl >= @desde_utc)
      and (@hasta_utc is null or b.fecha_hora_bl < @hasta_utc)
      and (@accion is null or b.accion = @accion)
      and (@id_rol is null or u.id_rol = @id_rol);

    -- La busqueda de texto se aplica despues para buscar tambien en el nombre.
    if @texto is not null
        delete from #movimientos
        where isnull(usuario, '') not like '%' + @texto + '%'
          and isnull(correo, '') not like '%' + @texto + '%'
          and isnull(detalles, '') not like '%' + @texto + '%';

    select count(*) as total from #movimientos;

    select id_log, fecha_local, accion, detalles, correo, rol, usuario
    from #movimientos
    order by fecha_local desc, id_log desc
    offset (@pagina - 1) * @tamano rows fetch next @tamano rows only;

    drop table #movimientos;
end
go