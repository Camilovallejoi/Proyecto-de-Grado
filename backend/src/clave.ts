import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type pg from 'pg';

/** Horas que sirve una contraseña temporal entregada al restablecer la cuenta. */
export const VIGENCIA_TEMPORAL_HORAS = 24;

// Sin caracteres que se confunden al dictarlos o copiarlos a mano (0/O, 1/l/I).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Contraseña temporal aleatoria de 10 caracteres. */
export const claveTemporal = () => Array.from({ length: 10 }, () => ALFABETO[crypto.randomInt(ALFABETO.length)]).join('');

/**
 * Asigna una contraseña temporal: obliga a cambiarla, la hace vencer, cierra las sesiones abiertas
 * y desconecta los teléfonos de las notificaciones. Devuelve la contraseña en claro una sola vez
 * (en la base solo queda cifrada).
 */
export async function restablecerClave(db: pg.Pool | pg.PoolClient | pg.Client, usuarioId: number) {
  const password = claveTemporal();
  const { rows } = await db.query(
    `UPDATE usuario SET password_hash = $2, cambio_clave_pendiente = true,
            clave_temporal_vence = now() + make_interval(hours => $3::int), version_sesion = version_sesion + 1
      WHERE id = $1 RETURNING clave_temporal_vence`,
    [usuarioId, await bcrypt.hash(password, 10), VIGENCIA_TEMPORAL_HORAS],
  );
  await db.query('DELETE FROM dispositivo_push WHERE usuario_id = $1', [usuarioId]);
  return { password, vence: rows[0].clave_temporal_vence as Date };
}
