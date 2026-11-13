// Token que se guardo al iniciar sesion.
const token = localStorage.getItem('token');

// Carga los roles disponibles al abrir la pagina.
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/admin/roles', {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        // Si no hay sesion de administrador, lo regresamos al login.
        if (response.status === 401 || response.status === 403) {
            alert('Necesitas iniciar sesión como Administrador.');
            window.location.href = 'index.html';
            return;
        }

        const roles = await response.json();

        const select = document.getElementById('rolSelect');
        select.innerHTML = '<option value="">-- Selecciona un rol --</option>';

        roles.forEach(rol => {
            select.innerHTML += `<option value="${rol.id_rol}">${rol.nombre_rol}</option>`;
        });
    } catch (error) {
        console.error('Error cargando los roles:', error);
        document.getElementById('rolSelect').innerHTML = '<option value="">Error al cargar roles</option>';
    }
});

// Envia los datos del nuevo usuario al servidor.
document.getElementById('adminForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const correoVal = document.getElementById('correo').value.trim().toLowerCase();
    const passVal = document.getElementById('password').value;
    const DOMINIOS = ['culiacan.tecnm.mx', 'tecnm.mx'];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoVal) || !DOMINIOS.includes(correoVal.split('@')[1])) {
        alert('El correo debe ser institucional.'); return;
    }
    if (passVal.length < 10 || passVal.length > 64 || !/[A-Z]/.test(passVal) || !/\d/.test(passVal)) {
        alert('La contraseña debe tener entre 10 y 64 caracteres, una mayúscula y un número.'); return;
    }
    
    const payload = {
        id_rol: document.getElementById('rolSelect').value,
        nombre: document.getElementById('nombre').value,
        paterno: document.getElementById('paterno').value,
        materno: document.getElementById('materno').value,
        departamento: document.getElementById('departamento').value,
        correo: document.getElementById('correo').value,
        password: document.getElementById('password').value
    };

    try {
        const response = await fetch('/api/admin/crear-usuario', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            alert(data.mensaje);
            document.getElementById('adminForm').reset();
        } else {
            alert('Error: ' + data.mensaje);
        }
    } catch (error) {
        console.error('Error de conexión:', error);
        alert('No se pudo conectar con el servidor.');
    }
});