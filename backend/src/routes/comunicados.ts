import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, exigirRol } from '../auth.js';
import { notificarPersonal } from '../push.js';

export const comunicadosRouter = Router();
comunicadosRouter.use(autenticar);

const schema = z.object({
  titulo: z.string().trim().min(3, 'El título es muy corto').max(150),
  cuerpo: z.string().trim().min(3, 'Escribe el contenido').max(2000),
  importante: z.boolean().default(false),
});

// Tabla comunicacion del esquema inicial: contenido y publicado_en se exponen como cuerpo y creado_en.
const SELECT = `SELECT c.id, c.titulo, c.contenido AS cuerpo, c.importante, c.publicado_en AS creado_en, u.nombre AS autor
                  FROM comunicacion c LEFT JOIN usuario u ON u.id = c.autor_id`;

// Todos los usuarios del conjunto leen los comunicados.
comunicadosRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(`${SELECT} WHERE c.copropiedad_id = $1 ORDER BY c.publicado_en DESC LIMIT 50`, [req.user!.copropiedadId]);
  res.json(rows);
});

// La administración publica y retira comunicados.
comunicadosRouter.post('/', exigirRol('administrador'), async (req, res) => {
  const user = req.user!;
  const d = schema.parse(req.body ?? {});
  const { rows } = await pool.query(
    'INSERT INTO comunicacion (copropiedad_id, autor_id, titulo, contenido, importante) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [user.copropiedadId, user.id, d.titulo, d.cuerpo, d.importante],
  );
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'publicar_comunicado', entidad: 'comunicacion', entidadId: rows[0].id, detalle: { titulo: d.titulo } });
  await notificarPersonal(user.copropiedadId, ['residente', 'vigilante'], {
    titulo: d.importante ? `Importante: ${d.titulo}` : d.titulo,
    cuerpo: d.cuerpo.length > 100 ? d.cuerpo.slice(0, 97) + '…' : d.cuerpo,
    datos: { tipo: 'comunicado', comunicado_id: String(rows[0].id) },
  });
  res.status(201).json((await pool.query(`${SELECT} WHERE c.id = $1`, [rows[0].id])).rows[0]);
});

comunicadosRouter.delete('/:id', exigirRol('administrador'), async (req, res) => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const r = await pool.query('DELETE FROM comunicacion WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
  if (!r.rowCount) throw new HttpError(404, 'Comunicado no encontrado');
  // Un comunicado retirado desaparece también de las bandejas.
  await pool.query(`DELETE FROM notificacion WHERE tipo = 'comunicado' AND referencia_id = $1`, [id]);
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'eliminar_comunicado', entidad: 'comunicacion', entidadId: id });
  res.status(204).end();
});
