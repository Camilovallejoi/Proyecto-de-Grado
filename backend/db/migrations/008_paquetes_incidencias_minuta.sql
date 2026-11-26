-- Chat solo entre residente y vigilante: se elimina el canal de la comunidad.
DELETE FROM mensaje_chat WHERE canal = 'comunidad';
ALTER TABLE mensaje_chat ADD CONSTRAINT mensaje_chat_solo_porteria CHECK (canal = 'porteria');

-- Paquetes, domicilios y correspondencia que recibe la portería para una unidad.
CREATE TABLE paquete (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  unidad_id       INT NOT NULL,
  tipo            VARCHAR(14) NOT NULL DEFAULT 'paquete' CHECK (tipo IN ('paquete','domicilio','correspondencia')),
  descripcion     VARCHAR(150),
  estado          VARCHAR(12) NOT NULL DEFAULT 'por_recoger' CHECK (estado IN ('por_recoger','entregado')),
  recibido_por    INT REFERENCES usuario(id) ON DELETE SET NULL,
  recibido_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  entregado_en    TIMESTAMPTZ,
  entregado_por   INT REFERENCES usuario(id) ON DELETE SET NULL,
  entregado_a     VARCHAR(120),
  FOREIGN KEY (unidad_id, copropiedad_id) REFERENCES unidad_residencial(id, copropiedad_id)
);
CREATE INDEX paquete_cop_estado_idx ON paquete (copropiedad_id, estado, recibido_en DESC);
CREATE INDEX paquete_unidad_idx ON paquete (unidad_id, recibido_en DESC);

-- Minuta digital del vigilante: novedades del turno con fecha y hora.
CREATE TABLE minuta (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  autor_id        INT REFERENCES usuario(id) ON DELETE SET NULL,
  tipo            VARCHAR(8) NOT NULL DEFAULT 'novedad' CHECK (tipo IN ('novedad','ronda','alerta')),
  descripcion     VARCHAR(1000) NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX minuta_cop_idx ON minuta (copropiedad_id, creado_en DESC);

-- Incidencias: la tabla ya existía en el esquema inicial; se agrega el seguimiento de la administración.
ALTER TABLE incidencia
  ADD COLUMN respuesta       VARCHAR(2000),
  ADD COLUMN atendido_por    INT REFERENCES usuario(id) ON DELETE SET NULL,
  ADD COLUMN atendido_en     TIMESTAMPTZ;
CREATE INDEX incidencia_cop_idx ON incidencia (copropiedad_id, estado, creado_en DESC);
CREATE INDEX incidencia_usuario_idx ON incidencia (usuario_id, creado_en DESC);
