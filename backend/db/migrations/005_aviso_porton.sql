-- Aviso de llegada: el residente avisa a la administración que va llegando en un vehículo y necesita que abran el portón.
CREATE TABLE aviso_porton (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  usuario_id      INT NOT NULL REFERENCES usuario(id),
  unidad_id       INT NOT NULL,
  tipo_vehiculo   VARCHAR(10) NOT NULL DEFAULT 'carro' CHECK (tipo_vehiculo IN ('carro','moto','otro')),
  placa           VARCHAR(7),
  estado          VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','atendido','cancelado','vencido')),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  atendido_en     TIMESTAMPTZ,
  atendido_por    INT REFERENCES usuario(id),
  FOREIGN KEY (unidad_id, copropiedad_id) REFERENCES unidad_residencial(id, copropiedad_id)
);
-- Un residente solo puede tener un aviso pendiente a la vez (lo garantiza la base de datos).
CREATE UNIQUE INDEX aviso_porton_pendiente_uk ON aviso_porton (usuario_id) WHERE estado = 'pendiente';
CREATE INDEX aviso_porton_cop_idx ON aviso_porton (copropiedad_id, estado, creado_en DESC);
