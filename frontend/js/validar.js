// Validar documentos: el jefe ve los PDF en revision y los acepta o rechaza.
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
const ROLES = ['Jefe de Oficina de SS', 'Jefe de Vinculacion'];
if (!token || !ROLES.includes(usuario.rol)) window.location.href = 'index.html';

// Nombre de cada tipo de documento.
const NOMBRES = {
    solicitud: 'Solicitud de servicio social',
    carta_aceptacion: 'Carta de aceptación',
    kardex: 'Kárdex',
    reporte_bimestral_1: 'Reporte bimestral 1',
    reporte_bimestral_2: 'Reporte bimestral 2',
    reporte_bimestral_3: 'Reporte bimestral 3',
    memoria_final: 'Memoria final',
    carta_terminacion: 'Carta de terminación'
};

let pendientes = [];

// El Jefe de Vinculacion no tiene panel
document.getElementById('rol').textContent = usuario.rol || '';
document.getElementById('volverPanel').hidden = usuario.rol !== 'Jefe de Oficina de SS';

// Evita que un texto se interprete como HTML.
function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Peticion con el token; si la sesion vencio regresa al login.
async function pedir(ruta, opciones = {}) {
    opciones.headers = { 'Authorization': 'Bearer ' + token, ...opciones.headers };
    const respuesta = await fetch(ruta, opciones);
    if (respuesta.status === 401) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
    return respuesta;
}

document.addEventListener('DOMContentLoaded', cargarPendientes);
document.getElementById('buscar').addEventListener('input', pintarLista);

async function cargarPendientes() {
    const respuesta = await pedir('/api/validacion/pendientes');
    const datos = await respuesta.json();
    if (!respuesta.ok) return alert(datos.mensaje);

    pendientes = datos;
    document.getElementById('totalPendientes').textContent = `${pendientes.length} documento(s) por revisar`;
    pintarLista();
}

// Dibuja la lista aplicando la busqueda.
function pintarLista() {
    const texto = document.getElementById('buscar').value.trim().toLowerCase();
    const lista = pendientes.filter(d => (d.alumno + ' ' + d.numero_control).toLowerCase().includes(texto));
    const caja = document.getElementById('listaPendientes');

    if (pendientes.length === 0) {
        caja.innerHTML = '<li class="nota">No hay documentos pendientes por revisar.</li>';
        return;
    }
    if (lista.length === 0) {
        caja.innerHTML = '<li class="nota">Ningún alumno coincide con la búsqueda.</li>';
        return;
    }

    caja.innerHTML = lista.map(d => `
        <li class="documento">
            <div>
                <p class="documento__nombre">${NOMBRES[d.tipo_documento] || escapar(d.tipo_documento)}
                    <span class="estatus estatus-pendiente">Versión ${d.version_doc}</span>
                    ${d.plan_estudios === 'Plan Viejo' ? '<span class="estatus estatus-vacio">Plan anterior</span>' : ''}
                </p>
                <p class="documento__detalle">${escapar(d.numero_control)} · ${escapar(d.alumno)} · ${escapar(d.carrera)}</p>
                <p class="documento__detalle">${escapar(d.nombre_programa || 'Sin programa')} · Subido el ${new Date(d.fecha_subida).toLocaleDateString('es-MX')}</p>
            </div>
            <div class="documento__acciones">
                <button class="boton-chico boton-oscuro" onclick="verPdf(${d.id_documento})">Ver PDF</button>
                <button class="boton-chico" onclick="aceptar(${d.id_documento}, '${d.tipo_documento}')">Aceptar</button>
                <button class="boton-chico boton-rojo" onclick="rechazar(${d.id_documento})">Rechazar</button>
            </div>
        </li>`).join('');
}

// Abre el PDF en otra pestana.
async function verPdf(id) {
    const ventana = window.open('', '_blank');
    const respuesta = await pedir('/api/validacion/documentos/' + id);
    if (!respuesta.ok) {
        ventana.close();
        return alert((await respuesta.json()).mensaje);
    }
    ventana.location.href = URL.createObjectURL(await respuesta.blob());
}

async function aceptar(id, tipo) {
    let porcentaje = null;

    // El kardex del plan anterior se revisa a mano
    if (tipo === 'kardex') {
        porcentaje = prompt('Revisaste el kárdex. ¿Qué porcentaje de créditos tiene aprobados? (0 a 100)');
        if (porcentaje === null) return;
    } else if (!confirm('¿Aceptar este documento?')) {
        return;
    }
    guardar(id, { estatus: 'aceptado', porcentaje });
}

async function rechazar(id) {
    const comentario = prompt('¿Qué le faltó al documento? (el alumno verá este mensaje)');
    if (comentario === null) return;
    if (!comentario.trim()) return alert('Escribe qué le faltó al documento.');
    guardar(id, { estatus: 'rechazado', comentario });
}

async function guardar(id, datos) {
    const respuesta = await pedir('/api/validacion/documentos/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
    });
    alert((await respuesta.json()).mensaje);
    cargarPendientes();
}

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});