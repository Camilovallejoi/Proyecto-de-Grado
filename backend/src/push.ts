import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from './config.js';
import { pool } from './db.js';

/**
 * Centro de notificaciones. Cada aviso hace dos cosas:
 *  1. Se guarda en la bandeja del usuario (tabla notificacion). La app la consulta cada pocos segundos,
 *     así que llega aunque el teléfono pierda la notificación o Firebase no esté configurado.
 *  2. Se envía como notificación push (Firebase Cloud Messaging) a sus teléfonos.
 * Sin cuenta de servicio configurada (FIREBASE_SERVICE_ACCOUNT) solo funciona la bandeja.
 */

export type Mensaje = {
  titulo: string;
  cuerpo: string;
  /** `tipo` decide a qué pantalla lleva el aviso; el primer campo terminado en `_id` es el asunto al que se refiere. */
  datos: { tipo: string } & Record<string, string>;
};

/** Minutos de utilidad de los avisos urgentes: si el teléfono estaba apagado, ya no se entregan tarde. */
const VIDA_UTIL_MIN: Record<string, number> = { aviso_porton: 30, visita_solicitud: 10, visita_respuesta: 30, paquete_en_camino: 30 };

/** Canal de Android de prioridad alta (lo crea MainActivity en la app). */
const CANAL_ANDROID = 'cantaluna_avisos';

function referenciaDe(datos: Mensaje['datos']): number | null {
  const clave = Object.keys(datos).find((k) => k.endsWith('_id'));
  const n = clave ? Number(datos[clave]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Envía un aviso a todos los usuarios activos de un conjunto que tengan alguno de los roles dados. */
export async function notificarPersonal(copropiedadId: number, roles: string[], msg: Mensaje) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id FROM usuario u JOIN rol r ON r.id = u.rol_id
        WHERE u.copropiedad_id = $1 AND u.estado = 'activo' AND r.nombre = ANY($2)`,
      [copropiedadId, roles],
    );
    await notificarUsuarios(rows.map((r) => r.id), msg);
  } catch (e) {
    console.warn('No se pudo notificar al personal:', (e as Error).message);
  }
}

/**
 * Envía un aviso a usuarios concretos. Devuelve cuando ya quedó en la bandeja; el push sale en segundo plano.
 * Nunca lanza errores: una notificación fallida no debe afectar la acción que la originó.
 */
export async function notificarUsuarios(usuarioIds: number[], msg: Mensaje) {
  if (!usuarioIds.length) return;
  const tipo = msg.datos.tipo;
  const referencia = referenciaDe(msg.datos);
  try {
    // Un aviso nuevo sobre el mismo asunto reemplaza al anterior que seguía sin leer (no se acumulan repetidos).
    if (referencia !== null) {
      await pool.query('DELETE FROM notificacion WHERE usuario_id = ANY($1) AND tipo = $2 AND referencia_id = $3 AND NOT leida', [usuarioIds, tipo, referencia]);
    }
    await pool.query(
      `INSERT INTO notificacion (usuario_id, tipo, titulo, mensaje, referencia_id)
       SELECT id, $2, $3, $4, $5 FROM usuario WHERE id = ANY($1) AND estado = 'activo'`,
      [usuarioIds, tipo, msg.titulo.slice(0, 150), msg.cuerpo, referencia],
    );
  } catch (e) {
    console.warn('No se pudo guardar la notificación:', (e as Error).message);
  }
  void enviarPush(usuarioIds, msg, referencia);
}

/** Marca como resueltos los avisos de un asunto que ya no requiere atención (por ejemplo, una solicitud respondida). */
export async function resolverAvisos(tipo: string, referencia: number, usuarioId?: number) {
  try {
    await pool.query(
      `UPDATE notificacion SET leida = true
        WHERE tipo = $1 AND referencia_id = $2 AND NOT leida AND ($3::int IS NULL OR usuario_id = $3)`,
      [tipo, referencia, usuarioId ?? null],
    );
  } catch (e) {
    console.warn('No se pudieron resolver notificaciones:', (e as Error).message);
  }
}

// ---------------------------------------------------------------- Firebase Cloud Messaging
let listo: boolean | null = null;

function iniciar(): boolean {
  if (listo !== null) return listo;
  listo = false;
  const ruta = config.FIREBASE_SERVICE_ACCOUNT;
  if (!ruta) return listo;
  try {
    const archivo = path.resolve(ruta);
    if (!fs.existsSync(archivo)) {
      console.warn(`Push desactivado: no existe ${archivo}`);
      return listo;
    }
    const credenciales = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (!getApps().length) initializeApp({ credential: cert(credenciales) });
    listo = true;
  } catch (e) {
    console.warn('Push desactivado: no se pudo leer la cuenta de servicio de Firebase.', (e as Error).message);
  }
  return listo;
}

export const pushActivo = () => iniciar();

async function enviarPush(usuarioIds: number[], msg: Mensaje, referencia: number | null) {
  if (!iniciar()) return;
  try {
    const { rows } = await pool.query(
      `SELECT d.token FROM dispositivo_push d JOIN usuario u ON u.id = d.usuario_id
        WHERE d.usuario_id = ANY($1) AND u.estado = 'activo'`,
      [usuarioIds],
    );
    const tokens: string[] = rows.map((r) => r.token);
    if (!tokens.length) return;
    const tipo = msg.datos.tipo;
    const vida = VIDA_UTIL_MIN[tipo];
    // FCM admite como máximo 500 teléfonos por envío.
    for (let i = 0; i < tokens.length; i += 500) {
      const lote = tokens.slice(i, i + 500);
      const r = await getMessaging().sendEachForMulticast({
        tokens: lote,
        notification: { title: msg.titulo, body: msg.cuerpo },
        data: msg.datos,
        android: {
          priority: 'high',
          ...(vida ? { ttl: vida * 60 * 1000 } : {}),
          // "tag": en la barra del teléfono, el aviso nuevo del mismo asunto reemplaza al anterior.
          notification: { channelId: CANAL_ANDROID, ...(referencia !== null ? { tag: `${tipo}-${referencia}` } : {}) },
        },
      });
      // Elimina los tokens que Firebase ya no reconoce (app desinstalada, token vencido).
      const muertos = lote.filter((_, j) => {
        const code = r.responses[j].error?.code;
        return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
      });
      if (muertos.length) await pool.query('DELETE FROM dispositivo_push WHERE token = ANY($1)', [muertos]);
    }
  } catch (e) {
    console.warn('No se pudo enviar la notificación push:', (e as Error).message);
  }
}
