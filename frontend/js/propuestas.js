// Apartado de revision y dictamen de propuestas propias (CU07)
// para el Jefe de Oficina de SS y el Jefe de Vinculacion.
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
const ROLES = ['Jefe de Oficina de SS', 'Jefe de Vinculacion'];

if (!token || !ROLES.includes(usuario.rol)) {
    window.location.href = 'index.html';
}

document.getElementById('etiquetaRol').textContent = usuario.rol || 'Validación de Propuestas';
document.getElementById('irConstancias').hidden = usuario.rol !== 'Jefe de Vinculacion';

const ETIQUETAS = {
    pendiente: 'Pendiente',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado'
};

let propuestas = [];

function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

async function pedir(ruta, opciones = {}) {
    opciones.headers = { 'Authorization': 'Bearer ' + token, ...opciones.headers };
    const respuesta = await fetch(ruta, opciones);
    if (respuesta.status === 401) {
        localStorage.clear();
        window.location.href = 'index.html';
    }
    return respuesta;
}

document.addEventListener('DOMContentLoaded', cargarPropuestas);
document.getElementById('buscar').addEventListener('input', pintarPropuestas);
document.getElementById('filtroEstatus').addEventListener('change', pintarPropuestas);

async function cargarPropuestas() {
    try {
        const res = await pedir('/api/propuestas');
        const datos = await res.json();
        if (!res.ok) return alert(datos.mensaje || 'Error al cargar propuestas');

        propuestas = datos;
        const contar = (est) => propuestas.filter(p => p.estatus === est).length;

        document.getElementById('totalPropuestas').textContent = propuestas.length;
        document.getElementById('totalPendientes').textContent = contar('pendiente');
        document.getElementById('totalAprobadas').textContent = contar('aprobado');
        document.getElementById('totalRechazadas').textContent = contar('rechazado');

        pintarPropuestas();
    } catch (err) {
        console.error(err);
        document.getElementById('listaPropuestas').innerHTML =
            '<p class="nota">No se pudo conectar con el servidor.</p>';
    }
}

function pintarPropuestas() {
    const texto = document.getElementById('buscar').value.trim().toLowerCase();
    const estatus = document.getElementById('filtroEstatus').value;
    const contenedor = document.getElementById('listaPropuestas');

    const filtradas = propuestas.filter(p => {
        const coincideEstatus = !estatus || p.estatus === estatus;
        const buscable = [
            p.folio, p.numero_control, p.alumno, p.carrera,
            p.nombre_empresa, p.area, p.nombre_titular, p.nombre_programa
        ].join(' ').toLowerCase();
        return coincideEstatus && buscable.includes(texto);
    });

    if (filtradas.length === 0) {
        contenedor.innerHTML = `<p class="nota">${
            estatus === 'pendiente'
                ? 'No hay propuestas propias pendientes por validar.'
                : 'Ninguna propuesta propia coincide con el filtro seleccionado.'
        }</p>`;
        return;
    }

    contenedor.innerHTML = filtradas.map(p => {
        const id = Number(p.id_programa);
        const esPendiente = p.estatus === 'pendiente';

        return `
            <article class="programa" style="margin-bottom: 1.8rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem; margin-bottom:1.2rem; border-bottom:1px solid var(--borde-suave, #e2e8f0); padding-bottom:1rem;">
                    <div>
                        <h3 class="programa__nombre" style="margin-bottom:0.3rem;">
                            # DE FOLIO: ${escapar(p.folio || 'S/F')} — ${escapar(p.nombre_empresa || 'Sin empresa')}
                        </h3>
                        <p style="margin:0;">
                            <strong># DE CONTROL:</strong> ${escapar(p.numero_control || 'S/N')}
                            ${p.alumno ? ` · <strong>Alumno:</strong> ${escapar(p.alumno)} (${escapar(p.carrera || '')} · ${escapar(p.plan_estudios || '')})` : ''}
                        </p>
                    </div>
                    <span class="estatus estatus-${escapar(p.estatus)}">
                        STATUS DE REVISIÓN: ${escapar(ETIQUETAS[p.estatus] || p.estatus)}
                    </span>
                </div>

                <div class="rejilla" style="font-size:1.4rem; gap:0.8rem; margin-bottom:1rem;">
                    <p><strong>NOMBRE DE EMPRESA O INSTITUCIÓN:</strong><br>${escapar(p.nombre_empresa || '—')}</p>
                    <p><strong>ÁREA O DEPTO.:</strong><br>${escapar(p.area || '—')}</p>
                    <p><strong>ORIGEN DE CAPITAL:</strong><br>${escapar(p.origen_capital || '—')}</p>
                    <p><strong>NOMBRE DEL PROGRAMA / PROYECTO:</strong><br>${escapar(p.nombre_programa || '—')}</p>
                    <p style="grid-column: 1 / -1;">
                        <strong>NOMBRE DE LA PERSONA TITULAR DE LA EMPRESA O JEFE DE DEPARTAMENTO (AUTORIZA ACEPTACIÓN):</strong><br>
                        ${escapar(p.nombre_titular || p.nombre_responsable || '—')}
                    </p>
                    <p><strong>PUESTO DEL TITULAR:</strong><br>${escapar(p.puesto_titular || '—')}</p>
                    <p><strong>PUESTO DEL RESPONSABLE:</strong><br>${escapar(p.puesto_responsable || '—')}</p>
                    <p><strong># DE ALUMNOS QUE SOLICITA:</strong><br>${Number(p.alumnos_solicitados || 1)}</p>
                    <p><strong>HORARIO / PERFIL REQUERIDO DEL ALUMNO:</strong><br>${escapar(p.horario_perfil || '—')}</p>
                    <p><strong>TELÉFONO DE CONTACTO:</strong><br>${escapar(p.telefono_contacto || '—')}</p>
                    <p><strong>CORREO DE CONTACTO:</strong><br>${escapar(p.correo_contacto || '—')}</p>
                    <p style="grid-column: 1 / -1;"><strong>DOMICILIO:</strong><br>${escapar(p.domicilio || '—')}</p>
                    <p style="grid-column: 1 / -1;"><strong>OBJETIVO:</strong><br>${escapar(p.objetivo || '—')}</p>
                    <p style="grid-column: 1 / -1;"><strong>ACTIVIDADES A REALIZAR:</strong><br>${escapar(p.actividades || '—')}</p>
                </div>

                ${p.estatus === 'rechazado' && p.motivo_rechazo ? `
                    <p class="documento__comentario" style="margin-bottom:1rem;">
                        <strong>Motivo del rechazo:</strong> ${escapar(p.motivo_rechazo)}
                    </p>
                ` : ''}

                ${esPendiente ? `
                    <div class="documento__acciones" style="margin-top:1rem;">
                        <button type="button" class="boton-chico" onclick="aprobarPropuesta(${id}, '${escapar(p.folio || '')}')">Aceptar propuesta</button>
                        <button type="button" class="boton-chico boton-rojo" onclick="rechazarPropuesta(${id}, '${escapar(p.folio || '')}')">Rechazar propuesta</button>
                    </div>
                ` : ''}
            </article>
        `;
    }).join('');
}

window.aprobarPropuesta = async function (id, folio) {
    if (!confirm(`¿Aprobar la propuesta propia ${folio} e inscribir automáticamente al alumno en este programa?`)) {
        return;
    }
    await enviarDictamen(id, { estatus: 'aprobado' });
};

window.rechazarPropuesta = async function (id, folio) {
    const motivo = prompt(`Indica el motivo por el que se rechaza la propuesta ${folio} (obligatorio para notificar al alumno):`);
    if (motivo === null) return;
    if (!motivo.trim()) {
        return alert('Es obligatorio capturar el motivo del rechazo para notificar al alumno.');
    }
    await enviarDictamen(id, { estatus: 'rechazado', motivo: motivo.trim() });
};

async function enviarDictamen(id, cuerpo) {
    try {
        const res = await pedir(`/api/propuestas/${id}/dictamen`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo)
        });
        const data = await res.json();
        alert(data.mensaje);
        if (res.ok) {
            await cargarPropuestas();
        }
    } catch (err) {
        console.error(err);
        alert('No se pudo conectar con el servidor.');
    }
}

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});
