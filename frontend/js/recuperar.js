// Flujo de recuperacion de contrasena en 3 pasos:
// 1. Solicitar codigo al correo institucional
// 2. Verificar el codigo de 6 digitos
// 3. Guardar la nueva contrasena

const formSolicitar = document.getElementById('formSolicitar');
const formVerificar = document.getElementById('formVerificar');
const formRestablecer = document.getElementById('formRestablecer');
const enlaceReenviar = document.getElementById('reenviarCodigo');

const inputCorreo = document.getElementById('correo');
const inputCodigo = document.getElementById('codigo');
const inputNueva = document.getElementById('nueva');
const inputConfirmacion = document.getElementById('confirmacion');

let correoActual = '';
let codigoActual = '';

// Si venimos del login con un correo ya escrito en la URL (?correo=...), lo rellenamos.
const params = new URLSearchParams(window.location.search);
if (params.get('correo')) {
    inputCorreo.value = params.get('correo');
}

// Paso 1: Solicitar codigo por correo
formSolicitar.addEventListener('submit', async (e) => {
    e.preventDefault();

    const correo = inputCorreo.value.trim().toLowerCase();
    if (!/^[^\s@]+@culiacan\.tecnm\.mx$/.test(correo)) {
        return alert('Usa tu correo institucional (@culiacan.tecnm.mx).');
    }

    const boton = document.getElementById('btnSolicitar');
    boton.disabled = true;

    try {
        const res = await fetch('/api/recuperar-contrasena/solicitar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo })
        });

        const data = await res.json();
        alert(data.mensaje);

        if (res.ok && data.success) {
            correoActual = correo;
            formSolicitar.hidden = true;
            formVerificar.hidden = false;
            enlaceReenviar.hidden = false;
            inputCodigo.focus();
        }
    } catch (err) {
        console.error(err);
        alert('No se pudo conectar con el servidor.');
    } finally {
        boton.disabled = false;
    }
});

// Paso 2: Verificar codigo de 6 digitos
formVerificar.addEventListener('submit', async (e) => {
    e.preventDefault();

    const codigo = inputCodigo.value.trim();
    if (!/^\d{6}$/.test(codigo)) {
        return alert('Escribe el código de 6 dígitos que recibiste en tu correo.');
    }

    const boton = document.getElementById('btnVerificar');
    boton.disabled = true;

    try {
        const res = await fetch('/api/recuperar-contrasena/verificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo: correoActual, codigo })
        });

        const data = await res.json();
        alert(data.mensaje);

        if (res.ok && data.success) {
            codigoActual = codigo;
            formVerificar.hidden = true;
            enlaceReenviar.hidden = true;
            formRestablecer.hidden = false;
            inputNueva.focus();
        }
    } catch (err) {
        console.error(err);
        alert('No se pudo conectar con el servidor.');
    } finally {
        boton.disabled = false;
    }
});

// Paso 3: Guardar la nueva contrasena
formRestablecer.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nueva = inputNueva.value;
    const confirmacion = inputConfirmacion.value;

    if (nueva !== confirmacion) {
        return alert('La nueva contraseña y su confirmación no coinciden.');
    }
    if (nueva.length < 10 || nueva.length > 64 || !/[A-Z]/.test(nueva) || !/\d/.test(nueva)) {
        return alert('La contraseña debe tener entre 10 y 64 caracteres, al menos una mayúscula y un número.');
    }

    const boton = document.getElementById('btnRestablecer');
    boton.disabled = true;

    try {
        const res = await fetch('/api/recuperar-contrasena/restablecer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                correo: correoActual,
                codigo: codigoActual,
                nueva,
                confirmacion
            })
        });

        const data = await res.json();
        alert(data.mensaje);

        if (res.ok && data.success) {
            window.location.href = 'index.html';
        }
    } catch (err) {
        console.error(err);
        alert('No se pudo conectar con el servidor.');
    } finally {
        boton.disabled = false;
    }
});

// Volver al paso 1 para pedir un codigo nuevo
enlaceReenviar.addEventListener('click', (e) => {
    e.preventDefault();
    inputCodigo.value = '';
    formVerificar.hidden = true;
    enlaceReenviar.hidden = true;
    formSolicitar.hidden = false;
});
