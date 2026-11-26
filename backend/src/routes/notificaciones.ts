import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { autenticar } from '../auth.js';

/** Bandeja de notificaciones del propio usuario. Nadie puede ver ni marcar las de otra persona. */
export const notificacionesRouter = Router();
notificacionesRouter.use(autenticar);

const COLUMNAS = 'id, tipo, titulo, mensaje, referencia_id, leida, creado_en';

notificacionesRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM notificacion WHERE usuario_id = $1 ORDER BY id DESC LIMIT 50`, [req.user!.id]);
  res.json(rows);
});

// Consulta ligera que la app hace cada pocos segundos: contadores y avisos nuevos desde el último visto.
// Sin "desde" (primera consulta tras iniciar sesión) no devuelve avisos antiguos, solo el punto de partida.
notificacionesRouter.get('/resumen', async (req, res) => {
  const { desde } = z.object({ desde: z.coerce.number().int().min(0).optional() }).parse(req.query);
  const yo = req.user!.id;
  const conteo = await pool.query(
    `SELECT count(*) FILTER (WHERE NOT leida)::int AS sin_leer,
            count(*) FILTER (WHERE NOT leida AND tipo = 'chat')::int AS chat_sin_leer,
            COALESCE(max(id), 0)::int AS ultimo_id
       FROM notificacion WHERE usuario_id = $1`,
    [yo],
  );
  const nuevas =
    desde === undefined
      ? []
      : (await pool.query(`SELECT ${COLUMNAS} FROM notificacion WHERE usuario_id = $1 AND id > $2 AND NOT leida ORDER BY id LIMIT 10`, [yo, desde])).rows;
  res.json({ ...conteo.rows[0], nuevas });
});

// Marca como leídas: unas concretas, las de un tipo o todas.
notificacionesRouter.post('/leer', async (req, res) => {
  const d = z
    .object({ ids: z.array(z.number().int().positive()).max(100).optional(), tipo: z.string().max(30).optional(), todas: z.boolean().optional() })
    .refine((v) => v.todas || v.tipo || v.ids?.length, { message: 'Indica qué notificaciones marcar' })
    .parse(req.body ?? {});
  const r = await pool.query(
    `UPDATE notificacion SET leida = true
      WHERE usuario_id = $1 AND NOT leida
        AND ($2::boolean OR ($3::text IS NOT NULL AND tipo = $3) OR id = ANY($4::int[]))`,
    [req.user!.id, d.todas ?? false, d.tipo ?? null, d.ids ?? []],
  );
  res.json({ marcadas: r.rowCount });
});

// Vacía de la bandeja lo que ya se leyó.
notificacionesRouter.delete('/leidas', async (req, res) => {
  const r = await pool.query('DELETE FROM notificacion WHERE usuario_id = $1 AND leida', [req.user!.id]);
  res.json({ eliminadas: r.rowCount });
});
