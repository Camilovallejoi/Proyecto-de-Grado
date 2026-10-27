-- Eliminar una zona la oculta (eliminación lógica) para conservar el historial de reservas y la auditoría.
ALTER TABLE zona_comun ADD COLUMN eliminada_en TIMESTAMPTZ;

-- El nombre debe ser único solo entre las zonas no eliminadas (permite volver a crear una zona con el mismo nombre).
ALTER TABLE zona_comun DROP CONSTRAINT zona_comun_copropiedad_id_nombre_key;
CREATE UNIQUE INDEX zona_comun_nombre_uk ON zona_comun (copropiedad_id, nombre) WHERE eliminada_en IS NULL;
