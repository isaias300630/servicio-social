# Sistema de Gestión del Servicio Social — TecNM Campus Culiacán

Plataforma web para gestionar el proceso completo del Servicio Social en el **Instituto Tecnológico de Culiacán** (Tecnológico Nacional de México), desarrollada con **Node.js + Express**, **Microsoft Azure SQL Database** y frontend responsivo con identidad visual institucional.

---

## Estructura del proyecto

```text
servicio-social/
├── sql/
│   ├── 01_tablas.sql                   → Crea las tablas base del modelo de datos
│   ├── 02_datos_iniciales.sql          → Catálogo de roles, administrador inicial, periodos y dependencias
│   ├── 03_procedimientos.sql           → Login, bitácora, alta de alumnos/personal, cambio de contraseña y CRUD de programas
│   ├── 04_recuperacion_contrasena.sql  → Tabla y procedimientos de recuperación de contraseña por código
│   ├── 05_modulo_alumno.sql            → Perfil del alumno, datos de contacto, solicitud de programa y subida de PDFs
│   ├── 06_reporte_bimestral.sql        → Reporte de alumnos activos sin entrega de reporte bimestral (CU12)
│   ├── 07_validar_documentos.sql       → Revisión y dictamen de documentos PDF y kárdex (CU11)
│   ├── 08_Admin.sql                    → Resumen administrativo y consulta paginada de la bitácora (RNF-09)
│   ├── 09_periodos_escolares.sql       → Registro/edición de periodos escolares y cálculo de 3 bimestres (CU13)
│   ├── 10_constancias.sql              → Emisión y descarga de Constancias de Terminación con folio único (CU15)
│   └── 11_propuestas.sql               → Registro y dictamen de Propuestas Propias de alumnos (CU06 y CU07)
├── backend/
│   ├── server.js                       → Punto de entrada de Express y montaje de rutas /api
│   ├── db.js                           → Pool de conexión a Azure SQL (lee variables del .env)
│   ├── correo.js                       → Envío de correos SMTP con Nodemailer para códigos de recuperación
│   ├── validaciones.js                 → Validación de correo institucional (@culiacan.tecnm.mx), política de contraseña y rangos
│   ├── errores.js                      → Traductor de errores de SQL Server (50400/50404/50409) a respuestas HTTP
│   ├── .env.example                    → Plantilla de variables de entorno
│   ├── package.json
│   └── rutas/
│       ├── verificarSesion.js          → Middleware de autenticación por token JWT
│       ├── rutasAcceso.js              → /api/login y /api/webhook/forms (alta desde curso de inducción)
│       ├── rutasRecuperacion.js        → /api/recuperar-contrasena/* (solicitar, verificar y restablecer)
│       ├── rutasCuenta.js              → /api/cambiar-contrasena
│       ├── rutasAdmin.js               → /api/admin/* (roles, crear-usuario, resumen, bitácora y periodos)
│       ├── rutasProgramas.js           → /api/programas, /api/dependencias y /api/periodos (banco de programas)
│       ├── rutasPropuestas.js          → /api/alumno/propuestas y /api/propuestas (propuestas propias CU06/CU07)
│       ├── rutasAlumno.js              → /api/alumno/* (panel, datos, programas, solicitud y documentos PDF)
│       ├── rutasValidacion.js          → /api/validacion/* (documentos pendientes, ver PDF y aceptar/rechazar)
│       ├── rutasReportes.js            → /api/reportes/* (carreras y alumnos sin reporte bimestral CU12)
│       └── rutasConstancias.js         → /api/constancias/* (alumnos listos, subir y descargar constancia PDF CU15)
└── frontend/
    ├── index.html                      → Inicio de sesión institucional (CU02)
    ├── recuperar.html                  → Recuperación de contraseña en 3 pasos con código de 6 dígitos
    ├── cuenta.html                     → Cambio de contraseña para usuarios autenticados (CU04)
    ├── admin.html                      → Panel principal del Administrador del Sistema
    ├── personal.html                   → Alta de personal administrativo (CU01)
    ├── periodos.html                   → Administración de periodos escolares y calendario bimestral (CU13)
    ├── bitacora.html                   → Consulta paginada y filtrada de la bitácora de auditoría (RNF-09)
    ├── jefe.html                       → Panel principal del Jefe de Oficina de SS y Jefe de Vinculación
    ├── programas.html                  → Gestión del Banco de Programas de Servicio Social (CU05)
    ├── propuestas.html                 → Revisión y dictamen de Propuestas Propias de alumnos (CU07)
    ├── validar.html                    → Validación de documentos PDF y kárdex entregados por alumnos (CU11)
    ├── reporte-bimestral.html          → Reporte imprimible de alumnos sin reporte bimestral (CU12)
    ├── constancias.html                → Emisión y consulta de Constancias de Terminación en PDF (CU15)
    ├── alumno.html                     → Panel del Alumno (avance, solicitud del banco, subida de PDFs y datos CU03/06/09)
    ├── propuesta-propia.html           → Captura y seguimiento de Propuesta Propia del Alumno (CU06)
    ├── css/                            → Hojas de estilo institucionales (estilos.css, admin.css, jefe.css, alumno.css, etc.)
    └── js/                             → Lógica de cliente de cada pantalla
```

---

## Pasos para ejecutar el proyecto localmente

### 1. Base de datos (Azure SQL / SQL Server)
Si configuras una base de datos desde cero en SSMS o Azure Data Studio, ejecuta los scripts de `sql/` en orden numérico (`01_tablas.sql` hasta `11_propuestas.sql`).

### 2. Configurar variables de entorno e iniciar el Backend
```bash
cd backend
cp .env.example .env
# Edita .env con las credenciales de Azure SQL y SMTP
npm install
npm start
```
Verás en consola:
```text
Servidor corriendo en http://localhost:3000
Conexion verificada con Azure SQL.
```

### 3. Abrir en el navegador
Entra a: **http://localhost:3000/index.html**

#### Cuenta inicial de prueba (Administrador)
- **Correo:** `admin@culiacan.tecnm.mx`
- **Contraseña:** `Admin12345`

---

## Módulos y Endpoints de la API

### 1. Acceso, Inducción y Cuenta (`rutasAcceso.js`, `rutasCuenta.js`, `rutasRecuperacion.js`)
| Método y ruta | Rol | Descripción |
|---|---|---|
| `POST /api/login` | Público | Inicia sesión con correo `@culiacan.tecnm.mx`, emite token JWT (8 h) y registra en bitácora (CU02). |
| `POST /api/webhook/forms` | Webhook | Registra automáticamente al alumno desde el formulario del curso de inducción asignando su plan por número de control (PRE-CU01 / CU01). |
| `POST /api/cambiar-contrasena` | Autenticado | Actualiza la contraseña verificando la actual y la política de seguridad: 10–64 caracteres, 1 mayúscula y 1 número (CU04). |
| `POST /api/recuperar-contrasena/solicitar` | Público | Genera un código de 6 dígitos (vigencia 15 min, guardado con HMAC-SHA256 en Azure SQL) y lo envía por correo. |
| `POST /api/recuperar-contrasena/verificar` | Público | Verifica que el código de 6 dígitos sea correcto y tenga intentos disponibles (máx. 5 intentos). |
| `POST /api/recuperar-contrasena/restablecer` | Público | Valida el código, guarda la nueva contraseña cifrada con `bcrypt` e invalida el código. |

### 2. Administración, Periodos y Bitácora (`rutasAdmin.js`)
| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/admin/resumen` | Administrador | Totales de usuarios activos, alumnos, personal, programas, documentos pendientes y movimientos del día. |
| `GET /api/admin/roles` | Administrador | Catálogo de roles asignables al personal. |
| `POST /api/admin/crear-usuario` | Administrador | Registra Jefes de Oficina de SS, Jefes de Vinculación o Administradores (CU01). |
| `GET /api/admin/bitacora` | Administrador | Consulta paginada y filtrada por fechas, acción, rol y texto de `bitacora_logs` (RNF-09). |
| `GET /api/admin/periodos` | Administrador | Lista los periodos escolares con las fechas calculadas de sus 3 reportes bimestrales (CU13). |
| `POST /api/admin/periodos` | Administrador | Registra un periodo escolar, verifica que solo haya un periodo `Activo` (con confirmación) y calcula los 3 bimestres (CU13). |
| `PUT /api/admin/periodos/:id` | Administrador | Actualiza un periodo escolar y recalcula sus 3 ventanas de reportes bimestrales (CU13). |

### 3. Banco de Programas y Propuestas Propias (`rutasProgramas.js`, `rutasPropuestas.js`)
| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/programas` | Autenticado | Lista los programas registrados con su dependencia, periodo y cupo disponible. |
| `POST /api/programas` | Jefe Oficina / Vinculación | Registra un programa en el Banco de Propuestas (CU05). |
| `PUT /api/programas/:id` | Jefe Oficina / Vinculación | Actualiza un programa o cambia su estatus (`aprobado` / `rechazado` con motivo obligatorio). |
| `DELETE /api/programas/:id` | Jefe Oficina / Vinculación | Elimina un programa si no tiene expedientes ni solicitudes ligadas. |
| `GET /api/alumno/propuestas` | Alumno | Consulta los datos del alumno y el estado/historial de sus propuestas propias (`# de folio`, `status`, `# de control`, etc.). |
| `POST /api/alumno/propuestas` | Alumno | Registra una propuesta propia con todos los datos de empresa y proyecto, asignando folio consecutivo `PP-AAAA-0001` (CU06). |
| `GET /api/propuestas` | Jefe Oficina / Vinculación | Lista todas las propuestas propias subidas por alumnos con los 16 campos solicitados (CU07). |
| `PUT /api/propuestas/:id/dictamen` | Jefe Oficina / Vinculación | Aprueba (creando automáticamente el expediente activo del alumno) o rechaza con motivo obligatorio una propuesta propia (CU07). |

### 4. Panel del Alumno y Entrega de Documentos PDF (`rutasAlumno.js`)
| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/alumno/panel` | Alumno | Datos del alumno, su programa activo, sus documentos PDF, calendario bimestral y constancia de terminación. |
| `PUT /api/alumno/datos` | Alumno | Actualiza teléfono (10 dígitos), domicilio y dirección (CU03). |
| `GET /api/alumno/programas` | Alumno | Lista programas aprobados del periodo activo con cupo disponible y compatibles con su plan. |
| `POST /api/alumno/solicitud` | Alumno | Inscribe al alumno en un programa del banco descontando atómicamente un lugar disponible (CU06). |
| `POST /api/alumno/documentos` | Alumno | Sube un archivo PDF (`<= 5 MB`, validado por cabecera `%PDF`) creando nueva versión si el anterior fue rechazado (CU09). |
| `GET /api/alumno/documentos/:id` | Alumno | Visualiza el archivo PDF subido por el propio alumno. |

### 5. Validación de Documentos, Reporte Bimestral y Constancias (`rutasValidacion.js`, `rutasReportes.js`, `rutasConstancias.js`)
| Método y ruta | Rol | Descripción |
|---|---|---|
| `GET /api/validacion/pendientes` | Jefe Oficina / Vinculación | Lista los documentos PDF de alumnos en estatus `pendiente` (CU11). |
| `GET /api/validacion/documentos/:id` | Jefe Oficina / Vinculación | Abre el archivo PDF del alumno para revisión. |
| `PUT /api/validacion/documentos/:id` | Jefe Oficina / Vinculación | Acepta (registrando porcentaje de créditos en caso de kárdex) o rechaza con comentario obligatorio (CU11). |
| `GET /api/reportes/carreras` | Jefe Oficina / Vinculación | Lista las carreras registradas para filtrar el reporte bimestral. |
| `GET /api/reportes/sin-reporte-bimestral` | Jefe Oficina / Vinculación | Cruza alumnos activos contra entregas del bimestre (1, 2 o 3) y devuelve resumen y lista de omisos imprimible en PDF (CU12). |
| `GET /api/constancias/alumnos` | Jefe Oficina / Vinculación | Lista alumnos con servicio activo y el estado de sus 4 requisitos de liberación (`reportes 1, 2, 3` y `carta de terminación`) (CU15). |
| `POST /api/constancias` | Jefe Oficina / Vinculación | Sube la Constancia de Terminación en PDF asignando folio único `ITC-SS-AAAA-0001` y completando las horas del expediente (CU15). |
| `GET /api/constancias/:id/pdf` | Jefe / Alumno dueño | Descarga el PDF de la Constancia de Terminación. |

---

## Casos de uso pendientes por implementar
- **CU08 (RF-08):** Generación y expedición de formatos oficiales en archivo Word editable (`.docx`) con los datos precargados del alumno y su programa.
- **CU14 (RF-14):** Módulo en el panel del Administrador para cambiar el rol o estado (`Activo` / `Inactivo`) de cuentas existentes con confirmación explícita y ejecución de respaldos.
- **CU02 (Extensión 5b):** Activar el bloqueo temporal de 15 minutos tras 3 intentos fallidos de inicio de sesión usando las columnas `intentos_fallidos` y `bloqueado_hasta` de la tabla `usuarios`.
