-- Procedimientos almacenados del sistema de Servicio Social.
-- Usan "create or alter", asi que el archivo se puede volver a correr completo.
-- Errores propios: 50400 = datos incorrectos, 50404 = no existe, 50409 = ya existe o tiene datos ligados.


/* ---------------------------------------------------------------------
   BITACORA
   --------------------------------------------------------------------- */

-- Guarda un movimiento en la bitacora (quien, que y detalles).
create or alter procedure sp_RegistrarBitacora
    @id_usuario int,
    @accion varchar(255),
    @detalles varchar(max)
as
begin
    set nocount on;

    insert into bitacora_logs (id_usuario, accion, detalles)
    values (@id_usuario, @accion, @detalles);
end
go


/* ---------------------------------------------------------------------
   ACCESO
   --------------------------------------------------------------------- */

-- Busca al usuario por su correo y regresa su contrasena cifrada,
-- su nombre y su rol. La contrasena se compara en Node con bcrypt.
create or alter procedure sp_ValidarLogin
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

-- Registra a un alumno desde el formulario del curso de induccion.
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
    set xact_abort on;

    -- El correo tiene que ser institucional.
    if lower(@correo) not like '%_@culiacan.tecnm.mx'
        throw 50400, N'El correo debe terminar en @culiacan.tecnm.mx', 1;

    -- No se puede repetir el numero de control ni el correo.
    if exists (select 1 from estudiantes where numero_control = @numero_control)
       or exists (select 1 from usuarios where correousu = lower(@correo))
        throw 50409, N'El alumno ya está registrado', 1;

    declare @id_rol_alumno int = (select id_rol from catalogo_roles where nombre_rol = 'Alumno');
    declare @nuevo_id int;

    begin try
        begin tran;

            insert into usuarios (correousu, contrausu, id_rol, activo_usu)
            values (lower(@correo), @password, @id_rol_alumno, 1);

            set @nuevo_id = scope_identity();

            insert into estudiantes (numero_control, id_usuario, nombrees, apellido_paterno_es,
                                     apellido_materno_es, carrera, semestre, plan_estudios)
            values (@numero_control, @nuevo_id, @nombre, @paterno,
                    @materno, @carrera, @semestre, @plan_estudios);

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@nuevo_id, 'Alta de alumno', 'Alumno registrado desde el formulario: ' + @numero_control);

        commit tran;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go


/* ---------------------------------------------------------------------
   ADMINISTRACION
   --------------------------------------------------------------------- */

-- Roles que el administrador puede asignar (el Alumno se registra por el formulario).
create or alter procedure sp_ObtenerRoles
as
begin
    set nocount on;

    select id_rol, nombre_rol
    from catalogo_roles
    where nombre_rol <> 'Alumno'
    order by id_rol;
end
go

-- Da de alta a un Jefe de Oficina, Jefe de Vinculacion o Administrador.
-- @id_admin es el administrador que hace el registro (para la bitacora).
create or alter procedure sp_RegistrarPersonal
    @correo varchar(100),
    @password varchar(255),
    @id_rol int,
    @nombre varchar(100),
    @paterno varchar(100),
    @materno varchar(100),
    @depto varchar(100),
    @id_admin int
as
begin
    set nocount on;
    set xact_abort on;

    declare @nombre_rol varchar(50) = (select nombre_rol from catalogo_roles where id_rol = @id_rol);

    -- El rol debe existir y no puede ser Alumno.
    if @nombre_rol is null or @nombre_rol = 'Alumno'
        throw 50400, N'El rol no es válido', 1;

    -- No se puede repetir el correo.
    if exists (select 1 from usuarios where correousu = lower(@correo))
        throw 50409, N'El usuario ya se encuentra registrado', 1;

    declare @nuevo_id int;

    begin try
        begin tran;

            insert into usuarios (correousu, contrausu, id_rol, activo_usu)
            values (lower(@correo), @password, @id_rol, 1);

            set @nuevo_id = scope_identity();

            -- Sus datos van en la tabla que corresponde a su rol.
            if @nombre_rol = 'Jefe de Oficina de SS'
                insert into coordinadores (id_usuario, nombreco, apellido_paterno_co, apellido_materno_co, departamento_co)
                values (@nuevo_id, @nombre, @paterno, @materno, @depto);
            else if @nombre_rol = 'Jefe de Vinculacion'
                insert into jefes_vinculacion (id_usuario, nombreje, apellido_paterno_je, apellido_materno_je, departamento_je)
                values (@nuevo_id, @nombre, @paterno, @materno, @depto);
            else if @nombre_rol = 'Administrador'
                insert into administradores (id_usuario, nombre_ad, apellido_paterno_ad, apellido_materno_ad, nivel_acceso_ad)
                values (@nuevo_id, @nombre, @paterno, @materno, @depto);

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_admin, 'Alta de personal',
                    concat('Se registró a ', lower(@correo), ' como ', @nombre_rol));

        commit tran;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go

-- Procedimiento anterior, reemplazado por sp_RegistrarPersonal.
drop procedure if exists sp_RegistrarCoordinador;
go


/* ---------------------------------------------------------------------
   CUENTA (cambiar contrasena, para cualquier usuario)
   --------------------------------------------------------------------- */

-- Regresa la contrasena cifrada del usuario para compararla en Node.
create or alter procedure sp_ObtenerContrasena
    @id_usuario int
as
begin
    set nocount on;

    if not exists (select 1 from usuarios where id_usuario = @id_usuario and activo_usu = 1)
        throw 50404, N'Usuario no encontrado', 1;

    select contrausu
    from usuarios
    where id_usuario = @id_usuario;
end
go

-- Guarda la nueva contrasena (ya cifrada) y lo anota en la bitacora.
create or alter procedure sp_CambiarContrasena
    @id_usuario int,
    @hash varchar(255)
as
begin
    set nocount on;
    set xact_abort on;

    if not exists (select 1 from usuarios where id_usuario = @id_usuario and activo_usu = 1)
        throw 50404, N'Usuario no encontrado', 1;

    begin try
        begin tran;

            update usuarios
            set contrausu = @hash
            where id_usuario = @id_usuario;

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Cambio de contrasena', 'El usuario cambió su contraseña');

        commit tran;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go


/* ---------------------------------------------------------------------
   CATALOGOS
   --------------------------------------------------------------------- */

create or alter procedure sp_ListarDependencias
as
begin
    set nocount on;

    select id_dependencia, nombre_empresa_de
    from dependencias
    order by nombre_empresa_de;
end
go

create or alter procedure sp_ListarPeriodos
as
begin
    set nocount on;

    select id_periodo, nombre_periodo, estatus_activo_pe
    from periodos_escolares
    order by fecha_inicio_pe desc;
end
go


/* ---------------------------------------------------------------------
   PROGRAMAS DE SERVICIO SOCIAL (CRUD)
   --------------------------------------------------------------------- */

-- Lista de programas para la tabla de la pantalla.
create or alter procedure sp_ListarProgramas
as
begin
    set nocount on;

    select p.id_programa, p.numero_folio, p.nombre_programa, p.tipo_pro, p.estatus_pro,
           p.area_departamento, p.nombre_responsable, p.horas_requeridas,
           p.cupo_alumnos, p.cupo_disponible,
           d.nombre_empresa_de as institucion,
           pe.nombre_periodo as periodo
    from programas_ss p
    left join dependencias d on p.id_dependencia = d.id_dependencia
    left join periodos_escolares pe on p.id_periodo = pe.id_periodo
    order by p.id_programa desc;
end
go

-- Un programa con todos sus datos 
create or alter procedure sp_ObtenerPrograma
    @id_programa int
as
begin
    set nocount on;

    if not exists (select 1 from programas_ss where id_programa = @id_programa)
        throw 50404, N'Programa no encontrado', 1;

    select *
    from programas_ss
    where id_programa = @id_programa;
end
go

-- Crea un programa. Siempre empieza como "pendiente".
create or alter procedure sp_CrearPrograma
    @folio varchar(50),
    @nombre varchar(150),
    @tipo varchar(50),
    @origen varchar(20),
    @plan varchar(50),
    @area varchar(100),
    @responsable varchar(100),
    @puesto varchar(100),
    @actividades varchar(max),
    @objetivo varchar(max),
    @horario varchar(255),
    @horas int,
    @cupo int,
    @id_dependencia int,
    @id_periodo int,
    @id_usuario int
as
begin
    set nocount on;
    set xact_abort on;

    -- La dependencia y el periodo, si se eligieron, deben existir.
    if @id_dependencia is not null and not exists (select 1 from dependencias where id_dependencia = @id_dependencia)
        throw 50400, N'La dependencia seleccionada no existe', 1;

    if @id_periodo is not null and not exists (select 1 from periodos_escolares where id_periodo = @id_periodo)
        throw 50400, N'El periodo seleccionado no existe', 1;

    -- No repetir el mismo programa en la misma dependencia y periodo.
    if exists (select 1 from programas_ss
               where nombre_programa = @nombre
                 and isnull(id_dependencia, 0) = isnull(@id_dependencia, 0)
                 and isnull(id_periodo, 0) = isnull(@id_periodo, 0))
        throw 50409, N'Ya existe un programa con ese nombre en la misma dependencia y periodo', 1;

    declare @nuevo_id int;

    begin try
        begin tran;

            insert into programas_ss
                (numero_folio, nombre_programa, tipo_pro, estatus_pro, origen_pro, plan_educativo_pro,
                 area_departamento, nombre_responsable, puesto_responsable, actividades_realizar,
                 objetivo, horario_perfil, horas_requeridas, cupo_alumnos, cupo_disponible,
                 id_dependencia, id_periodo)
            values
                (@folio, @nombre, @tipo, 'pendiente', @origen, @plan,
                 @area, @responsable, @puesto, @actividades,
                 @objetivo, @horario, @horas, @cupo, @cupo,
                 @id_dependencia, @id_periodo);

            set @nuevo_id = scope_identity();

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Alta de programa', concat('Programa #', @nuevo_id, ': ', @nombre));

        commit tran;

        select @nuevo_id as id_programa;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go

-- Actualiza todos los datos de un programa.
create or alter procedure sp_ActualizarPrograma
    @id_programa int,
    @folio varchar(50),
    @nombre varchar(150),
    @tipo varchar(50),
    @estatus varchar(50),
    @origen varchar(20),
    @plan varchar(50),
    @area varchar(100),
    @responsable varchar(100),
    @puesto varchar(100),
    @actividades varchar(max),
    @objetivo varchar(max),
    @horario varchar(255),
    @motivo varchar(300),
    @horas int,
    @cupo int,
    @id_dependencia int,
    @id_periodo int,
    @id_usuario int
as
begin
    set nocount on;
    set xact_abort on;

    if not exists (select 1 from programas_ss where id_programa = @id_programa)
        throw 50404, N'Programa no encontrado', 1;

    if @id_dependencia is not null and not exists (select 1 from dependencias where id_dependencia = @id_dependencia)
        throw 50400, N'La dependencia seleccionada no existe', 1;

    if @id_periodo is not null and not exists (select 1 from periodos_escolares where id_periodo = @id_periodo)
        throw 50400, N'El periodo seleccionado no existe', 1;

    -- Si se rechaza, el motivo es obligatorio; si no, se limpia.
    if @estatus = 'rechazado' and nullif(ltrim(rtrim(@motivo)), '') is null
        throw 50400, N'Escribe el motivo del rechazo', 1;

    if @estatus <> 'rechazado'
        set @motivo = null;

    -- No repetir el programa (sin contarse a si mismo).
    if exists (select 1 from programas_ss
               where id_programa <> @id_programa
                 and nombre_programa = @nombre
                 and isnull(id_dependencia, 0) = isnull(@id_dependencia, 0)
                 and isnull(id_periodo, 0) = isnull(@id_periodo, 0))
        throw 50409, N'Ya existe un programa con ese nombre en la misma dependencia y periodo', 1;

    -- Si cambia el cupo, los lugares libres cambian igual,
    -- pero nunca pueden quedar menos lugares que alumnos inscritos.
    declare @inscritos int = (select isnull(cupo_alumnos, 0) - isnull(cupo_disponible, isnull(cupo_alumnos, 0))
                              from programas_ss where id_programa = @id_programa);

    if @cupo < @inscritos
        throw 50409, N'El cupo no puede ser menor a los alumnos que ya están inscritos', 1;

    begin try
        begin tran;

            update programas_ss
            set numero_folio = @folio,
                nombre_programa = @nombre,
                tipo_pro = @tipo,
                estatus_pro = @estatus,
                origen_pro = @origen,
                plan_educativo_pro = @plan,
                area_departamento = @area,
                nombre_responsable = @responsable,
                puesto_responsable = @puesto,
                actividades_realizar = @actividades,
                objetivo = @objetivo,
                horario_perfil = @horario,
                motivo_rechazo = @motivo,
                horas_requeridas = @horas,
                cupo_disponible = @cupo - @inscritos,
                cupo_alumnos = @cupo,
                id_dependencia = @id_dependencia,
                id_periodo = @id_periodo
            where id_programa = @id_programa;

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Edicion de programa',
                    concat('Programa #', @id_programa, ': ', @nombre, ' (', @estatus, ')'));

        commit tran;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go

-- Borra un programa, solo si ningun alumno lo tiene ligado.
create or alter procedure sp_EliminarPrograma
    @id_programa int,
    @id_usuario int
as
begin
    set nocount on;
    set xact_abort on;

    declare @nombre varchar(150) = (select nombre_programa from programas_ss where id_programa = @id_programa);

    if @nombre is null
        throw 50404, N'Programa no encontrado', 1;

    if exists (select 1 from expedientes where id_programa = @id_programa)
       or exists (select 1 from solicitud_ss where id_programa = @id_programa)
        throw 50409, N'No se puede borrar: hay alumnos o solicitudes ligados a este programa. Cámbialo a "rechazado" en su lugar', 1;

    begin try
        begin tran;

            delete from programas_ss where id_programa = @id_programa;

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Baja de programa', concat('Programa #', @id_programa, ': ', @nombre));

        commit tran;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go
