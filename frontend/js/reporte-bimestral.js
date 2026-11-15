// Reporte de alumnos sin reporte bimestral (CU12): solo el Jefe de Oficina.
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

if (!token || usuario.rol !== 'Jefe de Oficina de SS') {
    window.location.href = 'index.html';
}

document.getElementById('etiquetaRol').textContent = usuario.rol || 'Servicio Social';

const cabeceras = { 'Authorization': 'Bearer ' + token };

// Evita que un texto se interprete como HTML.
function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Si la sesion vencio, regresa al login.
function revisarSesion(respuesta) {
    if (respuesta.status === 401) {
        alert('Tu sesión expiró. Inicia sesión de nuevo.');
        localStorage.clear();
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// "2026-08-17T00:00:00.000Z" -> "17/08/2026" (las fechas vienen sin hora, en UTC).
function formatearFecha(valor) {
    if (!valor) return '';
    const [anio, mes, dia] = String(valor).slice(0, 10).split('-');
    return `${dia}/${mes}/${anio}`;
}

const selectPeriodo = document.getElementById('periodo');
const selectCarrera = document.getElementById('carrera');

// Llena las listas de periodos y carreras.
async function cargarFiltros() {
    try {
        const [resPeriodos, resCarreras] = await Promise.all([
            fetch('/api/periodos', { headers: cabeceras }),
            fetch('/api/reportes/carreras', { headers: cabeceras })
        ]);
        if (!revisarSesion(resPeriodos) || !revisarSesion(resCarreras)) return;

        const periodos = await resPeriodos.json();
        const carreras = await resCarreras.json();

        selectPeriodo.innerHTML = periodos.map(p =>
            `<option value="${Number(p.id_periodo)}"${p.estatus_activo_pe ? ' selected' : ''}>` +
            `${escapar(p.nombre_periodo)}${p.estatus_activo_pe ? ' (activo)' : ''}</option>`
        ).join('');

        selectCarrera.insertAdjacentHTML('beforeend', carreras.map(c =>
            `<option value="${escapar(c)}">${escapar(c)}</option>`
        ).join(''));
    } catch (error) {
        console.error(error);
        alert('No se pudieron cargar los filtros. Revisa tu conexión.');
    }
}

document.getElementById('formFiltros').addEventListener('submit', async (e) => {
    e.preventDefault();

    const bimestre = document.getElementById('bimestre').value;
    if (!bimestre) return alert('Selecciona el bimestre.');

    const params = new URLSearchParams({ bimestre, periodo: selectPeriodo.value });
    if (selectCarrera.value) params.set('carrera', selectCarrera.value);

    const boton = document.getElementById('btnGenerar');
    boton.disabled = true;
    boton.textContent = 'Generando...';

    try {
        const res = await fetch('/api/reportes/sin-reporte-bimestral?' + params, { headers: cabeceras });
        if (!revisarSesion(res)) return;

        const data = await res.json();
        if (!res.ok) {
            document.getElementById('resultado').hidden = true;
            return alert(data.mensaje);
        }
        mostrarReporte(data);
    } catch (error) {
        console.error(error);
        alert('No se pudo conectar con el servidor.');
    } finally {
        boton.disabled = false;
        boton.textContent = 'Generar reporte';
    }
});

function mostrarReporte({ resumen, alumnos, mensaje }) {
    document.getElementById('resultado').hidden = false;

    document.getElementById('datosReporte').textContent =
        `Periodo ${resumen.periodo} · Bimestre ${resumen.bimestre} ` +
        `(del ${formatearFecha(resumen.fecha_inicio)} al ${formatearFecha(resumen.fecha_limite)}) · ` +
        `Carrera: ${resumen.carrera || 'todas'}`;

    document.getElementById('totales').innerHTML = `
        <div class="dato"><span class="dato__numero">${Number(resumen.total_activos)}</span><span class="dato__texto">Alumnos activos</span></div>
        <div class="dato dato--aprobado"><span class="dato__numero">${Number(resumen.entregados)}</span><span class="dato__texto">Entregaron</span></div>
        <div class="dato dato--rechazado"><span class="dato__numero">${Number(resumen.sin_entregar)}</span><span class="dato__texto">Sin entregar</span></div>`;

    const vacio = document.getElementById('mensajeVacio');
    vacio.hidden = alumnos.length > 0;
    vacio.textContent = mensaje || '';
    document.getElementById('contenedorTabla').hidden = alumnos.length === 0;
    document.getElementById('barraImprimir').hidden = false;

    document.getElementById('cuerpoTabla').innerHTML = alumnos.map(a => {
        const rechazado = a.estatus_reporte === 'rechazado';
        const clase = rechazado ? 'estatus-rechazado' : 'estatus-sin-entrega';
        const texto = rechazado ? 'Rechazado' : 'Sin entrega';
        return `
        <tr>
            <td>${escapar(a.numero_control)}</td>
            <td>${escapar(a.nombre_completo)}<br><small>${escapar(a.correo)}</small></td>
            <td>${escapar(a.carrera)}</td>
            <td>${escapar(a.semestre)}</td>
            <td>${escapar(a.programa || 'Sin programa')}<br><small>${escapar(a.institucion || '')}</small></td>
            <td><span class="estatus ${clase}">${texto}</span>${a.comentario ? `<br><small>${escapar(a.comentario)}</small>` : ''}</td>
        </tr>`;
    }).join('');

    document.getElementById('pieReporte').textContent =
        `Generado el ${new Date().toLocaleString('es-MX')} por ${usuario.nombre || 'Jefe de Oficina de SS'}`;
}

document.getElementById('btnImprimir').addEventListener('click', () => window.print());

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});

cargarFiltros();
