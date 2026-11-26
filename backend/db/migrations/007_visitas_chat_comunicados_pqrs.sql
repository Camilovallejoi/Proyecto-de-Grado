-- Visitantes con código QR y registro de ingresos, chat, comunicados y PQRS.

-- Visitante pre-autorizado por un residente (o registrado en portería sin autorización previa).
CREATE TABLE visita (
  id                      SERIAL PRIMARY KEY,
  copropiedad_id          INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  unidad_id               INT NOT NULL,
  residente_id            INT REFERENCES usuario(id) ON DELETE SET NULL,
  nombre                  VARCHAR(120) NOT NULL,
  documento               VARCHAR(30),
  placa                   VARCHAR(7),
  codigo                  VARCHAR(8) NOT NULL UNIQUE,
  valida_desde            TIMESTAMPTZ NOT NULL DEFAULT now(),
  valida_hasta            TIMESTAMPTZ NOT NULL,
  estado                  VARCHAR(12) NOT NULL DEFAULT 'autorizada'
                          CHECK (estado IN ('autorizada','dentro','finalizada','cancelada','vencida')),
  origen                  VARCHAR(10) NOT NULL DEFAULT 'residente' CHECK (origen IN ('residente','porteria')),
  entrada_en              TIMESTAMPTZ,
  salida_en               TIMESTAMPTZ,
  registrado_entrada_por  INT REFERENCES usuario(id) ON DELETE SET NULL,
  registrado_salida_por   INT REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (unidad_id, copropiedad_id) REFERENCES unidad_residencial(id, copropiedad_id),
  CHECK (valida_hasta > valida_desde)
);
CREATE INDEX visita_cop_estado_idx ON visita (copropiedad_id, estado, creado_en DESC);
CREATE INDEX visita_residente_idx ON visita (residente_id, creado_en DESC);

-- Chat: canal "comunidad" (todos) y canal "porteria" (un hilo por residente con el vigilante).
CREATE TABLE mensaje_chat (
  id              BIGSERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  canal           VARCHAR(10) NOT NULL CHECK (canal IN ('comunidad','porteria')),
  residente_id    INT REFERENCES usuario(id) ON DELETE CASCADE,
  autor_id        INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  cuerpo          VARCHAR(1000) NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((canal = 'comunidad' AND residente_id IS NULL) OR (canal = 'porteria' AND residente_id IS NOT NULL))
);
CREATE INDEX mensaje_chat_hilo_idx ON mensaje_chat (copropiedad_id, canal, residente_id, id);

-- Comunicados y PQRS ya existían en el esquema inicial (tablas comunicacion y pqrs): solo se completan.
ALTER TABLE comunicacion ADD COLUMN importante BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX comunicacion_cop_idx ON comunicacion (copropiedad_id, publicado_en DESC);

ALTER TABLE pqrs
  ADD COLUMN respondido_por INT REFERENCES usuario(id) ON DELETE SET NULL,
  ADD COLUMN respondido_en  TIMESTAMPTZ;
CREATE INDEX pqrs_cop_idx ON pqrs (copropiedad_id, estado, creado_en DESC);
CREATE INDEX pqrs_usuario_idx ON pqrs (usuario_id, creado_en DESC);
