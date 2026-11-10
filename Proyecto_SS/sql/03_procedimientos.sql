create procedure sp_ValidarLogin
    @correo varchar(100)
as
begin
    set nocount on;

    select
        u.id_usuario,
        u.contrausu,
        coalesce(
            e.nombrees + ' ' + e.apellido_paterno_es + ' ' + isnull(e.apellido_materno_es, ''),
            c.nombreco + ' ' + c.apellido_paterno_co + ' ' + isnull(c.apellido_materno_co, ''),
            j.nombreje + ' ' + j.apellido_paterno_je + ' ' + isnull(j.apellido_materno_je, ''),
            ad.nombre_ad + ' ' + isnull(ad.apellido_paterno_ad, ''),
            'Administrador'
        ) as nombre_completo,
        r.nombre_rol as rol,
        isnull(e.numero_control, 'N/A') as numero_control
    from usuarios u
    inner join catalogo_roles r on u.id_rol = r.id_rol
    left join estudiantes e on u.id_usuario = e.id_usuario
    left join coordinadores c on u.id_usuario = c.id_usuario
    left join jefes_vinculacion j on u.id_usuario = j.id_usuario
    left join administradores ad on u.id_usuario = ad.id_usuario
    where u.correousu = @correo
      and u.activo_usu = 1;
end
go
create or alter procedure sp_RegistrarAlumno
    @numero_control varchar(20),
    @correo varchar(100),
    @password varchar(255),
    @nombre varchar(100),
    @paterno varchar(100),
    @materno varchar(100),
    @carrera varchar(100),
    @semestre int,
    @plan_estudios varchar(50)
as
begin
    set nocount on;
    begin try
        if lower(@correo) not like '%_@culiacan.tecnm.mx'
            raiserror('El correo debe terminar en @culiacan.tecnm.mx', 16, 1);

        begin tran;

        declare @id_rol_alumno int;
        select @id_rol_alumno = id_rol from catalogo_roles where nombre_rol = 'Alumno';

        declare @nuevo_id_usuario int;

        insert into usuarios (correousu, contrausu, id_rol, activo_usu)
        values (lower(@correo), @password, @id_rol_alumno, 1);

        set @nuevo_id_usuario = scope_identity();

        insert into estudiantes (numero_control, id_usuario, nombrees, apellido_paterno_es, apellido_materno_es, carrera, semestre, plan_estudios)
        values (@numero_control, @nuevo_id_usuario, @nombre, @paterno, @materno, @carrera, @semestre, @plan_estudios);

        commit tran;
    end try
    begin catch
        if @@trancount > 0
            rollback tran;
        throw;
    end catch
end
go

create procedure sp_RegistrarCoordinador
    @correo varchar(100),
    @password varchar(255),
    @id_rol int,
    @nombre varchar(100),
    @paterno varchar(100),
    @materno varchar(100),
    @depto varchar(100)
as
begin
    set nocount on;
    begin try
        begin tran;

        declare @nuevo_id_usuario int;

        insert into usuarios (correousu, contrausu, id_rol, activo_usu)
        values (@correo, @password, @id_rol, 1);

        set @nuevo_id_usuario = scope_identity();

        declare @nombre_rol varchar(50);
        select @nombre_rol = nombre_rol from catalogo_roles where id_rol = @id_rol;

        if @nombre_rol = 'Jefe de Vinculacion'
            insert into jefes_vinculacion (id_usuario, nombreje, apellido_paterno_je, apellido_materno_je, departamento_je)
            values (@nuevo_id_usuario, @nombre, @paterno, @materno, @depto);
        else if @nombre_rol = 'Jefe de Oficina de SS'
            insert into coordinadores (id_usuario, nombreco, apellido_paterno_co, apellido_materno_co, departamento_co)
            values (@nuevo_id_usuario, @nombre, @paterno, @materno, @depto);
        else if @nombre_rol = 'Administrador'
            insert into administradores (id_usuario, nombre_ad, apellido_paterno_ad, apellido_materno_ad, nivel_acceso_ad)
            values (@nuevo_id_usuario, @nombre, @paterno, @materno, @depto);

        insert into bitacora_logs (id_usuario, accion, detalles)
        values (
            @nuevo_id_usuario,
            'Alta usuario',
            'Se registro al personal: ' + @correo + ' con rol id: ' + cast(@id_rol as varchar)
        );

        commit tran;
    end try
    begin catch
        if @@trancount > 0
            rollback tran;
        throw;
    end catch
end
go
