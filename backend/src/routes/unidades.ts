import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, exigirRol } from '../auth.js';

export const unidadesRouter = Router();
unidadesRouter.use(autenticar, exigirRol('administrador'));

unidadesRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, identificador FROM unidad_residencial WHERE copropiedad_id = $1 ORDER BY identificador',
    [req.user!.copropiedadId],
  );
  res.json(rows);
});

unidadesRouter.post('/', async (req, res) => {
  const { identificador } = z.object({ identificador: z.string().trim().min(1).max(40) }).parse(req.body);
  try {
    const { rows } = await pool.query(
      'INSERT INTO unidad_residencial (copropiedad_id, identificador) VALUES ($1,$2) RETURNING id, identificador',
      [req.user!.copropiedadId, identificador],
    );
    res.status(201).json(rows[0]);
  } catch (e: any) {
    if (e.code === '23505') throw new HttpError(409, 'Esa unidad ya existe');
    throw e;
  }
});

// Genera un código de invitación (válido 7 días) para que un residente se asocie a una unidad.
unidadesRouter.post('/:id/invitacion', async (req, res) => {
  const unidadId = Number(req.params.id);
  const u = await pool.query('SELECT 1 FROM unidad_residencial WHERE id = $1 AND copropiedad_id = $2', [unidadId, req.user!.copropiedadId]);
  if (!u.rowCount) throw new HttpError(404, 'Unidad no encontrada');
  const codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
  const { rows } = await pool.query(
    `INSERT INTO codigo_invitacion (copropiedad_id, unidad_id, codigo, creado_por, expira_en)
     VALUES ($1,$2,$3,$4, now() + interval '7 days') RETURNING codigo, expira_en`,
    [req.user!.copropiedadId, unidadId, codigo, req.user!.id],
  );
  await auditar(pool, { copropiedadId: req.user!.copropiedadId, usuarioId: req.user!.id, accion: 'crear_invitacion', entidad: 'unidad', entidadId: unidadId });
  res.status(201).json(rows[0]);
});
