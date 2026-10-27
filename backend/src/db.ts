import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export async function auditar(
  client: pg.Pool | pg.PoolClient,
  datos: { copropiedadId: number; usuarioId: number; accion: string; entidad: string; entidadId?: number; detalle?: unknown },
) {
  await client.query(
    `INSERT INTO registro_auditoria (copropiedad_id, usuario_id, accion, entidad, entidad_id, detalle)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [datos.copropiedadId, datos.usuarioId, datos.accion, datos.entidad, datos.entidadId ?? null, datos.detalle ? JSON.stringify(datos.detalle) : null],
  );
}
