import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, type UsuarioAuth } from '../auth.js';
import { notificarPersonal, notificarUsuarios, resolverAvisos } from '../push.js';

export const visitasRouter = Router();
visitasRouter.use(autenticar);

/** Máximo de visitas autorizadas y vigentes por residente. */
export const MAX_AUTORIZADAS = 5;

/** Minutos que el residente tiene para responder la solicitud de un visitante que espera en portería. */
export const VIGENCIA_SOLICITUD_MIN = 10;

/** Minutos que un visitante autorizado en el momento tiene para que el vigilante registre su entrada. */
export const VIGENCIA_TRAS_RESPUESTA_MIN = 30;

/** Máximo de solicitudes pendientes por residente (evita saturar al residente con avisos). */
export const MAX_SOLICITUDES_PENDIENTES = 3;

// Sin caracteres que se confunden al leerlos (0/O, 1/I).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const nuevoCodigo = () => Array.from(crypto.randomBytes(6), (b) => ALFABETO[b % ALFABETO.length]).join('');

const placaOpcional = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{5,7}$/, 'La placa debe tener entre 5 y 7 letras o números')
  .optional()
  .or(z.literal('').transform(() => undefined));
const textoOpcional = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

const crearSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre del visitante').max(120),
  documento: textoOpcional(30),
  placa: placaOpcional,
  horas: z.coerce.number().int().min(1).max(72).default(12),
});

const SELECT_VISITA = `
  SELECT v.id, v.nombre, v.documento, v.placa, v.codigo, v.valida_desde, v.valida_hasta, v.estado, v.origen,
         v.entrada_en, v.salida_en, ur.identificador AS unidad, u.nombre AS residente, ent.nombre AS recibido_por
    FROM visita v
    JOIN unidad_residencial ur ON ur.id = v.unidad_id
    LEFT JOIN usuario u ON u.id = v.residente_id
    LEFT JOIN usuario ent ON ent.id = v.registrado_entrada_por`;

/** Vista del vigilante: además, el teléfono del residente (solo si autorizó compartirlo) para poder llamarlo. */
const SELECT_VISITA_PORTERIA = SELECT_VISITA.replace(
  'ent.nombre AS recibido_por',
  `ent.nombre AS recibido_por, v.residente_id, CASE WHEN u.telefono_autorizado_en IS NOT NULL THEN u.telefono END AS residente_telefono`,
);

/** Selección de una visita por su identificador, para respuestas y la pantalla de inicio. */
export { SELECT_VISITA, SELECT_VISITA_PORTERIA };

/** Vence lo que ya no sirve: una autorización sin usar queda "vencida" y una solicitud sin respuesta queda "sin_respuesta". */
export async function vencerVisitas(copropiedadId?: number) {
  const { rows } = await pool.query(
    `UPDATE visita v SET estado = CASE WHEN v.estado = 'solicitada' THEN 'sin_respuesta' ELSE 'vencida' END
      WHERE v.estado IN ('autorizada','solicitada') AND v.valida_hasta < now() AND ($1::int IS NULL OR v.copropiedad_id = $1)
      RETURNING v.id, v.estado, v.nombre, v.residente_id, v.copropiedad_id,
                (SELECT nombre FROM usuario WHERE id = v.residente_id) AS residente`,
    [copropiedadId ?? null],
  );
  for (const v of rows) {
    if (v.estado !== 'sin_respuesta') continue; // una autorización que venció sin usarse no necesita aviso
    await resolverAvisos('visita_solicitud', v.id);
    await notificarPersonal(v.copropiedad_id, ['vigilante'], {
      titulo: 'El residente no respondió',
      cuerpo: `${v.residente ?? 'El residente'} no respondió sobre ${v.nombre}. Llámalo antes de decidir.`,
      datos: { tipo: 'visita_respuesta', visita_id: String(v.id) },
    });
    if (v.residente_id) {
      await notificarUsuarios([v.residente_id], {
        titulo: 'No alcanzaste a responder una visita',
        cuerpo: `${v.nombre} esperó en portería y la solicitud venció. Llama a portería si quieres que ingrese.`,
        datos: { tipo: 'visita', visita_id: String(v.id) },
      });
    }
  }
  return rows.length;
}

function idDe(valor: string) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  return id;
}

/** La operación de las visitas (cola, registro de ingresos, códigos, entradas y salidas) es trabajo del vigilante. */
function soloVigilante(u: UsuarioAuth | undefined): UsuarioAuth {
  if (!u || u.rol !== 'vigilante') throw new HttpError(403, 'Solo el vigilante realiza esta acción');
  return u;
}

async function insertar(v: {
  copropiedadId: number;
  unidadId: number;
  residenteId: number;
  nombre: string;
  documento?: string;
  placa?: string;
  horas?: number;
  minutos?: number;
  origen: 'residente' | 'porteria';
  estado: 'autorizada' | 'solicitada';
}) {
  for (let intento = 0; intento < 5; intento++) {
    try {
      return await pool.query(
        `INSERT INTO visita (copropiedad_id, unidad_id, residente_id, nombre, documento, placa, valida_hasta, origen, estado, codigo)
         VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(hours => $7::int, mins => $8::int), $9, $10, $11) RETURNING id`,
        [v.copropiedadId, v.unidadId, v.residenteId, v.nombre, v.documento ?? null, v.placa ?? null, v.horas ?? 0, v.minutos ?? 0, v.origen, v.estado, nuevoCodigo()],
      );
    } catch (e: any) {
      if (e.code !== '23505') throw e; // código repetido: se genera otro
    }
  }
  throw new HttpError(500, 'No se pudo generar un código único');
}

// El residente pre-autoriza a un visitante: recibe un código (y su QR) para entregarle.
visitasRouter.post('/', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'residente' || !user.unidadId) throw new HttpError(403, 'Solo un residente con unidad asignada puede autorizar visitantes');
  const d = crearSchema.parse(req.body ?? {});
  await vencerVisitas(user.copropiedadId);
  const n = await pool.query(`SELECT count(*)::int AS n FROM visita WHERE residente_id = $1 AND estado = 'autorizada'`, [user.id]);
  if (n.rows[0].n >= MAX_AUTORIZADAS) throw new HttpError(409, `Ya tienes ${MAX_AUTORIZADAS} visitantes autorizados vigentes: cancela alguno o espera a que venza`);
  const r = await insertar({ copropiedadId: user.copropiedadId, unidadId: user.unidadId, residenteId: user.id, nombre: d.nombre, documento: d.documento, placa: d.placa, horas: d.horas, origen: 'residente', estado: 'autorizada' });
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'autorizar_visita', entidad: 'visita', entidadId: r.rows[0].id, detalle: { nombre: d.nombre, horas: d.horas } });
  res.status(201).json((await pool.query(`${SELECT_VISITA} WHERE v.id = $1`, [r.rows[0].id])).rows[0]);
});

// Visitas recientes del propio residente.
visitasRouter.get('/mias', async (req, res) => {
  await vencerVisitas(req.user!.copropiedadId);
  // Lo vigente y lo de los últimos 7 días: el historial más antiguo ya no le sirve al residente.
  const { rows } = await pool.query(
    `${SELECT_VISITA} WHERE v.residente_id = $1
        AND (v.estado IN ('solicitada','autorizada','dentro') OR v.creado_en > now() - interval '7 days')
      ORDER BY (v.estado = 'solicitada') DESC, v.creado_en DESC LIMIT 20`,
    [req.user!.id],
  );
  res.json(rows);
});

// Registro de ingresos: entradas de los últimos N días (vigilante).
visitasRouter.get('/registro', async (req, res) => {
  const user = soloVigilante(req.user);
  const { dias } = z.object({ dias: z.coerce.number().int().min(1).max(90).default(7) }).parse(req.query);
  const { rows } = await pool.query(
    `${SELECT_VISITA} WHERE v.copropiedad_id = $1 AND v.entrada_en >= now() - make_interval(days => $2::int)
      ORDER BY v.entrada_en DESC LIMIT 300`,
    [user.copropiedadId, dias],
  );
  res.json(rows);
});

// Unidades del conjunto, para registrar un visitante que llega sin autorización previa (personal).
visitasRouter.get('/unidades', async (req, res) => {
  const user = soloVigilante(req.user);
  const { rows } = await pool.query('SELECT id, identificador FROM unidad_residencial WHERE copropiedad_id = $1 ORDER BY identificador', [user.copropiedadId]);
  res.json(rows);
});

// Residentes del conjunto, para elegir a quién visita quien llega sin autorización (vigilante).
visitasRouter.get('/residentes', async (req, res) => {
  const user = soloVigilante(req.user);
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, ur.identificador AS unidad,
            CASE WHEN u.telefono_autorizado_en IS NOT NULL THEN u.telefono END AS telefono
       FROM usuario u JOIN rol r ON r.id = u.rol_id AND r.nombre = 'residente'
       JOIN unidad_residencial ur ON ur.id = u.unidad_id
      WHERE u.copropiedad_id = $1 AND u.estado = 'activo'
      ORDER BY ur.identificador, u.nombre`,
    [user.copropiedadId],
  );
  res.json(rows);
});

// Visitas por atender: solicitudes esperando respuesta, autorizadas vigentes, visitantes dentro y respuestas recientes (vigilante).
visitasRouter.get('/', async (req, res) => {
  const user = soloVigilante(req.user);
  await vencerVisitas(user.copropiedadId);
  const { rows } = await pool.query(
    `${SELECT_VISITA_PORTERIA} WHERE v.copropiedad_id = $1
        AND (v.estado IN ('solicitada','autorizada','dentro')
             OR (v.estado IN ('rechazada','sin_respuesta') AND v.creado_en > now() - interval '30 minutes'))
      ORDER BY (v.estado = 'solicitada') DESC, (v.estado = 'dentro') DESC, v.creado_en DESC LIMIT 100`,
    [user.copropiedadId],
  );
  res.json(rows);
});

// Busca una visita por su código (lo que muestra el QR o lo que dicta el visitante).
visitasRouter.get('/codigo/:codigo', async (req, res) => {
  const user = soloVigilante(req.user);
  await vencerVisitas(user.copropiedadId);
  const codigo = String(req.params.codigo).trim().toUpperCase();
  const { rows } = await pool.query(`${SELECT_VISITA_PORTERIA} WHERE v.codigo = $1 AND v.copropiedad_id = $2`, [codigo, user.copropiedadId]);
  if (!rows[0]) throw new HttpError(404, 'No existe una visita con ese código');
  res.json(rows[0]);
});

// Llega un visitante sin autorización previa: el vigilante pide permiso al residente que va a visitar.
// El visitante no entra hasta que ese residente (y nadie más) responda.
visitasRouter.post('/porteria', async (req, res) => {
  const user = soloVigilante(req.user);
  const d = crearSchema.omit({ horas: true }).extend({ residente_id: z.coerce.number().int().positive() }).parse(req.body ?? {});
  const visitado = await pool.query(
    `SELECT u.id, u.nombre, u.unidad_id, ur.identificador AS unidad
       FROM usuario u JOIN rol r ON r.id = u.rol_id AND r.nombre = 'residente'
       JOIN unidad_residencial ur ON ur.id = u.unidad_id
      WHERE u.id = $1 AND u.copropiedad_id = $2 AND u.estado = 'activo'`,
    [d.residente_id, user.copropiedadId],
  );
  if (!visitado.rowCount) throw new HttpError(404, 'Residente no encontrado');
  await vencerVisitas(user.copropiedadId);
  const n = await pool.query(`SELECT count(*)::int AS n FROM visita WHERE residente_id = $1 AND estado = 'solicitada'`, [d.residente_id]);
  if (n.rows[0].n >= MAX_SOLICITUDES_PENDIENTES) throw new HttpError(409, 'Ese residente ya tiene varias solicitudes sin responder: espera a que respondan o llámalo');
  const v = visitado.rows[0];
  const r = await insertar({ copropiedadId: user.copropiedadId, unidadId: v.unidad_id, residenteId: v.id, nombre: d.nombre, documento: d.documento, placa: d.placa, minutos: VIGENCIA_SOLICITUD_MIN, origen: 'porteria', estado: 'solicitada' });
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'solicitar_visita_porteria', entidad: 'visita', entidadId: r.rows[0].id, detalle: { nombre: d.nombre, residente: v.nombre, unidad: v.unidad } });
  await notificarUsuarios([v.id], {
    titulo: 'Tienes una visita en portería',
    cuerpo: `${d.nombre} está en portería y quiere visitarte. ¿Lo autorizas?`,
    datos: { tipo: 'visita_solicitud', visita_id: String(r.rows[0].id) },
  });
  res.status(201).json((await pool.query(`${SELECT_VISITA} WHERE v.id = $1`, [r.rows[0].id])).rows[0]);
});

// Solo el residente al que visitan autoriza o rechaza; el visitante entra únicamente si fue autorizado.
visitasRouter.post('/:id/responder', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'residente') throw new HttpError(403, 'Solo el residente al que visitan puede responder');
  const id = idDe(String(req.params.id));
  const { decision } = z.object({ decision: z.enum(['autorizar', 'rechazar']) }).parse(req.body ?? {});
  await vencerVisitas(user.copropiedadId);
  const autorizar = decision === 'autorizar';
  const { rows } = autorizar
    ? await pool.query(
        `UPDATE visita SET estado = 'autorizada', respondida_en = now(), valida_desde = now(), valida_hasta = now() + make_interval(mins => $3::int)
          WHERE id = $1 AND residente_id = $2 AND estado = 'solicitada' RETURNING id, nombre`,
        [id, user.id, VIGENCIA_TRAS_RESPUESTA_MIN],
      )
    : await pool.query(
        `UPDATE visita SET estado = 'rechazada', respondida_en = now() WHERE id = $1 AND residente_id = $2 AND estado = 'solicitada' RETURNING id, nombre`,
        [id, user.id],
      );
  if (!rows[0]) {
    const v = await pool.query('SELECT residente_id, estado FROM visita WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!v.rows[0]) throw new HttpError(404, 'Visita no encontrada');
    if (v.rows[0].residente_id !== user.id) throw new HttpError(403, 'Solo el residente al que visitan puede responder');
    throw new HttpError(409, `La solicitud ya no se puede responder (${v.rows[0].estado})`);
  }
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: autorizar ? 'autorizar_visita_solicitada' : 'rechazar_visita_solicitada', entidad: 'visita', entidadId: id });
  await resolverAvisos('visita_solicitud', id);
  await notificarPersonal(user.copropiedadId, ['vigilante'], {
    titulo: autorizar ? 'Visita autorizada' : 'Visita rechazada',
    cuerpo: `${user.nombre} ${autorizar ? 'autorizó' : 'rechazó'} el ingreso de ${rows[0].nombre}`,
    datos: { tipo: 'visita_respuesta', visita_id: String(id) },
  });
  res.json((await pool.query(`${SELECT_VISITA} WHERE v.id = $1`, [id])).rows[0]);
});

// Registra la entrada de una visita autorizada y avisa al residente.
visitasRouter.post('/:id/entrada', async (req, res) => {
  const user = soloVigilante(req.user);
  const id = idDe(String(req.params.id));
  await vencerVisitas(user.copropiedadId);
  const { rows } = await pool.query(
    `UPDATE visita SET estado = 'dentro', entrada_en = now(), registrado_entrada_por = $3
      WHERE id = $1 AND copropiedad_id = $2 AND estado = 'autorizada' AND valida_desde <= now() AND valida_hasta >= now()
      RETURNING id, residente_id, nombre`,
    [id, user.copropiedadId, user.id],
  );
  if (!rows[0]) {
    const v = await pool.query('SELECT estado FROM visita WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!v.rows[0]) throw new HttpError(404, 'Visita no encontrada');
    throw new HttpError(409, `No se puede registrar la entrada: la visita está ${v.rows[0].estado}`);
  }
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'entrada_visita', entidad: 'visita', entidadId: id });
  await resolverAvisos('visita_respuesta', id);
  if (rows[0].residente_id) await notificarUsuarios([rows[0].residente_id], { titulo: 'Tu visita ingresó', cuerpo: `${rows[0].nombre} acaba de ingresar al conjunto`, datos: { tipo: 'visita', visita_id: String(id) } });
  res.json((await pool.query(`${SELECT_VISITA} WHERE v.id = $1`, [id])).rows[0]);
});

// Registra la salida de una visita que estaba dentro.
visitasRouter.post('/:id/salida', async (req, res) => {
  const user = soloVigilante(req.user);
  const id = idDe(String(req.params.id));
  const { rows } = await pool.query(
    `UPDATE visita SET estado = 'finalizada', salida_en = now(), registrado_salida_por = $3
      WHERE id = $1 AND copropiedad_id = $2 AND estado = 'dentro' RETURNING id, residente_id, nombre`,
    [id, user.copropiedadId, user.id],
  );
  if (!rows[0]) {
    const v = await pool.query('SELECT estado FROM visita WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!v.rows[0]) throw new HttpError(404, 'Visita no encontrada');
    throw new HttpError(409, `No se puede registrar la salida: la visita está ${v.rows[0].estado}`);
  }
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'salida_visita', entidad: 'visita', entidadId: id });
  if (rows[0].residente_id) await notificarUsuarios([rows[0].residente_id], { titulo: 'Tu visita salió', cuerpo: `${rows[0].nombre} salió del conjunto`, datos: { tipo: 'visita', visita_id: String(id) } });
  res.json((await pool.query(`${SELECT_VISITA} WHERE v.id = $1`, [id])).rows[0]);
});

// El residente cancela una autorización que todavía no se usó.
visitasRouter.post('/:id/cancelar', async (req, res) => {
  const user = req.user!;
  const id = idDe(String(req.params.id));
  const { rows } = await pool.query(`UPDATE visita SET estado = 'cancelada' WHERE id = $1 AND residente_id = $2 AND estado = 'autorizada' RETURNING id`, [id, user.id]);
  if (!rows[0]) {
    const v = await pool.query('SELECT residente_id, estado FROM visita WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!v.rows[0]) throw new HttpError(404, 'Visita no encontrada');
    if (v.rows[0].residente_id !== user.id) throw new HttpError(403, 'No puedes cancelar la visita de otra persona');
    throw new HttpError(409, `La visita ya no se puede cancelar (${v.rows[0].estado})`);
  }
  res.json((await pool.query(`${SELECT_VISITA} WHERE v.id = $1`, [id])).rows[0]);
});
