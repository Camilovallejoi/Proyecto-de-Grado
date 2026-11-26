import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, exigirRol } from '../auth.js';
import { notificarPersonal, notificarUsuarios, resolverAvisos } from '../push.js';

export const pqrsRouter = Router();
pqrsRouter.use(autenticar);

/** Máximo de PQRS sin cerrar por residente. */
export const MAX_PQRS_ABIERTAS = 10;

const crearSchema = z.object({
  tipo: z.enum(['peticion', 'queja', 'reclamo', 'sugerencia']),
  asunto: z.string().trim().min(3, 'El asunto es muy corto').max(150),
  descripcion: z.string().trim().min(5, 'Describe tu solicitud').max(2000),
});
const responderSchema = z
  .object({ estado: z.enum(['en_proceso', 'cerrada']), respuesta: z.string().trim().max(2000).optional() })
  .refine((d) => d.estado !== 'cerrada' || !!d.respuesta, { message: 'Para cerrar una PQRS escribe la respuesta', path: ['respuesta'] });

const SELECT = `
  SELECT p.id, p.tipo, p.asunto, p.descripcion, p.estado, p.respuesta, p.respondido_en, p.creado_en,
         u.nombre AS usuario, ur.identificador AS unidad, adm.nombre AS respondido_por
    FROM pqrs p
    JOIN usuario u ON u.id = p.usuario_id
    LEFT JOIN unidad_residencial ur ON ur.id = u.unidad_id
    LEFT JOIN usuario adm ON adm.id = p.respondido_por`;

pqrsRouter.post('/', exigirRol('residente'), async (req, res) => {
  const user = req.user!;
  const d = crearSchema.parse(req.body ?? {});
  const n = await pool.query(`SELECT count(*)::int AS n FROM pqrs WHERE usuario_id = $1 AND estado NOT IN ('cerrada','cancelada')`, [user.id]);
  if (n.rows[0].n >= MAX_PQRS_ABIERTAS) throw new HttpError(409, `Ya tienes ${MAX_PQRS_ABIERTAS} solicitudes sin cerrar`);
  const { rows } = await pool.query(
    'INSERT INTO pqrs (copropiedad_id, usuario_id, tipo, asunto, descripcion) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [user.copropiedadId, user.id, d.tipo, d.asunto, d.descripcion],
  );
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'crear_pqrs', entidad: 'pqrs', entidadId: rows[0].id, detalle: { tipo: d.tipo } });
  await notificarPersonal(user.copropiedadId, ['administrador'], { titulo: 'Nueva solicitud (PQRS)', cuerpo: `${user.nombre}: ${d.asunto}`, datos: { tipo: 'pqrs', pqrs_id: String(rows[0].id) } });
  res.status(201).json((await pool.query(`${SELECT} WHERE p.id = $1`, [rows[0].id])).rows[0]);
});

pqrsRouter.get('/mias', async (req, res) => {
  const { rows } = await pool.query(`${SELECT} WHERE p.usuario_id = $1 ORDER BY p.creado_en DESC LIMIT 50`, [req.user!.id]);
  res.json(rows);
});

// La administración ve todas las solicitudes del conjunto: sin resolver primero.
pqrsRouter.get('/', exigirRol('administrador'), async (req, res) => {
  const { rows } = await pool.query(
    `${SELECT} WHERE p.copropiedad_id = $1 ORDER BY (p.estado IN ('cerrada','cancelada')), p.creado_en DESC LIMIT 100`,
    [req.user!.copropiedadId],
  );
  res.json(rows);
});

pqrsRouter.put('/:id', exigirRol('administrador'), async (req, res) => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const d = responderSchema.parse(req.body ?? {});
  const { rows } = await pool.query(
    `UPDATE pqrs SET estado = $3, respuesta = COALESCE($4, respuesta), respondido_por = $5, respondido_en = now(), actualizado_en = now()
      WHERE id = $1 AND copropiedad_id = $2 AND estado NOT IN ('cerrada','cancelada') RETURNING usuario_id, asunto`,
    [id, user.copropiedadId, d.estado, d.respuesta ?? null, user.id],
  );
  if (!rows[0]) {
    const e = await pool.query('SELECT estado FROM pqrs WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!e.rows[0]) throw new HttpError(404, 'Solicitud no encontrada');
    throw new HttpError(409, 'La solicitud ya fue cerrada');
  }
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'responder_pqrs', entidad: 'pqrs', entidadId: id, detalle: { estado: d.estado } });
  await resolverAvisos('pqrs', id);
  await notificarUsuarios([rows[0].usuario_id], {
    titulo: d.estado === 'cerrada' ? 'Tu solicitud fue resuelta' : 'Tu solicitud está en proceso',
    cuerpo: rows[0].asunto,
    datos: { tipo: 'pqrs', pqrs_id: String(id) },
  });
  res.json((await pool.query(`${SELECT} WHERE p.id = $1`, [id])).rows[0]);
});
