import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db.js';
import { HttpError } from './errors.js';

export type Rol = 'administrador' | 'residente' | 'vigilante';
export type UsuarioAuth = { id: number; copropiedadId: number; unidadId: number | null; rol: Rol; nombre: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UsuarioAuth;
    }
  }
}

/** El pase incluye la versión de sesión: al restablecer o cambiar la contraseña, los anteriores dejan de valer. */
export function firmarToken(userId: number, version = 0) {
  return jwt.sign({ sub: String(userId), ver: version }, config.JWT_SECRET, { expiresIn: '12h' });
}

export async function autenticar(req: Request, _res: Response, next: NextFunction) {
  const cabecera = req.headers.authorization ?? '';
  if (!cabecera.startsWith('Bearer ')) throw new HttpError(401, 'Falta el token de acceso');
  let id: number;
  let version: number;
  try {
    const payload = jwt.verify(cabecera.slice(7), config.JWT_SECRET) as jwt.JwtPayload;
    id = Number(payload.sub);
    version = Number(payload.ver ?? 0);
  } catch {
    throw new HttpError(401, 'Token inválido o vencido');
  }
  const { rows } = await pool.query(
    `SELECT u.id, u.copropiedad_id, u.unidad_id, u.nombre, u.estado, u.cambio_clave_pendiente, u.version_sesion, r.nombre AS rol
       FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.id = $1`,
    [id],
  );
  const u = rows[0];
  if (!u || u.estado !== 'activo') throw new HttpError(401, 'Usuario no válido');
  if (u.version_sesion !== version) throw new HttpError(401, 'Tu sesión se cerró porque cambió la contraseña. Inicia sesión de nuevo.');
  // Con una contraseña temporal solo se puede consultar la propia cuenta y cambiarla (rutas /auth).
  if (u.cambio_clave_pendiente && req.baseUrl !== '/auth') throw new HttpError(403, 'Cambia tu contraseña temporal para continuar');
  req.user = { id: u.id, copropiedadId: u.copropiedad_id, unidadId: u.unidad_id, rol: u.rol, nombre: u.nombre };
  next();
}

/** Administración y vigilantes (portería): quienes operan el conjunto. */
export const esPersonal = (u: UsuarioAuth) => u.rol === 'administrador' || u.rol === 'vigilante';

export function exigirRol(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.rol)) throw new HttpError(403, 'No tienes permiso para esta acción');
    next();
  };
}
