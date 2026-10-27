-- Esquema inicial (modelo relacional, Figura 7 del documento + auditoría, invitaciones y sesiones)
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE rol (
  id      SMALLSERIAL PRIMARY KEY,
  nombre  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE copropiedad (
  id                 SERIAL PRIMARY KEY,
  nombre             VARCHAR(150) NOT NULL,
  nit                VARCHAR(20)  NOT NULL UNIQUE,
  ciudad             VARCHAR(80)  NOT NULL DEFAULT 'Barranquilla',
  reglamento_interno TEXT,
  creado_en          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE unidad_residencial (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  identificador   VARCHAR(40) NOT NULL,
  UNIQUE (copropiedad_id, identificador),
  UNIQUE (id, copropiedad_id)
);

CREATE TABLE usuario (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id),
  unidad_id       INT,
  rol_id          SMALLINT NOT NULL REFERENCES rol(id),
  nombre          VARCHAR(120) NOT NULL,
  correo          VARCHAR(160) NOT NULL,
  telefono        VARCHAR(30),
  password_hash   TEXT NOT NULL,
  estado          VARCHAR(12) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (unidad_id, copropiedad_id) REFERENCES unidad_residencial(id, copropiedad_id)
);
CREATE UNIQUE INDEX usuario_correo_uk ON usuario (lower(correo));

CREATE TABLE codigo_invitacion (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  unidad_id       INT NOT NULL,
  codigo          VARCHAR(20) NOT NULL UNIQUE,
  creado_por      INT REFERENCES usuario(id),
  expira_en       TIMESTAMPTZ NOT NULL,
  usado_por       INT REFERENCES usuario(id),
  usado_en        TIMESTAMPTZ,
  FOREIGN KEY (unidad_id, copropiedad_id) REFERENCES unidad_residencial(id, copropiedad_id)
);

CREATE TABLE refresh_token (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expira_en   TIMESTAMPTZ NOT NULL,
  revocado    BOOLEAN NOT NULL DEFAULT false,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE zona_comun (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  nombre          VARCHAR(100) NOT NULL,
  descripcion     TEXT,
  aforo           INT CHECK (aforo > 0),
  hora_apertura   TIME NOT NULL DEFAULT '06:00',
  hora_cierre     TIME NOT NULL DEFAULT '22:00',
  estado          VARCHAR(15) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','inactiva','mantenimiento')),
  UNIQUE (copropiedad_id, nombre),
  UNIQUE (id, copropiedad_id),
  CHECK (hora_cierre > hora_apertura)
);

-- Una regla por zona (el diagrama de clases muestra 1..N; se simplifica a 1:1 para evitar reglas contradictorias)
CREATE TABLE regla_reserva (
  id                      SERIAL PRIMARY KEY,
  zona_id                 INT NOT NULL UNIQUE REFERENCES zona_comun(id) ON DELETE CASCADE,
  duracion_maxima_min     INT NOT NULL DEFAULT 120 CHECK (duracion_maxima_min > 0),
  anticipacion_minima_min INT NOT NULL DEFAULT 60 CHECK (anticipacion_minima_min >= 0),
  max_activas_por_unidad  INT NOT NULL DEFAULT 2 CHECK (max_activas_por_unidad > 0),
  dias_habilitados        SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'
);

CREATE TABLE reserva (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL,
  zona_id         INT NOT NULL,
  usuario_id      INT NOT NULL REFERENCES usuario(id),
  unidad_id       INT NOT NULL,
  inicio          TIMESTAMPTZ NOT NULL,
  fin             TIMESTAMPTZ NOT NULL,
  estado          VARCHAR(12) NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada','cancelada')),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelado_en    TIMESTAMPTZ,
  CHECK (fin > inicio),
  FOREIGN KEY (zona_id, copropiedad_id)   REFERENCES zona_comun(id, copropiedad_id),
  FOREIGN KEY (unidad_id, copropiedad_id) REFERENCES unidad_residencial(id, copropiedad_id),
  -- Anti-duplicados garantizado por la base de datos, incluso con peticiones simultáneas.
  -- Rango [inicio, fin): una reserva que empieza justo cuando termina otra es válida.
  CONSTRAINT reserva_sin_solape EXCLUDE USING gist (
    zona_id WITH =,
    tstzrange(inicio, fin) WITH &&
  ) WHERE (estado = 'confirmada')
);
CREATE INDEX reserva_usuario_idx ON reserva (usuario_id, inicio DESC);
CREATE INDEX reserva_unidad_idx  ON reserva (unidad_id, estado);

CREATE TABLE pqrs (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id),
  usuario_id      INT NOT NULL REFERENCES usuario(id),
  tipo            VARCHAR(12) NOT NULL CHECK (tipo IN ('peticion','queja','reclamo','sugerencia')),
  asunto          VARCHAR(150) NOT NULL,
  descripcion     TEXT NOT NULL,
  estado          VARCHAR(15) NOT NULL DEFAULT 'registrada'
                  CHECK (estado IN ('registrada','en_revision','en_proceso','cerrada','cancelada')),
  respuesta       TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE incidencia (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL,
  usuario_id      INT NOT NULL REFERENCES usuario(id),
  zona_id         INT,
  descripcion     TEXT NOT NULL,
  gravedad        VARCHAR(8) NOT NULL DEFAULT 'media' CHECK (gravedad IN ('baja','media','alta')),
  estado          VARCHAR(15) NOT NULL DEFAULT 'registrada'
                  CHECK (estado IN ('registrada','en_revision','en_proceso','cerrada','cancelada')),
  evidencia_url   TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (zona_id, copropiedad_id) REFERENCES zona_comun(id, copropiedad_id)
);

CREATE TABLE comunicacion (
  id              SERIAL PRIMARY KEY,
  copropiedad_id  INT NOT NULL REFERENCES copropiedad(id) ON DELETE CASCADE,
  autor_id        INT NOT NULL REFERENCES usuario(id),
  titulo          VARCHAR(150) NOT NULL,
  contenido       TEXT NOT NULL,
  publicado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notificacion (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  tipo        VARCHAR(30) NOT NULL,
  mensaje     TEXT NOT NULL,
  leida       BOOLEAN NOT NULL DEFAULT false,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notificacion_usuario_idx ON notificacion (usuario_id, leida, creado_en DESC);

CREATE TABLE dispositivo_push (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  plataforma  VARCHAR(10) NOT NULL CHECK (plataforma IN ('ios','android')),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE registro_auditoria (
  id              BIGSERIAL PRIMARY KEY,
  copropiedad_id  INT REFERENCES copropiedad(id),
  usuario_id      INT REFERENCES usuario(id),
  accion          VARCHAR(60) NOT NULL,
  entidad         VARCHAR(40) NOT NULL,
  entidad_id      INT,
  detalle         JSONB,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_copropiedad_idx ON registro_auditoria (copropiedad_id, creado_en DESC);
