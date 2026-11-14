-- Recuperacion de contrasena por codigo enviado al correo.
-- Correr despues de 01, 02 y 03. Se puede volver a correr completo.
-- Errores propios: 50400 = datos incorrectos (igual que en 03_procedimientos.sql).


/* ---------------------------------------------------------------------
   TABLA
   --------------------------------------------------------------------- */

-- Cada vez que alguien pide recuperar su contrasena se crea un registro.
-- El codigo NUNCA se guarda en texto plano, solo su hash (HMAC-SHA256 en hexadecimal).
if object_id('recuperacion_contrasena', 'U') is null
begin
    create table recuperacion_contrasena (
        id_recuperacion int identity(1,1) primary key,
        id_usuario int not null foreign key references usuarios(id_usuario),
        codigo_hash char(64) not null,
        fecha_creacion_rc datetime not null default getdate(),
        fecha_expira_rc datetime not null,
        intentos_rc int not null default 0,
        usado_rc bit not null default 0
    );

    create index ix_recuperacion_usuario on recuperacion_contrasena (id_usuario, usado_rc);
end
go


/* ---------------------------------------------------------------------
   PROCEDIMIENTOS
   --------------------------------------------------------------------- */

-- Crea un codigo nuevo para el correo indicado.
-- Regresa una columna "resultado":
--   'ok'        -> se creo el codigo, hay que mandar el correo (tambien regresa nombre).
--   'no_existe' -> el correo no esta registrado o la cuenta esta inactiva.
--   'espera'    -> ya se pidio un codigo hace muy poco (evita que se abuse del envio).
-- Node responde lo mismo en los tres casos para no revelar que correos existen.
create or alter procedure sp_CrearCodigoRecuperacion
    @correo varchar(100),
    @codigo_hash char(64),
    @minutos_vigencia int,
    @segundos_espera int,
    @maximo_por_hora int
as
begin
    set nocount on;
    set xact_abort on;

    declare @id_usuario int, @nombre varchar(310);

    select
        @id_usuario = u.id_usuario,
        @nombre = coalesce(e.nombrees, c.nombreco, j.nombreje, ad.nombre_ad, 'Usuario')
    from usuarios u
    left join estudiantes e on u.id_usuario = e.id_usuario
    left join coordinadores c on u.id_usuario = c.id_usuario
    left join jefes_vinculacion j on u.id_usuario = j.id_usuario
    left join administradores ad on u.id_usuario = ad.id_usuario
    where u.correousu = lower(@correo)
      and u.activo_usu = 1;

    if @id_usuario is null
    begin
        select 'no_existe' as resultado;
        return;
    end

    begin try
        begin tran;

            -- Bloquea las filas del usuario para que dos peticiones al mismo tiempo
            -- no creen dos codigos.
            declare @ultimo datetime, @en_ultima_hora int;

            select
                @ultimo = max(fecha_creacion_rc),
                @en_ultima_hora = sum(case when fecha_creacion_rc > dateadd(hour, -1, getdate()) then 1 else 0 end)
            from recuperacion_contrasena with (updlock, holdlock)
            where id_usuario = @id_usuario;

            if (@ultimo is not null and @ultimo > dateadd(second, -@segundos_espera, getdate()))
               or isnull(@en_ultima_hora, 0) >= @maximo_por_hora
            begin
                rollback tran;

                insert into bitacora_logs (id_usuario, accion, detalles)
                values (@id_usuario, 'Recuperacion de contrasena', 'Solicitud de codigo rechazada por exceso de solicitudes');

                select 'espera' as resultado;
                return;
            end

            -- Los codigos anteriores que no se usaron dejan de servir.
            update recuperacion_contrasena
            set usado_rc = 1
            where id_usuario = @id_usuario
              and usado_rc = 0;

            insert into recuperacion_contrasena (id_usuario, codigo_hash, fecha_expira_rc)
            values (@id_usuario, @codigo_hash, dateadd(minute, @minutos_vigencia, getdate()));

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Recuperacion de contrasena', 'Se generó un código de recuperación');

        commit tran;

        select 'ok' as resultado, @id_usuario as id_usuario, @nombre as nombre;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go

-- Revisa que el codigo escrito sea el correcto y siga vigente.
-- Si es incorrecto, suma un intento; al llegar al maximo el codigo deja de servir.
-- Si es correcto, regresa id_recuperacion e id_usuario (NO lo marca como usado).
create or alter procedure sp_VerificarCodigoRecuperacion
    @correo varchar(100),
    @codigo_hash char(64),
    @maximo_intentos int
as
begin
    set nocount on;

    declare @id_recuperacion int, @id_usuario int, @hash_guardado char(64), @intentos int;

    -- Solo el codigo mas reciente, sin usar, sin expirar y con intentos disponibles.
    select top 1
        @id_recuperacion = r.id_recuperacion,
        @id_usuario = r.id_usuario,
        @hash_guardado = r.codigo_hash,
        @intentos = r.intentos_rc
    from recuperacion_contrasena r
    inner join usuarios u on u.id_usuario = r.id_usuario
    where u.correousu = lower(@correo)
      and u.activo_usu = 1
      and r.usado_rc = 0
      and r.fecha_expira_rc > getdate()
      and r.intentos_rc < @maximo_intentos
    order by r.fecha_creacion_rc desc;

    if @id_recuperacion is null
        throw 50400, N'El código no es válido o ya expiró. Solicita uno nuevo', 1;

    if @hash_guardado <> @codigo_hash
    begin
        -- Un solo update es atomico: dos intentos simultaneos se cuentan los dos.
        update recuperacion_contrasena
        set intentos_rc = intentos_rc + 1,
            usado_rc = case when intentos_rc + 1 >= @maximo_intentos then 1 else 0 end
        where id_recuperacion = @id_recuperacion;

        declare @restantes int = @maximo_intentos - (@intentos + 1);
        declare @mensaje nvarchar(200) =
            case when @restantes > 0
                 then concat(N'El código es incorrecto. Te quedan ', @restantes, N' intento(s)')
                 else N'El código es incorrecto y ya no es válido. Solicita uno nuevo'
            end;

        insert into bitacora_logs (id_usuario, accion, detalles)
        values (@id_usuario, 'Recuperacion de contrasena', 'Se capturó un código incorrecto');

        throw 50400, @mensaje, 1;
    end

    select @id_recuperacion as id_recuperacion, @id_usuario as id_usuario;
end
go

-- Guarda la nueva contrasena (ya cifrada) y "quema" el codigo para que no se vuelva a usar.
-- Tambien desbloquea la cuenta por si estaba bloqueada por intentos fallidos.
create or alter procedure sp_RestablecerContrasena
    @id_recuperacion int,
    @hash varchar(255)
as
begin
    set nocount on;
    set xact_abort on;

    begin try
        begin tran;

            declare @id_usuario int;

            -- Se vuelve a revisar dentro de la transaccion (con bloqueo) por si el mismo
            -- codigo se intenta usar dos veces al mismo tiempo.
            select @id_usuario = id_usuario
            from recuperacion_contrasena with (updlock, rowlock)
            where id_recuperacion = @id_recuperacion
              and usado_rc = 0
              and fecha_expira_rc > getdate();

            if @id_usuario is null
                throw 50400, N'El código no es válido o ya expiró. Solicita uno nuevo', 1;

            update usuarios
            set contrausu = @hash,
                intentos_fallidos = 0,
                bloqueado_hasta = null
            where id_usuario = @id_usuario;

            update recuperacion_contrasena
            set usado_rc = 1
            where id_recuperacion = @id_recuperacion;

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Recuperacion de contrasena', 'La contraseña se restableció con código de recuperación');

        commit tran;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go
