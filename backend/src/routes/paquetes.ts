import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar } from '../auth.js';
import { notificarPersonal, notificarUsuarios, resolverAvisos } from '../push.js';

export const paquetesRouter = Router();
paquetesRouter.use(autenticar);

const TEXTO_TIPO: Record<string, string> = { paquete: 'un paquete', domicilio: 'un domicilio', correspondencia: 'correspondencia' };

const crearSchema = z.object({
  unidad_id: z.coerce.number().int().positive(),
  tipo: z.enum(['paquete', 'domicilio', 'correspondencia']).default('paquete'),
  descripcion: z.string().trim().max(150).optional().or(z.literal('').transform(() => undefined)),
});

export const SELECT_PAQUETE = `
  SELECT p.id, p.tipo, p.descripcion, p.estado, p.recibido_en, p.entregado_en, p.entregado_a, p.en_camino_en,
         ur.identificador AS unidad, rec.nombre AS recibido_por, ent.nombre AS entregado_por
    FROM paquete p
    JOIN unidad_residencial ur ON ur.id = p.unidad_id
    LEFT JOIN usuario rec ON rec.id = p.recibido_por
    LEFT JOIN usuario ent ON ent.id = p.entregado_por`;

function idDe(valor: string) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  return id;
}

// Portería registra lo que llegó para una unidad y avisa a sus residentes.
paquetesRouter.post('/', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'vigilante') throw new HttpError(403, 'Solo el vigilante registra paquetes');
  const d = crearSchema.parse(req.body ?? {});
  const unidad = await pool.query('SELECT identificador FROM unidad_residencial WHERE id = $1 AND copropiedad_id = $2', [d.unidad_id, user.copropiedadId]);
  if (!unidad.rowCount) throw new HttpError(404, 'Unidad no encontrada');
  const { rows } = await pool.query(
    'INSERT INTO paquete (copropiedad_id, unidad_id, tipo, descripcion, recibido_por) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [user.copropiedadId, d.unidad_id, d.tipo, d.descripcion ?? null, user.id],
  );
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'recibir_paquete', entidad: 'paquete', entidadId: rows[0].id, detalle: { tipo: d.tipo, unidad: unidad.rows[0].identificador } });
  await notificarUsuarios(await habitantesDe(d.unidad_id), {
    titulo: d.tipo === 'domicilio' ? 'Tu domicilio llegó' : 'Tienes algo en portería',
    cuerpo: `Llegó ${TEXTO_TIPO[d.tipo]}${d.descripcion ? ` (${d.descripcion})` : ''}. ${d.tipo === 'domicilio' ? 'Baja o avisa que ya vas.' : 'Pasa a recogerlo.'}`,
    datos: { tipo: 'paquete', paquete_id: String(rows[0].id) },
  });
  res.status(201).json((await pool.query(`${SELECT_PAQUETE} WHERE p.id = $1`, [rows[0].id])).rows[0]);
});

/** Residentes activos de una unidad. */
async function habitantesDe(unidadId: number): Promise<number[]> {
  const r = await pool.query(`SELECT id FROM usuario WHERE unidad_id = $1 AND estado = 'activo'`, [unidadId]);
  return r.rows.map((h) => h.id);
}

// Lo que ha llegado para la unidad del residente: por recoger y lo entregado en los últimos 7 días.
paquetesRouter.get('/mios', async (req, res) => {
  const user = req.user!;
  if (!user.unidadId) return res.json([]);
  const { rows } = await pool.query(
    `${SELECT_PAQUETE} WHERE p.unidad_id = $1 AND (p.estado = 'por_recoger' OR p.entregado_en > now() - interval '7 days')
      ORDER BY (p.estado = 'por_recoger') DESC, p.recibido_en DESC LIMIT 30`,
    [user.unidadId],
  );
  res.json(rows);
});

// Portería: lo pendiente de entregar (primero quien ya viene) y lo entregado en las últimas 24 horas.
paquetesRouter.get('/', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'vigilante') throw new HttpError(403, 'La gestión de paquetes es del vigilante');
  const { rows } = await pool.query(
    `${SELECT_PAQUETE} WHERE p.copropiedad_id = $1 AND (p.estado = 'por_recoger' OR p.entregado_en > now() - interval '24 hours')
      ORDER BY (p.estado = 'por_recoger') DESC, p.en_camino_en DESC NULLS LAST, p.recibido_en DESC LIMIT 100`,
    [user.copropiedadId],
  );
  res.json(rows);
});

// Portería marca el paquete como entregado (con el nombre de quien lo recibió, si lo quiere dejar).
paquetesRouter.post('/:id/entregar', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'vigilante') throw new HttpError(403, 'Solo el vigilante entrega paquetes');
  const id = idDe(String(req.params.id));
  const { entregado_a } = z.object({ entregado_a: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)) }).parse(req.body ?? {});
  const { rows } = await pool.query(
    `UPDATE paquete SET estado = 'entregado', entregado_en = now(), entregado_por = $3, entregado_a = $4
      WHERE id = $1 AND copropiedad_id = $2 AND estado = 'por_recoger' RETURNING id, unidad_id, tipo`,
    [id, user.copropiedadId, user.id, entregado_a ?? null],
  );
  if (!rows[0]) {
    const e = await pool.query('SELECT estado FROM paquete WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!e.rows[0]) throw new HttpError(404, 'Paquete no encontrado');
    throw new HttpError(409, 'El paquete ya fue entregado');
  }
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'entregar_paquete', entidad: 'paquete', entidadId: id });
  await resolverAvisos('paquete_en_camino', id);
  // La unidad se entera de que ya se entregó (y a quién): si no fue ella, puede reclamar de inmediato.
  await notificarUsuarios(await habitantesDe(rows[0].unidad_id), {
    titulo: rows[0].tipo === 'domicilio' ? 'Domicilio entregado' : 'Entrega registrada',
    cuerpo: `Se entregó ${TEXTO_TIPO[rows[0].tipo]} de tu unidad${entregado_a ? ` a ${entregado_a}` : ''}.`,
    datos: { tipo: 'paquete', paquete_id: String(id) },
  });
  res.json((await pool.query(`${SELECT_PAQUETE} WHERE p.id = $1`, [id])).rows[0]);
});

// El residente avisa que ya va a recoger (útil con un domiciliario esperando en la puerta).
paquetesRouter.post('/:id/voy', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'residente' || !user.unidadId) throw new HttpError(403, 'Solo un residente de la unidad puede avisar que va en camino');
  const id = idDe(String(req.params.id));
  const { rows } = await pool.query(
    `UPDATE paquete SET en_camino_en = now()
      WHERE id = $1 AND unidad_id = $2 AND estado = 'por_recoger'
        AND (en_camino_en IS NULL OR en_camino_en < now() - interval '2 minutes')
      RETURNING id`,
    [id, user.unidadId],
  );
  if (!rows[0]) {
    const e = await pool.query('SELECT unidad_id, estado FROM paquete WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!e.rows[0]) throw new HttpError(404, 'Paquete no encontrado');
    if (e.rows[0].unidad_id !== user.unidadId) throw new HttpError(403, 'Ese paquete no es de tu unidad');
    if (e.rows[0].estado !== 'por_recoger') throw new HttpError(409, 'El paquete ya fue entregado');
    throw new HttpError(409, 'Ya avisaste hace un momento');
  }
  const p = (await pool.query(`${SELECT_PAQUETE} WHERE p.id = $1`, [id])).rows[0];
  await notificarPersonal(user.copropiedadId, ['vigilante'], {
    titulo: p.tipo === 'domicilio' ? 'Ya bajan por el domicilio' : 'Ya van a recoger',
    cuerpo: `${user.nombre} · ${p.unidad} va en camino por ${TEXTO_TIPO[p.tipo]}${p.descripcion ? ` (${p.descripcion})` : ''}.`,
    datos: { tipo: 'paquete_en_camino', paquete_id: String(id) },
  });
  res.json(p);
});
