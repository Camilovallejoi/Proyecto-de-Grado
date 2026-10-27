import { config } from './config.js';
import { pool } from './db.js';

/**
 * Borra las reservas que ya terminaron y las canceladas que superaron el tiempo de retención.
 * Deja una entrada de auditoría por copropiedad con la cantidad eliminada.
 */
export async function purgarReservas(): Promise<number> {
  const { rows } = await pool.query(
    `WITH borradas AS (
       DELETE FROM reserva
        WHERE fin < now()
           OR (estado = 'cancelada' AND cancelado_en < now() - make_interval(hours => $1::int))
       RETURNING copropiedad_id
     ), auditadas AS (
       INSERT INTO registro_auditoria (copropiedad_id, accion, entidad, detalle)
       SELECT copropiedad_id, 'purgar_reservas', 'reserva', jsonb_build_object('cantidad', count(*))
         FROM borradas GROUP BY copropiedad_id
       RETURNING 1
     )
     SELECT count(*)::int AS n FROM borradas`,
    [Math.floor(config.RETENCION_CANCELADAS_HORAS)],
  );
  return rows[0].n;
}

const CADA_MINUTOS = 10;

export function iniciarLimpieza() {
  const ejecutar = () =>
    purgarReservas()
      .then((n) => { if (n > 0) console.log(`Limpieza: ${n} reserva(s) eliminada(s)`); })
      .catch((e) => console.error('Error en la limpieza de reservas:', e.message));
  void ejecutar();
  setInterval(ejecutar, CADA_MINUTOS * 60 * 1000).unref();
}
