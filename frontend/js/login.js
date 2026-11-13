// Inicio de sesion para todos los roles.
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const correo_institucional = document.getElementById('correo_institucional').value.trim().toLowerCase();
    const password = document.getElementById('password').value;

    // Solo correos @culiacan.tecnm.mx
    if (!/^[^\s@]+@culiacan\.tecnm\.mx$/.test(correo_institucional)) {
        alert('Usa tu correo institucional (@culiacan.tecnm.mx).');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo_institucional, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert(`¡Bienvenido! ${data.mensaje} (${data.nombre})`);

            // Token 
            localStorage.setItem('token', data.token);
            localStorage.setItem('usuario', JSON.stringify(data));

            // Cada rol va a su pantalla.
            if (data.rol === 'Alumno') {
                window.location.href = 'cuenta.html';
            } else if (data.rol === 'Administrador') {
                window.location.href = 'admin.html';
            } else if (data.rol === 'Jefe de Oficina de SS') {
                window.location.href = 'jefe.html';
            } else if (data.rol === 'Jefe de Vinculacion') {
                window.location.href = 'cuenta.html'; 
            } else {
                alert('Este usuario no tiene una pantalla asignada.');
            }
        } else {
            alert('Error: ' + data.mensaje);
        }
    } catch (error) {
        console.error('Error en la petición:', error);
        alert('No se pudo conectar con el servidor.');
    }
});


//en proceso

// Enlaces de ayuda del login.
document.getElementById('enlaceAyuda').addEventListener('click', (e) => {
    e.preventDefault();
    alert('Acude a la Oficina de Servicio Social del Instituto Tecnológico de Culiacán.');
});

document.getElementById('enlaceOlvido').addEventListener('click', (e) => {
    e.preventDefault();
    alert('Pide a la Oficina de Servicio Social que restablezca tu contraseña.');
});
