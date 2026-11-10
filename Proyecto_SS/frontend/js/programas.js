// Direccion base de la API.
const api = 'http://localhost:3000/api/programas';

// Agarramos el token que se guardo al iniciar sesion.
const token = localStorage.getItem('token');

// Cuando abre la pagina, cargamos la lista.
document.addEventListener('DOMContentLoaded', cargarProgramas);

// Trae todos los programas y los pone en la tabla.
async function cargarProgramas() {
    try {
        const respuesta = await fetch(api);
        const programas = await respuesta.json();

        const cuerpo = document.getElementById('cuerpoTabla');
        cuerpo.innerHTML = '';

        if (programas.length === 0) {
            cuerpo.innerHTML = '<tr><td colspan="6">No hay programas todavia</td></tr>';
            return;
        }

        programas.forEach(programa => {
            cuerpo.innerHTML += `
                <tr>
                    <td>${programa.nombre_programa}</td>
                    <td>${programa.tipo_pro}</td>
                    <td>${programa.estatus_pro}</td>
                    <td>${programa.horas_requeridas}</td>
                    <td>${programa.cupo_alumnos}</td>
                    <td>
                        <button class="boton-chico" onclick="editar(${programa.id_programa})">Editar</button>
                        <button class="boton-chico boton-rojo" onclick="borrar(${programa.id_programa})">Borrar</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Error al cargar:', error);
        alert('No se pudo conectar con el servidor.');
    }
}

// Cuando se envia el formulario: crea o actualiza segun el caso.
document.getElementById('formularioPrograma').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('idPrograma').value;

    const datos = {
        nombre: document.getElementById('nombre').value,
        tipo: document.getElementById('tipo').value,
        horas: parseInt(document.getElementById('horas').value),
        cupo: parseInt(document.getElementById('cupo').value),
        estatus: document.getElementById('estatus').value
    };

    try {
        let respuesta;

        if (id === '') {
            // No hay id: es uno nuevo (crear).
            respuesta = await fetch(api, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(datos)
            });
        } else {
            // Hay id: estamos editando (actualizar).
            respuesta = await fetch(api + '/' + id, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify(datos)
            });
        }

        const resultado = await respuesta.json();

        if (respuesta.ok) {
            alert(resultado.mensaje);
            limpiarFormulario();
            cargarProgramas();
        } else {
            alert('Error: ' + resultado.mensaje);
        }
    } catch (error) {
        console.error('Error al guardar:', error);
        alert('No se pudo guardar.');
    }
});

// Llena el formulario con los datos de un programa para editarlo.
async function editar(id) {
    try {
        const respuesta = await fetch(api + '/' + id);
        const programa = await respuesta.json();

        document.getElementById('idPrograma').value = programa.id_programa;
        document.getElementById('nombre').value = programa.nombre_programa;
        document.getElementById('tipo').value = programa.tipo_pro;
        document.getElementById('horas').value = programa.horas_requeridas;
        document.getElementById('cupo').value = programa.cupo_alumnos;
        document.getElementById('estatus').value = programa.estatus_pro;

        // Mostramos el campo de estatus y cambiamos el titulo.
        document.getElementById('campoEstatus').style.display = 'block';
        document.getElementById('tituloFormulario').textContent = 'Editar programa';
        document.getElementById('botonCancelar').style.display = 'inline-block';

        window.scrollTo(0, 0);
    } catch (error) {
        console.error('Error al traer el programa:', error);
    }
}

// Borra un programa despues de confirmar.
async function borrar(id) {
    if (!confirm('¿Seguro que quieres borrar este programa?')) {
        return;
    }

    try {
        const respuesta = await fetch(api + '/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });

        const resultado = await respuesta.json();

        if (respuesta.ok) {
            alert(resultado.mensaje);
            cargarProgramas();
        } else {
            alert('Error: ' + resultado.mensaje);
        }
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
    document.getElementById('tituloFormulario').textContent = 'Nuevo programa';
    document.getElementById('botonCancelar').style.display = 'none';
}
