import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, exigirRol } from '../auth.js';
import { restablecerClave } from '../clave.js';
import { notificarUsuarios } from '../push.js';

export const usuariosRouter = Router();
usuariosRouter.use(autenticar, exigirRol('administrador'));

const vigilanteSchema = z.object({
  nombre: z.string().trim().min(3, 'El nombre es muy corto').max(120),
  correo: z.string().trim().toLowerCase().email('Correo inválido').max(160),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
});

// Usuarios del conjunto con su rol y unidad.
usuariosRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.estado, r.nombre AS rol, ur.identificador AS unidad, u.creado_en,
            CASE WHEN u.telefono_autorizado_en IS NOT NULL THEN u.telefono END AS telefono
       FROM usuario u JOIN rol r ON r.id = u.rol_id LEFT JOIN unidad_residencial ur ON ur.id = u.unidad_id
      WHERE u.copropiedad_id = $1
      ORDER BY (r.nombre = 'administrador') DESC, (r.nombre = 'vigilante') DESC, u.nombre`,
    [req.user!.copropiedadId],
  );
  res.json(rows);
});

const residenteSchema = vigilanteSchema.extend({ unidad_id: z.coerce.number().int().positive('Elige la unidad del residente') });

// La administración agrega a un residente en una unidad (apartamento, casa…), sin necesidad de invitación.
// La contraseña es temporal. El teléfono no se pide aquí: solo el residente puede autorizar su uso (Ley 1581).
usuariosRouter.post('/residentes', async (req, res) => {
  const user = req.user!;
  const d = residenteSchema.parse(req.body ?? {});
  const unidad = await pool.query('SELECT identificador FROM unidad_residencial WHERE id = $1 AND copropiedad_id = $2', [d.unidad_id, user.copropiedadId]);
  if (!unidad.rowCount) throw new HttpError(404, 'Unidad no encontrada');
  try {
    const { rows } = await pool.query(
      `INSERT INTO usuario (copropiedad_id, unidad_id, rol_id, nombre, correo, password_hash, cambio_clave_pendiente)
       VALUES ($1, $2, (SELECT id FROM rol WHERE nombre = 'residente'), $3, $4, $5, true) RETURNING id, nombre, correo, estado`,
      [user.copropiedadId, d.unidad_id, d.nombre, d.correo, await bcrypt.hash(d.password, 10)],
    );
    await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'crear_residente', entidad: 'usuario', entidadId: rows[0].id, detalle: { correo: d.correo, unidad: unidad.rows[0].identificador } });
    res.status(201).json({ ...rows[0], rol: 'residente', unidad: unidad.rows[0].identificador });
  } catch (e: any) {
    if (e.code === '23505') throw new HttpError(409, 'Ya existe un usuario con ese correo');
    throw e;
  }
});

// La administración da de alta al vigilante (celador) del conjunto.
usuariosRouter.post('/vigilantes', async (req, res) => {
  const user = req.user!;
  const d = vigilanteSchema.parse(req.body ?? {});
  try {
    const { rows } = await pool.query(
      `INSERT INTO usuario (copropiedad_id, rol_id, nombre, correo, password_hash, cambio_clave_pendiente)
       VALUES ($1, (SELECT id FROM rol WHERE nombre = 'vigilante'), $2, $3, $4, true) RETURNING id, nombre, correo, estado`,
      [user.copropiedadId, d.nombre, d.correo, await bcrypt.hash(d.password, 10)],
    );
    await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'crear_vigilante', entidad: 'usuario', entidadId: rows[0].id, detalle: { correo: d.correo } });
    res.status(201).json({ ...rows[0], rol: 'vigilante', unidad: null });
  } catch (e: any) {
    if (e.code === '23505') throw new HttpError(409, 'Ya existe un usuario con ese correo');
    throw e;
  }
});

// Activa o desactiva a un residente o vigilante (un usuario inactivo no puede iniciar sesión).
usuariosRouter.put('/:id/estado', async (req, res) => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const { estado } = z.object({ estado: z.enum(['activo', 'inactivo']) }).parse(req.body ?? {});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE usuario SET estado = $3
        WHERE id = $1 AND copropiedad_id = $2 AND rol_id IN (SELECT id FROM rol WHERE nombre IN ('residente','vigilante'))
        RETURNING id, nombre, estado`,
      [id, user.copropiedadId, estado],
    );
    if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado (solo se gestionan residentes y vigilantes)');

    // Quien queda inactivo no puede seguir abriendo puertas: se anulan sus accesos y reservas vigentes.
    const anulado = { visitas: 0, avisos_porton: 0, reservas: 0 };
    if (estado === 'inactivo') {
      anulado.visitas = (await client.query(`UPDATE visita SET estado = 'cancelada' WHERE residente_id = $1 AND estado IN ('autorizada','solicitada')`, [id])).rowCount ?? 0;
      anulado.avisos_porton = (await client.query(`UPDATE aviso_porton SET estado = 'cancelado' WHERE usuario_id = $1 AND estado = 'pendiente'`, [id])).rowCount ?? 0;
      anulado.reservas = (await client.query(`UPDATE reserva SET estado = 'cancelada', cancelado_en = now() WHERE usuario_id = $1 AND estado = 'confirmada' AND inicio > now()`, [id])).rowCount ?? 0;
      await client.query('DELETE FROM dispositivo_push WHERE usuario_id = $1', [id]);
    }
    await auditar(client, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'cambiar_estado_usuario', entidad: 'usuario', entidadId: id, detalle: { estado, ...anulado } });
    await client.query('COMMIT');
    res.json({ ...rows[0], anulado });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// Restablece la contraseña de un residente o vigilante que la olvidó. La administración debe haber confirmado
// su identidad. Devuelve la contraseña temporal una sola vez; la anterior nunca se puede leer.
usuariosRouter.post('/:id/restablecer-clave', async (req, res) => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const client = await pool.connect();
  let resultado: { password: string; vence: Date; nombre: string; correo: string };
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT u.nombre, u.correo, u.estado FROM usuario u JOIN rol r ON r.id = u.rol_id
        WHERE u.id = $1 AND u.copropiedad_id = $2 AND r.nombre IN ('residente','vigilante') FOR UPDATE OF u`,
      [id, user.copropiedadId],
    );
    if (!rows[0]) throw new HttpError(404, 'Usuario no encontrado (solo se restablecen residentes y vigilantes)');
    if (rows[0].estado !== 'activo') throw new HttpError(409, 'La cuenta está desactivada: actívala antes de restablecer la contraseña');
    resultado = { ...(await restablecerClave(client, id)), nombre: rows[0].nombre, correo: rows[0].correo };
    // En la auditoría queda quién restableció la cuenta y cuándo; nunca la contraseña.
    await auditar(client, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'restablecer_clave', entidad: 'usuario', entidadId: id });
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await notificarUsuarios([id], {
    titulo: 'Tu contraseña fue restablecida',
    cuerpo: 'La administración restableció tu contraseña. Si no lo pediste, avísale de inmediato.',
    datos: { tipo: 'cuenta', usuario_id: String(id) },
  });
  res.set('Cache-Control', 'no-store').json(resultado);
});
