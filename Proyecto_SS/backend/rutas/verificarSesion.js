// Revisa que la peticion traiga un token valido antes de entrar a una ruta protegida.
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
        req.usuario = datos; // datos del usuario disponibles en la ruta
        next();
    } catch (err) {
        return res.status(401).json({ success: false, mensaje: 'Sesion invalida o expirada' });
    }
}

module.exports = verificarSesion;
