import { config } from './config.js';
import { pool } from './db.js';
import { notificarUsuarios } from './push.js';
import { vencerAvisos } from './routes/porton.js';
import { vencerVisitas } from './routes/visitas.js';

/*
 * Mantenimiento automático en dos ritmos:
 *  - En tiempo real (cada 20 segundos): vence solicitudes y avisos sin atender, avisa a los afectados y
 *    envía los recordatorios de reserva. Son actualizaciones pequeñas apoyadas en índices.
 *  - Borrado (cada 10 minutos): elimina lo terminado, vencido o que cumplió su tiempo de conservación.
 */

/** Minutos antes del inicio en que se recuerda una reserva. */
export const RECORDATORIO_MIN = 60;

/** Días de conservación. El criterio es guardar cada dato solo el tiempo en que sirve (minimización, Ley 1581). */
export const RETENCION = {
  visitasConIngreso: 90, // registro de ingresos
  visitasSinIngreso: 7, // autorizaciones canceladas, vencidas, rechazadas o sin respuesta: nadie entró
  chat: 30,
  paquetesEntregados: 30,
  minuta: 90,
  notificacionesLeidas: 7,
  notificaciones: 30,
  telefonosSinRenovar: 60, // registros de notificaciones de teléfonos abandonados
  invitacionesSinUsar: 7, // después de vencer
  invitacionesUsadas: 90,
  auditoria: 365,
};

const borrar = async (sql: string, dias: number) => (await pool.query(sql, [dias])).rowCount ?? 0;

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

/** Borra los avisos de portón con más de 24 horas (después de vencer los pendientes antiguos). */
export async function purgarAvisos(): Promise<number> {
  await vencerAvisos();
  const r = await pool.query(`DELETE FROM aviso_porton WHERE estado <> 'pendiente' AND creado_en < now() - interval '24 hours'`);
  return r.rowCount ?? 0;
}

/** Vence las autorizaciones sin usar y borra visitas, mensajes, paquetes entregados y minutas antiguos. */
export async function purgarRegistros(): Promise<number> {
  await vencerVisitas();
  let n = 0;
  n += await borrar(
    `DELETE FROM visita WHERE entrada_en IS NULL AND estado IN ('cancelada','vencida','rechazada','sin_respuesta')
        AND creado_en < now() - make_interval(days => $1::int)`,
    RETENCION.visitasSinIngreso,
  );
  n += await borrar('DELETE FROM visita WHERE creado_en < now() - make_interval(days => $1::int)', RETENCION.visitasConIngreso);
  n += await borrar('DELETE FROM mensaje_chat WHERE creado_en < now() - make_interval(days => $1::int)', RETENCION.chat);
  n += await borrar(`DELETE FROM paquete WHERE estado = 'entregado' AND entregado_en < now() - make_interval(days => $1::int)`, RETENCION.paquetesEntregados);
  n += await borrar('DELETE FROM minuta WHERE creado_en < now() - make_interval(days => $1::int)', RETENCION.minuta);
  return n;
}

/** Borra datos de apoyo que ya no sirven: notificaciones, teléfonos abandonados, invitaciones y auditoría antigua. */
export async function purgarTemporales(): Promise<number> {
  let n = 0;
  n += await borrar('DELETE FROM notificacion WHERE leida AND creado_en < now() - make_interval(days => $1::int)', RETENCION.notificacionesLeidas);
  n += await borrar('DELETE FROM notificacion WHERE creado_en < now() - make_interval(days => $1::int)', RETENCION.notificaciones);
  n += await borrar('DELETE FROM dispositivo_push WHERE actualizado_en < now() - make_interval(days => $1::int)', RETENCION.telefonosSinRenovar);
  n += await borrar('DELETE FROM codigo_invitacion WHERE usado_en IS NULL AND expira_en < now() - make_interval(days => $1::int)', RETENCION.invitacionesSinUsar);
  n += await borrar('DELETE FROM codigo_invitacion WHERE usado_en < now() - make_interval(days => $1::int)', RETENCION.invitacionesUsadas);
  n += await borrar('DELETE FROM registro_auditoria WHERE creado_en < now() - make_interval(days => $1::int)', RETENCION.auditoria);
  return n;
}

/** Recuerda las reservas que empiezan pronto (una sola vez; no aplica a las hechas a última hora). */
export async function recordarReservas(): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE reserva r SET recordada_en = now()
       FROM zona_comun z
      WHERE z.id = r.zona_id AND r.estado = 'confirmada' AND r.recordada_en IS NULL
        AND r.inicio > now() AND r.inicio <= now() + make_interval(mins => $1::int)
        AND r.creado_en <= r.inicio - make_interval(mins => $1::int)
      RETURNING r.id, r.usuario_id, r.inicio, z.nombre AS zona, z.estado AS zona_estado`,
    [RECORDATORIO_MIN],
  );
  for (const r of rows) {
    const hora = new Date(r.inicio).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
    await notificarUsuarios([r.usuario_id], {
      titulo: 'Tu reserva empieza pronto',
      cuerpo: `${r.zona} a las ${hora}.${r.zona_estado === 'activa' ? '' : ' La zona figura fuera de servicio: confirma con portería.'}`,
      datos: { tipo: 'reserva', reserva_id: String(r.id) },
    });
  }
  return rows.length;
}

export async function tareasEnTiempoReal() {
  await vencerAvisos();
  await vencerVisitas();
  await recordarReservas();
}

export async function tareasDeBorrado() {
  const reservas = await purgarReservas();
  const avisos = await purgarAvisos();
  const registros = await purgarRegistros();
  const temporales = await purgarTemporales();
  if (reservas + avisos + registros + temporales > 0) {
    console.log(`Limpieza: ${reservas} reserva(s), ${avisos} aviso(s) de portón, ${registros} registro(s) y ${temporales} dato(s) temporales eliminados`);
  }
}

const CADA_SEGUNDOS_TIEMPO_REAL = 20;
const CADA_MINUTOS_BORRADO = 10;

/** Repite una tarea sin que dos ejecuciones se solapen y sin que un error detenga el ciclo. */
function repetir(tarea: () => Promise<unknown>, cadaMs: number, nombre: string) {
  let ocupada = false;
  const ejecutar = async () => {
    if (ocupada) return;
    ocupada = true;
    try {
      await tarea();
    } catch (e) {
      console.error(`Error en ${nombre}:`, (e as Error).message);
    } finally {
      ocupada = false;
    }
  };
  void ejecutar();
  setInterval(() => void ejecutar(), cadaMs).unref();
}

export function iniciarLimpieza() {
  repetir(tareasDeBorrado, CADA_MINUTOS_BORRADO * 60 * 1000, 'la limpieza');
  repetir(tareasEnTiempoReal, CADA_SEGUNDOS_TIEMPO_REAL * 1000, 'las tareas en tiempo real');
}
