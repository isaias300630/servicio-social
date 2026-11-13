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

## Pendientes (lo que falta por hacer)
- `registro.html` y `dashboard_jefe.html` (el login ya redirige a ellos).
- Subida de archivos PDF con `multer` hacia la carpeta `uploads/` o Azure Blob Storage.
- Cifrar contraseñas con `bcrypt` (ahora se guardan en texto plano, solo para pruebas).
- Bloqueo tras 3 intentos fallidos (las columnas ya existen en la tabla `usuarios`).
```
