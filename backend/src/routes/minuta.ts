import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, esPersonal, exigirRol } from '../auth.js';
import { notificarPersonal } from '../push.js';

export const minutaRouter = Router();
minutaRouter.use(autenticar);

const crearSchema = z.object({
  tipo: z.enum(['novedad', 'ronda', 'alerta']).default('novedad'),
  descripcion: z.string().trim().min(3, 'Describe la novedad').max(1000),
});

const SELECT = `SELECT m.id, m.tipo, m.descripcion, m.creado_en, u.nombre AS autor
                  FROM minuta m LEFT JOIN usuario u ON u.id = m.autor_id`;

// El vigilante anota las novedades de su turno.
minutaRouter.post('/', exigirRol('vigilante'), async (req, res) => {
  const user = req.user!;
  const d = crearSchema.parse(req.body ?? {});
  const { rows } = await pool.query(
    'INSERT INTO minuta (copropiedad_id, autor_id, tipo, descripcion) VALUES ($1,$2,$3,$4) RETURNING id',
    [user.copropiedadId, user.id, d.tipo, d.descripcion],
  );
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'anotar_minuta', entidad: 'minuta', entidadId: rows[0].id, detalle: { tipo: d.tipo } });
  if (d.tipo === 'alerta') {
    await notificarPersonal(user.copropiedadId, ['administrador'], {
      titulo: 'Alerta de portería',
      cuerpo: d.descripcion.length > 120 ? d.descripcion.slice(0, 117) + '…' : d.descripcion,
      datos: { tipo: 'minuta', minuta_id: String(rows[0].id) },
    });
  }
  res.status(201).json((await pool.query(`${SELECT} WHERE m.id = $1`, [rows[0].id])).rows[0]);
});

// La administración y el vigilante leen la minuta de los últimos días (la más reciente primero).
minutaRouter.get('/', async (req, res) => {
  const user = req.user!;
  if (!esPersonal(user)) throw new HttpError(403, 'No tienes permiso para esta acción');
  const { dias } = z.object({ dias: z.coerce.number().int().min(1).max(30).default(3) }).parse(req.query);
  const { rows } = await pool.query(
    `${SELECT} WHERE m.copropiedad_id = $1 AND m.creado_en >= now() - make_interval(days => $2::int) ORDER BY m.creado_en DESC LIMIT 200`,
    [user.copropiedadId, dias],
  );
  res.json(rows);
});
