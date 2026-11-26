import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, esPersonal, exigirRol } from '../auth.js';
import { notificarPersonal, notificarUsuarios, resolverAvisos } from '../push.js';

export const incidenciasRouter = Router();
incidenciasRouter.use(autenticar);

/** Máximo de incidencias sin cerrar por usuario. */
export const MAX_INCIDENCIAS_ABIERTAS = 10;

const crearSchema = z.object({
  zona_id: z.coerce.number().int().positive().optional().or(z.null().transform(() => undefined)),
  descripcion: z.string().trim().min(5, 'Describe el problema').max(1000),
  gravedad: z.enum(['baja', 'media', 'alta']).default('media'),
});
const gestionarSchema = z
  .object({ estado: z.enum(['en_revision', 'en_proceso', 'cerrada']), respuesta: z.string().trim().max(2000).optional() })
  .refine((d) => d.estado !== 'cerrada' || !!d.respuesta, { message: 'Para cerrar una incidencia escribe qué se hizo', path: ['respuesta'] });

const SELECT = `
  SELECT i.id, i.descripcion, i.gravedad, i.estado, i.respuesta, i.creado_en, i.atendido_en,
         u.nombre AS reportado_por, z.nombre AS zona, adm.nombre AS atendido_por
    FROM incidencia i
    JOIN usuario u ON u.id = i.usuario_id
    LEFT JOIN zona_comun z ON z.id = i.zona_id
    LEFT JOIN usuario adm ON adm.id = i.atendido_por`;

// Los residentes y el vigilante reportan daños o problemas, opcionalmente en una zona común.
incidenciasRouter.post('/', exigirRol('residente', 'vigilante'), async (req, res) => {
  const user = req.user!;
  const d = crearSchema.parse(req.body ?? {});
  if (d.zona_id) {
    const z = await pool.query('SELECT 1 FROM zona_comun WHERE id = $1 AND copropiedad_id = $2 AND eliminada_en IS NULL', [d.zona_id, user.copropiedadId]);
    if (!z.rowCount) throw new HttpError(404, 'Zona no encontrada');
  }
  const n = await pool.query(`SELECT count(*)::int AS n FROM incidencia WHERE usuario_id = $1 AND estado NOT IN ('cerrada','cancelada')`, [user.id]);
  if (n.rows[0].n >= MAX_INCIDENCIAS_ABIERTAS) throw new HttpError(409, `Ya tienes ${MAX_INCIDENCIAS_ABIERTAS} incidencias sin cerrar`);
  const { rows } = await pool.query(
    'INSERT INTO incidencia (copropiedad_id, usuario_id, zona_id, descripcion, gravedad) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [user.copropiedadId, user.id, d.zona_id ?? null, d.descripcion, d.gravedad],
  );
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'crear_incidencia', entidad: 'incidencia', entidadId: rows[0].id, detalle: { gravedad: d.gravedad } });
  await notificarPersonal(user.copropiedadId, ['administrador'], {
    titulo: d.gravedad === 'alta' ? 'Incidencia de gravedad alta' : 'Nueva incidencia',
    cuerpo: d.descripcion.length > 100 ? d.descripcion.slice(0, 97) + '…' : d.descripcion,
    datos: { tipo: 'incidencia', incidencia_id: String(rows[0].id) },
  });
  res.status(201).json((await pool.query(`${SELECT} WHERE i.id = $1`, [rows[0].id])).rows[0]);
});

incidenciasRouter.get('/mias', async (req, res) => {
  const { rows } = await pool.query(`${SELECT} WHERE i.usuario_id = $1 ORDER BY i.creado_en DESC LIMIT 50`, [req.user!.id]);
  res.json(rows);
});

// Administración y vigilante ven todas las del conjunto: sin cerrar primero.
incidenciasRouter.get('/', async (req, res) => {
  const user = req.user!;
  if (!esPersonal(user)) throw new HttpError(403, 'No tienes permiso para esta acción');
  const { rows } = await pool.query(
    `${SELECT} WHERE i.copropiedad_id = $1
      ORDER BY (i.estado IN ('cerrada','cancelada')), (i.gravedad = 'alta') DESC, i.creado_en DESC LIMIT 100`,
    [user.copropiedadId],
  );
  res.json(rows);
});

// La administración les hace seguimiento y las cierra con una nota de lo que se hizo.
incidenciasRouter.put('/:id', exigirRol('administrador'), async (req, res) => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const d = gestionarSchema.parse(req.body ?? {});
  const { rows } = await pool.query(
    `UPDATE incidencia SET estado = $3, respuesta = COALESCE($4, respuesta), atendido_por = $5, atendido_en = now(), actualizado_en = now()
      WHERE id = $1 AND copropiedad_id = $2 AND estado NOT IN ('cerrada','cancelada') RETURNING usuario_id`,
    [id, user.copropiedadId, d.estado, d.respuesta ?? null, user.id],
  );
  if (!rows[0]) {
    const e = await pool.query('SELECT estado FROM incidencia WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!e.rows[0]) throw new HttpError(404, 'Incidencia no encontrada');
    throw new HttpError(409, 'La incidencia ya fue cerrada');
  }
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'gestionar_incidencia', entidad: 'incidencia', entidadId: id, detalle: { estado: d.estado } });
  await resolverAvisos('incidencia', id);
  await notificarUsuarios([rows[0].usuario_id], {
    titulo: d.estado === 'cerrada' ? 'Tu incidencia fue resuelta' : 'Tu incidencia está siendo atendida',
    cuerpo: d.respuesta ?? 'La administración la está revisando.',
    datos: { tipo: 'incidencia', incidencia_id: String(id) },
  });
  res.json((await pool.query(`${SELECT} WHERE i.id = $1`, [id])).rows[0]);
});
