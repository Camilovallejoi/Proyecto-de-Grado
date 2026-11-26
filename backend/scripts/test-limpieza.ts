// Prueba de la limpieza automática de reservas (usa los datos de `npm run db:seed`).
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { restablecerClave } from '../src/clave.js';
import { pool } from '../src/db.js';
import { purgarAvisos, purgarRegistros, purgarReservas, purgarTemporales, tareasEnTiempoReal } from '../src/limpieza.js';

let fallos = 0;
const verificar = (nombre: string, ok: boolean) => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}`);
  if (!ok) fallos++;
};

const u = (await pool.query(
  `SELECT u.id AS usuario, u.unidad_id AS unidad, u.copropiedad_id AS cop, z.id AS zona
     FROM usuario u JOIN zona_comun z ON z.copropiedad_id = u.copropiedad_id AND z.nombre = 'Piscina'
    WHERE u.correo = 'residente@demo.test'`,
)).rows[0];

async function insertar(inicio: string, estado: 'confirmada' | 'cancelada', canceladoEn: string | null) {
  const { rows } = await pool.query(
    `INSERT INTO reserva (copropiedad_id, zona_id, usuario_id, unidad_id, inicio, fin, estado, cancelado_en)
     VALUES ($1,$2,$3,$4, ${inicio}, (${inicio}) + interval '1 hour', $5, ${canceladoEn ?? 'NULL'}) RETURNING id`,
    [u.cop, u.zona, u.usuario, u.unidad, estado],
  );
  return rows[0].id as number;
}
const existe = async (id: number) => (await pool.query('SELECT 1 FROM reserva WHERE id = $1', [id])).rowCount === 1;

const pasada = await insertar("now() - interval '2 days'", 'confirmada', null);
const canceladaVieja = await insertar("now() + interval '400 days'", 'cancelada', "now() - interval '2 days'");
const canceladaReciente = await insertar("now() + interval '401 days'", 'cancelada', 'now()');
const futura = await insertar("now() + interval '402 days'", 'confirmada', null);

const borradas = await purgarReservas();
verificar('se eliminó al menos las 2 reservas esperadas', borradas >= 2);
verificar('la reserva que ya terminó se elimina', !(await existe(pasada)));
verificar('la cancelada hace más de 24 h se elimina', !(await existe(canceladaVieja)));
verificar('la cancelada recientemente se conserva (el administrador aún puede verla)', await existe(canceladaReciente));
verificar('la reserva futura confirmada se conserva', await existe(futura));
const aud = await pool.query(`SELECT 1 FROM registro_auditoria WHERE accion = 'purgar_reservas' AND creado_en > now() - interval '1 minute'`);
verificar('la limpieza deja constancia en la auditoría', aud.rowCount! >= 1);

// Avisos de portón: el pendiente antiguo vence, el atendido de hace 2 días se borra y el reciente se conserva
async function aviso(estado: string, creado: string) {
  const { rows } = await pool.query(
    `INSERT INTO aviso_porton (copropiedad_id, usuario_id, unidad_id, estado, creado_en)
     VALUES ($1,$2,$3,$4, ${creado}) RETURNING id`,
    [u.cop, u.usuario, u.unidad, estado],
  );
  return rows[0].id as number;
}
const estadoAviso = async (id: number) => (await pool.query('SELECT estado FROM aviso_porton WHERE id = $1', [id])).rows[0]?.estado as string | undefined;
const avisoViejo = await aviso('atendido', "now() - interval '2 days'");
const avisoPendienteViejo = await aviso('pendiente', "now() - interval '2 hours'");
const avisoReciente = await aviso('atendido', 'now()');
await purgarAvisos();
verificar('el aviso atendido hace más de 24 h se elimina', (await estadoAviso(avisoViejo)) === undefined);
verificar('un aviso pendiente sin atender más de 30 minutos queda vencido', (await estadoAviso(avisoPendienteViejo)) === 'vencido');
verificar('el aviso reciente se conserva', (await estadoAviso(avisoReciente)) === 'atendido');
await pool.query('DELETE FROM aviso_porton WHERE id = ANY($1)', [[avisoViejo, avisoPendienteViejo, avisoReciente]]);

// Visitas (90 días) y chat (30 días)
const visita = async (estado: string, creada: string, hasta: string) =>
  (await pool.query(
    `INSERT INTO visita (copropiedad_id, unidad_id, residente_id, nombre, codigo, valida_desde, valida_hasta, estado, creado_en)
     VALUES ($1,$2,$3,'Visitante de prueba', substr(md5(random()::text), 1, 8), ${creada} - interval '1 day', ${hasta}, $4, ${creada}) RETURNING id`,
    [u.cop, u.unidad, u.usuario, estado],
  )).rows[0].id as number;
const estadoVisita = async (id: number) => (await pool.query('SELECT estado FROM visita WHERE id = $1', [id])).rows[0]?.estado as string | undefined;
const visitaVieja = await visita('finalizada', "now() - interval '100 days'", "now() - interval '99 days'");
const visitaSinUsar = await visita('autorizada', "now() - interval '3 hours'", "now() - interval '1 hour'");
const visitaReciente = await visita('finalizada', 'now()', "now() + interval '1 hour'");
const solicitudSinRespuesta = await visita('solicitada', "now() - interval '30 minutes'", "now() - interval '20 minutes'");
const solicitudVigente = await visita('solicitada', 'now()', "now() + interval '10 minutes'");
const mensaje = async (creado: string) =>
  (await pool.query(
    `INSERT INTO mensaje_chat (copropiedad_id, canal, residente_id, autor_id, cuerpo, creado_en) VALUES ($1,'porteria',$2,$2,'mensaje de prueba', ${creado}) RETURNING id`,
    [u.cop, u.usuario],
  )).rows[0].id as number;
const existeMensaje = async (id: number) => ((await pool.query('SELECT 1 FROM mensaje_chat WHERE id = $1', [id])).rowCount ?? 0) > 0;
const mensajeViejo = await mensaje("now() - interval '40 days'");
const mensajeReciente = await mensaje('now()');
await purgarRegistros();
verificar('la visita de hace más de 90 días se elimina', (await estadoVisita(visitaVieja)) === undefined);
verificar('una autorización sin usar cuya vigencia terminó queda vencida', (await estadoVisita(visitaSinUsar)) === 'vencida');
verificar('la visita reciente se conserva', (await estadoVisita(visitaReciente)) === 'finalizada');
verificar('una solicitud sin respuesta pasados 10 minutos queda sin respuesta', (await estadoVisita(solicitudSinRespuesta)) === 'sin_respuesta');
verificar('una solicitud dentro de su plazo sigue esperando respuesta', (await estadoVisita(solicitudVigente)) === 'solicitada');
verificar('el mensaje de chat de hace más de 30 días se elimina', !(await existeMensaje(mensajeViejo)));
verificar('el mensaje de chat reciente se conserva', await existeMensaje(mensajeReciente));
await pool.query('DELETE FROM visita WHERE id = ANY($1)', [[visitaVieja, visitaSinUsar, visitaReciente, solicitudSinRespuesta, solicitudVigente]]);
await pool.query('DELETE FROM mensaje_chat WHERE id = ANY($1)', [[mensajeViejo, mensajeReciente]]);

// Paquetes entregados (30 días) y minuta (90 días)
const paquete = async (estado: string, entregado: string) =>
  (await pool.query(
    `INSERT INTO paquete (copropiedad_id, unidad_id, tipo, estado, recibido_en, entregado_en)
     VALUES ($1,$2,'paquete',$3, now() - interval '60 days', ${entregado}) RETURNING id`,
    [u.cop, u.unidad, estado],
  )).rows[0].id as number;
const existePaquete = async (id: number) => ((await pool.query('SELECT 1 FROM paquete WHERE id = $1', [id])).rowCount ?? 0) > 0;
const paqueteViejo = await paquete('entregado', "now() - interval '45 days'");
const paqueteReciente = await paquete('entregado', "now() - interval '2 days'");
const paquetePendiente = await paquete('por_recoger', 'NULL');
const anotacion = async (creada: string) =>
  (await pool.query(`INSERT INTO minuta (copropiedad_id, autor_id, descripcion, creado_en) VALUES ($1,$2,'anotación de prueba', ${creada}) RETURNING id`, [u.cop, u.usuario])).rows[0].id as number;
const existeAnotacion = async (id: number) => ((await pool.query('SELECT 1 FROM minuta WHERE id = $1', [id])).rowCount ?? 0) > 0;
const minutaVieja = await anotacion("now() - interval '100 days'");
const minutaReciente = await anotacion('now()');
await purgarRegistros();
verificar('el paquete entregado hace más de 30 días se elimina', !(await existePaquete(paqueteViejo)));
verificar('el paquete entregado recientemente se conserva', await existePaquete(paqueteReciente));
verificar('un paquete sin entregar nunca se borra', await existePaquete(paquetePendiente));
verificar('la anotación de minuta de hace más de 90 días se elimina', !(await existeAnotacion(minutaVieja)));
verificar('la anotación de minuta reciente se conserva', await existeAnotacion(minutaReciente));
await pool.query('DELETE FROM paquete WHERE id = ANY($1)', [[paqueteViejo, paqueteReciente, paquetePendiente]]);
await pool.query('DELETE FROM minuta WHERE id = ANY($1)', [[minutaVieja, minutaReciente]]);

// ---- Visitas en las que nadie entró: se borran a los 7 días; el registro de ingresos se conserva 90
const rechazadaVieja = await visita('rechazada', "now() - interval '10 days'", "now() - interval '9 days'");
const ingresoDeHaceDiez = await visita('finalizada', "now() - interval '10 days'", "now() - interval '9 days'");
await purgarRegistros();
verificar('una visita rechazada de hace más de 7 días se elimina', (await estadoVisita(rechazadaVieja)) === undefined);
verificar('el registro de un ingreso de hace 10 días se conserva', (await estadoVisita(ingresoDeHaceDiez)) === 'finalizada');
await pool.query('DELETE FROM visita WHERE id = $1', [ingresoDeHaceDiez]);

// ---- Datos de apoyo: notificaciones, teléfonos abandonados e invitaciones vencidas
const notif = async (leida: boolean, dias: number) =>
  (await pool.query(
    `INSERT INTO notificacion (usuario_id, tipo, titulo, mensaje, leida, creado_en)
     VALUES ($1,'prueba','Prueba','Prueba',$2, now() - make_interval(days => $3::int)) RETURNING id`,
    [u.usuario, leida, dias],
  )).rows[0].id as number;
const existeFila = async (tabla: string, id: number) => ((await pool.query(`SELECT 1 FROM ${tabla} WHERE id = $1`, [id])).rowCount ?? 0) > 0;
const nLeidaVieja = await notif(true, 10);
const nSinLeerReciente = await notif(false, 10);
const nMuyVieja = await notif(false, 40);
const telefono = async (dias: number) =>
  (await pool.query(
    `INSERT INTO dispositivo_push (usuario_id, token, plataforma, actualizado_en) VALUES ($1, md5(random()::text), 'android', now() - make_interval(days => $2::int)) RETURNING id`,
    [u.usuario, dias],
  )).rows[0].id as number;
const telAbandonado = await telefono(70);
const telActivo = await telefono(1);
const invitacion = async (expira: string) =>
  (await pool.query(
    `INSERT INTO codigo_invitacion (copropiedad_id, unidad_id, codigo, expira_en) VALUES ($1,$2, substr(md5(random()::text),1,12), ${expira}) RETURNING id`,
    [u.cop, u.unidad],
  )).rows[0].id as number;
const invVencida = await invitacion("now() - interval '10 days'");
const invVigente = await invitacion("now() + interval '3 days'");
await purgarTemporales();
verificar('una notificación leída de hace más de 7 días se elimina', !(await existeFila('notificacion', nLeidaVieja)));
verificar('una sin leer de hace 10 días se conserva', await existeFila('notificacion', nSinLeerReciente));
verificar('cualquier notificación de más de 30 días se elimina', !(await existeFila('notificacion', nMuyVieja)));
verificar('el registro de un teléfono abandonado se elimina', !(await existeFila('dispositivo_push', telAbandonado)));
verificar('el de un teléfono en uso se conserva', await existeFila('dispositivo_push', telActivo));
verificar('una invitación vencida sin usar se elimina', !(await existeFila('codigo_invitacion', invVencida)));
verificar('una invitación vigente se conserva', await existeFila('codigo_invitacion', invVigente));
await pool.query('DELETE FROM notificacion WHERE id = $1', [nSinLeerReciente]);
await pool.query('DELETE FROM dispositivo_push WHERE id = $1', [telActivo]);
await pool.query('DELETE FROM codigo_invitacion WHERE id = $1', [invVigente]);

// ---- Tiempo real: vencimientos que avisan solos y recordatorio de reserva
const zonaRec = (await pool.query(
  `INSERT INTO zona_comun (copropiedad_id, nombre, hora_apertura, hora_cierre) VALUES ($1, 'Zona recordatorio ' || md5(random()::text), '00:00', '23:59') RETURNING id`,
  [u.cop],
)).rows[0].id as number;
const reservaEn = async (inicio: string, creada: string) =>
  (await pool.query(
    `INSERT INTO reserva (copropiedad_id, zona_id, usuario_id, unidad_id, inicio, fin, creado_en)
     VALUES ($1,$2,$3,$4, ${inicio}, ${inicio} + interval '10 minutes', ${creada}) RETURNING id`,
    [u.cop, zonaRec, u.usuario, u.unidad],
  )).rows[0].id as number;
const porRecordar = await reservaEn("now() + interval '30 minutes'", "now() - interval '3 hours'");
const deUltimaHora = await reservaEn("now() + interval '45 minutes'", 'now()');
const solicitudPorVencer = await visita('solicitada', "now() - interval '20 minutes'", "now() - interval '1 minute'");
await pool.query(`DELETE FROM aviso_porton WHERE usuario_id = $1 AND estado = 'pendiente'`, [u.usuario]);
const avisoSinAtender = await aviso('pendiente', "now() - interval '45 minutes'");
const hayAviso = async (tipo: string, ref: number, titulo: string) =>
  (await pool.query('SELECT count(*)::int AS n FROM notificacion WHERE tipo = $1 AND referencia_id = $2 AND titulo = $3', [tipo, ref, titulo])).rows[0].n as number;
await tareasEnTiempoReal();
verificar('la reserva que empieza en media hora se recuerda', (await hayAviso('reserva', porRecordar, 'Tu reserva empieza pronto')) === 1);
verificar('una reserva hecha a última hora no genera recordatorio', (await hayAviso('reserva', deUltimaHora, 'Tu reserva empieza pronto')) === 0);
verificar('al vencer una solicitud se avisa al vigilante para que llame', (await hayAviso('visita_respuesta', solicitudPorVencer, 'El residente no respondió')) >= 1);
verificar('y se avisa al residente que no alcanzó a responder', (await hayAviso('visita', solicitudPorVencer, 'No alcanzaste a responder una visita')) === 1);
verificar('al vencer un aviso de portón se avisa al residente', (await hayAviso('porton', avisoSinAtender, 'Nadie atendió tu aviso del portón')) === 1);
await tareasEnTiempoReal();
verificar('repetir el ciclo no duplica el recordatorio ni los avisos', (await hayAviso('reserva', porRecordar, 'Tu reserva empieza pronto')) === 1 && (await hayAviso('porton', avisoSinAtender, 'Nadie atendió tu aviso del portón')) === 1);
await pool.query('DELETE FROM reserva WHERE zona_id = $1', [zonaRec]);
await pool.query('DELETE FROM zona_comun WHERE id = $1', [zonaRec]);
await pool.query('DELETE FROM visita WHERE id = $1', [solicitudPorVencer]);
await pool.query('DELETE FROM aviso_porton WHERE id = $1', [avisoSinAtender]);

// ---- Contraseña temporal vencida y respaldo para la cuenta de administración
const cuenta = (await pool.query(
  `INSERT INTO usuario (copropiedad_id, unidad_id, rol_id, nombre, correo, password_hash)
   VALUES ($1,$2,(SELECT id FROM rol WHERE nombre='residente'),'Cuenta De Prueba', 'vence' || floor(random()*1e9) || '@demo.test', 'x') RETURNING id`,
  [u.cop, u.unidad],
)).rows[0].id as number;
const { password: claveDePrueba } = await restablecerClave(pool, cuenta);
const estadoCuenta = async () => (await pool.query(
  `SELECT cambio_clave_pendiente AS pendiente, version_sesion AS version, password_hash AS hash,
          clave_temporal_vence BETWEEN now() + interval '23 hours' AND now() + interval '25 hours' AS en_24h FROM usuario WHERE id = $1`, [cuenta])).rows[0];
const antes = await estadoCuenta();
verificar('al restablecer, la temporal vence en 24 horas y exige cambiarla', antes.pendiente === true && antes.en_24h === true && antes.version === 1);
verificar('la base solo guarda la contraseña cifrada', antes.hash !== claveDePrueba && String(antes.hash).startsWith('$2') && (await bcrypt.compare(claveDePrueba, antes.hash)));
const segunda = await restablecerClave(pool, cuenta);
verificar('cada restablecimiento genera una contraseña distinta y cierra sesiones otra vez', segunda.password !== claveDePrueba && (await estadoCuenta()).version === 2);
const correoCuenta = (await pool.query('SELECT correo FROM usuario WHERE id = $1', [cuenta])).rows[0].correo as string;
const servidor = app.listen(0);
const puerto = (servidor.address() as AddressInfo).port;
const entrarCon = async (password: string) => {
  const r = await fetch(`http://127.0.0.1:${puerto}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: correoCuenta, password }) });
  return { status: r.status, error: String(((await r.json()) as any).error ?? '') };
};
verificar('dentro de las 24 horas la temporal permite entrar', (await entrarCon(segunda.password)).status === 200);
await pool.query(`UPDATE usuario SET clave_temporal_vence = now() - interval '1 minute' WHERE id = $1`, [cuenta]);
const vencida = await entrarCon(segunda.password);
verificar('pasadas las 24 horas la temporal ya no deja entrar y lo explica', vencida.status === 401 && vencida.error.includes('venció'));
const equivocada = await entrarCon('no-es-la-clave');
verificar('a quien no la sabe no se le revela que la temporal venció', equivocada.status === 401 && !equivocada.error.includes('venció'));
servidor.close();
await pool.query('DELETE FROM usuario WHERE id = $1', [cuenta]);

await pool.query('DELETE FROM reserva WHERE id = ANY($1)', [[canceladaReciente, futura]]);
await pool.end();
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : '\nTodas las verificaciones pasaron');
process.exit(fallos ? 1 : 0);
