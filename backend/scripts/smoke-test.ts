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
verificar('admin lista reservas', (await api('/reservas', { token: admin })).data.length >= 1);

// Eliminación de reservas por el administrador
const vistaAdmin = (await api('/reservas', { token: admin })).data as any[];
verificar('el administrador ve la reserva cancelada mientras exista', vistaAdmin.some((x) => x.id === r1.data.id && x.estado === 'cancelada'));
verificar('el residente no elimina reservas (403)', (await api(`/reservas/${r1.data.id}`, { método: 'DELETE', token: res })).status === 403);
verificar('el administrador elimina una reserva cancelada (204)', (await api(`/reservas/${r1.data.id}`, { método: 'DELETE', token: admin })).status === 204);
verificar('la reserva eliminada ya no aparece', !((await api('/reservas', { token: admin })).data as any[]).some((x) => x.id === r1.data.id));
verificar('eliminar una reserva inexistente da 404', (await api(`/reservas/${r1.data.id}`, { método: 'DELETE', token: admin })).status === 404);
const salon = zonas.find((z) => z.nombre === 'Salón Social');
const vigente = await api('/reservas', { token: res, cuerpo: { zona_id: salon.id, inicio: futuro('10:00', dia + 5), fin: futuro('11:00', dia + 5) } });
verificar('se crea una reserva vigente para eliminarla', vigente.status === 201, JSON.stringify(vigente.data));
verificar('el administrador elimina una reserva vigente (204)', (await api(`/reservas/${vigente.data.id}`, { método: 'DELETE', token: admin })).status === 204);
verificar('el residente no usa la limpieza de canceladas (403)', (await api('/reservas/canceladas', { método: 'DELETE', token: res })).status === 403);
const limpieza = await api('/reservas/canceladas', { método: 'DELETE', token: admin });
verificar('el administrador limpia las reservas canceladas', limpieza.status === 200 && typeof limpieza.data.eliminadas === 'number', JSON.stringify(limpieza.data));
verificar('no quedan reservas canceladas tras la limpieza', !((await api('/reservas', { token: admin })).data as any[]).some((x) => x.estado === 'cancelada'));

verificar('un identificador no numérico da 400 y no un error del servidor', (await api('/reservas/abc', { método: 'DELETE', token: admin })).status === 400);

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

console.log(fallos ? `\n${fallos} verificación(es) fallaron` : '\nTodas las verificaciones pasaron');
process.exit(fallos ? 1 : 0);
