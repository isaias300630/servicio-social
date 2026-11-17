-- Modulo del alumno: datos de contacto, solicitud de programa
--y entrega de documentos PDF.



-- El PDF se guarda dentro de la base para que no se pierda al reiniciar el servidor.
if col_length('documentos', 'contenido_pdf') is null
    alter table documentos add contenido_pdf varbinary(max) null;
go

-- Fechas de los 3 reportes bimestrales: cada uno se recibe durante su bimestre y 7 dias despues.
insert into calendario_reportes (id_periodo, numero_bimestre, fecha_inicio_cr, fecha_limite_cr)
select p.id_periodo, b.numero,
       dateadd(month, 2 * (b.numero - 1), p.fecha_inicio_pe),
       dateadd(day, 7, dateadd(month, 2 * b.numero, p.fecha_inicio_pe))
from periodos_escolares p
cross join (values (1), (2), (3)) as b(numero)
where not exists (select 1 from calendario_reportes c where c.id_periodo = p.id_periodo);
go

-- Los alumnos que llenaron el formulario del curso ya tienen la induccion completa.
update estudiantes set induccion_completa = 1 where isnull(induccion_completa, 0) = 0;
go


-- Todo lo que muestra el panel del alumno: sus datos, su programa, sus documentos y las fechas de reportes.
create or alter procedure sp_PerfilAlumno
    @id_usuario int
as
begin
    set nocount on;

    declare @numero_control varchar(20) = (select numero_control from estudiantes where id_usuario = @id_usuario);
    if @numero_control is null
        throw 50404, N'Alumno no encontrado', 1;

    declare @id_expediente int = (select top 1 id_expediente from expedientes
                                  where numero_control = @numero_control and estatus_ex = 'activo');

    -- 1. Datos del alumno
    select numero_control, nombrees as nombre, carrera, semestre, plan_estudios,
           telefono_es as telefono, domicilio_es as domicilio, direccion_es as direccion,
           isnull(induccion_completa, 0) as induccion_completa
    from estudiantes
    where numero_control = @numero_control;

    -- 2. Su programa (si ya tiene)
    select p.nombre_programa, d.nombre_empresa_de as institucion, p.nombre_responsable,
           p.horario_perfil, p.horas_requeridas, x.horas_acumuladas
    from expedientes x
    inner join programas_ss p on x.id_programa = p.id_programa
    left join dependencias d on p.id_dependencia = d.id_dependencia
    where x.id_expediente = @id_expediente;

    -- 3. Sus documentos, la version mas nueva primero
    select id_documento, tipo_documento, version_doc, nombre_archivo,
           estatus_validacion_do as estatus, observaciones_doc as comentario
    from documentos
    where id_expediente = @id_expediente
    order by version_doc desc;

    -- 4. Fechas de los reportes del periodo activo
    select c.numero_bimestre, c.fecha_inicio_cr as inicio, c.fecha_limite_cr as limite,
           case when cast(getdate() as date) between c.fecha_inicio_cr and c.fecha_limite_cr then 1 else 0 end as abierto
    from calendario_reportes c
    inner join periodos_escolares pe on c.id_periodo = pe.id_periodo
    where pe.estatus_activo_pe = 1;

	
    -- 5. Su constancia de terminacion (si Vinculacion ya se la envio en PDF)
    select id_constancia, folio_unico as folio, fecha_emision_ct as fecha, archivo_pdf as nombre_archivo
    from constancias_terminacion
    where id_expediente = @id_expediente;
end

go

-- Guarda telefono, domicilio y direccion.
create or alter procedure sp_ActualizarDatosAlumno
    @id_usuario int,
    @telefono varchar(10),
    @domicilio varchar(255),
    @direccion varchar(255)
as
begin
    set nocount on;

    update estudiantes
    set telefono_es = @telefono, domicilio_es = @domicilio, direccion_es = @direccion
    where id_usuario = @id_usuario;

    insert into bitacora_logs (id_usuario, accion, detalles)
    values (@id_usuario, 'Actualizacion de datos', 'El alumno actualizo sus datos de contacto');
end
go

-- Programas aprobados del periodo activo, 
create or alter procedure sp_ProgramasDisponibles
    @id_usuario int
as
begin
    set nocount on;

    declare @plan varchar(50) = (select plan_estudios from estudiantes where id_usuario = @id_usuario);

    select p.id_programa, p.nombre_programa, d.nombre_empresa_de as institucion,
           p.horario_perfil, p.horas_requeridas, p.cupo_disponible
    from programas_ss p
    left join dependencias d on p.id_dependencia = d.id_dependencia
    inner join periodos_escolares pe on p.id_periodo = pe.id_periodo
    where pe.estatus_activo_pe = 1
      and p.estatus_pro = 'aprobado'
      and p.cupo_disponible > 0
      and (p.plan_educativo_pro is null or p.plan_educativo_pro = @plan);
end
go

-- El alumno elige un programa: se crea su expediente y se descuenta un lugar.
create or alter procedure sp_SolicitarPrograma
    @id_usuario int,
    @id_programa int
as
begin
    set nocount on;
    set xact_abort on;

    declare @numero_control varchar(20), @plan varchar(50), @induccion bit;
    select @numero_control = numero_control, @plan = plan_estudios, @induccion = isnull(induccion_completa, 0)
    from estudiantes where id_usuario = @id_usuario;

    if @induccion = 0
        throw 50400, N'Primero debes completar el curso de inducción', 1;

    if exists (select 1 from expedientes where numero_control = @numero_control and estatus_ex = 'activo')
        throw 50409, N'Ya cuentas con un servicio social activo', 1;

    -- El programa debe estar en la lista de disponibles para este alumno.
    declare @id_periodo int = (select p.id_periodo from programas_ss p
                               inner join periodos_escolares pe on p.id_periodo = pe.id_periodo
                               where p.id_programa = @id_programa and p.estatus_pro = 'aprobado'
                                 and pe.estatus_activo_pe = 1 and p.cupo_disponible > 0
                                 and (p.plan_educativo_pro is null or p.plan_educativo_pro = @plan));
    if @id_periodo is null
        throw 50400, N'El programa no está disponible para ti', 1;

    begin try
        begin tran;
            -- Por si dos alumnos toman el ultimo lugar al mismo tiempo.
            update programas_ss set cupo_disponible = cupo_disponible - 1
            where id_programa = @id_programa and cupo_disponible > 0;
            if @@rowcount = 0
                throw 50409, N'El programa ya no tiene lugares disponibles', 1;

            insert into expedientes (numero_control, id_programa, id_periodo, fechainicio_ex, estatus_ex)
            values (@numero_control, @id_programa, @id_periodo, getdate(), 'activo');

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (@id_usuario, 'Solicitud de programa', 'Programa #' + cast(@id_programa as varchar(10)));
        commit tran;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go

-- Guarda un PDF. Si el anterior fue rechazado se guarda como nueva version.
create or alter procedure sp_SubirDocumento
    @id_usuario int,
    @tipo varchar(50),
    @nombre_archivo varchar(255),
    @tamano int,
    @contenido varbinary(max)
as
begin
    set nocount on;
    set xact_abort on;

    declare @numero_control varchar(20), @plan varchar(50);
    select @numero_control = numero_control, @plan = plan_estudios from estudiantes where id_usuario = @id_usuario;

    declare @id_expediente int, @id_periodo int, @id_programa int;
    select top 1 @id_expediente = id_expediente, @id_periodo = id_periodo, @id_programa = id_programa
    from expedientes where numero_control = @numero_control and estatus_ex = 'activo';

    if @id_expediente is null
        throw 50400, N'Primero solicita un programa de servicio social', 1;

    if isnull(@tipo, '') not in ('solicitud', 'carta_aceptacion', 'kardex', 'reporte_bimestral_1', 'reporte_bimestral_2',
                     'reporte_bimestral_3', 'memoria_final', 'carta_terminacion')
        throw 50400, N'El tipo de documento no es válido', 1;

    if @tipo = 'kardex' and isnull(@plan, '') <> 'Plan Viejo'
        throw 50400, N'El kárdex solo lo entregan los alumnos del plan anterior', 1;

    -- Si ya hay uno en revision o aceptado, no se puede subir otro.
    declare @estatus varchar(50), @version int;
    select top 1 @estatus = estatus_validacion_do, @version = version_doc
    from documentos where id_expediente = @id_expediente and tipo_documento = @tipo
    order by version_doc desc;

    if @estatus in ('pendiente', 'aceptado')
        throw 50409, N'Este documento ya está en revisión o ya fue aceptado', 1;


    -- Los reportes bimestrales van en orden: el 2 se sube cuando el 1 ya se entrego, y el 3 despues del 2.
       -- Los reportes bimestrales van en orden: el 2 se sube cuando el 1 ya se entrego, y el 3 despues del 2.
    -- "Entregado" = en revision o aceptado (si el anterior lo rechazaron, primero se corrige ese).
    if @tipo in ('reporte_bimestral_2', 'reporte_bimestral_3')
    begin
        declare @anterior varchar(50) = 'reporte_bimestral_' + cast(cast(right(@tipo, 1) as int) - 1 as varchar(1));

        if not exists (select 1 from documentos
                       where id_expediente = @id_expediente
                         and tipo_documento = @anterior
                         and estatus_validacion_do in ('pendiente', 'aceptado'))
            throw 50400, N'Primero entrega el reporte bimestral anterior', 1;
    end

    set @version = isnull(@version, 0) + 1;

    -- Todo se guarda junto o no se guarda nada.
    begin tran;
        insert into documentos (numero_control, id_expediente, tipo_documento, version_doc, nombre_archivo,
                                ruta_archivo, tamano_bytes, contenido_pdf)
        values (@numero_control, @id_expediente, @tipo, @version, @nombre_archivo,
                'bd', @tamano, @contenido);

        declare @id_documento int = scope_identity();

        -- El reporte se liga a su bimestre del calendario.
        if @tipo like 'reporte_bimestral_%'
            insert into reporte_bimestral (id_documento, id_calendario, n_bimestre)
            select @id_documento, id_calendario, numero_bimestre
            from calendario_reportes
            where id_periodo = @id_periodo and numero_bimestre = cast(right(@tipo, 1) as int);

        -- La solicitud se liga al programa que eligio el alumno.
        if @tipo = 'solicitud'
            insert into solicitud_ss (id_documento, id_programa)
            values (@id_documento, @id_programa);

        insert into bitacora_logs (id_usuario, accion, detalles)
        values (@id_usuario, 'Subida de documento', @tipo + ' version ' + cast(@version as varchar(10)));
    commit tran;
end
go

-- Regresa el PDF solo si es del alumno que lo pide.
create or alter procedure sp_ObtenerArchivoAlumno
    @id_usuario int,
    @id_documento int
as
begin
    set nocount on;

    select d.nombre_archivo, d.contenido_pdf
    from documentos d
    inner join estudiantes e on d.numero_control = e.numero_control
    where d.id_documento = @id_documento and e.id_usuario = @id_usuario;
end
go