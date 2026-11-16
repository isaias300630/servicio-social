// Bitacora de auditoria: el Administrador consulta los movimientos con filtros y por paginas.
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

if (!token || usuario.rol !== 'Administrador') {
    window.location.href = 'index.html';
}

const TAMANO_PAGINA = 25;
let paginaActual = 1;
let totalPaginas = 1;

// Evita que un texto se interprete como HTML.
function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}


function fechaHora(valor) {
    return new Date(valor).toLocaleString('es-MX', {
        timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function hoyLocal(diasAtras = 0) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - diasAtras);
    return fecha.toLocaleDateString('en-CA');
}

function claseAccion(accion) {
    const texto = accion.toLowerCase();
    if (texto.includes('fallido') || texto.includes('fuera de fecha') || texto.includes('rechazada') || texto.includes('baja')) return 'accion--alerta';
    if (texto.includes('sesion') || texto.includes('contrasena') || texto.includes('recuperacion')) return 'accion--acceso';
    if (texto.includes('alta') || texto.includes('subida') || texto.includes('solicitud')) return 'accion--alta';
    if (texto.includes('validacion') || texto.includes('edicion') || texto.includes('actualizacion')) return 'accion--cambio';
    return '';
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

function leerFiltros() {
    const parametros = new URLSearchParams();
    for (const id of ['desde', 'hasta', 'accion', 'rol', 'texto']) {
        const valor = document.getElementById(id).value.trim();
        if (valor) parametros.set(id, valor);
    }
    return parametros;
}

document.addEventListener('DOMContentLoaded', async () => {
    await cargarFiltros();
    buscar(1);
});

// Llena las listas de acciones y roles.
async function cargarFiltros() {
    try {
        const respuesta = await pedir('/api/admin/bitacora/filtros');
        if (!respuesta.ok) return;
        const { acciones, roles } = await respuesta.json();

        document.getElementById('accion').insertAdjacentHTML('beforeend',
            acciones.map(a => `<option value="${escapar(a)}">${escapar(a)}</option>`).join(''));
        document.getElementById('rol').insertAdjacentHTML('beforeend',
            roles.map(r => `<option value="${Number(r.id_rol)}">${escapar(r.nombre_rol)}</option>`).join(''));
    } catch (error) {
        console.error('Error al cargar los filtros:', error);
    }
}


async function buscar(pagina) {
    const parametros = leerFiltros();
    parametros.set('pagina', pagina);
    parametros.set('tamano', TAMANO_PAGINA);

    const cuerpo = document.getElementById('cuerpoTabla');
    cuerpo.innerHTML = '<tr><td colspan="5">Buscando...</td></tr>';

    try {
        const respuesta = await pedir('/api/admin/bitacora?' + parametros);
        const datos = await respuesta.json();
        if (!respuesta.ok) {
            cuerpo.innerHTML = '<tr><td colspan="5">No se pudo consultar la bitácora.</td></tr>';
            return alert(datos.mensaje);
        }

        paginaActual = datos.pagina;
        totalPaginas = datos.paginas;
        pintarTabla(datos.movimientos);

        document.getElementById('totalMovimientos').textContent =
            `${datos.total} movimiento${datos.total === 1 ? '' : 's'}`;
        document.getElementById('textoPagina').textContent = `Página ${paginaActual} de ${totalPaginas}`;
        document.getElementById('anterior').disabled = paginaActual <= 1;
        document.getElementById('siguiente').disabled = paginaActual >= totalPaginas;
    } catch (error) {
        console.error('Error al consultar la bitácora:', error);
        cuerpo.innerHTML = '<tr><td colspan="5">No se pudo conectar con el servidor.</td></tr>';
    }
}

function pintarTabla(movimientos) {
    const cuerpo = document.getElementById('cuerpoTabla');
    if (movimientos.length === 0) {
        cuerpo.innerHTML = '<tr><td colspan="5" class="vacio">No hay movimientos con esos filtros.</td></tr>';
        return;
    }
    cuerpo.innerHTML = movimientos.map(m => `
        <tr>
            <td class="col-fecha" data-titulo="Fecha">${fechaHora(m.fecha_local)}</td>
            <td data-titulo="Usuario"><span>${escapar(m.usuario)}<small>${escapar(m.correo || '')}</small></span></td>
            <td data-titulo="Rol">${escapar(m.rol || '—')}</td>
            <td data-titulo="Acción"><span class="accion ${claseAccion(m.accion)}">${escapar(m.accion)}</span></td>
            <td class="col-detalles" data-titulo="Detalles">${escapar(m.detalles || '—')}</td>
        </tr>`).join('');
}


async function descargarCsv() {
    const parametros = leerFiltros();
    parametros.set('pagina', 1);
    parametros.set('tamano', 1000);

    const respuesta = await pedir('/api/admin/bitacora?' + parametros);
    const datos = await respuesta.json();
    if (!respuesta.ok) return alert(datos.mensaje);

    const celda = (valor) => '"' + String(valor ?? '').replace(/"/g, '""') + '"';
    const filas = [['Fecha y hora', 'Usuario', 'Correo', 'Rol', 'Accion', 'Detalles']].concat(
        datos.movimientos.map(m => [fechaHora(m.fecha_local), m.usuario, m.correo, m.rol, m.accion, m.detalles]));
    const contenido = '\uFEFF' + filas.map(f => f.map(celda).join(',')).join('\r\n');

    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    enlace.download = `bitacora_${hoyLocal()}.csv`;
    enlace.click();
}

document.getElementById('formFiltros').addEventListener('submit', (e) => {
    e.preventDefault();
    buscar(1);
});

document.getElementById('limpiar').addEventListener('click', () => {
    document.getElementById('formFiltros').reset();
    buscar(1);
});

document.getElementById('rapidoHoy').addEventListener('click', () => {
    document.getElementById('desde').value = hoyLocal();
    document.getElementById('hasta').value = hoyLocal();
    buscar(1);
});

document.getElementById('rapidoSemana').addEventListener('click', () => {
    document.getElementById('desde').value = hoyLocal(6);
    document.getElementById('hasta').value = hoyLocal();
    buscar(1);
});

document.getElementById('anterior').addEventListener('click', () => { if (paginaActual > 1) buscar(paginaActual - 1); });
document.getElementById('siguiente').addEventListener('click', () => { if (paginaActual < totalPaginas) buscar(paginaActual + 1); });
document.getElementById('descargarCsv').addEventListener('click', descargarCsv);
document.getElementById('imprimir').addEventListener('click', () => window.print());

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});