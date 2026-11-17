-- CU13 / RF-13: Registrar y actualizar periodos escolares (Administrador del Sistema).
-- Correr despues de 01 a 08. Se puede volver a correr completo.
--
-- Reglas:
--   * Todos los campos son obligatorios y fecha_fin_pe > fecha_inicio_pe.
--   * Solo puede existir un periodo con estatus_activo_pe = 1 al mismo tiempo.
--   * Calcula y actualiza automaticamente las ventanas de los 3 reportes bimestrales en calendario_reportes.
--   * Registra el alta o edicion en bitacora_logs.


-- Lista todos los periodos con sus 3 fechas de reportes bimestrales y total de expedientes.
create or alter procedure sp_ListarPeriodosAdmin
as
begin
    set nocount on;

    select p.id_periodo,
           p.nombre_periodo,
           p.fecha_inicio_pe as fecha_inicio,
           p.fecha_fin_pe as fecha_fin,
           p.estatus_activo_pe as activo,
           (select count(*) from expedientes x where x.id_periodo = p.id_periodo) as expedientes,
           (select count(*) from programas_ss pr where pr.id_periodo = p.id_periodo) as programas,
           c1.fecha_inicio_cr as b1_inicio, c1.fecha_limite_cr as b1_limite,
           c2.fecha_inicio_cr as b2_inicio, c2.fecha_limite_cr as b2_limite,
           c3.fecha_inicio_cr as b3_inicio, c3.fecha_limite_cr as b3_limite
    from periodos_escolares p
    left join calendario_reportes c1 on c1.id_periodo = p.id_periodo and c1.numero_bimestre = 1
    left join calendario_reportes c2 on c2.id_periodo = p.id_periodo and c2.numero_bimestre = 2
    left join calendario_reportes c3 on c3.id_periodo = p.id_periodo and c3.numero_bimestre = 3
    order by p.estatus_activo_pe desc, p.fecha_inicio_pe desc, p.id_periodo desc;
end
go


-- Crea o actualiza un periodo escolar y recalcula sus 3 reportes bimestrales.
-- Si @id_periodo es NULL, crea uno nuevo; si trae valor, actualiza ese periodo.
-- Si @activo = 1 y existe otro periodo activo pero @confirmar_cambio_activo = 0,
-- lanza 50409 indicando cual es el periodo activo actual para que el Administrador confirme.
create or alter procedure sp_GuardarPeriodoEscolar
    @id_periodo int = null,
    @nombre varchar(50),
    @fecha_inicio date,
    @fecha_fin date,
    @activo bit,
    @confirmar_cambio_activo bit = 0,
    @id_admin int
as
begin
    set nocount on;
    set xact_abort on;

    set @nombre = ltrim(rtrim(isnull(@nombre, '')));
    if @nombre = '' or @fecha_inicio is null or @fecha_fin is null or @activo is null
        throw 50400, N'Todos los campos del periodo escolar son obligatorios', 1;

    if @fecha_fin <= @fecha_inicio
        throw 50400, N'La fecha de término debe ser posterior a la fecha de inicio', 1;

    if @id_periodo is not null and not exists (select 1 from periodos_escolares where id_periodo = @id_periodo)
        throw 50404, N'El periodo escolar no existe', 1;

    if exists (
        select 1 from periodos_escolares
        where lower(nombre_periodo) = lower(@nombre)
          and (@id_periodo is null or id_periodo <> @id_periodo)
    )
        throw 50409, N'Ya existe un periodo escolar con ese nombre', 1;

    declare @otro_activo_id int, @otro_activo_nombre varchar(50);
    select top 1 @otro_activo_id = id_periodo, @otro_activo_nombre = nombre_periodo
    from periodos_escolares
    where estatus_activo_pe = 1
      and (@id_periodo is null or id_periodo <> @id_periodo);

    if @activo = 1 and @otro_activo_id is not null and isnull(@confirmar_cambio_activo, 0) = 0
    begin
        declare @msg nvarchar(200) = concat(
            N'Ya existe otro periodo activo (', @otro_activo_nombre,
            N'). Confirma si deseas cerrarlo y dejar únicamente este como Activo'
        );
        throw 50409, @msg, 1;
    end

    begin try
        begin tran;

            if @activo = 1 and @otro_activo_id is not null
            begin
                update periodos_escolares
                set estatus_activo_pe = 0
                where estatus_activo_pe = 1
                  and (@id_periodo is null or id_periodo <> @id_periodo);
            end

            declare @es_nuevo bit = 0;
            if @id_periodo is null
            begin
                set @es_nuevo = 1;
                insert into periodos_escolares (nombre_periodo, fecha_inicio_pe, fecha_fin_pe, estatus_activo_pe)
                values (@nombre, @fecha_inicio, @fecha_fin, @activo);

                set @id_periodo = scope_identity();
            end
            else
            begin
                update periodos_escolares
                set nombre_periodo = @nombre,
                    fecha_inicio_pe = @fecha_inicio,
                    fecha_fin_pe = @fecha_fin,
                    estatus_activo_pe = @activo
                where id_periodo = @id_periodo;
            end

            -- Calcula las fechas de los 3 bimestres a partir de la fecha de inicio:
            -- Bimestre n: abre en inicio + 2*(n-1) meses y cierra en inicio + 2*n meses + 7 dias.
            declare @b int = 1;
            while @b <= 3
            begin
                declare @ini_b date = dateadd(month, 2 * (@b - 1), @fecha_inicio);
                declare @lim_b date = dateadd(day, 7, dateadd(month, 2 * @b, @fecha_inicio));

                if exists (select 1 from calendario_reportes where id_periodo = @id_periodo and numero_bimestre = @b)
                begin
                    update calendario_reportes
                    set fecha_inicio_cr = @ini_b,
                        fecha_limite_cr = @lim_b
                    where id_periodo = @id_periodo and numero_bimestre = @b;
                end
                else
                begin
                    insert into calendario_reportes (id_periodo, numero_bimestre, fecha_inicio_cr, fecha_limite_cr)
                    values (@id_periodo, @b, @ini_b, @lim_b);
                end

                set @b = @b + 1;
            end

            insert into bitacora_logs (id_usuario, accion, detalles)
            values (
                @id_admin,
                case when @es_nuevo = 1 then 'Alta de periodo escolar' else 'Actualizacion de periodo escolar' end,
                concat('Periodo ', @nombre, ' (', convert(varchar(10), @fecha_inicio, 23), ' a ',
                       convert(varchar(10), @fecha_fin, 23), ') - ',
                       case when @activo = 1 then 'Activo' else 'Inactivo' end)
            );

        commit tran;

        select @id_periodo as id_periodo;
    end try
    begin catch
        if @@trancount > 0 rollback tran;
        throw;
    end catch
end
go
