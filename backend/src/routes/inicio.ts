import { Router } from 'express';
import { pool } from '../db.js';
import { autenticar, type UsuarioAuth } from '../auth.js';
import { SELECT_AVISO, vencerAvisos } from './porton.js';
import { SELECT_VISITA, SELECT_VISITA_PORTERIA, vencerVisitas } from './visitas.js';
import { SELECT_PAQUETE } from './paquetes.js';
import { SELECT_RESERVA } from './reservas.js';

/**
 * Pantalla de inicio: en una sola consulta, lo que cada perfil necesita atender ahora.
 * Respeta la misma visibilidad que el resto de la API.
 */
export const inicioRouter = Router();
inicioRouter.use(autenticar);

const filas = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows;
const uno = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows[0] ?? null;
const contar = async (sql: string, params: unknown[]): Promise<number> => (await pool.query(sql, params)).rows[0].n;

async function inicioResidente(u: UsuarioAuth) {
  const [solicitudes, visitasAutorizadas, paquetes, avisoPorton, proximaReserva, comunicado, pqrsAbiertas, incidenciasAbiertas] = await Promise.all([
    filas(`${SELECT_VISITA} WHERE v.residente_id = $1 AND v.estado = 'solicitada' ORDER BY v.creado_en`, [u.id]),
    contar(`SELECT count(*)::int AS n FROM visita WHERE residente_id = $1 AND estado = 'autorizada'`, [u.id]),
    filas(`${SELECT_PAQUETE} WHERE p.unidad_id = $1 AND p.estado = 'por_recoger' ORDER BY p.recibido_en DESC LIMIT 5`, [u.unidadId]),
    uno(`${SELECT_AVISO} WHERE a.usuario_id = $1 AND a.estado = 'pendiente'`, [u.id]),
    uno(`${SELECT_RESERVA} WHERE r.usuario_id = $1 AND r.estado = 'confirmada' AND r.fin > now() ORDER BY r.inicio LIMIT 1`, [u.id]),
    uno(
      `SELECT id, titulo, contenido AS cuerpo, importante, publicado_en AS creado_en FROM comunicacion
        WHERE copropiedad_id = $1 AND publicado_en > now() - interval '15 days' ORDER BY importante DESC, publicado_en DESC LIMIT 1`,
      [u.copropiedadId],
    ),
    contar(`SELECT count(*)::int AS n FROM pqrs WHERE usuario_id = $1 AND estado NOT IN ('cerrada','cancelada')`, [u.id]),
    contar(`SELECT count(*)::int AS n FROM incidencia WHERE usuario_id = $1 AND estado NOT IN ('cerrada','cancelada')`, [u.id]),
  ]);
  return {
    solicitudes,
    visitas_autorizadas: visitasAutorizadas,
    paquetes,
    aviso_porton: avisoPorton,
    proxima_reserva: proximaReserva,
    comunicado,
    pqrs_abiertas: pqrsAbiertas,
    incidencias_abiertas: incidenciasAbiertas,
  };
}

async function inicioVigilante(u: UsuarioAuth) {
  const c = [u.copropiedadId];
  const [avisos, solicitudes, porIngresar, dentro, porRecoger, enCamino, chats, reservasHoy] = await Promise.all([
    filas(`${SELECT_AVISO} WHERE a.copropiedad_id = $1 AND a.estado = 'pendiente' ORDER BY a.creado_en`, c),
    filas(`${SELECT_VISITA_PORTERIA} WHERE v.copropiedad_id = $1 AND v.estado = 'solicitada' ORDER BY v.creado_en`, c),
    filas(`${SELECT_VISITA_PORTERIA} WHERE v.copropiedad_id = $1 AND v.estado = 'autorizada' ORDER BY v.creado_en DESC LIMIT 10`, c),
    uno(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE entrada_en < now() - interval '24 hours')::int AS mas_de_un_dia
         FROM visita WHERE copropiedad_id = $1 AND estado = 'dentro'`,
      c,
    ),
    contar(`SELECT count(*)::int AS n FROM paquete WHERE copropiedad_id = $1 AND estado = 'por_recoger'`, c),
    filas(
      `${SELECT_PAQUETE} WHERE p.copropiedad_id = $1 AND p.estado = 'por_recoger' AND p.en_camino_en > now() - interval '30 minutes'
        ORDER BY p.en_camino_en DESC`,
      c,
    ),
    contar(`SELECT count(*)::int AS n FROM notificacion WHERE usuario_id = $1 AND tipo = 'chat' AND NOT leida`, [u.id]),
    filas(
      `${SELECT_RESERVA} WHERE r.copropiedad_id = $1 AND r.estado = 'confirmada' AND r.fin > now()
          AND (r.inicio AT TIME ZONE 'America/Bogota')::date <= (now() AT TIME ZONE 'America/Bogota')::date
        ORDER BY r.inicio LIMIT 6`,
      c,
    ),
  ]);
  return {
    avisos,
    solicitudes,
    por_ingresar: porIngresar,
    dentro: dentro.total,
    dentro_mas_de_un_dia: dentro.mas_de_un_dia,
    paquetes_por_recoger: porRecoger,
    en_camino: enCamino,
    chats_sin_leer: chats,
    reservas_hoy: reservasHoy,
  };
}

async function inicioAdministracion(u: UsuarioAuth) {
  const c = [u.copropiedadId];
  const [pqrs, incidencias, alertas, dentro, residentes] = await Promise.all([
    contar(`SELECT count(*)::int AS n FROM pqrs WHERE copropiedad_id = $1 AND estado NOT IN ('cerrada','cancelada')`, c),
    uno(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE gravedad = 'alta')::int AS graves
         FROM incidencia WHERE copropiedad_id = $1 AND estado NOT IN ('cerrada','cancelada')`,
      c,
    ),
    contar(`SELECT count(*)::int AS n FROM minuta WHERE copropiedad_id = $1 AND tipo = 'alerta' AND creado_en > now() - interval '24 hours'`, c),
    contar(`SELECT count(*)::int AS n FROM visita WHERE copropiedad_id = $1 AND estado = 'dentro'`, c),
    contar(
      `SELECT count(*)::int AS n FROM usuario x JOIN rol r ON r.id = x.rol_id WHERE x.copropiedad_id = $1 AND x.estado = 'activo' AND r.nombre = 'residente'`,
      c,
    ),
  ]);
  return { pqrs_sin_cerrar: pqrs, incidencias_abiertas: incidencias.total, incidencias_graves: incidencias.graves, alertas_24h: alertas, visitantes_dentro: dentro, residentes };
}

inicioRouter.get('/', async (req, res) => {
  const u = req.user!;
  await vencerAvisos(u.copropiedadId);
  await vencerVisitas(u.copropiedadId);
  const porteria = await uno('SELECT telefono_porteria FROM copropiedad WHERE id = $1', [u.copropiedadId]);
  const datos = u.rol === 'residente' ? await inicioResidente(u) : u.rol === 'vigilante' ? await inicioVigilante(u) : await inicioAdministracion(u);
  res.json({ rol: u.rol, telefono_porteria: porteria?.telefono_porteria ?? null, ...datos });
});
