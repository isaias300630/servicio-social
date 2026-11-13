// Traduce los errores de SQL Server a respuestas HTTP.
function responderErrorSql(res, err, contexto) {
    const numero = err.number;

    // 50400, 50404, 50409...: errores que lanzan nuestros procedimientos.
  
    if (numero >= 50400 && numero <= 50499) {
        return res.status(numero - 50000).json({ success: false, mensaje: err.message });
    }

    // 2627 y 2601: se intento guardar algo repetido (llave primaria o unica).
    if (numero === 2627 || numero === 2601) {
        return res.status(409).json({ success: false, mensaje: 'El registro ya existe' });
    }

    // 547: se rompio una relacion entre tablas.
    if (numero === 547) {
        const alBorrar = String(err.message).includes('DELETE');
        return res.status(alBorrar ? 409 : 400).json({
            success: false,
            mensaje: alBorrar
                ? 'No se puede borrar porque otros registros dependen de él'
                : 'Uno de los datos hace referencia a un registro que no existe'
        });
    }

    // 2628 y 8152: un texto es mas largo de lo que permite la columna.
    if (numero === 2628 || numero === 8152) {
        return res.status(400).json({ success: false, mensaje: 'Uno de los textos es demasiado largo' });
    }

    // EPARAM: un dato no tiene el tipo correcto 
    if (err.code === 'EPARAM') {
        return res.status(400).json({ success: false, mensaje: 'Uno de los datos no tiene el formato correcto' });
    }

    // falla del servidor.
    console.error((contexto || 'Error en la base de datos') + ':', err);
    return res.status(500).json({ success: false, mensaje: 'Error interno del servidor' });
}

module.exports = { responderErrorSql };
