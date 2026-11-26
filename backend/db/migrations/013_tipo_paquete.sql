-- 'correspondencia' tiene 15 caracteres y la columna admitía 14: registrar correspondencia fallaba.
ALTER TABLE paquete ALTER COLUMN tipo TYPE VARCHAR(20);
