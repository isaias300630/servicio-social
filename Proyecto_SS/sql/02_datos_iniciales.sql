insert into catalogo_roles (nombre_rol, descripcion)
values
    ('Alumno', 'Estudiante que realiza el servicio social'),
    ('Jefe de Oficina de SS', 'Encargado de revisar expedientes y kardex'),
    ('Jefe de Vinculacion', 'Encargado de firmar constancias de terminacion'),
    ('Administrador', 'Control total del sistema y altas de personal')
go

-- La contrasena es 'Admin12345' ya cifrada con bcrypt.
insert into usuarios (correousu, contrausu, id_rol, activo_usu)
values ('admin@culiacan.tecnm.mx', '$2b$10$iU8SLIj4/lBNFF05IgKX6OU6RTm.yJ.toB1NBiY3eSWidQfJbwqpC', 4, 1)
go

insert into administradores (id_usuario, nombre_ad, apellido_paterno_ad, nivel_acceso_ad)
values (scope_identity(), 'Administrador', 'General', 'Total')
go


-- Periodos escolares 
insert into periodos_escolares (nombre_periodo, fecha_inicio_pe, fecha_fin_pe, estatus_activo_pe)
values
    ('Ago-Dic 2026', '2026-08-17', '2026-12-11', 1),
    ('Ene-Jun 2027', '2027-01-25', '2027-06-11', 0)
go

-- Dependencias de ejemplo
insert into dependencias (nombre_empresa_de, origen_capital_de, nombre_titular_de, puesto_titular_de,
                          direccion_de, telefono_contacto_de, correo_contacto_de)
values
    ('Instituto Tecnológico de Culiacán', 'Público', 'Titular de ejemplo', 'Director',
     'Juan de Dios Bátiz 310 Pte., Culiacán, Sin.', '6670000001', 'contacto1@ejemplo.com'),
    ('Ayuntamiento de Culiacán', 'Público', 'Titular de ejemplo', 'Director de Desarrollo Social',
     'Av. Álvaro Obregón s/n, Centro, Culiacán, Sin.', '6670000002', 'contacto2@ejemplo.com'),
    ('Cruz Roja Mexicana Delegación Culiacán', 'Social', 'Titular de ejemplo', 'Coordinador',
     'Culiacán, Sin.', '6670000003', 'contacto3@ejemplo.com'),
    ('Empresa Privada de Ejemplo S.A. de C.V.', 'Privado', 'Titular de ejemplo', 'Gerente de Recursos Humanos',
     'Culiacán, Sin.', '6670000004', 'contacto4@ejemplo.com')
go