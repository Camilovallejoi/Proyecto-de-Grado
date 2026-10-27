import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError } from './errors.js';

export type Rol = 'administrador' | 'residente';
export type UsuarioAuth = { id: number; copropiedadId: number; unidadId: number | null; rol: Rol; nombre: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UsuarioAuth;
    }
  }
}

export function firmarToken(userId: number) {
  return jwt.sign({ sub: String(userId) }, config.JWT_SECRET, { expiresIn: '12h' });
}

export async function autenticar(req: Request, _res: Response, next: NextFunction) {
  const cabecera = req.headers.authorization ?? '';
  if (!cabecera.startsWith('Bearer ')) throw new HttpError(401, 'Falta el token de acceso');
  let id: number;
  try {
    const payload = jwt.verify(cabecera.slice(7), config.JWT_SECRET) as jwt.JwtPayload;
    id = Number(payload.sub);
  } catch {
    throw new HttpError(401, 'Token inválido o vencido');
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.copropiedad_id, u.unidad_id, u.nombre, u.estado, r.nombre AS rol
       FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.id = $1`,
    [id],
  );
  const u = rows[0];
  if (!u || u.estado !== 'activo') throw new HttpError(401, 'Usuario no válido');
  req.user = { id: u.id, copropiedadId: u.copropiedad_id, unidadId: u.unidad_id, rol: u.rol, nombre: u.nombre };
  next();
}

export function exigirRol(rol: Rol) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.rol !== rol) throw new HttpError(403, 'No tienes permiso para esta acción');
    next();
  };
}
