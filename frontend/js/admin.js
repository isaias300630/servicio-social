// Panel del Administrador: resumen del sistema y ultimos movimientos de la bitacora.
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

if (!token || usuario.rol !== 'Administrador') {
    window.location.href = 'index.html';
}

// Evita que un texto se interprete como HTML.
function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// La bitacora ya viene en hora de Culiacan, se muestra tal cual.
function fechaHora(valor) {
    return new Date(valor).toLocaleString('es-MX', {
        timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

// Peticion con el token; si la sesion vencio regresa al login.
async function pedir(ruta) {
    const respuesta = await fetch(ruta, { headers: { 'Authorization': 'Bearer ' + token } });
    if (respuesta.status === 401 || respuesta.status === 403) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
    return respuesta;
}

document.getElementById('saludo').textContent = 'Hola, ' + (usuario.nombre || 'Administrador');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [resResumen, resBitacora] = await Promise.all([
            pedir('/api/admin/resumen'),
            pedir('/api/admin/bitacora?tamano=8')
        ]);
        const resumen = await resResumen.json();
        const bitacora = await resBitacora.json();

        if (resResumen.ok) mostrarResumen(resumen);
        mostrarMovimientos(resBitacora.ok ? bitacora.movimientos : []);
    } catch (error) {
        console.error('Error al cargar el panel:', error);
        document.getElementById('ultimosMovimientos').innerHTML = '<li>No se pudo conectar con el servidor.</li>';
    }
});

function mostrarResumen(r) {
    const poner = (id, valor) => { document.getElementById(id).textContent = valor ?? 0; };
    poner('usuariosActivos', r.usuarios_activos);
    poner('alumnos', r.alumnos);
    poner('personal', r.personal);
    poner('programas', r.programas);
    poner('documentosPendientes', r.documentos_pendientes);
    poner('movimientosHoy', r.movimientos_hoy);
    document.getElementById('periodoActivo').textContent =
        r.periodo_activo ? 'Periodo activo: ' + r.periodo_activo : 'No hay un periodo escolar activo';
}

function mostrarMovimientos(lista) {
    const caja = document.getElementById('ultimosMovimientos');
    if (lista.length === 0) {
        caja.innerHTML = '<li>Todavía no hay movimientos registrados.</li>';
        return;
    }
    caja.innerHTML = lista.map(m => `
        <li>
            <span class="movimientos__hora">${fechaHora(m.fecha_local)}</span>
            <span class="movimientos__texto">
                <strong>${escapar(m.accion)}</strong>
                <small>${escapar(m.usuario)} · ${escapar(m.rol || 'Sin rol')}</small>
            </span>
        </li>`).join('');
}

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
})