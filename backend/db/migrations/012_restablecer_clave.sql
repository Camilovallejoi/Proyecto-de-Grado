-- Restablecimiento de contraseña por la administración.
ALTER TABLE usuario
  -- Vencimiento de la contraseña temporal entregada al restablecer (nulo: no vence).
  ADD COLUMN clave_temporal_vence TIMESTAMPTZ,
  -- Cambia al restablecer o cambiar la contraseña: las sesiones emitidas antes dejan de valer.
  ADD COLUMN version_sesion INT NOT NULL DEFAULT 0;
