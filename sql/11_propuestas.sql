-- Propuesta propia: el alumno tiene dos opciones, elegir un programa del banco o crear su propuesta
-- con los mismos datos que usa el Jefe de Oficina al dar de alta un programa.
-- Correr despues de 10 (y volver a correr 05). Se puede volver a correr completo.
-- La propuesta se guarda en programas_ss con origen 'propuesta', estatus 'pendiente' y cupo 1.
-- Cuando el Jefe la aprueba en "Gestión de programas", solo el alumno que la propuso la ve para inscribirse.


-- El alumno manda su propuesta.
-- La dependencia se elige de la lista (@id_dependencia) o se escribe una nueva (@institucion);
-- si la nueva ya existe con el mismo nombre se reutiliza.
-- El periodo es el activo y el plan es el del alumno; el cupo siempre es 1.
create or alter procedure sp_ProponerPrograma
    @id_usuario int,
    @nombre varchar(150),
    @tipo varchar(50),
    @horas int,
    @id_dependencia int,
    @institucion varchar(150),
    @responsable varchar(100),
    @puesto varchar(100),
    @telefono varchar(20),
    @correo varchar(100),
    @area varchar(100),
    @horario varchar(255),
    @objetivo varchar(max),
    @actividades varchar(max)
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

    -- Solo una propuesta a la vez (si la rechazan, puede mandar otra).
    if exists (select 1 from programas_ss
               where numero_control_propone = @numero_control
                 and origen_pro = 'propuesta'
                 and estatus_pro in ('pendiente', 'aprobado'))
        throw 50409, N'Ya tienes una propuesta en revisión o aprobada', 1;

    declare @id_periodo int = (select top 1 id_periodo from periodos_escolares where estatus_activo_pe = 1);
    if @id_periodo is null
        throw 50400, N'No hay un periodo escolar activo para recibir propuestas', 1;

    if @id_dependencia is not null and not exists (select 1 from dependencias where id_dependencia = @id_dependencia)
        throw 50400, N'La dependencia seleccionada no existe', 1;

    if @id_dependencia is null and nullif(ltrim(rtrim(@institucion)), '') is null
        throw 50400, N'Elige una dependencia o escribe el nombre de la institución', 1;

    declare @id_programa int;

    begin tran;
        -- Dependencia nueva: se busca por nombre (sin importar mayusculas) o se crea.
        if @id_dependencia is null
            select top 1 @id_dependencia = id_dependencia
            from dependencias with (updlock, holdlock)
            where lower(ltrim(rtrim(nombre_empresa_de))) = lower(ltrim(rtrim(@institucion)));

        if @id_dependencia is null
        begin
            insert into dependencias (nombre_empresa_de, nombre_titular_de, puesto_titular_de,
                                      telefono_contacto_de, correo_contacto_de)
            values (@institucion, @responsable, @puesto, @telefono, @correo);
            set @id_dependencia = scope_identity();
        end

        -- La propuesta es un programa con un solo lugar (para el alumno que la propone).
        insert into programas_ss
            (id_dependencia, id_periodo, numero_control_propone, nombre_programa, tipo_pro, estatus_pro,
             origen_pro, plan_educativo_pro, area_departamento, nombre_responsable, puesto_responsable,
             actividades_realizar, objetivo, horario_perfil, horas_requeridas, cupo_alumnos, cupo_disponible)
        values
            (@id_dependencia, @id_periodo, @numero_control, @nombre, @tipo, 'pendiente',
             'propuesta', @plan, @area, @responsable, @puesto,
             @actividades, @objetivo, @horario, @horas, 1, 1);

        set @id_programa = scope_identity();

        insert into bitacora_logs (id_usuario, accion, detalles)
        values (@id_usuario, 'Propuesta de programa', concat('Programa #', @id_programa, ': ', @nombre));
    commit tran;

    select @id_programa as id_programa;
end
go


-- Propuestas que ha mandado el alumno, la mas nueva primero (con el motivo si la rechazaron).
create or alter procedure sp_MisPropuestas
    @id_usuario int
as
begin
    set nocount on;

    select p.id_programa, p.nombre_programa, d.nombre_empresa_de as institucion,
           p.estatus_pro as estatus, p.motivo_rechazo as motivo
    from programas_ss p
    inner join estudiantes e on p.numero_control_propone = e.numero_control
    left join dependencias d on p.id_dependencia = d.id_dependencia
    where e.id_usuario = @id_usuario
      and p.origen_pro = 'propuesta'
    order by p.id_programa desc;
end
go