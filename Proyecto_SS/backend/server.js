// Punto de entrada del servidor.
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getPool } = require('./db');

const rutasAcceso = require('./rutas/rutasAcceso');
const rutasAdmin = require('./rutas/rutasAdmin');
const rutasProgramas = require('./rutas/rutasProgramas');

const rutasCuenta = require('./rutas/rutasCuenta');   
app.use('/api', rutasCuenta);                          
const app = express();
app.use(express.json());
app.use(cors());


app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Rutas de la API
app.use('/api', rutasAcceso);
app.use('/api/admin', rutasAdmin);
app.use('/api', rutasProgramas);

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
