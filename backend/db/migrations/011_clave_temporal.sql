-- Cuentas creadas por la administración: la contraseña que ella asigna es temporal
-- y el usuario debe cambiarla antes de usar la aplicación.
ALTER TABLE usuario ADD COLUMN cambio_clave_pendiente BOOLEAN NOT NULL DEFAULT false;
