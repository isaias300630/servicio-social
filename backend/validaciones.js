// Validaciones que se usan en varias rutas

// Todos los correos (alumnos y personal) deben ser institucionales.
const DOMINIO = 'culiacan.tecnm.mx';

function esCorreoInstitucional(correo) {
    const limpio = String(correo || '').trim().toLowerCase();
    return /^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(limpio) && limpio.endsWith('@' + DOMINIO);
}

// Politica de contrasenas: entre 10 y 64 caracteres, al menos una mayuscula y un numero.
const MIN_CONTRASENA = 10;
const MAX_CONTRASENA = 64;

function cumplePolitica(contrasena) {
    return typeof contrasena === 'string'
        && contrasena.length >= MIN_CONTRASENA
        && contrasena.length <= MAX_CONTRASENA
        && /[A-Z]/.test(contrasena)
        && /\d/.test(contrasena);
}

const MENSAJE_POLITICA = `La contraseña debe tener entre ${MIN_CONTRASENA} y ${MAX_CONTRASENA} caracteres, al menos una mayúscula y un número`;

// El id que viene en la URL debe ser un numero entero mayor a 0.
function esIdValido(valor) {
    return /^\d+$/.test(String(valor)) && Number(valor) > 0;
}

// Numero entero dentro de un rango (horas, cupo, semestre...).
function esEnteroEnRango(valor, minimo, maximo) {
    if (valor === null || valor === undefined || String(valor).trim() === '') return false;
    const numero = Number(valor);
    return Number.isInteger(numero) && numero >= minimo && numero <= maximo;
}

// Texto obligatorio que no pase de cierto largo.
function esTextoValido(valor, largoMaximo) {
    return typeof valor === 'string' && valor.trim() !== '' && valor.trim().length <= largoMaximo;
}

module.exports = {
    DOMINIO,
    esCorreoInstitucional,
    cumplePolitica,
    MENSAJE_POLITICA,
    esIdValido,
    esEnteroEnRango,
    esTextoValido
};
