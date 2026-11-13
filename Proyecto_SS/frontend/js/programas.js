const api = '/api/programas';

// Solo entra el Jefe de Oficina con sesion iniciada.
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
if (!token || usuario.rol !== 'Jefe de Oficina de SS') window.location.href = 'index.html';


let programas = [];

function cabeceras() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
}

function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Si la sesion vencio, regresamos al login.
function sesionVencida(respuesta) {
    if (respuesta.status === 401) {
        alert('Tu sesión expiró. Inicia sesión de nuevo.');
        window.location.href = 'index.html';
        return true;
    }
    return false;
}

// Al abrir: catalogos
document.addEventListener('DOMContentLoaded', async () => {
    const parametros = new URLSearchParams(window.location.search);
    if (parametros.get('estatus')) document.getElementById('filtroEstatus').value = parametros.get('estatus');

    await cargarCatalogos();
    await cargarProgramas();

    const idEditar = Number(parametros.get('editar'));
    if (idEditar) editar(idEditar);
});

// Llena las listas de dependencias y periodos.
async function cargarCatalogos() {
    try {
        const [resDep, resPer] = await Promise.all([
            fetch('/api/dependencias', { headers: cabeceras() }),
            fetch('/api/periodos', { headers: cabeceras() })
        ]);
        if (sesionVencida(resDep) || sesionVencida(resPer)) return;

        const dependencias = await resDep.json();
        const periodos = await resPer.json();

        const selDep = document.getElementById('dependencia');
        dependencias.forEach(d => {
            selDep.innerHTML += `<option value="${d.id_dependencia}">${escapar(d.nombre_empresa_de)}</option>`;
        });

        const selPer = document.getElementById('periodo');
        periodos.forEach(p => {
            selPer.innerHTML += `<option value="${p.id_periodo}">${escapar(p.nombre_periodo)}</option>`;
        });
    } catch (error) {
        console.error('Error al cargar catálogos:', error);
    }
}

// Trae todos los programas del servidor.
async function cargarProgramas() {
    try {
        const respuesta = await fetch(api);
        const datos = await respuesta.json();
        if (!respuesta.ok) return alert('Error: ' + datos.mensaje);
        programas = datos;
        pintarTabla();
    } catch (error) {
        console.error('Error al cargar:', error);
        alert('No se pudo conectar con el servidor.');
    }
}

// Dibuja la tabla 
function pintarTabla() {
    const texto = document.getElementById('buscar').value.trim().toLowerCase();
    const estatus = document.getElementById('filtroEstatus').value;

    const filtrados = programas.filter(p => {
        const coincideEstatus = !estatus || p.estatus_pro === estatus;
        const contenido = [p.numero_folio, p.nombre_programa, p.tipo_pro, p.area_departamento,
                           p.nombre_responsable, p.institucion].join(' ').toLowerCase();
        return coincideEstatus && contenido.includes(texto);
    });

    const cuerpo = document.getElementById('cuerpoTabla');

    if (filtrados.length === 0) {
        cuerpo.innerHTML = `<tr><td colspan="8">${programas.length === 0 ? 'No hay programas todavía' : 'Ningún programa coincide con la búsqueda'}</td></tr>`;
        return;
    }

    cuerpo.innerHTML = filtrados.map(p => `
        <tr>
            <td>${escapar(p.numero_folio || '—')}</td>
            <td>${escapar(p.nombre_programa)}</td>
            <td>${escapar(p.tipo_pro)}</td>
            <td>${escapar(p.institucion || '—')}</td>
            <td><span class="estatus estatus-${escapar(p.estatus_pro)}">${escapar(p.estatus_pro)}</span></td>
            <td>${escapar(p.horas_requeridas)}</td>
            <td>${escapar(p.cupo_disponible)} / ${escapar(p.cupo_alumnos)}</td>
            <td>
                <button class="boton-chico" onclick="editar(${Number(p.id_programa)})">Editar</button>
                <button class="boton-chico boton-rojo" onclick="borrar(${Number(p.id_programa)})">Borrar</button>
            </td>
        </tr>
    `).join('');
}

// Busqueda y filtro en vivo.
document.getElementById('buscar').addEventListener('input', pintarTabla);
document.getElementById('filtroEstatus').addEventListener('change', pintarTabla);

// Muestra el motivo solo cuando el estatus es "rechazado".
document.getElementById('estatus').addEventListener('change', mostrarMotivo);
function mostrarMotivo() {
    const rechazado = document.getElementById('estatus').value === 'rechazado';
    document.getElementById('campoMotivo').style.display = rechazado ? 'block' : 'none';
}

// Lee todos los campos del formulario.
function leerFormulario() {
    const valor = (id) => document.getElementById(id).value;
    return {
        folio: valor('folio'),
        nombre: valor('nombre'),
        tipo: valor('tipo'),
        origen: valor('origen'),
        idDependencia: valor('dependencia'),
        idPeriodo: valor('periodo'),
        plan: valor('plan'),
        area: valor('area'),
        responsable: valor('responsable'),
        puesto: valor('puesto'),
        horas: parseInt(valor('horas'), 10),
        cupo: parseInt(valor('cupo'), 10),
        horario: valor('horario'),
        objetivo: valor('objetivo'),
        actividades: valor('actividades'),
        estatus: valor('estatus'),
        motivo: valor('motivo')
    };
}

// Guardar: crea o actualiza segun haya id o no.
document.getElementById('formularioPrograma').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('idPrograma').value;
    const datos = leerFormulario();

    if (id && datos.estatus === 'rechazado' && !datos.motivo.trim()) {
        return alert('Escribe el motivo del rechazo.');
    }

    try {
        const respuesta = await fetch(id ? `${api}/${id}` : api, {
            method: id ? 'PUT' : 'POST',
            headers: cabeceras(),
            body: JSON.stringify(datos)
        });
        if (sesionVencida(respuesta)) return;

        const resultado = await respuesta.json();
        alert(respuesta.ok ? resultado.mensaje : 'Error: ' + resultado.mensaje);

        if (respuesta.ok) {
            limpiarFormulario();
            cargarProgramas();
        }
    } catch (error) {
        console.error('Error al guardar:', error);
        alert('No se pudo guardar.');
    }
});

// Llena el formulario con los datos de un programa para editarlo.
async function editar(id) {
    try {
        const respuesta = await fetch(`${api}/${id}`);
        const p = await respuesta.json();
        if (!respuesta.ok) return alert('Error: ' + p.mensaje);

        const poner = (campo, valor) => { document.getElementById(campo).value = valor ?? ''; };
        poner('idPrograma', p.id_programa);
        poner('folio', p.numero_folio);
        poner('nombre', p.nombre_programa);
        poner('tipo', p.tipo_pro);
        poner('origen', p.origen_pro || 'banco');
        poner('dependencia', p.id_dependencia);
        poner('periodo', p.id_periodo);
        poner('plan', p.plan_educativo_pro);
        poner('area', p.area_departamento);
        poner('responsable', p.nombre_responsable);
        poner('puesto', p.puesto_responsable);
        poner('horas', p.horas_requeridas);
        poner('cupo', p.cupo_alumnos);
        poner('horario', p.horario_perfil);
        poner('objetivo', p.objetivo);
        poner('actividades', p.actividades_realizar);
        poner('estatus', p.estatus_pro);
        poner('motivo', p.motivo_rechazo);

        document.getElementById('campoEstatus').style.display = 'block';
        mostrarMotivo();
        document.getElementById('tituloFormulario').textContent = 'Editar programa';
        document.getElementById('botonCancelar').style.display = 'inline-block';
        document.getElementById('formulario').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error al traer el programa:', error);
    }
}

// Borra un programa despues de confirmar.
async function borrar(id) {
    if (!confirm('¿Seguro que quieres borrar este programa?')) return;

    try {
        const respuesta = await fetch(`${api}/${id}`, {
            method: 'DELETE',
            headers: cabeceras()
        });
        if (sesionVencida(respuesta)) return;

        const resultado = await respuesta.json();
        alert(respuesta.ok ? resultado.mensaje : 'Error: ' + resultado.mensaje);
        if (respuesta.ok) cargarProgramas();
    } catch (error) {
        console.error('Error al borrar:', error);
    }
}

// Deja el formulario como al inicio.
document.getElementById('botonCancelar').addEventListener('click', limpiarFormulario);

function limpiarFormulario() {
    document.getElementById('formularioPrograma').reset();
    document.getElementById('idPrograma').value = '';
    document.getElementById('campoEstatus').style.display = 'none';
    document.getElementById('campoMotivo').style.display = 'none';
    document.getElementById('tituloFormulario').textContent = 'Nuevo programa';
    document.getElementById('botonCancelar').style.display = 'none';
}

// Cerrar sesion.
document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});
