// Punto de entrada del servidor.
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPool } = require('./db');

const rutasAcceso = require('./rutas/rutasAcceso');
const rutasAdmin = require('./rutas/rutasAdmin');
const rutasProgramas = require('./rutas/rutasProgramas');
const rutasCuenta = require('./rutas/rutasCuenta');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Sirve el frontend (HTML, CSS, JS) desde la carpeta /frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Rutas de la API
app.use('/api', rutasAcceso);
app.use('/api/admin', rutasAdmin);
app.use('/api', rutasProgramas);
app.use('/api', rutasCuenta);

// Si piden una ruta de la API que no existe.
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, mensaje: 'La ruta solicitada no existe' });
});

// Manejador general de errores
app.use((err, req, res, next) => {
    // El cuerpo de la peticion no es un JSON valido.
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, mensaje: 'Los datos enviados no tienen un formato JSON válido' });
    }
    // El cuerpo de la peticion es demasiado grande.
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, mensaje: 'Los datos enviados son demasiado grandes' });
    }
    console.error('Error no controlado:', err);
    res.status(500).json({ success: false, mensaje: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    try {
        await getPool();
        console.log('Conexion verificada con Azure SQL.');
    } catch (err) {
        console.error('No se pudo conectar a Azure SQL:', err.message);
    }
});
