import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, firmarToken } from '../auth.js';

export const authRouter = Router();

const loginSchema = z.object({ correo: z.string().email(), password: z.string().min(1) });
const registroSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  correo: z.string().trim().email().max(160),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
  telefono: z.string().trim().max(30).optional(),
  codigo: z.string().trim().min(4).max(20),
});

authRouter.post('/login', async (req, res) => {
  const { correo, password } = loginSchema.parse(req.body);
  const { rows } = await pool.query(
    `SELECT u.id, u.password_hash, u.estado FROM usuario u WHERE lower(u.correo) = lower($1)`,
    [correo],
  );
  const u = rows[0];
  // mismo mensaje para correo inexistente y contraseña incorrecta
  if (!u || u.estado !== 'activo' || !(await bcrypt.compare(password, u.password_hash))) {
    throw new HttpError(401, 'Correo o contraseña incorrectos');
  }
  res.json({ token: firmarToken(u.id) });
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
      `INSERT INTO usuario (copropiedad_id, unidad_id, rol_id, nombre, correo, telefono, password_hash)
       VALUES ($1,$2,(SELECT id FROM rol WHERE nombre='residente'),$3,$4,$5,$6) RETURNING id`,
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
    `SELECT u.id, u.nombre, u.correo, r.nombre AS rol, c.nombre AS copropiedad, ur.identificador AS unidad
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN copropiedad c ON c.id = u.copropiedad_id
       LEFT JOIN unidad_residencial ur ON ur.id = u.unidad_id
      WHERE u.id = $1`,
    [req.user!.id],
  );
  res.json(rows[0]);
});
