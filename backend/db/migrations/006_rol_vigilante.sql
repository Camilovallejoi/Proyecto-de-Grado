-- Rol de vigilante (celador): recibe y atiende los avisos de llegada al portón.
INSERT INTO rol (nombre) VALUES ('vigilante') ON CONFLICT (nombre) DO NOTHING;
