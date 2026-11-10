// Carga los roles disponibles al abrir la pagina.
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('http://localhost:3000/api/admin/roles');
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
        const response = await fetch('http://localhost:3000/api/admin/crear-usuario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        alert('No se pudo conectar con el servidor. Verifica que Node.js esté corriendo.');
    }
});
