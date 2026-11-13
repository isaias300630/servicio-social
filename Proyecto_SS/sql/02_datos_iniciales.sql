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
