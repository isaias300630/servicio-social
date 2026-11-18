// Constancias: el Jefe de Vinculacion ve quien cumple los requisitos y le sube su constancia en PDF.
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

if (!token || (usuario.rol !== 'Jefe de Oficina de SS' && usuario.rol !== 'Jefe de Vinculacion')) {
    window.location.href = 'index.html';
}

// Requisitos de la constancia 
const REQUISITOS = [
    ['reporte1', 'Reporte 1'],
    ['reporte2', 'Reporte 2'],
    ['reporte3', 'Reporte 3'],
    ['carta_terminacion', 'Carta de terminación']
];
const ESTADOS = { aceptado: 'aceptado', pendiente: 'en revisión', rechazado: 'rechazado' };

let alumnos = [];
let expedienteElegido = null;   
const MAXIMO_PDF = 5 * 1024 * 1024;

// Evita que un texto se interprete como HTML.
function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Fecha corta: 16 nov 2026
function fecha(valor) {
    return new Date(valor).toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

// Peticion con el token; si la sesion vencio regresa al login.
async function pedir(ruta, opciones = {}) {
    opciones.headers = { 'Authorization': 'Bearer ' + token, ...opciones.headers };
    const respuesta = await fetch(ruta, opciones);
    if (respuesta.status === 401 || respuesta.status === 403) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
    return respuesta;
}

document.addEventListener('DOMContentLoaded', cargarAlumnos);
document.getElementById('buscar').addEventListener('input', pintarTabla);
document.getElementById('filtro').addEventListener('change', pintarTabla);

async function cargarAlumnos() {
    try {
        const respuesta = await pedir('/api/constancias/alumnos');
        const datos = await respuesta.json();
        if (!respuesta.ok) return alert(datos.mensaje);

        alumnos = datos;
        document.getElementById('totalActivos').textContent = alumnos.length;
        document.getElementById('totalListos').textContent = alumnos.filter(a => a.listo && !a.id_constancia).length;
        document.getElementById('totalEmitidas').textContent = alumnos.filter(a => a.id_constancia).length;
        pintarTabla();
    } catch (error) {
        console.error('Error al cargar alumnos:', error);
        document.getElementById('cuerpoTabla').innerHTML = '<tr><td colspan="4">No se pudo conectar con el servidor.</td></tr>';
    }
}

// Dibuja la tabla con el filtro y la busqueda.
function pintarTabla() {
    const texto = document.getElementById('buscar').value.trim().toLowerCase();
    const filtro = document.getElementById('filtro').value;

    const lista = alumnos.filter(a => {
        if (filtro === 'listos' && !(a.listo && !a.id_constancia)) return false;
        if (filtro === 'faltan' && a.listo) return false;
        if (filtro === 'emitidas' && !a.id_constancia) return false;
        return (a.alumno + ' ' + a.numero_control).toLowerCase().includes(texto);
    });

    const cuerpo = document.getElementById('cuerpoTabla');
    if (lista.length === 0) {
        cuerpo.innerHTML = '<tr><td colspan="4" class="vacio">No hay alumnos con ese filtro.</td></tr>';
        return;
    }

    cuerpo.innerHTML = lista.map(a => `
        <tr>
            <td data-titulo="Alumno">
                <span>
                    <strong>${escapar(a.alumno)}</strong>
                    <small>${escapar(a.numero_control)} · ${escapar(a.carrera)}</small>
                </span>
            </td>
            <td data-titulo="Programa">
                <span>${escapar(a.programa)}<small>${escapar(a.institucion || '')} · ${Number(a.horas_requeridas) || 0} horas</small></span>
            </td>
            <td data-titulo="Requisitos">
                <span class="requisitos">${REQUISITOS.map(([campo, nombre]) => {
                    const estatus = a[campo];
                    const titulo = nombre + ': ' + (ESTADOS[estatus] || 'sin entregar');
                    return `<span class="requisito ${estatus ? 'requisito--' + estatus : ''}" title="${titulo}">${nombre}</span>`;
                }).join('')}</span>
            </td>
            <td data-titulo="Constancia">${columnaConstancia(a)}</td>
        </tr>`).join('');
}

// Boton para subir el PDF, o el folio si ya se envio.
function columnaConstancia(a) {
    if (a.id_constancia) {
        return `<span class="folio">
                    <strong>${escapar(a.folio)}</strong>
                    <small>Enviada el ${fecha(a.fecha)}</small>
                    <span class="folio__botones">
                        <button class="boton-chico boton-outline" onclick="verConstancia(${Number(a.id_constancia)})">Ver PDF</button>
                        <button class="boton-chico boton-gris" onclick="elegirArchivo(${Number(a.id_expediente)})">Reemplazar</button>
                    </span>
                </span>`;
    }
    if (a.listo) {
        return `<button class="boton-chico" onclick="elegirArchivo(${Number(a.id_expediente)})">Subir constancia (PDF)</button>`;
    }
    return '<span class="falta">Faltan requisitos</span>';
}

// Abre el selector de archivos para el alumno elegido.
function elegirArchivo(idExpediente) {
    expedienteElegido = idExpediente;
    const selector = document.getElementById('archivoConstancia');
    selector.value = '';
    selector.click();
}

// Cuando eligen el PDF se revisa y se sube.
document.getElementById('archivoConstancia').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo || !expedienteElegido) return;

    if (!archivo.name.toLowerCase().endsWith('.pdf') || archivo.size > MAXIMO_PDF) {
        return alert('Solo se permiten archivos en formato PDF con un peso máximo de 5 MB');
    }

    const alumno = alumnos.find(a => a.id_expediente === expedienteElegido);
    const accion = alumno.id_constancia ? 'reemplazar la constancia' : 'enviar la constancia';
    if (!confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} de ${alumno.alumno} con el archivo "${archivo.name}"?`)) return;

    const formulario = new FormData();
    formulario.append('id_expediente', expedienteElegido);
    formulario.append('archivo', archivo);

    try {
        const respuesta = await pedir('/api/constancias', { method: 'POST', body: formulario });
        alert((await respuesta.json()).mensaje);
    } catch (error) {
        console.error('Error al subir la constancia:', error);
        alert('No se pudo conectar con el servidor.');
    }
    cargarAlumnos();
});

// Abre el PDF en otra pestaña 
async function verConstancia(idConstancia) {
    const ventana = window.open('', '_blank');
    const respuesta = await pedir(`/api/constancias/${idConstancia}/pdf`);
    if (!respuesta.ok) {
        if (ventana) ventana.close();
        return alert((await respuesta.json()).mensaje);
    }
    const enlace = URL.createObjectURL(await respuesta.blob());
    if (ventana) ventana.location.href = enlace;
    else window.location.href = enlace;
}

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});