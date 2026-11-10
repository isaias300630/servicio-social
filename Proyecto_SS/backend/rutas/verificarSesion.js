// Middleware: revisa que la peticion traiga un token valido.
// Se usa en las rutas que quieras proteger, poniendolo antes del controlador.
const jwt = require('jsonwebtoken');

function verificarSesion(req, res, next) {
    // El token llega en la cabecera: Authorization: Bearer <token>
    const cabecera = req.headers['authorization'];
    const token = cabecera && cabecera.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, mensaje: 'No hay sesion iniciada' });
    }

    try {
        const datos = jwt.verify(token, process.env.CLAVE_SECRETA);
        req.usuario = datos; // guardamos los datos del usuario para usarlos despues
        next();
    } catch (err) {
        return res.status(401).json({ success: false, mensaje: 'Sesion invalida o expirada' });
    }
}

module.exports = verificarSesion;
