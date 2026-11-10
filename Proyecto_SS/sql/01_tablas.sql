create table catalogo_roles (
    id_rol int identity(1,1) primary key,
    nombre_rol varchar(50) not null,
    descripcion varchar(150)
)
go

create table usuarios (
    id_usuario int identity(1,1) primary key,
    correousu varchar(100) not null unique,
    contrausu varchar(255) not null,
    id_rol int foreign key references catalogo_roles(id_rol),
    activo_usu bit default 1,
    intentos_fallidos int default 0,
    bloqueado_hasta datetime null,
    fecha_registro_usu datetime default getdate()
)
go

create table estudiantes (
    numero_control varchar(20) primary key,
    id_usuario int foreign key references usuarios(id_usuario),
    nombrees varchar(100) not null,
    apellido_paterno_es varchar(100) not null,
    apellido_materno_es varchar(100),
    curp char(18) unique,
    carrera varchar(100),
    semestre int,
    plan_estudios varchar(50),
    creditos_aprobados decimal(5,2),
    telefono_es varchar(10),
    domicilio_es varchar(255),
    direccion_es varchar(255),
    induccion_completa bit default 0
)
go

create table coordinadores (
    id_coordinador int identity(1,1) primary key,
    id_usuario int foreign key references usuarios(id_usuario),
    nombreco varchar(100) not null,
    apellido_paterno_co varchar(100) not null,
    apellido_materno_co varchar(100),
    curp_co char(18),
    departamento_co varchar(100)
)
go

create table jefes_vinculacion (
    id_jefe int identity(1,1) primary key,
    id_usuario int foreign key references usuarios(id_usuario),
    nombreje varchar(100) not null,
    apellido_paterno_je varchar(100) not null,
    apellido_materno_je varchar(100),
    curp_je char(18),
    departamento_je varchar(100)
)
go

create table administradores (
    id_administrador int identity(1,1) primary key,
    id_usuario int foreign key references usuarios(id_usuario),
    nombre_ad varchar(100) not null,
    apellido_paterno_ad varchar(100),
    apellido_materno_ad varchar(100),
    nivel_acceso_ad varchar(50)
)
go

create table periodos_escolares (
    id_periodo int identity(1,1) primary key,
    nombre_periodo varchar(50) not null,
    fecha_inicio_pe date not null,
    fecha_fin_pe date not null,
    estatus_activo_pe bit default 0
)
go

create table calendario_reportes (
    id_calendario int identity(1,1) primary key,
    id_periodo int foreign key references periodos_escolares(id_periodo),
    numero_bimestre int not null,
    fecha_inicio_cr date not null,
    fecha_limite_cr date not null
)
go

create table dependencias (
    id_dependencia int identity(1,1) primary key,
    nombre_empresa_de varchar(150) not null,
    origen_capital_de varchar(50),
    nombre_titular_de varchar(100),
    puesto_titular_de varchar(100),
    direccion_de varchar(255),
    telefono_contacto_de varchar(20),
    correo_contacto_de varchar(100)
)
go

create table programas_ss (
    id_programa int identity(1,1) primary key,
    id_dependencia int foreign key references dependencias(id_dependencia),
    id_periodo int foreign key references periodos_escolares(id_periodo),
    numero_control_propone varchar(20) foreign key references estudiantes(numero_control),
    numero_folio varchar(50),
    nombre_programa varchar(150) not null,
    tipo_pro varchar(50) not null,
    estatus_pro varchar(50) not null,
    origen_pro varchar(20) default 'banco',
    plan_educativo_pro varchar(50),
    area_departamento varchar(100),
    nombre_responsable varchar(100),
    puesto_responsable varchar(100),
    actividades_realizar varchar(max),
    objetivo varchar(max),
    horas_requeridas int,
    cupo_alumnos int,
    cupo_disponible int,
    horario_perfil varchar(255),
    motivo_rechazo varchar(300)
)
go

create table curso_induccion (
    id_curso int identity(1,1) primary key,
    numero_control varchar(20) foreign key references estudiantes(numero_control),
    fecha_asistencia_ci date,
    asistio_ci bit default 0,
    forms_lleno bit default 0,
    respuestas_forms varchar(max),
    activo_ci bit default 1
)
go

create table expedientes (
    id_expediente int identity(1,1) primary key,
    numero_control varchar(20) foreign key references estudiantes(numero_control),
    id_programa int foreign key references programas_ss(id_programa),
    id_periodo int foreign key references periodos_escolares(id_periodo),
    observaciones_ex varchar(max),
    fecha_solicitud_ex datetime default getdate(),
    fechainicio_ex date,
    fechafin_ex date,
    horas_acumuladas int default 0,
    estatus_ex varchar(50)
)
go

create table documentos (
    id_documento int identity(1,1) primary key,
    numero_control varchar(20) foreign key references estudiantes(numero_control),
    id_expediente int foreign key references expedientes(id_expediente),
    tipo_documento varchar(50) not null,
    version_doc int default 1,
    nombre_archivo varchar(255) not null,
    ruta_archivo varchar(255) not null,
    tamano_bytes int,
    observaciones_doc varchar(max),
    estatus_validacion_do varchar(50) default 'pendiente',
    revisado_por int foreign key references coordinadores(id_coordinador),
    fecha_revision_do datetime null,
    fecha_subida_do datetime default getdate()
)
go

create table reporte_bimestral (
    id_reporte int identity(1,1) primary key,
    id_documento int foreign key references documentos(id_documento),
    id_calendario int foreign key references calendario_reportes(id_calendario),
    n_bimestre int not null,
    horas_reportadas int default 0
)
go

create table carta_aceptacion (
    id_car_aceptacion int identity(1,1) primary key,
    id_documento int foreign key references documentos(id_documento),
    folio varchar(50),
    fecha_emision date
)
go

create table memoria_final (
    id_memoria int identity(1,1) primary key,
    id_documento int foreign key references documentos(id_documento),
    fecha_recepcion_usb date
)
go

create table solicitud_ss (
    id_solicitud int identity(1,1) primary key,
    id_documento int foreign key references documentos(id_documento),
    id_programa int foreign key references programas_ss(id_programa)
)
go

create table kardex (
    id_kardex int identity(1,1) primary key,
    id_documento int foreign key references documentos(id_documento),
    porcentaje_cred int
)
go

create table constancias_terminacion (
    id_constancia int identity(1,1) primary key,
    id_expediente int foreign key references expedientes(id_expediente),
    id_jefe int foreign key references jefes_vinculacion(id_jefe),
    folio_unico varchar(100) not null unique,
    fecha_emision_ct date not null,
    archivo_pdf varchar(255),
    estatus_ct varchar(50)
)
go

create table expedicion_formatos (
    id_expedicion int identity(1,1) primary key,
    numero_control varchar(20) foreign key references estudiantes(numero_control),
    id_coordinador int foreign key references coordinadores(id_coordinador),
    tipo_documento_ef varchar(100) not null,
    fecha_ef datetime default getdate()
)
go

create table bitacora_logs (
    id_log int identity(1,1) primary key,
    id_usuario int foreign key references usuarios(id_usuario),
    accion varchar(255) not null,
    fecha_hora_bl datetime default getdate(),
    detalles varchar(max)
)
go
