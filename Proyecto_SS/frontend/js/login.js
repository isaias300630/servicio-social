document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const correo_institucional = document.getElementById('correo_institucional').value;
    const password = document.getElementById('password').value;

    
    const DOMINIOS = ['culiacan.tecnm.mx'];
    const correoChk = correo_institucional.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoChk) || !DOMINIOS.includes(correoChk.split('@')[1])) {
        alert('Usa tu correo institucional.'); return;
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

            // Guardamos el token y los datos de la sesion para las otras paginas.
            localStorage.setItem('token', data.token);
            localStorage.setItem('usuario', JSON.stringify(data));

            // Redirigir segun el rol, cada uno a su pantalla.
            if (data.rol === 'Alumno') {
                window.location.href = 'cuenta.html';
            } else if (data.rol === 'Administrador') {
                window.location.href = 'admin.html';
            } else if (data.rol === 'Jefe de Oficina de SS') {
                window.location.href = 'programas.html';
            } else if (data.rol === 'Jefe de Vinculacion') {
                window.location.href = 'constancias.html';
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