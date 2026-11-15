# Sistema de Gestión del Servicio Social — TecNM Campus Culiacán

Página web con base de datos (SQL Server / Azure SQL) y backend en Node.js.

## Estructura del proyecto

```
Proyecto_SS/
├── sql/
│   ├── 01_tablas.sql          → crea las 16 tablas
│   ├── 02_datos_iniciales.sql → roles, tipos de documento y admin inicial
│   └── 03_procedimientos.sql  → sp_ValidarLogin, sp_RegistrarAlumno, sp_RegistrarCoordinador
├── backend/
│   ├── server.js              → arranca el servidor
│   ├── db.js                  → conexión a Azure SQL (lee el .env)
│   ├── .env                   → credenciales (NO subir a GitHub)
│   ├── .env.example           → plantilla del .env
│   ├── package.json
│   └── rutas/
│       ├── rutasAcceso.js     → /api/login y /api/webhook/forms
│       ├── rutasAdmin.js      → /api/admin/roles y /api/admin/crear-usuario
│       └── rutasProgramas.js  → /api/programas
├── frontend/
│   ├── index.html             → pantalla de login
│   ├── admin.html             → alta de personal
│   ├── css/estilos.css
│   └── js/
│       ├── login.js
│       └── admin.js
└── uploads/                   → aquí se guardarán los PDF (pendiente)
```

## Pasos para levantarlo

### 1. Base de datos (una sola vez)
En Azure Data Studio o SSMS, conéctate a tu base y ejecuta **en este orden**:
1. `sql/01_tablas.sql`
2. `sql/02_datos_iniciales.sql`
3. `sql/03_procedimientos.sql`
4. `sql/04_recuperacion_contrasena.sql`
5. `sql/05_modulo_alumno.sql`
6. `sql/06_reporte_bimestral.sql`
7. `sql/07_validar_documentos.sql`

### 2. Backend
```bash
cd backend
npm install
# revisa que el archivo .env tenga tus datos de Azure
npm start
```
Verás: `Servidor corriendo en http://localhost:3000`

### 3. Abrir la página
En el navegador: **http://localhost:3000/index.html**

El servidor ya sirve el frontend, así que no necesitas abrir los HTML con doble clic.

## Usuario de prueba (admin)
- Correo: `admin@tecnm.mx`
- Contraseña: `Admin12345`

Con él entras al login, te manda a `admin.html` y desde ahí das de alta a los jefes.

## Recuperación de contraseña (olvidé mi contraseña)

Requiere correr `sql/04_recuperacion_contrasena.sql` y configurar las variables `SMTP_*` del `.env`
(ver `.env.example`). Sin SMTP y con `NODE_ENV` distinto de `production`, el código se imprime en la consola del servidor.

| Paso | Método y ruta | Cuerpo (JSON) |
|---|---|---|
| 1. Pedir código | `POST /api/recuperar-contrasena/solicitar` | `{ "correo": "..." }` |
| 2. Validar código (opcional) | `POST /api/recuperar-contrasena/verificar` | `{ "correo": "...", "codigo": "123456" }` |
| 3. Cambiar contraseña | `POST /api/recuperar-contrasena/restablecer` | `{ "correo": "...", "codigo": "123456", "nueva": "...", "confirmacion": "..." }` |

Reglas: código de 6 dígitos, vence en 15 min, un solo uso, 5 intentos máximo, 1 solicitud por minuto y 5 por hora.
El código se guarda como hash (HMAC-SHA256), la respuesta al solicitar es igual exista o no el correo, y al
restablecer se desbloquea la cuenta. Todo queda en la bitácora.

## Reporte de alumnos sin reporte bimestral (CU12)

Requiere correr `sql/06_reporte_bimestral.sql` (después de 01 a 05). Solo lo puede usar el Jefe de Oficina de SS.
Pantalla: `reporte-bimestral.html` (botón **Reportes bimestrales** del panel del jefe), con botón para imprimir o guardar como PDF.

| Método y ruta | Parámetros (URL) |
|---|---|
| `GET /api/reportes/carreras` | — |
| `GET /api/reportes/sin-reporte-bimestral` | `bimestre` (1 a 3, obligatorio), `periodo` (id, opcional; sin él usa el activo), `carrera` (opcional) |

Un reporte cuenta como **entregado** solo si su versión más reciente está `pendiente` o `aceptado`.
Sin documento, o con el último `rechazado`, el alumno aparece en la lista.

## Módulo del alumno (`alumno.html`)

Todas las rutas piden sesión de **Alumno**: sin token responden 401 y con otro rol 403.

| Método y ruta | Qué hace | Respuestas |
|---|---|---|
| `GET /api/alumno/panel` | Datos del alumno, su programa, sus documentos y fechas de reportes | 200 |
| `PUT /api/alumno/datos` | `{ telefono, domicilio, direccion }` (teléfono de 10 dígitos) | 200, 400 |
| `GET /api/alumno/programas` | Programas aprobados del periodo activo, con lugares y de su plan | 200 |
| `POST /api/alumno/solicitud` | `{ id_programa }` crea su expediente y descuenta un lugar | 201, 400, 409 |
| `POST /api/alumno/documentos` | Formulario con `tipo` y `archivo` (PDF de máximo 5 MB) | 201, 400, 409, 503 |
| `GET /api/alumno/documentos/:id` | Regresa el PDF si es del alumno | 200, 400, 404 |

Reglas: solo PDF reales de máximo 5 MB; el kárdex solo para Plan Viejo; no se puede volver a subir un documento en revisión o aceptado
(si fue rechazado se guarda como nueva versión); los reportes bimestrales solo dentro de sus fechas (hora de Culiacán);
un alumno solo puede tener un servicio activo; máximo 5 subidas al mismo tiempo (503 si hay más).

## Validar documentos (`validar.html`, CU11)

Requiere correr `sql/07_validar_documentos.sql`. Rutas para el **Jefe de Oficina de SS** y el **Jefe de Vinculacion** (otro rol responde 403).

| Método y ruta | Qué hace | Respuestas |
|---|---|---|
| `GET /api/validacion/pendientes` | Documentos de alumnos en estatus pendiente | 200 |
| `GET /api/validacion/documentos/:id` | Regresa el PDF para revisarlo | 200, 400, 404 |
| `PUT /api/validacion/documentos/:id` | `{ estatus: "aceptado" \| "rechazado", comentario, porcentaje }` | 200, 400, 404, 409 |

Reglas: solo se validan documentos pendientes (409 si ya se validó); al rechazar, el comentario es obligatorio y el alumno lo ve
para subir una nueva versión; al aceptar el kárdex del plan anterior se guarda el porcentaje de créditos (0 a 100); todo queda en la bitácora.

## Pendientes (lo que falta por hacer)
- `registro.html` y `dashboard_jefe.html` (el login ya redirige a ellos).
- Subida de archivos PDF con `multer` hacia la carpeta `uploads/` o Azure Blob Storage.
- Cifrar contraseñas con `bcrypt` (ahora se guardan en texto plano, solo para pruebas).
- Bloqueo tras 3 intentos fallidos (las columnas ya existen en la tabla `usuarios`).
```
