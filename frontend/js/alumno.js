// Panel del alumno: avance, programa, documentos PDF y datos de contacto.
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
if (!token || usuario.rol !== 'Alumno') window.location.href = 'index.html';

// Documentos que entrega el alumno (el kardex solo el plan anterior).
const DOCUMENTOS = [
    { tipo: 'solicitud', nombre: 'Solicitud de servicio social' },
    { tipo: 'carta_aceptacion', nombre: 'Carta de aceptación' },
    { tipo: 'kardex', nombre: 'Kárdex (solo plan anterior)', soloPlanViejo: true },
    { tipo: 'reporte_bimestral_1', nombre: 'Reporte bimestral 1', bimestre: 1 },
    { tipo: 'reporte_bimestral_2', nombre: 'Reporte bimestral 2', bimestre: 2 },
    { tipo: 'reporte_bimestral_3', nombre: 'Reporte bimestral 3', bimestre: 3 },
    { tipo: 'memoria_final', nombre: 'Memoria final' },
    { tipo: 'carta_terminacion', nombre: 'Carta de terminación' }
];
const ESTADOS = { pendiente: 'En revisión', aceptado: 'Aceptado', rechazado: 'Rechazado' };

let tipoPorSubir = null;

// Evita que un texto se interprete como HTML.
function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Fecha corta: 17 oct 2026
function fecha(valor) {
    return new Date(valor).toLocaleDateString('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
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

document.addEventListener('DOMContentLoaded', cargarPanel);

// Trae todo el panel en una sola peticion y lo dibuja.
async function cargarPanel() {
    const respuesta = await pedir('/api/alumno/panel');
    const datos = await respuesta.json();
    if (!respuesta.ok) return alert(datos.mensaje);

    const a = datos.alumno;
    document.getElementById('numeroControl').textContent = 'Alumno · ' + a.numero_control;
    document.getElementById('saludo').textContent = 'Hola, ' + a.nombre;
    document.getElementById('datosEscolares').textContent = `${a.carrera} · ${a.semestre}° semestre · ${a.plan_estudios}`;
    document.getElementById('telefono').value = a.telefono || '';
    document.getElementById('domicilio').value = a.domicilio || '';
    document.getElementById('direccion').value = a.direccion || '';

    // Si es plan nuevo, se quita el kardex de la lista.
    const lista = DOCUMENTOS.filter(d => !d.soloPlanViejo || a.plan_estudios === 'Plan Viejo');

    mostrarAvance(a, datos.programa, lista, datos.documentos, datos.constancia);
    mostrarConstancia(datos.constancia);
    mostrarPrograma(a, datos.programa);
    mostrarDocumentos(lista, datos);
}

// Pasos del tramite: induccion, programa, documentos y liberacion (constancia).
function mostrarAvance(alumno, programa, lista, documentos, constancia) {
    const aceptados = documentos.filter(d => d.estatus === 'aceptado').length;
    const pasos = [
        ['Curso de inducción', alumno.induccion_completa],
        ['Programa', programa],
        [`Documentos (${aceptados} de ${lista.length})`, aceptados === lista.length],
        ['Liberación', Boolean(constancia)]
    ];
    document.getElementById('avance').innerHTML = pasos.map(([nombre, listo], i) => `
        <li class="avance__paso ${listo ? 'avance__paso--listo' : ''}">
            <span class="avance__numero">${listo ? '✓' : i + 1}</span>
            <span class="avance__texto">${nombre}</span>
        </li>`).join('');
}

// Aviso cuando el Jefe de Vinculacion ya le envio su constancia en PDF.
function mostrarConstancia(constancia) {
    document.getElementById('seccionConstancia').hidden = !constancia;
    if (!constancia) return;
    document.getElementById('textoConstancia').textContent =
        `El Departamento de Vinculación te envió tu constancia de terminación el ${fecha(constancia.fecha)} (folio ${constancia.folio}).`;
    document.getElementById('verConstancia').onclick = () => descargarConstancia(constancia);
}

// Descarga el PDF de la constancia (se pide con el token).
async function descargarConstancia(constancia) {
    const respuesta = await pedir(`/api/constancias/${Number(constancia.id_constancia)}/pdf`);
    if (!respuesta.ok) return alert((await respuesta.json()).mensaje);

    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(await respuesta.blob());
    enlace.download = constancia.nombre_archivo || `constancia_${constancia.folio}.pdf`;
    enlace.click();
}

// Su programa, o la lista de programas para elegir uno.
async function mostrarPrograma(alumno, programa) {
    const caja = document.getElementById('contenidoPrograma');

    if (programa) {
        caja.innerHTML = `
            <h3 class="programa__nombre">${escapar(programa.nombre_programa)}</h3>
            <p>${escapar(programa.institucion)} · Responsable: ${escapar(programa.nombre_responsable)}</p>
            <p>Horario: ${escapar(programa.horario_perfil)} · Horas: ${programa.horas_acumuladas} de ${programa.horas_requeridas}</p>`;
        return;
    }
    if (!alumno.induccion_completa) {
        caja.innerHTML = '<p class="nota">Primero debes completar el curso de inducción.</p>';
        return;
    }

    const [programas, datosProp] = await Promise.all([
        pedir('/api/alumno/programas').then(r => r.json()),
        pedir('/api/alumno/propuestas').then(r => r.ok ? r.json() : { propuestas: [] }).catch(() => ({ propuestas: [] }))
    ]);

    const ultimaProp = (datosProp.propuestas && datosProp.propuestas[0]) || null;
    const bloquePropuesta = ultimaProp
        ? `<div class="nota" style="margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
               <span>
                   <strong>Tu propuesta propia (${escapar(ultimaProp.folio || 'S/F')} — ${escapar(ultimaProp.nombre_empresa)}):</strong>
                   Estatus <strong style="text-transform:uppercase;">${escapar(ultimaProp.estatus)}</strong>
                   ${ultimaProp.motivo_rechazo ? ` · Motivo: ${escapar(ultimaProp.motivo_rechazo)}` : ''}
               </span>
               <a href="propuesta-propia.html" class="boton-chico">Ver mi propuesta propia</a>
           </div>`
        : `<div class="nota" style="margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
               <span>¿Quieres realizar tu Servicio Social en una empresa o institución que no está en el banco?</span>
               <a href="propuesta-propia.html" class="boton-chico">Subir propuesta propia</a>
           </div>`;

    if (programas.length === 0) {
        caja.innerHTML = bloquePropuesta + '<p class="nota">Por ahora no hay programas del banco disponibles para tu plan.</p>';
        return;
    }
    caja.innerHTML = bloquePropuesta + '<p class="nota">Aún no tienes programa. Elige uno del banco o sube tu propuesta propia:</p><div class="programas">' +
        programas.map(p => `
            <article class="programa">
                <h3 class="programa__nombre">${escapar(p.nombre_programa)}</h3>
                <p>${escapar(p.institucion)}</p>
                <p>${p.horas_requeridas} horas · ${escapar(p.horario_perfil)}</p>
                <p class="lugares">${p.cupo_disponible} lugares</p>
                <button class="boton-chico" onclick="solicitar(${Number(p.id_programa)})">Solicitar</button>
            </article>`).join('') + '</div>';
}

async function solicitar(id) {
    if (!confirm('¿Solicitar este programa? Solo puedes tener uno activo.')) return;
    const respuesta = await pedir('/api/alumno/solicitud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_programa: id })
    });
    alert((await respuesta.json()).mensaje);
    cargarPanel();
}

// Lista de documentos con su estado y botones.
function mostrarDocumentos(lista, datos) {
    document.getElementById('notaDocumentos').hidden = Boolean(datos.programa);
    document.getElementById('notaDocumentos').textContent = 'Cuando solicites tu programa podrás subir tus documentos.';

    document.getElementById('listaDocumentos').innerHTML = lista.map(d => {
        // La version mas nueva viene primero.
        const subido = datos.documentos.find(x => x.tipo_documento === d.tipo);
        // Los reportes van en orden: el 2 se habilita cuando el 1 ya se entrego (en revision o aceptado).
        const anterior = d.bimestre > 1
            ? datos.documentos.find(x => x.tipo_documento === 'reporte_bimestral_' + (d.bimestre - 1))
            : null;
        const enOrden = !(d.bimestre > 1) || (anterior && anterior.estatus !== 'rechazado');
        const puedeSubir = datos.programa && enOrden && (!subido || subido.estatus === 'rechazado');

        return `
            <li class="documento">
                <div>
                    <p class="documento__nombre">${d.nombre}
                        <span class="estatus estatus-${subido ? subido.estatus : 'vacio'}">${subido ? ESTADOS[subido.estatus] : 'Sin entregar'}</span>
                    </p>
                    ${d.bimestre > 1 && !enOrden && !subido ? `<p class="documento__detalle">Se habilita al entregar el reporte bimestral ${d.bimestre - 1}</p>` : ''}
                    ${subido ? `<p class="documento__detalle">${escapar(subido.nombre_archivo)} · versión ${subido.version_doc}</p>` : ''}
                    ${subido && subido.comentario ? `<p class="documento__comentario">Motivo del rechazo: ${escapar(subido.comentario)}</p>` : ''}
                </div>
                <div class="documento__acciones">
                    ${subido ? `<button class="boton-chico boton-oscuro" onclick="verPdf(${subido.id_documento})">Ver</button>` : ''}
                    ${puedeSubir ? `<button class="boton-chico" onclick="elegirArchivo('${d.tipo}')">Subir PDF</button>` : ''}
                </div>
            </li>`;
    }).join('');
}

// Abre el selector de archivos para un documento.
function elegirArchivo(tipo) {
    tipoPorSubir = tipo;
    document.getElementById('archivo').click();
}

// Cuando eligen el archivo: se revisa y se sube.
document.getElementById('archivo').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    e.target.value = '';
    if (!archivo) return;

    if (!archivo.name.toLowerCase().endsWith('.pdf') || archivo.size > 5 * 1024 * 1024) {
        return alert('Solo se permiten archivos en formato PDF con un peso máximo de 5 MB');
    }

    const formulario = new FormData();
    formulario.append('tipo', tipoPorSubir);
    formulario.append('archivo', archivo);

    const respuesta = await pedir('/api/alumno/documentos', { method: 'POST', body: formulario });
    alert((await respuesta.json()).mensaje);
    cargarPanel();
});

// Abre el PDF en otra pestana.
async function verPdf(id) {
    const ventana = window.open('', '_blank');
    const respuesta = await pedir('/api/alumno/documentos/' + id);
    if (!respuesta.ok) {
        ventana.close();
        return alert((await respuesta.json()).mensaje);
    }
    ventana.location.href = URL.createObjectURL(await respuesta.blob());
}

// Guardar datos de contacto.
document.getElementById('formDatos').addEventListener('submit', async (e) => {
    e.preventDefault();
    const respuesta = await pedir('/api/alumno/datos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            telefono: document.getElementById('telefono').value.trim(),
            domicilio: document.getElementById('domicilio').value,
            direccion: document.getElementById('direccion').value
        })
    });
    alert((await respuesta.json()).mensaje);
});

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});