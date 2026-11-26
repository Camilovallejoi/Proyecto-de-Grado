import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { autenticar } from '../auth.js';

export const dispositivosRouter = Router();
dispositivosRouter.use(autenticar);

const schema = z.object({
  token: z.string().trim().min(20).max(4096),
  plataforma: z.enum(['ios', 'android']).default('android'),
});

// La app registra el token de Firebase del teléfono; si ya existía, pasa al usuario que inició sesión.
dispositivosRouter.post('/', async (req, res) => {
  const d = schema.parse(req.body ?? {});
  await pool.query(
    `INSERT INTO dispositivo_push (usuario_id, token, plataforma) VALUES ($1,$2,$3)
     ON CONFLICT (token) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, plataforma = EXCLUDED.plataforma, actualizado_en = now()`,
    [req.user!.id, d.token, d.plataforma],
  );
  res.status(204).end();
});

// Al cerrar sesión la app borra su token para no recibir avisos de otra persona.
dispositivosRouter.post('/baja', async (req, res) => {
  const d = z.object({ token: z.string().trim().min(20) }).parse(req.body ?? {});
  await pool.query('DELETE FROM dispositivo_push WHERE token = $1 AND usuario_id = $2', [d.token, req.user!.id]);
  res.status(204).end();
});
