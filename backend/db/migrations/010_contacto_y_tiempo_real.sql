-- Llamada a portería, bandeja de notificaciones y datos para el borrado en tiempo real.

-- Un solo número de portería para todo el conjunto (los vigilantes rotan; no se expone su celular personal).
ALTER TABLE copropiedad ADD COLUMN telefono_porteria VARCHAR(20);

-- Habeas data (Ley 1581 de 2012): el teléfono del residente solo se usa si autorizó su tratamiento.
ALTER TABLE usuario ADD COLUMN telefono_autorizado_en TIMESTAMPTZ;

-- Bandeja de notificaciones (la tabla venía del diseño inicial): título y asunto al que se refiere,
-- para reemplazar avisos repetidos y marcar como resueltos los que ya no requieren acción.
ALTER TABLE notificacion
  ADD COLUMN titulo        VARCHAR(150) NOT NULL DEFAULT '',
  ADD COLUMN referencia_id BIGINT;
CREATE INDEX notificacion_asunto_idx ON notificacion (tipo, referencia_id) WHERE NOT leida;
CREATE INDEX notificacion_antiguedad_idx ON notificacion (creado_en);

-- Última vez que un teléfono renovó su registro de notificaciones (para borrar los abandonados).
ALTER TABLE dispositivo_push ADD COLUMN actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now();

-- Recordatorio de reserva: se envía una sola vez.
ALTER TABLE reserva ADD COLUMN recordada_en TIMESTAMPTZ;

-- Paquetes y domicilios: el residente puede avisar que ya va a recogerlo.
ALTER TABLE paquete ADD COLUMN en_camino_en TIMESTAMPTZ;
