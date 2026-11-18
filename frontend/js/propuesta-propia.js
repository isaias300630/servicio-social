// Apartado del Alumno para registrar y consultar el estatus de su Propuesta Propia (CU06).
const token = localStorage.getItem('token');
const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
if (!token || usuario.rol !== 'Alumno') {
    window.location.href = 'index.html';
}

const ETIQUETAS_ESTATUS = {
    pendiente: 'Pendiente de revisión',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado'
};

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

let ultimaPropuesta = null;

document.addEventListener('DOMContentLoaded', cargarDatosPropuesta);

async function cargarDatosPropuesta() {
    try {
        const res = await pedir('/api/alumno/propuestas');
        const datos = await res.json();
        if (!res.ok) return alert(datos.mensaje || 'Error al cargar datos');

        const a = datos.alumno;
        document.getElementById('encabezadoControl').textContent = 'Alumno · ' + a.numero_control;
        document.getElementById('encabezadoAlumno').textContent = `${a.nombre} · ${a.carrera} · ${a.semestre}° semestre`;
        document.getElementById('numeroControl').value = a.numero_control;

        const propuestas = datos.propuestas || [];
        ultimaPropuesta = propuestas[0] || null;

        mostrarEstadoPropuesta(a, propuestas);
    } catch (err) {
        console.error(err);
        alert('No se pudo conectar con el servidor.');
    }
}

function mostrarEstadoPropuesta(alumno, propuestas) {
    const seccionEstado = document.getElementById('seccionEstado');
    const contenidoEstado = document.getElementById('contenidoEstado');
    const seccionFormulario = document.getElementById('seccionFormulario');

    if (propuestas.length === 0) {
        seccionEstado.hidden = !alumno.tiene_servicio_activo;
        seccionFormulario.hidden = false;
        if (alumno.tiene_servicio_activo) {
            contenidoEstado.innerHTML = '<p class="nota">Nota: actualmente ya cuentas con un Servicio Social activo en <a href="alumno.html"><strong>Mi Servicio Social</strong></a>.</p>';
        }
        return;
    }

    seccionEstado.hidden = false;
    const p = propuestas[0];
    const tienePendiente = p.estatus === 'pendiente';
    seccionFormulario.hidden = false;

    contenidoEstado.innerHTML = propuestas.map(prop => `
        <article class="programa" style="margin-bottom: 1.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
                <div>
                    <h3 class="programa__nombre" style="margin-bottom:0.3rem;">
                        Folio: ${escapar(prop.folio || 'S/F')} — ${escapar(prop.nombre_empresa)}
                    </h3>
                    <p style="margin:0;"><strong># de Control:</strong> ${escapar(prop.numero_control)} · <strong>Programa:</strong> ${escapar(prop.nombre_programa)}</p>
                </div>
                <span class="estatus estatus-${escapar(prop.estatus)}">${escapar(ETIQUETAS_ESTATUS[prop.estatus] || prop.estatus)}</span>
            </div>

            ${prop.estatus === 'rechazado' && prop.motivo_rechazo ? `
                <p class="documento__comentario" style="margin-bottom:1rem;">
                    <strong>Motivo del rechazo:</strong> ${escapar(prop.motivo_rechazo)}
                </p>
            ` : ''}

            <div class="rejilla" style="font-size:1.4rem; gap:0.8rem;">
                <p><strong>Área o Depto.:</strong> ${escapar(prop.area)}</p>
                <p><strong>Origen de capital:</strong> ${escapar(prop.origen_capital)}</p>
                <p><strong>Titular / Jefe que autoriza:</strong> ${escapar(prop.nombre_titular)} (${escapar(prop.puesto_titular)})</p>
                <p><strong>Puesto del responsable:</strong> ${escapar(prop.puesto_responsable)}</p>
                <p><strong># de alumnos que solicita:</strong> ${Number(prop.alumnos_solicitados)}</p>
                <p><strong>Horario / Perfil:</strong> ${escapar(prop.horario_perfil)}</p>
                <p><strong>Teléfono de contacto:</strong> ${escapar(prop.telefono_contacto)}</p>
                <p><strong>Correo de contacto:</strong> ${escapar(prop.correo_contacto)}</p>
                <p style="grid-column: 1 / -1;"><strong>Domicilio:</strong> ${escapar(prop.domicilio)}</p>
                <p style="grid-column: 1 / -1;"><strong>Objetivo:</strong> ${escapar(prop.objetivo)}</p>
                <p style="grid-column: 1 / -1;"><strong>Actividades a realizar:</strong> ${escapar(prop.actividades)}</p>
            </div>

            ${prop.estatus === 'rechazado' && !alumno.tiene_servicio_activo && !tienePendiente ? `
                <div style="margin-top:1rem;">
                    <button type="button" class="boton-chico" onclick="cargarEnFormulario()">Corregir y volver a enviar</button>
                </div>
            ` : ''}
        </article>
    `).join('');
}

window.cargarEnFormulario = function () {
    if (!ultimaPropuesta) return;
    document.getElementById('nombreEmpresa').value = ultimaPropuesta.nombre_empresa || '';
    document.getElementById('area').value = ultimaPropuesta.area || '';
    document.getElementById('origenCapital').value = ultimaPropuesta.origen_capital || '';
    document.getElementById('nombreTitular').value = ultimaPropuesta.nombre_titular || '';
    document.getElementById('puestoTitular').value = ultimaPropuesta.puesto_titular || '';
    document.getElementById('puestoResponsable').value = ultimaPropuesta.puesto_responsable || '';
    document.getElementById('nombrePrograma').value = ultimaPropuesta.nombre_programa || '';
    document.getElementById('alumnosSolicitados').value = ultimaPropuesta.alumnos_solicitados || 1;
    document.getElementById('horarioPerfil').value = ultimaPropuesta.horario_perfil || '';
    document.getElementById('objetivo').value = ultimaPropuesta.objetivo || '';
    document.getElementById('actividades').value = ultimaPropuesta.actividades || '';
    document.getElementById('telefonoContacto').value = ultimaPropuesta.telefono_contacto || '';
    document.getElementById('correoContacto').value = ultimaPropuesta.correo_contacto || '';
    document.getElementById('domicilio').value = ultimaPropuesta.domicilio || '';
    document.getElementById('seccionFormulario').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('formPropuesta').addEventListener('submit', async (e) => {
    e.preventDefault();

    const cuerpo = {
        nombre_empresa: document.getElementById('nombreEmpresa').value.trim(),
        area: document.getElementById('area').value.trim(),
        origen_capital: document.getElementById('origenCapital').value,
        nombre_titular: document.getElementById('nombreTitular').value.trim(),
        puesto_titular: document.getElementById('puestoTitular').value.trim(),
        nombre_responsable: document.getElementById('nombreTitular').value.trim(),
        puesto_responsable: document.getElementById('puestoResponsable').value.trim(),
        nombre_programa: document.getElementById('nombrePrograma').value.trim(),
        alumnos_solicitados: Number(document.getElementById('alumnosSolicitados').value),
        horario_perfil: document.getElementById('horarioPerfil').value.trim(),
        objetivo: document.getElementById('objetivo').value.trim(),
        actividades: document.getElementById('actividades').value.trim(),
        telefono_contacto: document.getElementById('telefonoContacto').value.trim(),
        correo_contacto: document.getElementById('correoContacto').value.trim(),
        domicilio: document.getElementById('domicilio').value.trim()
    };

    if (!/^\d{10}$/.test(cuerpo.telefono_contacto)) {
        return alert('El teléfono de contacto debe tener exactamente 10 dígitos.');
    }

    const btn = document.getElementById('btnEnviar');
    btn.disabled = true;

    try {
        const res = await pedir('/api/alumno/propuestas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cuerpo)
        });
        const data = await res.json();
        alert(data.mensaje);

        if (res.ok && data.success) {
            document.getElementById('formPropuesta').reset();
            await cargarDatosPropuesta();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (err) {
        console.error(err);
        alert('No se pudo conectar con el servidor.');
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('cerrarSesion').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = 'index.html';
});
