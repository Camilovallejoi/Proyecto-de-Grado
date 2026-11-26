-- Visitante sin autorización previa: el vigilante crea una solicitud y solo el residente visitado la responde.
-- Estados nuevos: solicitada (esperando respuesta), rechazada y sin_respuesta (venció sin que el residente respondiera).
ALTER TABLE visita DROP CONSTRAINT visita_estado_check;
ALTER TABLE visita ALTER COLUMN estado TYPE VARCHAR(14); -- 'sin_respuesta' tiene 13 caracteres
ALTER TABLE visita ADD CONSTRAINT visita_estado_check
  CHECK (estado IN ('solicitada','autorizada','dentro','finalizada','cancelada','vencida','rechazada','sin_respuesta'));
ALTER TABLE visita ADD COLUMN respondida_en TIMESTAMPTZ;
