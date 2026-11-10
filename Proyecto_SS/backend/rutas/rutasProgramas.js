// Rutas de programas de servicio social 
const express = require('express');
const { sql, getPool } = require('../db');
const verificarSesion = require('./verificarSesion');

const router = express.Router();

//  deja pasar solo si el usuario es Jefe de Oficina de SS.
function soloJefeOficina(req, res, next) {
    if (req.usuario.rol !== 'Jefe de Oficina de SS') {
        return res.status(403).json({ mensaje: 'Solo el Jefe de Oficina de SS puede hacer esto' });
    }
    next();
}

// Ver todos los programas.
router.get('/programas', async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request().query(`
            select p.id_programa, p.nombre_programa, p.tipo_pro, p.estatus_pro,
                   p.horas_requeridas, p.cupo_alumnos, d.nombre_empresa_de as institucion
            from programas_ss p
            left join dependencias d on p.id_dependencia = d.id_dependencia
        `);
        res.json(resultado.recordset);
    } catch (error) {
        console.error('Error al obtener programas:', error);
        res.status(500).json({ mensaje: 'Error interno' });
    }
});

// Ver un solo programa por su id.
router.get('/programas/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const resultado = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('select * from programas_ss where id_programa = @id');

        if (resultado.recordset.length === 0) {
            return res.status(404).json({ mensaje: 'Programa no encontrado' });
        }
        res.json(resultado.recordset[0]);
    } catch (error) {
        console.error('Error al obtener el programa:', error);
        res.status(500).json({ mensaje: 'Error interno' });
    }
});

// Crear un programa nuevo.
router.post('/programas', verificarSesion, soloJefeOficina, async (req, res) => {
    const { nombre, tipo, horas, cupo, idDependencia, idPeriodo } = req.body;

    // Revisamos que lo importante no venga vacio.
    if (!nombre || !tipo) {
        return res.status(400).json({ mensaje: 'Falta el nombre o el tipo del programa' });
    }

    try {
        const pool = await getPool();
        await pool.request()
            .input('nombre', sql.VarChar, nombre)
            .input('tipo', sql.VarChar, tipo)
            .input('horas', sql.Int, horas || 0)
            .input('cupo', sql.Int, cupo || 0)
            .input('idDependencia', sql.Int, idDependencia || null)
            .input('idPeriodo', sql.Int, idPeriodo || null)
            .query(`
                insert into programas_ss
                    (nombre_programa, tipo_pro, estatus_pro, horas_requeridas, cupo_alumnos, cupo_disponible, id_dependencia, id_periodo)
                values
                    (@nombre, @tipo, 'pendiente', @horas, @cupo, @cupo, @idDependencia, @idPeriodo)
            `);

        res.status(201).json({ mensaje: 'Programa creado' });
    } catch (error) {
        console.error('Error al crear el programa:', error);
        res.status(500).json({ mensaje: 'Error al crear el programa' });
    }
});

// Actualizar un programa que ya existe.
router.put('/programas/:id', verificarSesion, soloJefeOficina, async (req, res) => {
    const { nombre, tipo, estatus, horas, cupo } = req.body;

    try {
        const pool = await getPool();

        // Primero revisamos que el programa exista.
        const existe = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('select id_programa from programas_ss where id_programa = @id');

        if (existe.recordset.length === 0) {
            return res.status(404).json({ mensaje: 'Programa no encontrado' });
        }

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('nombre', sql.VarChar, nombre)
            .input('tipo', sql.VarChar, tipo)
            .input('estatus', sql.VarChar, estatus)
            .input('horas', sql.Int, horas || 0)
            .input('cupo', sql.Int, cupo || 0)
            .query(`
                update programas_ss
                set nombre_programa = @nombre,
                    tipo_pro = @tipo,
                    estatus_pro = @estatus,
                    horas_requeridas = @horas,
                    cupo_alumnos = @cupo
                where id_programa = @id
            `);

        res.json({ mensaje: 'Programa actualizado' });
    } catch (error) {
        console.error('Error al actualizar el programa:', error);
        res.status(500).json({ mensaje: 'Error al actualizar el programa' });
    }
});

// Borrar un programa.
router.delete('/programas/:id', verificarSesion, soloJefeOficina, async (req, res) => {
    try {
        const pool = await getPool();

        const existe = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('select id_programa from programas_ss where id_programa = @id');

        if (existe.recordset.length === 0) {
            return res.status(404).json({ mensaje: 'Programa no encontrado' });
        }

        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('delete from programas_ss where id_programa = @id');

        res.json({ mensaje: 'Programa borrado' });
    } catch (error) {
        console.error('Error al borrar el programa:', error);
        res.status(500).json({ mensaje: 'Error al borrar el programa' });
    }
});

module.exports = router;
