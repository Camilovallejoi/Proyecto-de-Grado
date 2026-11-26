import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, firmarToken } from '../auth.js';
import { telefonoSchema } from '../telefono.js';

export const authRouter = Router();

const loginSchema = z.object({ correo: z.string().email(), password: z.string().min(1) });
const registroSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  correo: z.string().trim().email().max(160),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
  telefono: z.union([z.literal('').transform(() => undefined), telefonoSchema]).optional(),
  autoriza_telefono: z.boolean().optional(),
  codigo: z.string().trim().min(4).max(20),
}).refine((d) => !d.telefono || d.autoriza_telefono === true, {
  message: 'Para guardar tu teléfono debes autorizar su uso por portería y la administración',
  path: ['autoriza_telefono'],
});

authRouter.post('/login', async (req, res) => {
  const { correo, password } = loginSchema.parse(req.body);
  const { rows } = await pool.query(
    `SELECT u.id, u.password_hash, u.estado, u.version_sesion,
            (u.cambio_clave_pendiente AND u.clave_temporal_vence IS NOT NULL AND u.clave_temporal_vence < now()) AS temporal_vencida
       FROM usuario u WHERE lower(u.correo) = lower($1)`,
    [correo],
  );
  const u = rows[0];
  // mismo mensaje para correo inexistente y contraseña incorrecta
  if (!u || u.estado !== 'activo' || !(await bcrypt.compare(password, u.password_hash))) {
    throw new HttpError(401, 'Correo o contraseña incorrectos');
  }
  // Solo se informa el vencimiento a quien escribió bien la contraseña temporal.
  if (u.temporal_vencida) throw new HttpError(401, 'La contraseña temporal venció. Pide a la administración que la restablezca.');
  res.json({ token: firmarToken(u.id, u.version_sesion) });
});

// El residente se registra con el código de invitación que genera el administrador para su unidad.
authRouter.post('/registro', async (req, res) => {
  const datos = registroSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, copropiedad_id, unidad_id FROM codigo_invitacion
        WHERE codigo = $1 AND usado_en IS NULL AND expira_en > now() FOR UPDATE`,
      [datos.codigo.toUpperCase()],
    );
    const inv = rows[0];
    if (!inv) throw new HttpError(400, 'Código de invitación inválido, usado o vencido');

    const dup = await client.query('SELECT 1 FROM usuario WHERE lower(correo) = lower($1)', [datos.correo]);
    if (dup.rowCount) throw new HttpError(409, 'Ya existe una cuenta con ese correo');

    const hash = await bcrypt.hash(datos.password, 10);
    const nuevo = await client.query(
      `INSERT INTO usuario (copropiedad_id, unidad_id, rol_id, nombre, correo, telefono, telefono_autorizado_en, password_hash)
       VALUES ($1,$2,(SELECT id FROM rol WHERE nombre='residente'),$3,$4,$5::text, CASE WHEN $5::text IS NOT NULL THEN now() END, $6) RETURNING id`,
      [inv.copropiedad_id, inv.unidad_id, datos.nombre, datos.correo, datos.telefono ?? null, hash],
    );
    await client.query('UPDATE codigo_invitacion SET usado_por = $1, usado_en = now() WHERE id = $2', [nuevo.rows[0].id, inv.id]);
    await client.query('COMMIT');
    res.status(201).json({ token: firmarToken(nuevo.rows[0].id) });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

authRouter.get('/me', autenticar, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.correo, r.nombre AS rol, c.nombre AS copropiedad, ur.identificador AS unidad,
            CASE WHEN u.telefono_autorizado_en IS NOT NULL THEN u.telefono END AS telefono, c.telefono_porteria,
            u.cambio_clave_pendiente
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN copropiedad c ON c.id = u.copropiedad_id
       LEFT JOIN unidad_residencial ur ON ur.id = u.unidad_id
      WHERE u.id = $1`,
    [req.user!.id],
  );
  res.json(rows[0]);
});

// El residente registra, cambia o quita (texto vacío) su teléfono. Guardarlo exige su autorización; quitarlo no.
authRouter.put('/me/telefono', autenticar, async (req, res) => {
  const d = z
    .object({ telefono: z.union([z.literal('').transform(() => null), telefonoSchema]), autoriza: z.boolean().optional() })
    .refine((v) => v.telefono === null || v.autoriza === true, { message: 'Debes autorizar el uso de tu teléfono', path: ['autoriza'] })
    .parse(req.body ?? {});
  if (req.user!.rol !== 'residente') throw new HttpError(403, 'Solo los residentes registran su teléfono: portería usa el número del conjunto');
  await pool.query(
    'UPDATE usuario SET telefono = $2::text, telefono_autorizado_en = CASE WHEN $2::text IS NOT NULL THEN now() END WHERE id = $1',
    [req.user!.id, d.telefono],
  );
  res.json({ telefono: d.telefono });
});

// Cambiar la propia contraseña (obligatorio cuando la administración asignó una temporal).
// Una contraseña actual incorrecta responde 400 y no 401, para que la app no cierre la sesión.
authRouter.put('/me/password', autenticar, async (req, res) => {
  const d = z
    .object({ actual: z.string().min(1, 'Escribe tu contraseña actual'), nueva: z.string().min(8, 'La contraseña nueva debe tener al menos 8 caracteres').max(100) })
    .parse(req.body ?? {});
  const { rows } = await pool.query('SELECT password_hash FROM usuario WHERE id = $1', [req.user!.id]);
  if (!(await bcrypt.compare(d.actual, rows[0].password_hash))) throw new HttpError(400, 'La contraseña actual no es correcta');
  if (d.actual === d.nueva) throw new HttpError(400, 'La contraseña nueva debe ser distinta de la actual');
  // Las demás sesiones de la cuenta se cierran; quien la cambió recibe un pase nuevo para seguir.
  const nuevo = await pool.query(
    `UPDATE usuario SET password_hash = $2, cambio_clave_pendiente = false, clave_temporal_vence = NULL, version_sesion = version_sesion + 1
      WHERE id = $1 RETURNING version_sesion`,
    [req.user!.id, await bcrypt.hash(d.nueva, 10)],
  );
  res.json({ token: firmarToken(req.user!.id, nuevo.rows[0].version_sesion) });
});
