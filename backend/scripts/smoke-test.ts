// Prueba de extremo a extremo contra la API en ejecución (usa los datos de `npm run db:seed`).
const BASE = process.env.API_URL ?? 'http://localhost:3000';
let fallos = 0;

async function api(ruta: string, opts: { método?: string; token?: string; cuerpo?: unknown } = {}) {
  const r = await fetch(BASE + ruta, {
    method: opts.método ?? (opts.cuerpo ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.cuerpo ? JSON.stringify(opts.cuerpo) : undefined,
  });
  return { status: r.status, data: (await r.json().catch(() => null)) as any };
}
function verificar(nombre: string, ok: boolean, extra = '') {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${ok ? '' : ' ' + extra}`);
  if (!ok) fallos++;
}

// Próxima fecha (lunes a sábado) a las HH:MM de Bogotá, a partir de pasado mañana
function futuro(horaLocal: string, diasMas = 2) {
  const d = new Date(Date.now() + diasMas * 86400000 - 5 * 3600000);
  const f = d.toISOString().slice(0, 10);
  return new Date(`${f}T${horaLocal}:00-05:00`).toISOString();
}

const login = async (correo: string) => (await api('/auth/login', { cuerpo: { correo, password: 'Demo12345!' } })).data.token as string;

const admin = await login('admin@demo.test');
const res = await login('residente@demo.test');
const cel = await login('celador@demo.test');
verificar('login admin y residente', !!admin && !!res);
verificar('sin token → 401', (await api('/zonas')).status === 401);
verificar('login con contraseña mala → 401', (await api('/auth/login', { cuerpo: { correo: 'admin@demo.test', password: 'mala' } })).status === 401);

const zonas = (await api('/zonas', { token: res })).data as any[];
verificar('residente lista las zonas de su conjunto', ['Piscina', 'Salón Social', 'Zona BBQ', 'Cancha Múltiple'].every((n) => zonas.some((z) => z.nombre === n)), JSON.stringify(zonas).slice(0, 80));
const piscina = zonas.find((z) => z.nombre === 'Piscina');
// Hace la prueba repetible: cancela reservas futuras previas del residente de demostración
for (const r of (await api('/reservas/mias', { token: res })).data as any[]) {
  if (r.estado === 'confirmada' && new Date(r.inicio) > new Date()) await api(`/reservas/${r.id}/cancelar`, { token: res, cuerpo: {} });
}
verificar('residente no crea zonas (403)', (await api('/zonas', { token: res, cuerpo: { nombre: 'X', hora_apertura: '08:00', hora_cierre: '09:00' } })).status === 403);

const nueva = await api('/zonas', { token: admin, cuerpo: { nombre: `Gimnasio ${Date.now()}`, aforo: 10, hora_apertura: '05:00', hora_cierre: '22:00', regla: { duracion_maxima_min: 60 } } });
verificar('admin crea zona con regla', nueva.status === 201 && nueva.data.regla.duracion_maxima_min === 60, JSON.stringify(nueva.data));
const ed = await api(`/zonas/${nueva.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'mantenimiento' } });
verificar('admin edita estado de zona', ed.data?.estado === 'mantenimiento');
verificar('admin no puede poner cierre antes de apertura', (await api(`/zonas/${nueva.data.id}`, { método: 'PUT', token: admin, cuerpo: { hora_cierre: '04:00' } })).status === 400);

// Reservas: usamos un día lejano distinto en cada ejecución para no chocar con ejecuciones previas
const dia = 3 + Math.floor(Math.random() * 300);
const r1 = await api('/reservas', { token: res, cuerpo: { zona_id: piscina.id, inicio: futuro('10:00', dia), fin: futuro('11:00', dia) } });
verificar('residente crea reserva', r1.status === 201, JSON.stringify(r1.data));
const dup = await api('/reservas', { token: admin, cuerpo: { zona_id: piscina.id, inicio: futuro('10:30', dia), fin: futuro('11:30', dia) } });
verificar('solape rechazado (admin sin unidad → 403)', dup.status === 403);
const solape = await api('/reservas', { token: res, cuerpo: { zona_id: piscina.id, inicio: futuro('10:30', dia), fin: futuro('11:30', dia) } });
verificar('solape rechazado (409)', solape.status === 409, JSON.stringify(solape.data));
const contiguas = await api('/reservas', { token: res, cuerpo: { zona_id: piscina.id, inicio: futuro('11:00', dia), fin: futuro('12:00', dia) } });
verificar('reserva contigua permitida', contiguas.status === 201, JSON.stringify(contiguas.data));
const tercera = await api('/reservas', { token: res, cuerpo: { zona_id: piscina.id, inicio: futuro('14:00', dia), fin: futuro('15:00', dia) } });
verificar('límite de reservas activas por unidad (409)', tercera.status === 409, JSON.stringify(tercera.data));
verificar('fuera de horario (400)', (await api('/reservas', { token: res, cuerpo: { zona_id: zonas.find((z) => z.nombre === 'Zona BBQ').id, inicio: futuro('06:00', dia), fin: futuro('07:00', dia) } })).status === 400);
verificar('duración excedida (400)', (await api('/reservas', { token: res, cuerpo: { zona_id: piscina.id, inicio: futuro('16:00', dia), fin: futuro('19:30', dia) } })).status === 400);
verificar('anticipación insuficiente (400)', (await api('/reservas', { token: res, cuerpo: { zona_id: piscina.id, inicio: new Date(Date.now() + 10 * 60000).toISOString(), fin: new Date(Date.now() + 40 * 60000).toISOString() } })).status === 400);
verificar('zona en mantenimiento (409)', (await api('/reservas', { token: res, cuerpo: { zona_id: nueva.data.id, inicio: futuro('10:00', dia), fin: futuro('10:30', dia) } })).status === 409);

// Concurrencia: dos peticiones simultáneas por el mismo horario con usuarios distintos → solo una gana
const unidades = (await api('/unidades', { token: admin })).data as any[];
const inv = await api(`/unidades/${unidades.find((u) => u.identificador === 'Torre 1 - Apto 102').id}/invitacion`, { token: admin, cuerpo: {} });
verificar('admin genera código de invitación', inv.status === 201 && !!inv.data.codigo, JSON.stringify(inv.data));
const reg = await api('/auth/registro', { cuerpo: { nombre: 'Vecino Prueba', correo: `vecino${Date.now()}@demo.test`, password: 'Clave12345!', codigo: inv.data.codigo } });
const otro = reg.data?.token as string | undefined;
if (otro) {
  const mismo = { zona_id: zonas.find((z) => z.nombre === 'Cancha Múltiple').id, inicio: futuro('08:00', dia + 1), fin: futuro('09:00', dia + 1) };
  const [a, b] = await Promise.all([api('/reservas', { token: res, cuerpo: mismo }), api('/reservas', { token: otro, cuerpo: mismo })]);
  const estados = [a.status, b.status].sort();
  verificar('reservas simultáneas: una 201 y una 409', estados[0] === 201 && estados[1] === 409, estados.join(','));
} else {
  console.log('No se pudo registrar al vecino de prueba: omito la prueba de concurrencia');
}

const disp = await api(`/zonas/${piscina.id}/disponibilidad?fecha=${futuro('10:00', dia).slice(0, 10)}`, { token: res });
verificar('disponibilidad lista la reserva', disp.data?.ocupados?.length >= 1, JSON.stringify(disp.data));
const mias = await api('/reservas/mias', { token: res });
verificar('mis reservas incluye la creada', mias.data.some((x: any) => x.id === r1.data.id));
const canc = await api(`/reservas/${r1.data.id}/cancelar`, { token: res, cuerpo: {} });
verificar('residente cancela su reserva', canc.data?.estado === 'cancelada', JSON.stringify(canc.data));
verificar('cancelar dos veces → 409', (await api(`/reservas/${r1.data.id}/cancelar`, { token: res, cuerpo: {} })).status === 409);
verificar('residente no lista todas las reservas (403)', (await api('/reservas', { token: res })).status === 403);
verificar('el vigilante lista las reservas del conjunto', (await api('/reservas', { token: cel })).data.length >= 1);
verificar('la administración no consulta las reservas (403)', (await api('/reservas', { token: admin })).status === 403);

// Eliminación de reservas por el vigilante
const vistaAdmin = (await api('/reservas', { token: cel })).data as any[];
verificar('el vigilante ve la reserva cancelada mientras exista', vistaAdmin.some((x) => x.id === r1.data.id && x.estado === 'cancelada'));
verificar('el residente no elimina reservas (403)', (await api(`/reservas/${r1.data.id}`, { método: 'DELETE', token: res })).status === 403);
verificar('el vigilante elimina una reserva cancelada (204)', (await api(`/reservas/${r1.data.id}`, { método: 'DELETE', token: cel })).status === 204);
verificar('la reserva eliminada ya no aparece', !((await api('/reservas', { token: cel })).data as any[]).some((x) => x.id === r1.data.id));
verificar('eliminar una reserva inexistente da 404', (await api(`/reservas/${r1.data.id}`, { método: 'DELETE', token: cel })).status === 404);
const salon = zonas.find((z) => z.nombre === 'Salón Social');
const vigente = await api('/reservas', { token: res, cuerpo: { zona_id: salon.id, inicio: futuro('10:00', dia + 5), fin: futuro('11:00', dia + 5) } });
verificar('se crea una reserva vigente para eliminarla', vigente.status === 201, JSON.stringify(vigente.data));
verificar('la administración no cancela reservas de los residentes (403)', (await api(`/reservas/${vigente.data.id}/cancelar`, { token: admin, cuerpo: {} })).status === 403);
verificar('la administración no elimina reservas (403)', (await api(`/reservas/${vigente.data.id}`, { método: 'DELETE', token: admin })).status === 403);
verificar('la administración no usa la limpieza de canceladas (403)', (await api('/reservas/canceladas', { método: 'DELETE', token: admin })).status === 403);
verificar('el vigilante elimina una reserva vigente (204)', (await api(`/reservas/${vigente.data.id}`, { método: 'DELETE', token: cel })).status === 204);
verificar('el residente no usa la limpieza de canceladas (403)', (await api('/reservas/canceladas', { método: 'DELETE', token: res })).status === 403);
const limpieza = await api('/reservas/canceladas', { método: 'DELETE', token: cel });
verificar('el vigilante limpia las reservas canceladas', limpieza.status === 200 && typeof limpieza.data.eliminadas === 'number', JSON.stringify(limpieza.data));
verificar('no quedan reservas canceladas tras la limpieza', !((await api('/reservas', { token: cel })).data as any[]).some((x) => x.estado === 'cancelada'));

verificar('un identificador no numérico da 400 y no un error del servidor', (await api('/reservas/abc', { método: 'DELETE', token: cel })).status === 400);

// Eliminación de zonas
verificar('residente no elimina zonas (403)', (await api(`/zonas/${nueva.data.id}`, { método: 'DELETE', token: res })).status === 403);
const delConReserva = await api(`/zonas/${piscina.id}`, { método: 'DELETE', token: admin });
verificar('no se elimina una zona con reservas futuras (409)', delConReserva.status === 409, JSON.stringify(delConReserva.data));
verificar('admin elimina una zona sin reservas (204)', (await api(`/zonas/${nueva.data.id}`, { método: 'DELETE', token: admin })).status === 204);
const zonasDespues = (await api('/zonas', { token: admin })).data as any[];
verificar('la zona eliminada ya no aparece', !zonasDespues.some((z) => z.id === nueva.data.id));
verificar('no se puede reservar una zona eliminada (404)', (await api('/reservas', { token: res, cuerpo: { zona_id: nueva.data.id, inicio: futuro('10:00', dia), fin: futuro('10:30', dia) } })).status === 404);
const recreada = await api('/zonas', { token: admin, cuerpo: { nombre: nueva.data.nombre, hora_apertura: '07:00', hora_cierre: '20:00' } });
verificar('se puede crear otra zona con el mismo nombre', recreada.status === 201, JSON.stringify(recreada.data));
await api(`/zonas/${recreada.data.id}`, { método: 'DELETE', token: admin });

// Aviso de llegada al portón
const av0 = await api('/porton', { token: admin, cuerpo: {} });
verificar('el administrador no envía avisos de llegada (403)', av0.status === 403);
verificar('una placa inválida se rechaza (400)', (await api('/porton', { token: res, cuerpo: { placa: 'AB-1' } })).status === 400);
const av = await api('/porton', { token: res, cuerpo: { tipo_vehiculo: 'carro', placa: 'abc123' } });
verificar('el residente avisa que llega y necesita que abran el portón', av.status === 201 && av.data.estado === 'pendiente' && av.data.placa === 'ABC123', JSON.stringify(av.data));
verificar('un segundo aviso pendiente se rechaza (409)', (await api('/porton', { token: res, cuerpo: {} })).status === 409);
verificar('el residente no lista los avisos de todos (403)', (await api('/porton', { token: res })).status === 403);
const colaPorton = (await api('/porton', { token: cel })).data as any[];
verificar('el vigilante ve el aviso pendiente primero', colaPorton[0]?.id === av.data.id && colaPorton[0].unidad === 'Torre 1 - Apto 101', JSON.stringify(colaPorton[0]));
verificar('el residente no atiende avisos (403)', (await api(`/porton/${av.data.id}/atender`, { token: res, cuerpo: {} })).status === 403);
if (otro) verificar('otro residente no cancela el aviso ajeno (403)', (await api(`/porton/${av.data.id}/cancelar`, { token: otro, cuerpo: {} })).status === 403);
verificar('la administración no consulta la operación del portón (403)', (await api('/porton', { token: admin })).status === 403);
verificar('la administración no atiende avisos del portón (403)', (await api(`/porton/${av.data.id}/atender`, { token: admin, cuerpo: {} })).status === 403);
const atendido = await api(`/porton/${av.data.id}/atender`, { token: cel, cuerpo: {} });
verificar('el vigilante marca el portón como abierto', atendido.status === 200 && atendido.data.estado === 'atendido' && !!atendido.data.atendido_por, JSON.stringify(atendido.data));
verificar('atender dos veces da 409', (await api(`/porton/${av.data.id}/atender`, { token: cel, cuerpo: {} })).status === 409);
verificar('el residente ve su aviso atendido', ((await api('/porton/mios', { token: res })).data as any[])[0]?.estado === 'atendido');
const av2 = await api('/porton', { token: res, cuerpo: { tipo_vehiculo: 'moto' } });
verificar('tras ser atendido puede enviar otro aviso', av2.status === 201, JSON.stringify(av2.data));
const cancAv = await api(`/porton/${av2.data.id}/cancelar`, { token: res, cuerpo: {} });
verificar('el residente cancela su aviso pendiente', cancAv.data?.estado === 'cancelado', JSON.stringify(cancAv.data));
verificar('cancelar un aviso ya cancelado da 409', (await api(`/porton/${av2.data.id}/cancelar`, { token: res, cuerpo: {} })).status === 409);
verificar('un aviso inexistente da 404', (await api('/porton/99999999/atender', { token: cel, cuerpo: {} })).status === 404);
verificar('un identificador no numérico del portón da 400', (await api('/porton/abc/atender', { token: cel, cuerpo: {} })).status === 400);

// Celador (vigilante) y notificaciones push
verificar('login del celador', !!cel);
const av3 = await api('/porton', { token: res, cuerpo: { tipo_vehiculo: 'carro', placa: 'abc123' } });
verificar('el residente avisa de nuevo para probar al celador', av3.status === 201, JSON.stringify(av3.data));
const colaCel = await api('/porton', { token: cel });
verificar('el celador ve los avisos pendientes', colaCel.status === 200 && colaCel.data[0]?.id === av3.data?.id, JSON.stringify(colaCel.data).slice(0, 80));
verificar('el celador no envía avisos de llegada (403)', (await api('/porton', { token: cel, cuerpo: {} })).status === 403);
const atCel = await api(`/porton/${av3.data.id}/atender`, { token: cel, cuerpo: {} });
verificar('el celador marca el portón como abierto', atCel.status === 200 && atCel.data.estado === 'atendido', JSON.stringify(atCel.data));
const tokenFalso = 'token-de-prueba-' + 'x'.repeat(40);
verificar('el celador registra el token de su teléfono', (await api('/dispositivos', { token: cel, cuerpo: { token: tokenFalso, plataforma: 'android' } })).status === 204);
verificar('un token demasiado corto es rechazado (400)', (await api('/dispositivos', { token: cel, cuerpo: { token: 'corto' } })).status === 400);
verificar('registrar dispositivo sin sesión da 401', (await api('/dispositivos', { cuerpo: { token: tokenFalso } })).status === 401);
verificar('el celador da de baja su token al cerrar sesión', (await api('/dispositivos/baja', { token: cel, cuerpo: { token: tokenFalso } })).status === 204);

// ---- El vigilante opera zonas y reservas
const zonaCel = await api('/zonas', { token: cel, cuerpo: { nombre: `Sala del celador ${Date.now()}`, aforo: 8, hora_apertura: '07:00', hora_cierre: '20:00', regla: { duracion_maxima_min: 60 } } });
verificar('el vigilante crea una zona', zonaCel.status === 201, JSON.stringify(zonaCel.data));
verificar('el vigilante pone una zona en mantenimiento', (await api(`/zonas/${zonaCel.data.id}`, { método: 'PUT', token: cel, cuerpo: { estado: 'mantenimiento' } })).data?.estado === 'mantenimiento');
verificar('el vigilante cambia el horario y las reglas de una zona', (await api(`/zonas/${zonaCel.data.id}`, { método: 'PUT', token: cel, cuerpo: { hora_cierre: '21:00', estado: 'activa', regla: { duracion_maxima_min: 90 } } })).data?.regla?.duracion_maxima_min === 90);
verificar('el vigilante ve todas las reservas del conjunto', (await api('/reservas', { token: cel })).status === 200);
verificar('el residente sigue sin ver todas las reservas (403)', (await api('/reservas', { token: res })).status === 403);
verificar('el vigilante elimina una zona sin reservas (204)', (await api(`/zonas/${zonaCel.data.id}`, { método: 'DELETE', token: cel })).status === 204);
verificar('el vigilante usa la limpieza de reservas canceladas', (await api('/reservas/canceladas', { método: 'DELETE', token: cel })).status === 200);
verificar('el residente no crea ni elimina zonas (403)', (await api('/zonas', { token: res, cuerpo: { nombre: 'X', hora_apertura: '08:00', hora_cierre: '09:00' } })).status === 403);

// ---- Visitantes con código QR y registro de ingresos
const visitasPrevias = (await api('/visitas/mias', { token: res })).data as any[];
for (const v of visitasPrevias) if (v.estado === 'autorizada') await api(`/visitas/${v.id}/cancelar`, { token: res, cuerpo: {} });
const vis = await api('/visitas', { token: res, cuerpo: { nombre: 'Ana Visitante', documento: '1020304050', placa: 'xyz987', horas: 6 } });
verificar('el residente autoriza un visitante y recibe un código', vis.status === 201 && /^[A-Z0-9]{6}$/.test(vis.data?.codigo ?? '') && vis.data.estado === 'autorizada', JSON.stringify(vis.data));
verificar('un nombre demasiado corto es rechazado (400)', (await api('/visitas', { token: res, cuerpo: { nombre: 'A' } })).status === 400);
verificar('una placa inválida de visitante es rechazada (400)', (await api('/visitas', { token: res, cuerpo: { nombre: 'Luis Prueba', placa: '!!' } })).status === 400);
verificar('el vigilante no autoriza visitantes (403)', (await api('/visitas', { token: cel, cuerpo: { nombre: 'Luis Prueba' } })).status === 403);
verificar('el residente ve su visita en la lista', ((await api('/visitas/mias', { token: res })).data as any[]).some((v) => v.id === vis.data.id));
verificar('el residente no ve la lista de portería (403)', (await api('/visitas', { token: res })).status === 403);
const porCodigo = await api(`/visitas/codigo/${vis.data.codigo.toLowerCase()}`, { token: cel });
verificar('el vigilante encuentra la visita por su código', porCodigo.status === 200 && porCodigo.data.id === vis.data.id && porCodigo.data.placa === 'XYZ987', JSON.stringify(porCodigo.data));
verificar('un código inexistente da 404', (await api('/visitas/codigo/ZZZZZZ', { token: cel })).status === 404);
verificar('el residente no consulta códigos (403)', (await api(`/visitas/codigo/${vis.data.codigo}`, { token: res })).status === 403);
if (otro) verificar('otro residente no cancela la visita ajena (403)', (await api(`/visitas/${vis.data.id}/cancelar`, { token: otro, cuerpo: {} })).status === 403);
const entrada = await api(`/visitas/${vis.data.id}/entrada`, { token: cel, cuerpo: {} });
verificar('el vigilante registra la entrada', entrada.status === 200 && entrada.data.estado === 'dentro' && !!entrada.data.entrada_en && !!entrada.data.recibido_por, JSON.stringify(entrada.data));
verificar('registrar la entrada dos veces da 409', (await api(`/visitas/${vis.data.id}/entrada`, { token: cel, cuerpo: {} })).status === 409);
verificar('el residente no registra entradas (403)', (await api(`/visitas/${vis.data.id}/entrada`, { token: res, cuerpo: {} })).status === 403);
verificar('la visita aparece como dentro en portería', ((await api('/visitas', { token: cel })).data as any[]).some((v) => v.id === vis.data.id && v.estado === 'dentro'));
const salida = await api(`/visitas/${vis.data.id}/salida`, { token: cel, cuerpo: {} });
verificar('el vigilante registra la salida', salida.status === 200 && salida.data.estado === 'finalizada' && !!salida.data.salida_en, JSON.stringify(salida.data));
verificar('registrar la salida dos veces da 409', (await api(`/visitas/${vis.data.id}/salida`, { token: cel, cuerpo: {} })).status === 409);
const registro = await api('/visitas/registro?dias=7', { token: cel });
verificar('la administración no consulta el registro de ingresos (403)', (await api('/visitas/registro?dias=7', { token: admin })).status === 403);
verificar('el vigilante ve el registro de ingresos', registro.status === 200 && registro.data.some((v: any) => v.id === vis.data.id));
verificar('el residente no ve el registro de ingresos (403)', (await api('/visitas/registro', { token: res })).status === 403);
const vis2 = await api('/visitas', { token: res, cuerpo: { nombre: 'Pedro Cancelado' } });
const canc2 = await api(`/visitas/${vis2.data.id}/cancelar`, { token: res, cuerpo: {} });
verificar('el residente cancela una visita sin usar', canc2.data?.estado === 'cancelada', JSON.stringify(canc2.data));
verificar('una visita cancelada no puede ingresar (409)', (await api(`/visitas/${vis2.data.id}/entrada`, { token: cel, cuerpo: {} })).status === 409);
verificar('una visita inexistente da 404', (await api('/visitas/99999999/entrada', { token: cel, cuerpo: {} })).status === 404);
verificar('un identificador no numérico de visita da 400', (await api('/visitas/abc/salida', { token: cel, cuerpo: {} })).status === 400);
const lote: any[] = [];
for (let i = 1; i <= 5; i++) lote.push(await api('/visitas', { token: res, cuerpo: { nombre: `Invitado ${i}` } }));
verificar('el límite de 5 visitantes autorizados se hace cumplir (409)', lote.slice(0, 5).filter((r) => r.status === 201).length === 5 && (await api('/visitas', { token: res, cuerpo: { nombre: 'Invitado 6' } })).status === 409);
for (const r of lote) if (r.status === 201) await api(`/visitas/${r.data.id}/cancelar`, { token: res, cuerpo: {} });
const unidadesVis = await api('/visitas/unidades', { token: cel });
verificar('el vigilante lista las unidades del conjunto', unidadesVis.status === 200 && unidadesVis.data.length >= 1);
const residentesVis = await api('/visitas/residentes', { token: cel });
const visitado = (residentesVis.data as any[])?.find((r) => r.nombre === 'Residente Demo');
verificar('el vigilante lista los residentes para elegir a quién visitan', residentesVis.status === 200 && !!visitado && !!visitado.unidad, JSON.stringify(residentesVis.data).slice(0, 100));
verificar('el residente no lista residentes para visitas (403)', (await api('/visitas/residentes', { token: res })).status === 403);
const sol = await api('/visitas/porteria', { token: cel, cuerpo: { residente_id: visitado.id, nombre: 'Repartidor Sin Aviso', documento: '99887766' } });
verificar('el vigilante pide autorización al residente que van a visitar', sol.status === 201 && sol.data.estado === 'solicitada' && sol.data.origen === 'porteria' && sol.data.residente === 'Residente Demo' && !sol.data.entrada_en, JSON.stringify(sol.data));
verificar('el visitante no entra mientras el residente no responda (409)', (await api(`/visitas/${sol.data.id}/entrada`, { token: cel, cuerpo: {} })).status === 409);
verificar('el vigilante ve la solicitud esperando respuesta', ((await api('/visitas', { token: cel })).data as any[])[0]?.id === sol.data.id);
verificar('el residente ve la solicitud pendiente', ((await api('/visitas/mias', { token: res })).data as any[]).some((v) => v.id === sol.data.id && v.estado === 'solicitada'));
verificar('el vigilante no responde por el residente (403)', (await api(`/visitas/${sol.data.id}/responder`, { token: cel, cuerpo: { decision: 'autorizar' } })).status === 403);
verificar('la administración no responde por el residente (403)', (await api(`/visitas/${sol.data.id}/responder`, { token: admin, cuerpo: { decision: 'autorizar' } })).status === 403);
if (otro) verificar('otro residente, aunque sea de otra unidad, no responde (403)', (await api(`/visitas/${sol.data.id}/responder`, { token: otro, cuerpo: { decision: 'autorizar' } })).status === 403);
verificar('una decisión inválida es rechazada (400)', (await api(`/visitas/${sol.data.id}/responder`, { token: res, cuerpo: { decision: 'quizas' } })).status === 400);
verificar('una solicitud inexistente da 404', (await api('/visitas/99999999/responder', { token: res, cuerpo: { decision: 'rechazar' } })).status === 404);
const rechazo = await api(`/visitas/${sol.data.id}/responder`, { token: res, cuerpo: { decision: 'rechazar' } });
verificar('el residente rechaza al visitante', rechazo.status === 200 && rechazo.data.estado === 'rechazada', JSON.stringify(rechazo.data));
verificar('un visitante rechazado no puede entrar (409)', (await api(`/visitas/${sol.data.id}/entrada`, { token: cel, cuerpo: {} })).status === 409);
verificar('responder dos veces la misma solicitud da 409', (await api(`/visitas/${sol.data.id}/responder`, { token: res, cuerpo: { decision: 'autorizar' } })).status === 409);
verificar('el vigilante ve la respuesta rechazada', ((await api('/visitas', { token: cel })).data as any[]).some((v) => v.id === sol.data.id && v.estado === 'rechazada'));
const sol2 = await api('/visitas/porteria', { token: cel, cuerpo: { residente_id: visitado.id, nombre: 'Tía Marta', placa: 'abc123' } });
const aut = await api(`/visitas/${sol2.data.id}/responder`, { token: res, cuerpo: { decision: 'autorizar' } });
verificar('el residente autoriza al visitante en el momento', aut.status === 200 && aut.data.estado === 'autorizada', JSON.stringify(aut.data));
const entradaSol = await api(`/visitas/${sol2.data.id}/entrada`, { token: cel, cuerpo: {} });
verificar('tras la autorización el vigilante registra la entrada', entradaSol.status === 200 && entradaSol.data.estado === 'dentro', JSON.stringify(entradaSol.data));
verificar('el vigilante registra la salida de la visita solicitada', (await api(`/visitas/${sol2.data.id}/salida`, { token: cel, cuerpo: {} })).data?.estado === 'finalizada');
verificar('pedir autorización para un residente inexistente da 404', (await api('/visitas/porteria', { token: cel, cuerpo: { residente_id: 99999999, nombre: 'Nadie Existe' } })).status === 404);
verificar('el residente no pide autorizaciones en portería (403)', (await api('/visitas/porteria', { token: res, cuerpo: { residente_id: visitado.id, nombre: 'Nadie Existe' } })).status === 403);
verificar('una solicitud sin nombre es rechazada (400)', (await api('/visitas/porteria', { token: cel, cuerpo: { residente_id: visitado.id, nombre: 'A' } })).status === 400);
const pendientes: any[] = [];
for (let i = 1; i <= 3; i++) pendientes.push(await api('/visitas/porteria', { token: cel, cuerpo: { residente_id: visitado.id, nombre: `Visitante ${i}` } }));
verificar('un residente no puede tener más de 3 solicitudes pendientes (409)', pendientes.every((r) => r.status === 201) && (await api('/visitas/porteria', { token: cel, cuerpo: { residente_id: visitado.id, nombre: 'Visitante 4' } })).status === 409);
for (const r of pendientes) if (r.status === 201) await api(`/visitas/${r.data.id}/responder`, { token: res, cuerpo: { decision: 'rechazar' } });

// ---- Chat entre residente y vigilante
const m1 = await api('/chat/porteria/mi', { token: res, cuerpo: { cuerpo: 'Buenas, voy llegando con un domicilio' } });
verificar('el residente escribe a portería', m1.status === 201 && m1.data.rol === 'residente', JSON.stringify(m1.data));
verificar('los identificadores del chat llegan como número y no como texto', typeof m1.data.id === 'number' && ((await api('/chat/porteria/mi', { token: res })).data as any[]).every((m) => typeof m.id === 'number'));
const hilos = await api('/chat/porteria/hilos', { token: cel });
const hiloRes = (hilos.data as any[])?.find((h) => h.nombre === 'Residente Demo');
verificar('el vigilante ve la conversación con el residente', hilos.status === 200 && !!hiloRes && !!hiloRes.ultimo, JSON.stringify(hilos.data).slice(0, 100));
verificar('el residente no ve la lista de conversaciones (403)', (await api('/chat/porteria/hilos', { token: res })).status === 403);
const m2 = await api(`/chat/porteria/${hiloRes.residente_id}`, { token: cel, cuerpo: { cuerpo: 'Listo, ya abro el portón' } });
verificar('el vigilante responde al residente', m2.status === 201 && m2.data.rol === 'vigilante', JSON.stringify(m2.data));
const hilo = (await api('/chat/porteria/mi', { token: res })).data as any[];
verificar('el residente ve la conversación completa en orden', hilo.length >= 2 && hilo.at(-1).id === m2.data.id && hilo.at(-2).id === m1.data.id);
const nuevos = (await api(`/chat/porteria/${hiloRes.residente_id}?desde=${m1.data.id}`, { token: cel })).data as any[];
verificar('el parámetro desde devuelve solo mensajes nuevos', nuevos.length >= 1 && nuevos.every((m) => m.id > m1.data.id) && nuevos[0].id === m2.data.id);
if (otro) verificar('otro residente no lee la conversación ajena (403)', (await api(`/chat/porteria/${hiloRes.residente_id}`, { token: otro })).status === 403);
verificar('un mensaje vacío es rechazado (400)', (await api('/chat/porteria/mi', { token: res, cuerpo: { cuerpo: '   ' } })).status === 400);
verificar('un mensaje demasiado largo es rechazado (400)', (await api('/chat/porteria/mi', { token: res, cuerpo: { cuerpo: 'x'.repeat(1001) } })).status === 400);
verificar('el vigilante no escribe a quien no es residente (404)', (await api(`/chat/porteria/${(await api('/auth/me', { token: admin })).data.id}`, { token: cel, cuerpo: { cuerpo: 'hola' } })).status === 404);

// ---- El chat ya no tiene canal de comunidad
verificar('el canal de comunidad ya no existe (404)', (await api('/chat/comunidad', { token: res })).status === 404);
verificar('no se puede escribir en el canal de comunidad (404)', (await api('/chat/comunidad', { token: res, cuerpo: { cuerpo: 'hola' } })).status === 404);
verificar('el chat de portería exige sesión (401)', (await api('/chat/porteria/mi')).status === 401);

// ---- Paquetes y domicilios
const unidadPaq = unidadesVis.data[0];
const paq = await api('/paquetes', { token: cel, cuerpo: { unidad_id: unidadPaq.id, tipo: 'domicilio', descripcion: 'Rappi' } });
verificar('el vigilante registra un domicilio recibido', paq.status === 201 && paq.data.estado === 'por_recoger' && paq.data.tipo === 'domicilio', JSON.stringify(paq.data));
verificar('la administración no registra paquetes (403)', (await api('/paquetes', { token: admin, cuerpo: { unidad_id: unidadPaq.id } })).status === 403);
verificar('el residente no registra paquetes (403)', (await api('/paquetes', { token: res, cuerpo: { unidad_id: unidadPaq.id } })).status === 403);
verificar('un tipo de paquete inválido es rechazado (400)', (await api('/paquetes', { token: cel, cuerpo: { unidad_id: unidadPaq.id, tipo: 'mascota' } })).status === 400);
verificar('registrar un paquete en una unidad inexistente da 404', (await api('/paquetes', { token: cel, cuerpo: { unidad_id: 99999999 } })).status === 404);
const misPaq = (await api('/paquetes/mios', { token: res })).data as any[];
verificar('el residente de la unidad ve el paquete por recoger', Array.isArray(misPaq) && (misPaq.some((p) => p.id === paq.data.id) || unidadPaq.id !== (await api('/auth/me', { token: res })).data.unidad_id));
verificar('el vigilante ve los paquetes del conjunto', ((await api('/paquetes', { token: cel })).data as any[]).some((p) => p.id === paq.data.id));
verificar('la administración no gestiona la lista de paquetes (403)', (await api('/paquetes', { token: admin })).status === 403);
verificar('el residente no ve la lista general de paquetes (403)', (await api('/paquetes', { token: res })).status === 403);
verificar('la administración no entrega paquetes (403)', (await api(`/paquetes/${paq.data.id}/entregar`, { token: admin, cuerpo: {} })).status === 403);
const entregado = await api(`/paquetes/${paq.data.id}/entregar`, { token: cel, cuerpo: { entregado_a: 'Residente Demo' } });
verificar('el vigilante entrega el paquete', entregado.status === 200 && entregado.data.estado === 'entregado' && entregado.data.entregado_a === 'Residente Demo' && !!entregado.data.entregado_en, JSON.stringify(entregado.data));
verificar('entregar dos veces el mismo paquete da 409', (await api(`/paquetes/${paq.data.id}/entregar`, { token: cel, cuerpo: {} })).status === 409);
verificar('entregar un paquete inexistente da 404', (await api('/paquetes/99999999/entregar', { token: cel, cuerpo: {} })).status === 404);
verificar('un identificador no numérico de paquete da 400', (await api('/paquetes/abc/entregar', { token: cel, cuerpo: {} })).status === 400);

// ---- Incidencias
const zonasInc = (await api('/zonas', { token: res })).data as any[];
const inc = await api('/incidencias', { token: res, cuerpo: { zona_id: zonasInc[0].id, descripcion: 'La bomba de la piscina hace mucho ruido', gravedad: 'alta' } });
verificar('el residente reporta una incidencia en una zona', inc.status === 201 && inc.data.estado === 'registrada' && inc.data.gravedad === 'alta' && !!inc.data.zona, JSON.stringify(inc.data));
verificar('una descripción muy corta es rechazada (400)', (await api('/incidencias', { token: res, cuerpo: { descripcion: 'mal' } })).status === 400);
verificar('una gravedad inválida es rechazada (400)', (await api('/incidencias', { token: res, cuerpo: { descripcion: 'Algo se dañó', gravedad: 'extrema' } })).status === 400);
verificar('una zona inexistente da 404', (await api('/incidencias', { token: res, cuerpo: { zona_id: 99999999, descripcion: 'Algo se dañó' } })).status === 404);
const incCel = await api('/incidencias', { token: cel, cuerpo: { descripcion: 'Luz del parqueadero quemada' } });
verificar('el vigilante también reporta incidencias', incCel.status === 201 && incCel.data.gravedad === 'media', JSON.stringify(incCel.data));
verificar('la administración no reporta incidencias (403)', (await api('/incidencias', { token: admin, cuerpo: { descripcion: 'Algo se dañó' } })).status === 403);
verificar('el residente ve sus incidencias', ((await api('/incidencias/mias', { token: res })).data as any[]).some((i) => i.id === inc.data.id));
verificar('el residente no ve las incidencias de todos (403)', (await api('/incidencias', { token: res })).status === 403);
const colaInc = (await api('/incidencias', { token: admin })).data as any[];
verificar('la administración ve las incidencias con las graves primero', colaInc.some((i) => i.id === inc.data.id) && colaInc.findIndex((i) => i.id === inc.data.id) < colaInc.findIndex((i) => i.id === incCel.data.id));
verificar('el vigilante ve las incidencias del conjunto', ((await api('/incidencias', { token: cel })).data as any[]).some((i) => i.id === inc.data.id));
verificar('el vigilante no gestiona incidencias (403)', (await api(`/incidencias/${inc.data.id}`, { método: 'PUT', token: cel, cuerpo: { estado: 'en_proceso' } })).status === 403);
verificar('cerrar una incidencia sin explicar qué se hizo es rechazado (400)', (await api(`/incidencias/${inc.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'cerrada' } })).status === 400);
verificar('la administración pone la incidencia en proceso', (await api(`/incidencias/${inc.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'en_proceso' } })).data?.estado === 'en_proceso');
const incCerrada = await api(`/incidencias/${inc.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'cerrada', respuesta: 'Se cambió el rodamiento de la bomba.' } });
verificar('la administración cierra la incidencia con una nota', incCerrada.data?.estado === 'cerrada' && !!incCerrada.data.respuesta && !!incCerrada.data.atendido_por, JSON.stringify(incCerrada.data));
verificar('cerrar dos veces la misma incidencia da 409', (await api(`/incidencias/${inc.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'en_proceso' } })).status === 409);
verificar('una incidencia inexistente da 404', (await api('/incidencias/99999999', { método: 'PUT', token: admin, cuerpo: { estado: 'en_proceso' } })).status === 404);
verificar('el residente ve la nota con que se cerró su incidencia', ((await api('/incidencias/mias', { token: res })).data as any[]).find((i) => i.id === inc.data.id)?.respuesta?.includes('rodamiento'));
await api(`/incidencias/${incCel.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'cerrada', respuesta: 'Se reemplazó la bombilla.' } });

// ---- Minuta digital del vigilante
const min = await api('/minuta', { token: cel, cuerpo: { tipo: 'ronda', descripcion: 'Ronda de las 10 p. m.: sin novedades en torres y zonas comunes' } });
verificar('el vigilante anota una ronda en la minuta', min.status === 201 && min.data.tipo === 'ronda' && min.data.autor === 'Celador Demo', JSON.stringify(min.data));
verificar('el residente no escribe en la minuta (403)', (await api('/minuta', { token: res, cuerpo: { descripcion: 'Hola vecinos' } })).status === 403);
verificar('la administración no escribe en la minuta (403)', (await api('/minuta', { token: admin, cuerpo: { descripcion: 'Anotación' } })).status === 403);
verificar('una anotación muy corta es rechazada (400)', (await api('/minuta', { token: cel, cuerpo: { descripcion: 'ok' } })).status === 400);
verificar('un tipo de anotación inválido es rechazado (400)', (await api('/minuta', { token: cel, cuerpo: { tipo: 'chisme', descripcion: 'Anotación de prueba' } })).status === 400);
verificar('la administración lee la minuta', ((await api('/minuta', { token: admin })).data as any[]).some((m) => m.id === min.data.id));
verificar('el vigilante lee la minuta con la más reciente primero', ((await api('/minuta', { token: cel })).data as any[])[0]?.id === min.data.id);
verificar('el residente no lee la minuta (403)', (await api('/minuta', { token: res })).status === 403);
verificar('un rango de días inválido es rechazado (400)', (await api('/minuta?dias=500', { token: cel })).status === 400);

// ---- Comunicados (publica la administración)
const com = await api('/comunicados', { token: admin, cuerpo: { titulo: 'Corte de agua programado', cuerpo: 'Mañana de 8:00 a 12:00 por mantenimiento del tanque.', importante: true } });
verificar('la administración publica un comunicado', com.status === 201 && com.data.importante === true, JSON.stringify(com.data));
verificar('el residente y el vigilante leen el comunicado', ((await api('/comunicados', { token: res })).data as any[]).some((c) => c.id === com.data.id) && ((await api('/comunicados', { token: cel })).data as any[]).some((c) => c.id === com.data.id));
verificar('el residente no publica comunicados (403)', (await api('/comunicados', { token: res, cuerpo: { titulo: 'Spam', cuerpo: 'Spam spam' } })).status === 403);
verificar('el vigilante no publica comunicados (403)', (await api('/comunicados', { token: cel, cuerpo: { titulo: 'Spam', cuerpo: 'Spam spam' } })).status === 403);
verificar('un comunicado sin título es rechazado (400)', (await api('/comunicados', { token: admin, cuerpo: { titulo: '', cuerpo: 'Algo' } })).status === 400);
verificar('la administración elimina el comunicado', (await api(`/comunicados/${com.data.id}`, { método: 'DELETE', token: admin })).status === 204);
verificar('eliminar un comunicado inexistente da 404', (await api(`/comunicados/${com.data.id}`, { método: 'DELETE', token: admin })).status === 404);

// ---- PQRS (las crea el residente y las resuelve la administración)
const pqrs = await api('/pqrs', { token: res, cuerpo: { tipo: 'queja', asunto: 'Ruido en la zona BBQ', descripcion: 'Hubo música alta pasadas las 11 de la noche.' } });
verificar('el residente radica una PQRS', pqrs.status === 201 && pqrs.data.estado === 'registrada', JSON.stringify(pqrs.data));
verificar('una PQRS con tipo inválido es rechazada (400)', (await api('/pqrs', { token: res, cuerpo: { tipo: 'otra', asunto: 'Asunto', descripcion: 'Descripción larga' } })).status === 400);
verificar('la administración no radica PQRS (403)', (await api('/pqrs', { token: admin, cuerpo: { tipo: 'queja', asunto: 'Asunto', descripcion: 'Descripción larga' } })).status === 403);
verificar('la administración ve las PQRS del conjunto', ((await api('/pqrs', { token: admin })).data as any[]).some((p) => p.id === pqrs.data.id));
verificar('el vigilante no ve las PQRS (403)', (await api('/pqrs', { token: cel })).status === 403);
verificar('cerrar sin escribir la respuesta es rechazado (400)', (await api(`/pqrs/${pqrs.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'cerrada' } })).status === 400);
verificar('la administración pone la PQRS en proceso', (await api(`/pqrs/${pqrs.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'en_proceso' } })).data?.estado === 'en_proceso');
verificar('el residente no responde PQRS (403)', (await api(`/pqrs/${pqrs.data.id}`, { método: 'PUT', token: res, cuerpo: { estado: 'cerrada', respuesta: 'Ya' } })).status === 403);
const resuelta = await api(`/pqrs/${pqrs.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'cerrada', respuesta: 'Se envió un recordatorio de horarios a los residentes.' } });
verificar('la administración cierra la PQRS con una respuesta', resuelta.data?.estado === 'cerrada' && !!resuelta.data.respuesta && !!resuelta.data.respondido_por, JSON.stringify(resuelta.data));
verificar('cerrar dos veces la misma PQRS da 409', (await api(`/pqrs/${pqrs.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'en_proceso' } })).status === 409);
verificar('el residente ve la respuesta a su PQRS', ((await api('/pqrs/mias', { token: res })).data as any[]).find((p) => p.id === pqrs.data.id)?.respuesta?.includes('recordatorio'));
verificar('una PQRS inexistente da 404', (await api('/pqrs/99999999', { método: 'PUT', token: admin, cuerpo: { estado: 'en_proceso' } })).status === 404);

// ---- Usuarios y reportes (administración)
const lista = await api('/usuarios', { token: admin });
verificar('la administración lista los usuarios del conjunto', lista.status === 200 && ['administrador', 'vigilante', 'residente'].every((r) => lista.data.some((u: any) => u.rol === r)));
verificar('el residente no lista usuarios (403)', (await api('/usuarios', { token: res })).status === 403);
const correoNuevo = `vigilante${Date.now()}@demo.test`;
const nuevoVig = await api('/usuarios/vigilantes', { token: admin, cuerpo: { nombre: 'Vigilante Nocturno', correo: correoNuevo, password: 'Demo12345!' } });
verificar('la administración da de alta a un vigilante', nuevoVig.status === 201 && nuevoVig.data.rol === 'vigilante', JSON.stringify(nuevoVig.data));
verificar('un correo repetido da 409', (await api('/usuarios/vigilantes', { token: admin, cuerpo: { nombre: 'Otro Vigilante', correo: correoNuevo, password: 'Demo12345!' } })).status === 409);
verificar('una contraseña corta es rechazada (400)', (await api('/usuarios/vigilantes', { token: admin, cuerpo: { nombre: 'Otro Vigilante', correo: 'x@demo.test', password: '123' } })).status === 400);
const tokenVigNuevo = await login(correoNuevo);
verificar('el vigilante nuevo inicia sesión', !!tokenVigNuevo);
verificar('el vigilante nuevo debe cambiar la contraseña temporal antes de operar (403)', (await api('/porton', { token: tokenVigNuevo })).status === 403);
verificar('la administración desactiva al vigilante', (await api(`/usuarios/${nuevoVig.data.id}/estado`, { método: 'PUT', token: admin, cuerpo: { estado: 'inactivo' } })).data?.estado === 'inactivo');
verificar('un usuario inactivo no inicia sesión (401)', (await api('/auth/login', { cuerpo: { correo: correoNuevo, password: 'Demo12345!' } })).status === 401);
verificar('no se puede desactivar a un administrador (404)', (await api(`/usuarios/${(await api('/auth/me', { token: admin })).data.id}/estado`, { método: 'PUT', token: admin, cuerpo: { estado: 'inactivo' } })).status === 404);
const rep = await api('/reportes/resumen?dias=30', { token: admin });
verificar('la administración consulta el reporte de gestión', rep.status === 200 && Array.isArray(rep.data.reservas_por_zona) && Array.isArray(rep.data.ingresos_por_dia) && rep.data.porton && Array.isArray(rep.data.pqrs_por_estado), JSON.stringify(rep.data).slice(0, 120));
verificar('el reporte cuenta los ingresos de visitantes', rep.data.ingresos_por_dia.reduce((s: number, d: any) => s + d.ingresos, 0) >= 2);
verificar('el reporte incluye paquetes e incidencias', !!rep.data.paquetes && rep.data.paquetes.recibidos >= 1 && Array.isArray(rep.data.incidencias_por_estado), JSON.stringify(rep.data.paquetes));
verificar('el vigilante no consulta reportes (403)', (await api('/reportes/resumen', { token: cel })).status === 403);

// ---- Separación de funciones: la administración no opera la portería ni lee chats privados
const visPerm = await api('/visitas', { token: res, cuerpo: { nombre: 'Visitante Permisos' } });
verificar('la administración no valida códigos de visitantes (403)', (await api(`/visitas/codigo/${visPerm.data.codigo}`, { token: admin })).status === 403);
verificar('la administración no registra entradas (403)', (await api(`/visitas/${visPerm.data.id}/entrada`, { token: admin, cuerpo: {} })).status === 403);
verificar('la administración no pide autorizaciones de visitantes (403)', (await api('/visitas/porteria', { token: admin, cuerpo: { residente_id: visitado.id, nombre: 'Nadie Existe' } })).status === 403);
verificar('la administración no lista unidades para portería (403)', (await api('/visitas/unidades', { token: admin })).status === 403);
verificar('la administración no consulta las visitas por atender (403)', (await api('/visitas', { token: admin })).status === 403);
await api(`/visitas/${visPerm.data.id}/cancelar`, { token: res, cuerpo: {} });
verificar('la administración no lee la lista de chats con residentes (403)', (await api('/chat/porteria/hilos', { token: admin })).status === 403);
verificar('la administración no lee la conversación de un residente (403)', (await api(`/chat/porteria/${hiloRes.residente_id}`, { token: admin })).status === 403);
verificar('la administración no escribe en el chat de un residente (403)', (await api(`/chat/porteria/${hiloRes.residente_id}`, { token: admin, cuerpo: { cuerpo: 'hola' } })).status === 403);
verificar('la administración no entrega ni registra paquetes (403)', (await api('/paquetes', { token: admin, cuerpo: { unidad_id: unidadesVis.data[0].id } })).status === 403);
verificar('el vigilante no ve las PQRS ni los reportes ni los usuarios (403)', (await api('/pqrs', { token: cel })).status === 403 && (await api('/reportes/resumen', { token: cel })).status === 403 && (await api('/usuarios', { token: cel })).status === 403);
verificar('el vigilante no gestiona unidades ni invitaciones (403)', (await api('/unidades', { token: cel })).status === 403);
verificar('el residente no ve visitas, ingresos, paquetes ni minuta de otros (403)', (await api('/visitas', { token: res })).status === 403 && (await api('/visitas/registro', { token: res })).status === 403 && (await api('/paquetes', { token: res })).status === 403 && (await api('/minuta', { token: res })).status === 403);
verificar('el residente no ve los avisos del portón de otros (403)', (await api('/porton', { token: res })).status === 403);
if (otro) verificar('otro residente no ve mis avisos del portón ni mis visitas', ((await api('/porton/mios', { token: otro })).data as any[]).every((a) => a.usuario !== 'Residente Demo') && ((await api('/visitas/mias', { token: otro })).data as any[]).every((v) => v.residente !== 'Residente Demo'));

// ================= Lo que la administración sí gestiona
const zonaAdm = await api('/zonas', { token: admin, cuerpo: { nombre: `Coworking ${Date.now()}`, hora_apertura: '07:00', hora_cierre: '21:00' } });
verificar('la administración crea zonas comunes', zonaAdm.status === 201, JSON.stringify(zonaAdm.data));
verificar('la administración edita y pone en mantenimiento una zona', (await api(`/zonas/${zonaAdm.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'mantenimiento', aforo: 12 } })).data?.aforo === 12);
verificar('la administración elimina una zona sin reservas', (await api(`/zonas/${zonaAdm.data.id}`, { método: 'DELETE', token: admin })).status === 204);
verificar('la administración atiende la gestión del conjunto (PQRS, incidencias, minuta y reportes)', (await api('/pqrs', { token: admin })).status === 200 && (await api('/incidencias', { token: admin })).status === 200 && (await api('/minuta', { token: admin })).status === 200 && (await api('/reportes/resumen', { token: admin })).status === 200);

// ================= La administración agrega residentes con contraseña temporal
const unidadAlta = ((await api('/unidades', { token: admin })).data as any[]).at(-1);
const correoAlta = `alta${Date.now()}@demo.test`;
const datosAlta = { nombre: 'Residente De Alta', correo: correoAlta, password: 'Temporal123!', unidad_id: unidadAlta.id };
verificar('el vigilante no agrega residentes (403)', (await api('/usuarios/residentes', { token: cel, cuerpo: datosAlta })).status === 403);
verificar('un residente no agrega residentes (403)', (await api('/usuarios/residentes', { token: res, cuerpo: datosAlta })).status === 403);
verificar('agregar un residente sin unidad es rechazado (400)', (await api('/usuarios/residentes', { token: admin, cuerpo: { nombre: 'Sin Unidad', correo: `x${correoAlta}`, password: 'Temporal123!' } })).status === 400);
verificar('una unidad inexistente da 404', (await api('/usuarios/residentes', { token: admin, cuerpo: { ...datosAlta, unidad_id: 99999999 } })).status === 404);
verificar('una contraseña temporal corta es rechazada (400)', (await api('/usuarios/residentes', { token: admin, cuerpo: { ...datosAlta, password: '1234' } })).status === 400);
const alta = await api('/usuarios/residentes', { token: admin, cuerpo: { ...datosAlta, telefono: '3009998877' } });
verificar('la administración agrega un residente en una unidad', alta.status === 201 && alta.data.rol === 'residente' && alta.data.unidad === unidadAlta.identificador, JSON.stringify(alta.data));
verificar('un correo ya registrado da 409', (await api('/usuarios/residentes', { token: admin, cuerpo: datosAlta })).status === 409);
verificar('la administración no puede registrar el teléfono por el residente', ((await api('/usuarios', { token: admin })).data as any[]).find((u) => u.correo === correoAlta)?.telefono === null);
const entrar = (password: string) => api('/auth/login', { cuerpo: { correo: correoAlta, password } });
const nuevoRes = (await entrar('Temporal123!')).data?.token as string;
const yoNuevo = await api('/auth/me', { token: nuevoRes });
verificar('el residente nuevo entra y la cuenta pide cambiar la contraseña', yoNuevo.status === 200 && yoNuevo.data.cambio_clave_pendiente === true && yoNuevo.data.unidad === unidadAlta.identificador, JSON.stringify(yoNuevo.data));
const bloqueado = await api('/zonas', { token: nuevoRes });
verificar('con la contraseña temporal no puede usar la app (403)', bloqueado.status === 403 && String(bloqueado.data?.error).includes('contraseña'), JSON.stringify(bloqueado.data));
verificar('tampoco puede enviar avisos ni usar el chat (403)', (await api('/porton', { token: nuevoRes, cuerpo: {} })).status === 403 && (await api('/chat/porteria/mi', { token: nuevoRes })).status === 403);
const cambiar = (cuerpo: unknown, t = nuevoRes) => api('/auth/me/password', { método: 'PUT', token: t, cuerpo });
verificar('una contraseña actual equivocada responde 400 y no cierra la sesión', (await cambiar({ actual: 'otra-clave', nueva: 'MiClaveNueva1' })).status === 400);
verificar('la contraseña nueva debe ser distinta (400)', (await cambiar({ actual: 'Temporal123!', nueva: 'Temporal123!' })).status === 400);
verificar('la contraseña nueva debe tener 8 caracteres (400)', (await cambiar({ actual: 'Temporal123!', nueva: 'corta' })).status === 400);
verificar('cambiar la contraseña exige sesión (401)', (await api('/auth/me/password', { método: 'PUT', cuerpo: { actual: 'a', nueva: 'MiClaveNueva1' } })).status === 401);
const otraSesion = (await entrar('Temporal123!')).data?.token as string;
const cambio = await cambiar({ actual: 'Temporal123!', nueva: 'MiClaveNueva1' });
const conPropia = cambio.data?.token as string;
verificar('el residente crea su propia contraseña y recibe un pase nuevo', cambio.status === 200 && !!conPropia, JSON.stringify(cambio.data));
verificar('al cambiarla se cierran las demás sesiones de la cuenta (401)', (await api('/auth/me', { token: otraSesion })).status === 401 && (await api('/auth/me', { token: nuevoRes })).status === 401);
verificar('después ya puede usar la app', (await api('/zonas', { token: conPropia })).status === 200 && (await api('/auth/me', { token: conPropia })).data.cambio_clave_pendiente === false);
verificar('la contraseña temporal deja de funcionar y la nueva sí', (await entrar('Temporal123!')).status === 401 && (await entrar('MiClaveNueva1')).status === 200);

// ================= Restablecimiento de contraseña por la administración
const idAlta = ((await api('/usuarios', { token: admin })).data as any[]).find((u) => u.correo === correoAlta).id;
const reset = (id: number | string, t: string = admin) => api(`/usuarios/${id}/restablecer-clave`, { token: t, cuerpo: {} });
verificar('el residente no restablece contraseñas (403)', (await reset(idAlta, res)).status === 403);
verificar('el vigilante no restablece contraseñas (403)', (await reset(idAlta, cel)).status === 403);
verificar('restablecer sin sesión da 401', (await api(`/usuarios/${idAlta}/restablecer-clave`, { cuerpo: {} })).status === 401);
verificar('no se restablece desde la app la cuenta de un administrador (404)', (await reset((await api('/auth/me', { token: admin })).data.id)).status === 404);
verificar('una cuenta inexistente da 404', (await reset(99999999)).status === 404);
verificar('un identificador no numérico da 400', (await reset('abc')).status === 400);
await api('/dispositivos', { token: conPropia, cuerpo: { token: 'telefono-perdido-' + 'z'.repeat(40) + Date.now(), plataforma: 'android' } });
const restablecida = await reset(idAlta);
const temporal = restablecida.data?.password as string;
verificar('la administración restablece la contraseña y recibe una temporal de un solo uso', restablecida.status === 200 && /^[A-Za-z2-9]{10}$/.test(temporal ?? '') && new Date(restablecida.data.vence).getTime() - Date.now() > 23 * 3600000, JSON.stringify({ ...restablecida.data, password: temporal ? '(oculta)' : null }));
verificar('las sesiones abiertas antes del restablecimiento dejan de valer (401)', (await api('/auth/me', { token: conPropia })).status === 401);
verificar('la contraseña olvidada deja de funcionar', (await entrar('MiClaveNueva1')).status === 401);
const conTemporal = (await entrar(temporal)).data?.token as string;
verificar('con la temporal entra, pero debe cambiarla antes de usar la app', !!conTemporal && (await api('/auth/me', { token: conTemporal })).data.cambio_clave_pendiente === true && (await api('/zonas', { token: conTemporal })).status === 403);
const nueva2 = await cambiar({ actual: temporal, nueva: 'OtraClave2026' }, conTemporal);
verificar('crea una contraseña nueva y vuelve a usar la app', nueva2.status === 200 && (await api('/zonas', { token: nueva2.data.token })).status === 200);
verificar('la temporal ya no sirve después de cambiarla', (await entrar(temporal)).status === 401);
verificar('le queda un aviso de que la cuenta fue restablecida', ((await api('/notificaciones', { token: nueva2.data.token })).data as any[]).some((n) => n.tipo === 'cuenta'));
verificar('conserva su unidad y sus datos', (await api('/auth/me', { token: nueva2.data.token })).data.unidad === unidadAlta.identificador);
await api(`/usuarios/${idAlta}/estado`, { método: 'PUT', token: admin, cuerpo: { estado: 'inactivo' } });
verificar('no se restablece una cuenta desactivada (409)', (await reset(idAlta)).status === 409);

// ================= Llamada a portería, teléfonos y habeas data
const porteria0 = await api('/contacto/porteria', { token: res });
verificar('todos pueden consultar el número de portería', porteria0.status === 200 && 'telefono' in porteria0.data, JSON.stringify(porteria0.data));
verificar('el residente no cambia el número de portería (403)', (await api('/contacto/porteria', { método: 'PUT', token: res, cuerpo: { telefono: '6051234567' } })).status === 403);
verificar('el vigilante no cambia el número de portería (403)', (await api('/contacto/porteria', { método: 'PUT', token: cel, cuerpo: { telefono: '6051234567' } })).status === 403);
verificar('un número de portería inválido es rechazado (400)', (await api('/contacto/porteria', { método: 'PUT', token: admin, cuerpo: { telefono: 'llámame' } })).status === 400);
verificar('la administración define el número de portería (se normaliza)', (await api('/contacto/porteria', { método: 'PUT', token: admin, cuerpo: { telefono: '(605) 123-4567' } })).data?.telefono === '6051234567');
verificar('el residente ve el número nuevo también en su perfil', (await api('/auth/me', { token: res })).data.telefono_porteria === '6051234567');
verificar('la administración puede quitar el número de portería', (await api('/contacto/porteria', { método: 'PUT', token: admin, cuerpo: { telefono: '' } })).data?.telefono === null);
await api('/contacto/porteria', { método: 'PUT', token: admin, cuerpo: { telefono: '6050000000' } });
verificar('guardar el teléfono sin autorizar su uso es rechazado (400)', (await api('/auth/me/telefono', { método: 'PUT', token: res, cuerpo: { telefono: '3001112233' } })).status === 400);
verificar('el residente guarda su teléfono autorizando su uso', (await api('/auth/me/telefono', { método: 'PUT', token: res, cuerpo: { telefono: '300 111 2233', autoriza: true } })).data?.telefono === '3001112233');
verificar('el vigilante no registra un teléfono personal (403)', (await api('/auth/me/telefono', { método: 'PUT', token: cel, cuerpo: { telefono: '3001112233', autoriza: true } })).status === 403);
const directorio = await api('/contacto/residentes', { token: cel });
const miFicha = (directorio.data as any[])?.find((r) => r.nombre === 'Residente Demo');
verificar('el vigilante ve en el directorio el teléfono autorizado', directorio.status === 200 && miFicha?.telefono === '3001112233', JSON.stringify(miFicha));
verificar('las conversaciones del vigilante incluyen el teléfono para llamar', ((await api('/chat/porteria/hilos', { token: cel })).data as any[]).some((h) => h.nombre === 'Residente Demo' && h.telefono === '3001112233'));
verificar('el residente no ve el directorio de teléfonos (403)', (await api('/contacto/residentes', { token: res })).status === 403);
verificar('la administración no usa el directorio de portería (403)', (await api('/contacto/residentes', { token: admin })).status === 403);
if (otro) verificar('otro residente no obtiene teléfonos de nadie (403)', (await api('/contacto/residentes', { token: otro })).status === 403);
verificar('el residente puede borrar su teléfono sin más requisitos', (await api('/auth/me/telefono', { método: 'PUT', token: res, cuerpo: { telefono: '' } })).data?.telefono === null);
verificar('sin teléfono autorizado, el directorio no lo muestra', ((await api('/contacto/residentes', { token: cel })).data as any[]).find((r) => r.nombre === 'Residente Demo')?.telefono === null);
await api('/auth/me/telefono', { método: 'PUT', token: res, cuerpo: { telefono: '3000000000', autoriza: true } });

// ================= Registro con teléfono y desactivación de un residente
const unidadesAdm = (await api('/unidades', { token: admin })).data as any[];
const invTel = await api(`/unidades/${unidadesAdm.at(-1).id}/invitacion`, { token: admin, cuerpo: {} });
const correoTmp = `temporal${Date.now()}@demo.test`;
const datosTmp = { nombre: 'Residente Temporal', correo: correoTmp, password: 'Demo12345!', codigo: invTel.data.codigo, telefono: '3005556677' };
verificar('registrarse con teléfono sin autorizar es rechazado (400)', (await api('/auth/registro', { cuerpo: datosTmp })).status === 400);
const regTmp = await api('/auth/registro', { cuerpo: { ...datosTmp, autoriza_telefono: true } });
const tmp = regTmp.data?.token as string;
verificar('registrarse autorizando guarda el teléfono', regTmp.status === 201 && (await api('/auth/me', { token: tmp })).data.telefono === '3005556677', JSON.stringify(regTmp.data));
const idTmp = ((await api('/usuarios', { token: admin })).data as any[]).find((u) => u.correo === correoTmp)?.id;
const visTmp = await api('/visitas', { token: tmp, cuerpo: { nombre: 'Invitado Temporal' } });
const avisoTmp = await api('/porton', { token: tmp, cuerpo: {} });
const canchaTmp = ((await api('/zonas', { token: tmp })).data as any[]).find((z) => z.nombre === 'Cancha Múltiple');
const diaTmp = 310 + Math.floor(Math.random() * 70);
const resTmp = await api('/reservas', { token: tmp, cuerpo: { zona_id: canchaTmp.id, inicio: futuro('10:00', diaTmp), fin: futuro('11:00', diaTmp) } });
verificar('el residente temporal tiene visita, aviso y reserva vigentes', visTmp.status === 201 && avisoTmp.status === 201 && resTmp.status === 201, JSON.stringify([visTmp.status, avisoTmp.status, resTmp.data]));
const baja = await api(`/usuarios/${idTmp}/estado`, { método: 'PUT', token: admin, cuerpo: { estado: 'inactivo' } });
verificar('al desactivarlo se anulan sus accesos y reservas', baja.data?.anulado?.visitas === 1 && baja.data.anulado.avisos_porton === 1 && baja.data.anulado.reservas === 1, JSON.stringify(baja.data));
verificar('el código QR de un residente desactivado ya no sirve', (await api(`/visitas/${visTmp.data.id}/entrada`, { token: cel, cuerpo: {} })).status === 409);
verificar('su aviso de portón ya no está pendiente', !((await api('/porton', { token: cel })).data as any[]).some((a) => a.id === avisoTmp.data.id && a.estado === 'pendiente'));
verificar('su sesión deja de funcionar de inmediato (401)', (await api('/auth/me', { token: tmp })).status === 401);

// ================= Notificaciones en tiempo real
const punto = async (t: string) => (await api('/notificaciones/resumen', { token: t })).data;
const nuevas = async (t: string, desde: number) => (await api(`/notificaciones/resumen?desde=${desde}`, { token: t })).data.nuevas as any[];
const bandeja = async (t: string) => (await api('/notificaciones', { token: t })).data as any[];
const pRes = await punto(res);
verificar('la primera consulta no repite avisos antiguos', Array.isArray(pRes.nuevas) && pRes.nuevas.length === 0 && typeof pRes.ultimo_id === 'number', JSON.stringify(pRes));
verificar('la bandeja exige sesión (401)', (await api('/notificaciones')).status === 401);

let pCel = await punto(cel);
const avN = await api('/porton', { token: res, cuerpo: { tipo_vehiculo: 'moto' } });
verificar('el vigilante recibe al instante el aviso del portón', (await nuevas(cel, pCel.ultimo_id)).some((n) => n.tipo === 'aviso_porton' && n.referencia_id === avN.data.id));
let base = (await punto(res)).ultimo_id;
await api(`/porton/${avN.data.id}/atender`, { token: cel, cuerpo: {} });
verificar('al abrir, al residente le llega "Portón abierto"', (await nuevas(res, base)).some((n) => n.tipo === 'porton' && n.titulo === 'Portón abierto' && n.referencia_id === avN.data.id));
verificar('el aviso del vigilante queda resuelto al abrir', !(await bandeja(cel)).some((n) => n.tipo === 'aviso_porton' && n.referencia_id === avN.data.id && !n.leida));
const avC = await api('/porton', { token: res, cuerpo: {} });
pCel = await punto(cel);
await api(`/porton/${avC.data.id}/cancelar`, { token: res, cuerpo: {} });
verificar('si el residente cancela, el vigilante se entera y el pendiente se resuelve', (await nuevas(cel, pCel.ultimo_id)).some((n) => n.tipo === 'porton_cancelado') && !(await bandeja(cel)).some((n) => n.tipo === 'aviso_porton' && n.referencia_id === avC.data.id && !n.leida));

base = (await punto(res)).ultimo_id;
const solN = await api('/visitas/porteria', { token: cel, cuerpo: { residente_id: visitado.id, nombre: 'Domiciliario En Puerta' } });
verificar('la solicitud de visita le llega al residente', (await nuevas(res, base)).some((n) => n.tipo === 'visita_solicitud' && n.referencia_id === solN.data.id));
const visPort = ((await api('/visitas', { token: cel })).data as any[]).find((v) => v.id === solN.data.id);
verificar('el vigilante tiene el teléfono para llamar si no responde', visPort?.residente_telefono === '3000000000', JSON.stringify(visPort));
pCel = await punto(cel);
await api(`/visitas/${solN.data.id}/responder`, { token: res, cuerpo: { decision: 'autorizar' } });
verificar('al responder, el vigilante recibe la respuesta', (await nuevas(cel, pCel.ultimo_id)).some((n) => n.tipo === 'visita_respuesta' && n.titulo === 'Visita autorizada'));
verificar('la solicitud respondida deja de estar pendiente en la bandeja', !(await bandeja(res)).some((n) => n.tipo === 'visita_solicitud' && n.referencia_id === solN.data.id && !n.leida));
base = (await punto(res)).ultimo_id;
await api(`/visitas/${solN.data.id}/entrada`, { token: cel, cuerpo: {} });
await api(`/visitas/${solN.data.id}/salida`, { token: cel, cuerpo: {} });
const deVisita = (await nuevas(res, base)).filter((n) => n.tipo === 'visita' && n.referencia_id === solN.data.id);
verificar('el residente se entera de la salida y no se acumulan avisos repetidos', deVisita.length === 1 && deVisita[0].titulo === 'Tu visita salió', JSON.stringify(deVisita));

// ----- Domiciliario: llega, el residente avisa que baja y se entrega
const miUnidad = ((await api('/visitas/unidades', { token: cel })).data as any[]).find((u) => u.identificador === 'Torre 1 - Apto 101');
base = (await punto(res)).ultimo_id;
const dom = await api('/paquetes', { token: cel, cuerpo: { unidad_id: miUnidad.id, tipo: 'domicilio', descripcion: 'Pizza' } });
verificar('el residente recibe "Tu domicilio llegó"', (await nuevas(res, base)).some((n) => n.titulo === 'Tu domicilio llegó' && n.referencia_id === dom.data.id));
pCel = await punto(cel);
const voy = await api(`/paquetes/${dom.data.id}/voy`, { token: res, cuerpo: {} });
verificar('el residente avisa que ya baja por su domicilio', voy.status === 200 && !!voy.data.en_camino_en, JSON.stringify(voy.data));
verificar('el vigilante se entera de que ya bajan', (await nuevas(cel, pCel.ultimo_id)).some((n) => n.tipo === 'paquete_en_camino'));
verificar('no se puede avisar dos veces seguidas (409)', (await api(`/paquetes/${dom.data.id}/voy`, { token: res, cuerpo: {} })).status === 409);
if (otro) verificar('un residente de otra unidad no avisa por un paquete ajeno (403)', (await api(`/paquetes/${dom.data.id}/voy`, { token: otro, cuerpo: {} })).status === 403);
verificar('el vigilante no usa el aviso del residente (403)', (await api(`/paquetes/${dom.data.id}/voy`, { token: cel, cuerpo: {} })).status === 403);
base = (await punto(res)).ultimo_id;
await api(`/paquetes/${dom.data.id}/entregar`, { token: cel, cuerpo: { entregado_a: 'Vecina' } });
verificar('la unidad recibe la confirmación de entrega y a quién se entregó', (await nuevas(res, base)).some((n) => n.titulo === 'Domicilio entregado' && n.mensaje.includes('Vecina')));
verificar('ya entregado, no se puede avisar que va en camino (409)', (await api(`/paquetes/${dom.data.id}/voy`, { token: res, cuerpo: {} })).status === 409);

// ----- Chat: contador y lectura
await api('/chat/porteria/mi', { token: res, cuerpo: { cuerpo: 'Primer mensaje sin leer' } });
await api('/chat/porteria/mi', { token: res, cuerpo: { cuerpo: 'Segundo mensaje sin leer' } });
const miHilo = async () => ((await api('/chat/porteria/hilos', { token: cel })).data as any[]).find((h) => h.nombre === 'Residente Demo');
const hiloNuevo = await miHilo();
verificar('la conversación del residente aparece como no leída', hiloNuevo?.sin_leer === true);
verificar('varios mensajes de un mismo hilo cuentan como un solo aviso', (await bandeja(cel)).filter((n) => n.tipo === 'chat' && n.referencia_id === hiloNuevo.residente_id && !n.leida).length === 1);
await api(`/chat/porteria/${hiloNuevo.residente_id}`, { token: cel });
verificar('al abrir la conversación queda como leída', (await miHilo())?.sin_leer === false);

// ----- Avisos para la administración
let pAdm = await punto(admin);
const pqN = await api('/pqrs', { token: res, cuerpo: { tipo: 'sugerencia', asunto: 'Más iluminación', descripcion: 'En el parqueadero de visitantes' } });
verificar('la administración se entera de una PQRS nueva', (await nuevas(admin, pAdm.ultimo_id)).some((n) => n.tipo === 'pqrs' && n.referencia_id === pqN.data.id));
await api(`/pqrs/${pqN.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'cerrada', respuesta: 'Se instalarán dos lámparas.' } });
verificar('al responder, su aviso pendiente se resuelve', !(await bandeja(admin)).some((n) => n.tipo === 'pqrs' && n.referencia_id === pqN.data.id && !n.leida));
pAdm = await punto(admin);
await api('/minuta', { token: cel, cuerpo: { tipo: 'novedad', descripcion: 'Novedad sin urgencia' } });
verificar('una novedad común de la minuta no molesta a la administración', !(await nuevas(admin, pAdm.ultimo_id)).some((n) => n.tipo === 'minuta'));
await api('/minuta', { token: cel, cuerpo: { tipo: 'alerta', descripcion: 'Persona sospechosa en el parqueadero' } });
verificar('una alerta de la minuta llega a la administración', (await nuevas(admin, pAdm.ultimo_id)).some((n) => n.tipo === 'minuta'));

// ----- Comunicado retirado
const comN = await api('/comunicados', { token: admin, cuerpo: { titulo: 'Aviso de prueba', cuerpo: 'Se retirará enseguida' } });
verificar('el comunicado llega a la bandeja del residente', (await bandeja(res)).some((n) => n.tipo === 'comunicado' && n.referencia_id === comN.data.id));
await api(`/comunicados/${comN.data.id}`, { método: 'DELETE', token: admin });
verificar('un comunicado retirado desaparece de las bandejas', !(await bandeja(res)).some((n) => n.tipo === 'comunicado' && n.referencia_id === comN.data.id));

// ----- Zona fuera de servicio y reserva retirada
const zonaN = await api('/zonas', { token: cel, cuerpo: { nombre: `Sauna ${Date.now()}`, hora_apertura: '07:00', hora_cierre: '20:00' } });
const resN = await api('/reservas', { token: res, cuerpo: { zona_id: zonaN.data.id, inicio: futuro('09:00', 20), fin: futuro('10:00', 20) } });
base = (await punto(res)).ultimo_id;
await api(`/zonas/${zonaN.data.id}`, { método: 'PUT', token: cel, cuerpo: { estado: 'mantenimiento' } });
verificar('quien tiene reserva se entera de que la zona entró en mantenimiento', (await nuevas(res, base)).some((n) => n.tipo === 'zona' && n.titulo === 'Zona en mantenimiento'), JSON.stringify(resN.data));
base = (await punto(res)).ultimo_id;
await api(`/reservas/${resN.data.id}/cancelar`, { token: cel, cuerpo: {} });
verificar('si portería cancela la reserva, el residente se entera', (await nuevas(res, base)).some((n) => n.tipo === 'reserva' && n.titulo === 'Tu reserva fue retirada'));
await api(`/zonas/${zonaN.data.id}`, { método: 'DELETE', token: cel });

// ----- Lectura y privacidad de la bandeja
const misAvisosBandeja = await bandeja(res);
if (otro) {
  verificar('un residente no ve las notificaciones de otro', !(await bandeja(otro)).some((n) => misAvisosBandeja.some((m) => m.id === n.id)));
  await api('/notificaciones/leer', { token: res, cuerpo: { todas: false, tipo: 'ninguno' } });
  const intento = await api('/notificaciones/leer', { token: otro, cuerpo: { ids: misAvisosBandeja.slice(0, 5).map((n) => n.id) } });
  verificar('nadie marca como leídas las notificaciones de otra persona', intento.data?.marcadas === 0, JSON.stringify(intento.data));
}
verificar('marcar sin indicar cuáles es rechazado (400)', (await api('/notificaciones/leer', { token: res, cuerpo: {} })).status === 400);
await api('/notificaciones/leer', { token: res, cuerpo: { todas: true } });
verificar('marcar todas deja el contador en cero', (await punto(res)).sin_leer === 0);
verificar('se pueden vaciar las ya leídas', (await api('/notificaciones/leidas', { método: 'DELETE', token: res })).status === 200 && (await bandeja(res)).every((n) => !n.leida));

// ================= Todas las opciones de cada formulario se pueden guardar (no solo la primera)
for (const tipo of ['paquete', 'domicilio', 'correspondencia']) {
  const r = await api('/paquetes', { token: cel, cuerpo: { unidad_id: miUnidad.id, tipo } });
  verificar(`se registra un envío de tipo "${tipo}"`, r.status === 201 && r.data.tipo === tipo, JSON.stringify(r.data));
  if (r.status === 201) await api(`/paquetes/${r.data.id}/entregar`, { token: cel, cuerpo: {} });
}
for (const tipo of ['novedad', 'ronda', 'alerta']) {
  verificar(`se anota en la minuta una entrada de tipo "${tipo}"`, (await api('/minuta', { token: cel, cuerpo: { tipo, descripcion: `Anotación de tipo ${tipo}` } })).status === 201);
}
for (const tipo of ['peticion', 'queja', 'reclamo', 'sugerencia']) {
  const r = await api('/pqrs', { token: res, cuerpo: { tipo, asunto: `Solicitud ${tipo}`, descripcion: 'Descripción de la solicitud de prueba' } });
  verificar(`se radica una PQRS de tipo "${tipo}"`, r.status === 201, JSON.stringify(r.data));
  if (r.status === 201) await api(`/pqrs/${r.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'cerrada', respuesta: 'Cerrada por la prueba.' } });
}
for (const tipo_vehiculo of ['carro', 'moto', 'otro']) {
  const r = await api('/porton', { token: res, cuerpo: { tipo_vehiculo } });
  verificar(`se avisa la llegada en "${tipo_vehiculo}"`, r.status === 201, JSON.stringify(r.data));
  if (r.status === 201) await api(`/porton/${r.data.id}/cancelar`, { token: res, cuerpo: {} });
}
for (const gravedad of ['baja', 'media', 'alta']) {
  const r = await api('/incidencias', { token: res, cuerpo: { descripcion: `Incidencia de gravedad ${gravedad}`, gravedad } });
  verificar(`se reporta una incidencia de gravedad "${gravedad}"`, r.status === 201, JSON.stringify(r.data));
  if (r.status === 201) await api(`/incidencias/${r.data.id}`, { método: 'PUT', token: admin, cuerpo: { estado: 'cerrada', respuesta: 'Cerrada por la prueba.' } });
}

// ================= Pantalla de inicio de cada perfil
const iRes = (await api('/inicio', { token: res })).data;
verificar('el inicio del residente reúne sus pendientes', iRes.rol === 'residente' && Array.isArray(iRes.solicitudes) && Array.isArray(iRes.paquetes) && 'proxima_reserva' in iRes && !!iRes.telefono_porteria, JSON.stringify(iRes).slice(0, 120));
verificar('el inicio del residente no incluye datos de portería', !('avisos' in iRes) && !('por_ingresar' in iRes));
const avI = await api('/porton', { token: res, cuerpo: {} });
const iCel = (await api('/inicio', { token: cel })).data;
verificar('el inicio del vigilante muestra lo que debe atender', iCel.rol === 'vigilante' && iCel.avisos.some((a: any) => a.id === avI.data.id) && Array.isArray(iCel.solicitudes) && typeof iCel.paquetes_por_recoger === 'number');
await api(`/porton/${avI.data.id}/cancelar`, { token: res, cuerpo: {} });
const iAdm = (await api('/inicio', { token: admin })).data;
verificar('el inicio de la administración muestra sus pendientes de gestión', iAdm.rol === 'administrador' && typeof iAdm.pqrs_sin_cerrar === 'number' && typeof iAdm.incidencias_abiertas === 'number' && !('avisos' in iAdm));
verificar('el inicio exige sesión (401)', (await api('/inicio')).status === 401);

console.log(fallos ? `\n${fallos} verificación(es) fallaron` : '\nTodas las verificaciones pasaron');
process.exit(fallos ? 1 : 0);
