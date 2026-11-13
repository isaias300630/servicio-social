// Panel del Jefe de Oficina: 
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

if (!token || usuario.rol !== 'Jefe de Oficina de SS') {
    window.location.href = 'index.html';
}

// Evita que un texto se interprete como HTML.
function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

document.getElementById('saludo').textContent = 'Hola, ' + (usuario.nombre || 'Jefe de Oficina');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [resProgramas, resPeriodos] = await Promise.all([
            fetch('/api/programas'),
            fetch('/api/periodos', { headers: { 'Authorization': 'Bearer ' + token } })
        ]);

        // Si la sesion vencio, regresa al login.
        if (resPeriodos.status === 401) {
            alert('Tu sesión expiró. Inicia sesión de nuevo.');
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }

        const programas = await resProgramas.json();
        const periodos = await resPeriodos.json();

        mostrarResumen(programas);
        mostrarPendientes(programas);

        const activo = Array.isArray(periodos) && periodos.find(p => p.estatus_activo_pe);
        if (activo) {
            document.getElementById('periodoActivo').textContent = 'Periodo activo: ' + activo.nombre_periodo;
        }
    } catch (error) {
        console.error('Error al cargar el panel:', error);
        document.getElementById('listaPendientes').innerHTML = '<li>No se pudo conectar con el servidor.</li>';
    }
});

// Cuenta los programas por estatus y los lugares libres de los aprobados.
function mostrarResumen(programas) {
    const contar = (estatus) => programas.filter(p => p.estatus_pro === estatus).length;
    const pendientes = contar('pendiente');
    const lugares = programas
        .filter(p => p.estatus_pro === 'aprobado')
        .reduce((suma, p) => suma + (Number(p.cupo_disponible) || 0), 0);

    document.getElementById('totalProgramas').textContent = programas.length;
    document.getElementById('totalPendientes').textContent = pendientes;
    document.getElementById('totalAprobados').textContent = contar('aprobado');
    document.getElementById('totalRechazados').textContent = contar('rechazado');
    document.getElementById('totalLugares').textContent = lugares;

    const globo = document.getElementById('globoPendientes');
    if (pendientes > 0) {
        globo.textContent = pendientes;
        globo.hidden = false;
    }
}

// Lista los primeros 5 programas que esperan revision.
function mostrarPendientes(programas) {
    const lista = document.getElementById('listaPendientes');
    const pendientes = programas.filter(p => p.estatus_pro === 'pendiente').slice(0, 5);

    if (pendientes.length === 0) {
        lista.innerHTML = '<li>No hay programas pendientes. ¡Todo al día!</li>';
        return;
    }

    lista.innerHTML = pendientes.map(p => `
        <li>
            <span>
                <strong>${escapar(p.nombre_programa)}</strong>
                <small>${escapar(p.institucion || 'Sin dependencia')} · ${escapar(p.periodo || 'Sin periodo')}</small>
            </span>
            <a class="boton-chico" href="programas.html?estatus=pendiente&editar=${Number(p.id_programa)}">Revisar</a>
        </li>
    `).join('');
}

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});
