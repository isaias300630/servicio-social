const token = localStorage.getItem('token');
if (!token) window.location.href = 'index.html';

// Cambiar contraseña
document.getElementById('formContrasena').addEventListener('submit', async (e) => {
    e.preventDefault();

    const actual = document.getElementById('actual').value;
    const nueva = document.getElementById('nueva').value;
    const confirmacion = document.getElementById('confirmacion').value;

    if (nueva !== confirmacion) {
        return alert('La nueva contraseña y su confirmación no coinciden.');
    }
    if (nueva.length < 10 || nueva.length > 64 || !/[A-Z]/.test(nueva) || !/\d/.test(nueva)) {
        return alert('La contraseña debe tener entre 10 y 64 caracteres, una mayúscula y un número.');
    }

    try {
        const res = await fetch('/api/cambiar-contrasena', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ actual, nueva })
        });

        const data = await res.json();
        alert(data.mensaje);
        if (res.ok) document.getElementById('formContrasena').reset();
    } catch (err) {
        console.error(err);
        alert('No se pudo conectar con el servidor.');
    }
});

// Cerrar sesión
document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});