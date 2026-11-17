// CU13 / RF-13: Administrar periodos escolares (solo Administrador).
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');

if (!token || usuario.rol !== 'Administrador') {
    window.location.href = 'index.html';
}

const cabeceras = () => ({
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
});

function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function sesionVencida(res) {
    if (res.status === 401) {
        alert('Tu sesión expiró. Inicia sesión de nuevo.');
        localStorage.clear();
        window.location.href = 'index.html';
        return true;
    }
    return false;
}

// Convierte "2026-08-17T00:00:00.000Z" a "2026-08-17"
function isoCorto(valor) {
    return valor ? String(valor).slice(0, 10) : '';
}

// Convierte "2026-08-17" a "17/08/2026"
function formatearFecha(valor) {
    const corto = isoCorto(valor);
    if (!corto) return '—';
    const [a, m, d] = corto.split('-');
    return `${d}/${m}/${a}`;
}

// Suma meses y dias en UTC igual que dateadd de SQL Server para mostrar la vista previa en vivo.
function calcularBimestres(fechaInicioStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicioStr)) return [];
    const [anio, mes, dia] = fechaInicioStr.split('-').map(Number);

    const sumarMeses = (m) => {
        const totalMeses = (mes - 1) + m;
        const nuevoAnio = anio + Math.floor(totalMeses / 12);
        const nuevoMes = (totalMeses % 12) + 1;
        const ultimoDiaMes = new Date(Date.UTC(nuevoAnio, nuevoMes, 0)).getUTCDate();
        return new Date(Date.UTC(nuevoAnio, nuevoMes - 1, Math.min(dia, ultimoDiaMes)));
    };

    const aIso = (f) => f.toISOString().slice(0, 10);

    return [1, 2, 3].map(b => {
        const ini = sumarMeses(2 * (b - 1));
        const cierreBase = sumarMeses(2 * b);
        const lim = new Date(cierreBase.getTime() + 7 * 86400000);
        return { numero: b, inicio: aIso(ini), limite: aIso(lim) };
    });
}

let listaPeriodos = [];

const formPeriodo = document.getElementById('formPeriodo');
const inputId = document.getElementById('idPeriodo');
const inputNombre = document.getElementById('nombre');
const selectEstatus = document.getElementById('estatus');
const inputInicio = document.getElementById('fechaInicio');
const inputFin = document.getElementById('fechaFin');
const tituloFormulario = document.getElementById('tituloFormulario');
const btnGuardar = document.getElementById('btnGuardar');
const btnCancelar = document.getElementById('btnCancelar');
const vistaPrevia = document.getElementById('vistaPreviaBimestres');
const tarjetasBimestres = document.getElementById('tarjetasBimestres');

function actualizarVistaPrevia() {
    const bimestres = calcularBimestres(inputInicio.value);
    if (bimestres.length === 0) {
        vistaPrevia.hidden = true;
        return;
    }
    vistaPrevia.hidden = false;
    tarjetasBimestres.innerHTML = bimestres.map(b => `
        <div class="dato">
            <span class="dato__texto"><strong>Reporte Bimestral ${b.numero}</strong></span>
            <span class="dato__texto">Del ${formatearFecha(b.inicio)} al ${formatearFecha(b.limite)}</span>
        </div>
    `).join('');
}

inputInicio.addEventListener('change', actualizarVistaPrevia);
inputInicio.addEventListener('input', actualizarVistaPrevia);

async function cargarPeriodos() {
    try {
        const res = await fetch('/api/admin/periodos', { headers: cabeceras() });
        if (sesionVencida(res)) return;

        const datos = await res.json();
        if (!res.ok) {
            return alert(datos.mensaje || 'Error al cargar los periodos');
        }

        listaPeriodos = datos;
        pintarTabla();
    } catch (err) {
        console.error(err);
        document.getElementById('cuerpoPeriodos').innerHTML =
            '<tr><td colspan="8" class="vacio">No se pudo conectar con el servidor.</td></tr>';
    }
}

function pintarTabla() {
    const cuerpo = document.getElementById('cuerpoPeriodos');
    if (listaPeriodos.length === 0) {
        cuerpo.innerHTML = '<tr><td colspan="8" class="vacio">No hay periodos escolares registrados.</td></tr>';
        return;
    }

    cuerpo.innerHTML = listaPeriodos.map(p => {
        const id = Number(p.id_periodo);
        const activo = Boolean(p.activo);
        const etiqueta = activo
            ? '<span class="accion accion--alta">Activo</span>'
            : '<span class="accion accion--acceso">Inactivo</span>';

        const rangoBim = (ini, lim) => ini && lim
            ? `${formatearFecha(ini)}<small>al ${formatearFecha(lim)}</small>`
            : '—';

        return `
            <tr>
                <td data-titulo="Periodo"><strong>${escapar(p.nombre_periodo)}</strong></td>
                <td data-titulo="Fechas" class="col-fecha">
                    ${formatearFecha(p.fecha_inicio)}
                    <small>al ${formatearFecha(p.fecha_fin)}</small>
                </td>
                <td data-titulo="Estatus">${etiqueta}</td>
                <td data-titulo="Bimestre 1" class="col-fecha">${rangoBim(p.b1_inicio, p.b1_limite)}</td>
                <td data-titulo="Bimestre 2" class="col-fecha">${rangoBim(p.b2_inicio, p.b2_limite)}</td>
                <td data-titulo="Bimestre 3" class="col-fecha">${rangoBim(p.b3_inicio, p.b3_limite)}</td>
                <td data-titulo="Registros">
                    ${Number(p.programas)} prog.
                    <small>${Number(p.expedientes)} exp.</small>
                </td>
                <td data-titulo="Acciones">
                    <button type="button" class="boton-chico" onclick="editarPeriodo(${id})">Editar</button>
                    ${!activo ? `<button type="button" class="boton-chico" onclick="activarDirecto(${id})">Activar</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

window.editarPeriodo = function (id) {
    const p = listaPeriodos.find(x => Number(x.id_periodo) === Number(id));
    if (!p) return;

    inputId.value = p.id_periodo;
    inputNombre.value = p.nombre_periodo;
    selectEstatus.value = p.activo ? '1' : '0';
    inputInicio.value = isoCorto(p.fecha_inicio);
    inputFin.value = isoCorto(p.fecha_fin);

    tituloFormulario.textContent = `Editar periodo: ${p.nombre_periodo}`;
    btnGuardar.textContent = 'Actualizar periodo';
    btnCancelar.hidden = false;
    actualizarVistaPrevia();
    document.getElementById('seccionFormulario').scrollIntoView({ behavior: 'smooth' });
};

window.activarDirecto = async function (id) {
    const p = listaPeriodos.find(x => Number(x.id_periodo) === Number(id));
    if (!p) return;

    await enviarPeriodo(p.id_periodo, {
        nombre: p.nombre_periodo,
        fecha_inicio: isoCorto(p.fecha_inicio),
        fecha_fin: isoCorto(p.fecha_fin),
        activo: true,
        confirmar_cambio_activo: false
    });
};

function limpiarFormulario() {
    formPeriodo.reset();
    inputId.value = '';
    tituloFormulario.textContent = 'Registrar nuevo periodo escolar';
    btnGuardar.textContent = 'Guardar periodo';
    btnCancelar.hidden = true;
    vistaPrevia.hidden = true;
}

btnCancelar.addEventListener('click', limpiarFormulario);

async function enviarPeriodo(id, cuerpo) {
    const url = id ? `/api/admin/periodos/${id}` : '/api/admin/periodos';
    const metodo = id ? 'PUT' : 'POST';

    btnGuardar.disabled = true;
    try {
        const res = await fetch(url, {
            method: metodo,
            headers: cabeceras(),
            body: JSON.stringify(cuerpo)
        });
        if (sesionVencida(res)) return;

        const data = await res.json();

        // Extension 6a: Ya existe otro periodo con estatus Activo -> pide confirmacion para cerrarlo.
        if (res.status === 409 && data.requiereConfirmacion) {
            if (confirm(data.mensaje)) {
                return await enviarPeriodo(id, { ...cuerpo, confirmar_cambio_activo: true });
            }
            return;
        }

        alert(data.mensaje);
        if (res.ok && data.success) {
            limpiarFormulario();
            await cargarPeriodos();
        }
    } catch (err) {
        console.error(err);
        alert('No se pudo conectar con el servidor.');
    } finally {
        btnGuardar.disabled = false;
    }
}

formPeriodo.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nombre = inputNombre.value.trim();
    const fecha_inicio = inputInicio.value;
    const fecha_fin = inputFin.value;
    const activo = selectEstatus.value === '1';

    if (!nombre || !fecha_inicio || !fecha_fin) {
        return alert('Todos los campos del periodo escolar son obligatorios.');
    }
    if (fecha_fin <= fecha_inicio) {
        return alert('La fecha de término debe ser posterior a la fecha de inicio.');
    }

    await enviarPeriodo(inputId.value || null, {
        nombre,
        fecha_inicio,
        fecha_fin,
        activo,
        confirmar_cambio_activo: false
    });
});

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});

cargarPeriodos();
