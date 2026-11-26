// Genera los diagramas UML del documento a partir del estado REAL de la aplicación.
// Blanco/azul = implementado. Gris = previsto (aún no implementado).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const H = require('./svg_helpers');

const OUT = path.join(__dirname, '..', 'diagramas');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const GRIS = '#e4e4e4';

function save(name, svg) {
  const png = new Resvg(svg, { background: 'white', fitTo: { mode: 'width', value: 2000 } }).render().asPng();
  fs.writeFileSync(path.join(OUT, name + '.png'), png);
  console.log(name, 'ok', png.length);
}

function leyenda(x, y, textoGris = 'Previsto (aún no implementado)') {
  return (
    `<rect x="${x}" y="${y - 12}" width="16" height="14" fill="#ffffff" stroke="${H.LINE}"/>` +
    H.text(x + 22, y, 'Implementado', { size: 15 }) +
    `<rect x="${x + 140}" y="${y - 12}" width="16" height="14" fill="${GRIS}" stroke="${H.LINE}"/>` +
    H.text(x + 162, y, textoGris, { size: 15 })
  );
}

// ================================================================ CASOS DE USO (uno por perfil)
/** casos: [texto, previsto?, secundario?] — secundario: actor que también participa. */
function casosDeUso(archivo, actor, casos, secundarios) {
  const paso = 52;
  const W = 900;
  const H_ = 110 + casos.length * paso;
  const sx = 170, sw = 540, sy = 20, sh = H_ - 60;
  let b = '';
  b += H.box(sx, sy, sw, sh, { fill: '#fbfcfe' });
  b += H.text(sx + sw / 2, sy + 22, 'Sistema: Cantaluna', { anchor: 'middle', weight: 'bold', size: 16 });
  const cx = sx + sw / 2;
  const ys = casos.map((_, i) => sy + 60 + i * paso);
  const yActor = Math.round((ys[0] + ys[ys.length - 1]) / 2) - 30;
  casos.forEach(([t, planeado, otro], i) => {
    const y = ys[i];
    b += H.line(88, yActor + 34, cx - 215, y, {});
    if (otro) {
      const s = secundarios[otro];
      b += H.line(cx + 215, y, 810, s.y + 34, { stroke: '#8a97a8' });
    }
    b += H.ellipseUC(cx, y, 215, 23, [t], { fill: planeado ? GRIS : '#ffffff' });
  });
  b += H.actor(60, yActor, actor);
  Object.values(secundarios).forEach((s) => { b += H.actor(835, s.y, s.nombre); });
  b += leyenda(sx + 10, H_ - 14);
  save(archivo, H.svgDoc(W, H_, b));
}

function useCases() {
  casosDeUso('use_case_residente', 'Residente', [
    ['Registrarse con invitación e iniciar sesión'],
    ['Consultar disponibilidad y reservar zona'],
    ['Consultar y cancelar mis reservas'],
    ['Avisar llegada al portón', false, 'vig'],
    ['Autorizar visitante con código QR', false, 'vig'],
    ['Responder solicitud de visita en portería', false, 'vig'],
    ['Ver paquetes y avisar «ya voy»', false, 'vig'],
    ['Chatear con portería y llamar', false, 'vig'],
    ['Leer comunicados'],
    ['Radicar y consultar PQRS', false, 'adm'],
    ['Reportar incidencia', false, 'adm'],
    ['Recibir avisos (bandeja, banner y push)'],
    ['Gestionar perfil, teléfono y contraseña'],
    ['Pagar cuotas de administración', true],
  ], { vig: { nombre: 'Vigilante', y: 230 }, adm: { nombre: 'Administración', y: 500 } });

  casosDeUso('use_case_vigilante', 'Vigilante', [
    ['Iniciar sesión y cambiar contraseña'],
    ['Atender avisos del portón', false, 'res'],
    ['Validar código y registrar entrada y salida', false, 'res'],
    ['Pedir autorización para visitante sin aviso', false, 'res'],
    ['Consultar el registro de ingresos'],
    ['Registrar y entregar paquetes y domicilios', false, 'res'],
    ['Anotar la minuta (novedad, ronda, alerta)', false, 'adm'],
    ['Reportar incidencia y consultarlas', false, 'adm'],
    ['Chatear y llamar a residentes', false, 'res'],
    ['Gestionar zonas comunes y sus reglas'],
    ['Ver, cancelar y eliminar reservas', false, 'res'],
    ['Leer comunicados y recibir avisos'],
    ['Leer el código QR con la cámara', true],
  ], { res: { nombre: 'Residente', y: 200 }, adm: { nombre: 'Administración', y: 420 } });

  casosDeUso('use_case_admin', 'Administración', [
    ['Iniciar sesión y cambiar contraseña'],
    ['Publicar y eliminar comunicados', false, 'res'],
    ['Atender PQRS', false, 'res'],
    ['Dar seguimiento a incidencias', false, 'res'],
    ['Leer la minuta y recibir alertas', false, 'vig'],
    ['Gestionar usuarios (alta y activación)'],
    ['Restablecer contraseña', false, 'res'],
    ['Gestionar unidades e invitaciones'],
    ['Gestionar zonas comunes y sus reglas'],
    ['Configurar el número de portería'],
    ['Consultar el resumen de gestión'],
    ['Exportar reportes y consultar auditoría', true],
    ['Gestionar cartera, pagos y asambleas', true],
  ], { res: { nombre: 'Residente', y: 170 }, vig: { nombre: 'Vigilante', y: 380 } });
}

// ================================================================ NÚCLEO (cuadrícula)
const COLS = { A: 25, B: 305, C: 585, D: 865 };
const ROWS = { r1: 60, r2: 320, r3: 600 };

function boxDiagram(defs, rels, opts = {}) {
  const W = opts.width || 1135, Ht = opts.height || 760;
  let b = '';
  const boxes = {};
  Object.entries(defs).forEach(([id, d]) => {
    const r = H.classBox(d.x, d.y, d.w, d.title, d.attrs || [], d.methods || [], { fill: opts.fill });
    b += r.svg;
    boxes[id] = { x: d.x, y: d.y, w: d.w, h: r.height };
  });
  rels.forEach((rel) => {
    const A = boxes[rel.a], B = boxes[rel.b];
    let lx, ly;
    if (rel.kind === 'row') { b += H.rowConnect(A, B, {}); lx = (A.x + A.w + B.x) / 2; ly = A.y + A.h / 2 - 6; }
    else if (rel.kind === 'col') { b += H.colConnect(A, B, {}); lx = A.x + A.w / 2 + 30; ly = A.y < B.y ? (A.y + A.h + B.y) / 2 : (B.y + B.h + A.y) / 2; }
    else if (rel.kind === 'gutter') { b += H.gutterConnect(A, B, rel.gx, rel.laneY, {}); lx = (rel.gx + B.x + B.w / 2) / 2; ly = rel.laneY - 6; }
    else { b += H.laneConnect(A, B, rel.laneY, rel.fromSide, rel.toSide, {}); lx = (A.x + A.w / 2 + B.x + B.w / 2) / 2; ly = rel.laneY - 6; }
    if (rel.label) b += H.text(lx, ly, rel.label, { size: 14, anchor: 'middle', italic: true });
  });
  if (opts.nota) b += H.text(40, Ht - 14, opts.nota, { size: 12, italic: true });
  return H.svgDoc(W, Ht, b);
}

function relsNucleo(l) {
  return [
    { a: 'cop', b: 'unidad', kind: 'col', label: l[0] },
    { a: 'cop', b: 'invitacion', kind: 'row', label: l[0] },
    { a: 'cop', b: 'zona', kind: 'lane', laneY: 42, fromSide: 'top', toSide: 'top', label: l[0] },
    { a: 'unidad', b: 'usuario', kind: 'row', label: l[0] },
    { a: 'rol', b: 'usuario', kind: 'col', label: l[0] },
    { a: 'invitacion', b: 'usuario', kind: 'col', label: 'usa' },
    { a: 'zona', b: 'regla', kind: 'col', label: l[1] },
    { a: 'zona', b: 'reserva', kind: 'row', label: l[0] },
    { a: 'usuario', b: 'reserva', kind: 'gutter', gx: 570, laneY: 20, label: l[0] },
    { a: 'usuario', b: 'auditoria', kind: 'lane', laneY: 565, fromSide: 'bottom', toSide: 'top', label: l[2] },
  ];
}

function nucleo(archivo, nombres, a, opts, etiquetas) {
  const pos = {
    cop: [COLS.A, ROWS.r1], unidad: [COLS.A, ROWS.r2], auditoria: [COLS.A, ROWS.r3],
    invitacion: [COLS.B, ROWS.r1], usuario: [COLS.B, ROWS.r2], rol: [COLS.B, ROWS.r3],
    zona: [COLS.C, ROWS.r1], regla: [COLS.C, ROWS.r2], reserva: [COLS.D, ROWS.r1],
  };
  const defs = {};
  Object.entries(pos).forEach(([id, [x, y]]) => {
    defs[id] = { x, y, w: 250, title: nombres[id], ...a[id] };
  });
  save(archivo, boxDiagram(defs, relsNucleo(etiquetas), opts));
}

function diagramasNucleo() {
  const at = (...attrs) => ({ attrs });
  nucleo('domain_model',
    { cop: 'Copropiedad', unidad: 'UnidadResidencial', auditoria: 'RegistroAuditoría', invitacion: 'CódigoInvitación', usuario: 'Usuario', rol: 'Rol', zona: 'ZonaComún', regla: 'ReglaReserva', reserva: 'Reserva' },
    {
      cop: at('nombre', 'nit', 'ciudad', 'teléfonoPortería'), unidad: at('identificador'), auditoria: at('acción', 'entidad', 'detalle', 'fechaHora'),
      invitacion: at('código', 'vence', 'usadoEn'), usuario: at('nombre', 'correo', 'estado', 'teléfonoAutorizado'), rol: at('nombre'),
      zona: at('nombre', 'aforo', 'horario', 'estado'), regla: at('duraciónMáxima', 'anticipaciónMínima', 'máxActivasPorUnidad', 'díasHabilitados'),
      reserva: at('inicio', 'fin', 'estado'),
    }, {}, ['1..N', '1..1', 'registra']);

  nucleo('er_model',
    { cop: 'COPROPIEDAD', unidad: 'UNIDAD_RESIDENCIAL', auditoria: 'REGISTRO_AUDITORIA', invitacion: 'CODIGO_INVITACION', usuario: 'USUARIO', rol: 'ROL', zona: 'ZONA_COMUN', regla: 'REGLA_RESERVA', reserva: 'RESERVA' },
    {
      cop: at('PK id', 'nombre', 'nit', 'telefono_porteria'), unidad: at('PK id', 'FK copropiedad_id', 'identificador'),
      auditoria: at('PK id', 'FK copropiedad_id', 'FK usuario_id', 'accion', 'entidad'),
      invitacion: at('PK id', 'FK unidad_id', 'FK usado_por', 'codigo', 'expira_en'),
      usuario: at('PK id', 'FK copropiedad_id', 'FK unidad_id', 'FK rol_id', 'correo'), rol: at('PK id', 'nombre'),
      zona: at('PK id', 'FK copropiedad_id', 'nombre', 'estado'), regla: at('PK id', 'FK zona_id (único)', 'duracion_maxima_min'),
      reserva: at('PK id', 'FK zona_id', 'FK usuario_id', 'FK unidad_id', 'inicio / fin'),
    }, { fill: '#eaf3ff' }, ['1:N', '1:1', '1:N']);

  nucleo('relational_model',
    { cop: 'copropiedad', unidad: 'unidad_residencial', auditoria: 'registro_auditoria', invitacion: 'codigo_invitacion', usuario: 'usuario', rol: 'rol', zona: 'zona_comun', regla: 'regla_reserva', reserva: 'reserva' },
    {
      cop: at('PK id: SERIAL', 'nombre: VARCHAR(150)', 'nit: VARCHAR(20) UNIQUE', 'telefono_porteria: VARCHAR(20)'),
      unidad: at('PK id: SERIAL', 'FK copropiedad_id: INT', 'identificador: VARCHAR(40)'),
      auditoria: at('PK id: BIGSERIAL', 'FK usuario_id: INT', 'accion: VARCHAR(60)', 'detalle: JSONB'),
      invitacion: at('PK id: SERIAL', 'FK unidad_id: INT', 'codigo: VARCHAR(20) UNIQUE', 'expira_en, usado_en: TIMESTAMPTZ'),
      usuario: at('PK id: SERIAL', 'FK unidad_id / rol_id', 'correo: VARCHAR(160)', 'password_hash: TEXT', 'version_sesion: INT', 'clave_temporal_vence'),
      rol: at('PK id: SMALLSERIAL', 'nombre: VARCHAR(30) UNIQUE'),
      zona: at('PK id: SERIAL', 'FK copropiedad_id: INT', 'hora_apertura / hora_cierre', 'estado: VARCHAR(15)', 'eliminada_en: TIMESTAMPTZ'),
      regla: at('PK id: SERIAL', 'FK zona_id: INT UNIQUE', 'duracion_maxima_min: INT', 'dias_habilitados: SMALLINT[]'),
      reserva: at('PK id: SERIAL', 'FK zona_id / unidad_id', 'FK usuario_id: INT', 'inicio, fin: TIMESTAMPTZ', 'estado: VARCHAR(12)', 'EXCLUDE (zona, rango)'),
    }, { fill: '#fef7e6' }, ['FK', 'FK 1:1', 'FK']);

  const m = (attrs, methods = []) => ({ attrs, methods });
  nucleo('class_diagram',
    { cop: 'Copropiedad', unidad: 'UnidadResidencial', auditoria: 'RegistroAuditoria', invitacion: 'CodigoInvitacion', usuario: 'Usuario', rol: 'Rol', zona: 'ZonaComun', regla: 'ReglaReserva', reserva: 'Reserva' },
    {
      cop: m(['- id: int', '- nombre: String', '- telefonoPorteria: String']),
      unidad: m(['- id: int', '- identificador: String'], ['+ invitar()']),
      auditoria: m(['- accion: String', '- detalle: JSON'], ['+ registrar()']),
      invitacion: m(['- codigo: String', '- expiraEn: DateTime'], ['+ canjear()']),
      usuario: m(['- nombre: String', '- correo: String', '- estado: String', '- versionSesion: int'], ['+ autenticar()', '+ cambiarClave()', '+ desactivar()']),
      rol: m(['- nombre: String']),
      zona: m(['- nombre: String', '- aforo: int', '- estado: String'], ['+ disponibilidad(fecha)', '+ ponerEnMantenimiento()', '+ eliminar()']),
      regla: m(['- duracionMaximaMin: int', '- anticipacionMinimaMin: int', '- maxActivasPorUnidad: int'], ['+ validar(reserva)']),
      reserva: m(['- inicio: DateTime', '- fin: DateTime', '- estado: String'], ['+ crear()', '+ cancelar()', '+ recordar()']),
    }, { height: 800 }, ['1..N', '1..1', '1..N']);
}

// ================================================================ OPERACIÓN (columnas con "bus")
const OP_IZQ = ['porton', 'visita', 'paquete', 'chat', 'minuta'];
const OP_DER = ['comunicado', 'pqrs', 'incidencia', 'notificacion', 'dispositivo'];
const CON_UNIDAD = ['porton', 'visita', 'paquete'];

function operacion(archivo, nombres, contenido, opts = {}) {
  const W = 1160, ancho = 270, xi = 30, xc = 445, xd = 860;
  let b = '';
  const cajas = {};
  const poner = (id, x, y) => {
    const d = contenido[id];
    const r = H.classBox(x, y, ancho, nombres[id], d.attrs, d.methods || [], { fill: opts.fill });
    b += r.svg;
    cajas[id] = { x, y, w: ancho, h: r.height };
    return y + r.height + 24;
  };
  let y = 30;
  OP_IZQ.forEach((id) => { y = poner(id, xi, y); });
  const altoIzq = y;
  y = 30;
  OP_DER.forEach((id) => { y = poner(id, xd, y); });
  const alto = Math.max(altoIzq, y);
  poner('unidad', xc, 70);
  poner('usuario', xc, Math.round(alto / 2) - 60);
  poner('zona', xc, alto - 190);

  const linea = (pts, extra = {}) => { b += H.polyline(pts, extra); };
  const U = cajas.usuario, R = cajas.unidad, Z = cajas.zona;
  const yU = U.y + U.h / 2;
  OP_IZQ.forEach((id) => {
    const c = cajas[id], mid = c.y + c.h / 2;
    linea([[c.x + c.w, mid - 9], [405, mid - 9], [405, yU - 9], [U.x, yU - 9]]);
    b += H.text(c.x + c.w + 5, mid - 13, 'N:1', { size: 13, italic: true });
    if (CON_UNIDAD.includes(id)) {
      const yR = R.y + R.h / 2;
      linea([[c.x + c.w, mid + 11], [365, mid + 11], [365, yR], [R.x, yR]], { dashed: true });
    }
  });
  OP_DER.forEach((id) => {
    const c = cajas[id], mid = c.y + c.h / 2;
    linea([[c.x, mid - 9], [755, mid - 9], [755, yU - 9], [U.x + U.w, yU - 9]]);
    b += H.text(c.x - 28, mid - 13, 'N:1', { size: 13, italic: true });
  });
  const inc = cajas.incidencia, midInc = inc.y + inc.h / 2 + 12;
  linea([[inc.x, midInc], [805, midInc], [805, Z.y + Z.h / 2], [Z.x + Z.w, Z.y + Z.h / 2]], { dashed: true });
  b += H.text(30, alto + 6, 'Línea continua: relación con el usuario (autor, destinatario o titular). Línea punteada: relación con la unidad o con la zona.', { size: 15, italic: true });
  b += H.text(30, alto + 28, 'Todas estas entidades pertenecen además a una copropiedad (excepto notificación y dispositivo, que dependen del usuario).', { size: 15, italic: true });
  save(archivo, H.svgDoc(W, alto + 48, b));
}

function diagramasOperacion() {
  const nombresD = { porton: 'AvisoPortón', visita: 'Visita', paquete: 'Paquete', chat: 'MensajeChat', minuta: 'AnotaciónMinuta', comunicado: 'Comunicado', pqrs: 'PQRS', incidencia: 'Incidencia', notificacion: 'Notificación', dispositivo: 'DispositivoPush', unidad: 'UnidadResidencial', usuario: 'Usuario', zona: 'ZonaComún' };
  const a = (...attrs) => ({ attrs });
  operacion('domain_ops', nombresD, {
    porton: a('tipoVehículo', 'placa', 'estado'), visita: a('visitante', 'código', 'vigencia', 'estado', 'origen'),
    paquete: a('tipo', 'descripción', 'estado', 'entregadoA'), chat: a('texto', 'fechaHora'), minuta: a('tipo', 'descripción'),
    comunicado: a('título', 'contenido', 'importante'), pqrs: a('tipo', 'asunto', 'estado', 'respuesta'),
    incidencia: a('descripción', 'gravedad', 'estado'), notificacion: a('tipo', 'título', 'leída'), dispositivo: a('token', 'plataforma'),
    unidad: a('identificador'), usuario: a('nombre', 'correo', 'rol', 'estado'), zona: a('nombre', 'estado'),
  });

  const nombresT = { porton: 'AVISO_PORTON', visita: 'VISITA', paquete: 'PAQUETE', chat: 'MENSAJE_CHAT', minuta: 'MINUTA', comunicado: 'COMUNICACION', pqrs: 'PQRS', incidencia: 'INCIDENCIA', notificacion: 'NOTIFICACION', dispositivo: 'DISPOSITIVO_PUSH', unidad: 'UNIDAD_RESIDENCIAL', usuario: 'USUARIO', zona: 'ZONA_COMUN' };
  operacion('er_ops', nombresT, {
    porton: a('PK id', 'FK usuario_id', 'FK unidad_id', 'FK atendido_por'), visita: a('PK id', 'FK residente_id', 'FK unidad_id', 'codigo (único)'),
    paquete: a('PK id', 'FK unidad_id', 'FK recibido_por', 'FK entregado_por'), chat: a('PK id', 'FK residente_id', 'FK autor_id'), minuta: a('PK id', 'FK autor_id'),
    comunicado: a('PK id', 'FK autor_id'), pqrs: a('PK id', 'FK usuario_id', 'FK respondido_por'),
    incidencia: a('PK id', 'FK usuario_id', 'FK zona_id', 'FK atendido_por'), notificacion: a('PK id', 'FK usuario_id', 'referencia_id'), dispositivo: a('PK id', 'FK usuario_id', 'token (único)'),
    unidad: a('PK id', 'FK copropiedad_id'), usuario: a('PK id', 'FK rol_id', 'FK unidad_id'), zona: a('PK id', 'FK copropiedad_id'),
  }, { fill: '#eaf3ff' });

  operacion('relational_ops', { porton: 'aviso_porton', visita: 'visita', paquete: 'paquete', chat: 'mensaje_chat', minuta: 'minuta', comunicado: 'comunicacion', pqrs: 'pqrs', incidencia: 'incidencia', notificacion: 'notificacion', dispositivo: 'dispositivo_push', unidad: 'unidad_residencial', usuario: 'usuario', zona: 'zona_comun' }, {
    porton: a('tipo_vehiculo: VARCHAR(10)', 'placa: VARCHAR(7)', 'estado: VARCHAR(12)', 'UNIQUE pendiente por usuario'),
    visita: a('nombre: VARCHAR(120)', 'codigo: VARCHAR(8) UNIQUE', 'valida_hasta: TIMESTAMPTZ', 'estado: VARCHAR(14)', 'origen: VARCHAR(10)'),
    paquete: a('tipo: VARCHAR(20)', 'estado: VARCHAR(12)', 'en_camino_en: TIMESTAMPTZ'),
    chat: a('canal: VARCHAR(10)', 'cuerpo: VARCHAR(1000)', 'CHECK canal = porteria'),
    minuta: a('tipo: VARCHAR(8)', 'descripcion: VARCHAR(1000)'),
    comunicado: a('titulo: VARCHAR(150)', 'contenido: TEXT', 'importante: BOOLEAN'),
    pqrs: a('tipo: VARCHAR(12)', 'asunto: VARCHAR(150)', 'estado: VARCHAR(15)'),
    incidencia: a('gravedad: VARCHAR(8)', 'estado: VARCHAR(15)', 'respuesta: VARCHAR(2000)'),
    notificacion: a('tipo: VARCHAR(30)', 'titulo: VARCHAR(150)', 'leida: BOOLEAN'),
    dispositivo: a('token: TEXT UNIQUE', 'actualizado_en: TIMESTAMPTZ'),
    unidad: a('id: SERIAL', 'identificador'), usuario: a('id: SERIAL', 'rol_id: SMALLINT'), zona: a('id: SERIAL', 'nombre'),
  }, { fill: '#fef7e6' });

  const m = (attrs, methods) => ({ attrs, methods });
  operacion('class_ops', { porton: 'AvisoPorton', visita: 'Visita', paquete: 'Paquete', chat: 'MensajeChat', minuta: 'AnotacionMinuta', comunicado: 'Comunicado', pqrs: 'PQRS', incidencia: 'Incidencia', notificacion: 'Notificacion', dispositivo: 'DispositivoPush', unidad: 'UnidadResidencial', usuario: 'Usuario', zona: 'ZonaComun' }, {
    porton: m(['- estado: String', '- placa: String'], ['+ atender()', '+ cancelar()', '+ vencer()']),
    visita: m(['- codigo: String', '- estado: String'], ['+ responder(decision)', '+ registrarEntrada()', '+ registrarSalida()']),
    paquete: m(['- tipo: String', '- estado: String'], ['+ avisarVoy()', '+ entregar(a)']),
    chat: m(['- cuerpo: String'], ['+ enviar()']),
    minuta: m(['- tipo: String'], ['+ anotar()']),
    comunicado: m(['- titulo: String'], ['+ publicar()', '+ eliminar()']),
    pqrs: m(['- tipo: String', '- estado: String'], ['+ responder(estado, texto)']),
    incidencia: m(['- gravedad: String', '- estado: String'], ['+ gestionar(estado, nota)']),
    notificacion: m(['- tipo: String', '- leida: boolean'], ['+ marcarLeida()', '+ resolver()']),
    dispositivo: m(['- token: String'], ['+ registrar()', '+ darDeBaja()']),
    unidad: m(['- identificador: String'], []), usuario: m(['- nombre: String', '- rol: Rol'], ['+ restablecerClave()']), zona: m(['- nombre: String'], []),
  });
}

// ================================================================ PAQUETES
function packageDiagram() {
  let b = '';
  b += H.pkgBox(30, 30, 240, 100, 'Mantenimiento automático', ['Vencimientos (cada 20 s)', 'Borrado (cada 10 min)']);
  b += H.pkgBox(430, 30, 240, 100, 'Notificaciones', ['Bandeja de avisos', 'Push (Firebase)']);
  b += H.pkgBox(830, 30, 240, 100, 'Auditoría', ['Registro de acciones', 'de todos los módulos']);
  b += H.pkgBox(30, 230, 240, 120, 'Zonas y reservas', ['Zonas comunes', 'Reglas de reserva', 'Reservas y disponibilidad']);
  b += H.pkgBox(297, 230, 240, 120, 'Portería', ['Portón y visitas con QR', 'Paquetes y minuta', 'Chat y contacto']);
  b += H.pkgBox(563, 230, 240, 120, 'Gestión del conjunto', ['Comunicados', 'PQRS e incidencias', 'Resumen de gestión']);
  b += H.pkgBox(830, 230, 240, 120, 'Financiero (futuro)', ['Cuotas y cartera', 'Pagos y asambleas'], GRIS);
  b += H.pkgBox(200, 440, 700, 90, 'Núcleo', ['Autenticación y sesiones · Usuarios, roles y claves · Copropiedades y unidades', 'Base de datos y validación de datos']);
  const dep = (x1, y1, x2, y2) => { b += H.line(x1, y1, x2, y2, { dashed: true, arrow: 'arrowOpen' }); };
  dep(150, 350, 290, 454); dep(417, 350, 417, 454); dep(683, 350, 683, 454); dep(950, 350, 840, 454);
  dep(220, 246, 450, 132); dep(440, 230, 520, 132); dep(660, 230, 590, 132);
  dep(270, 80, 428, 80); dep(185, 130, 185, 244);
  b += H.text(550, 560, '«dependency»: la flecha va del paquete que usa hacia el usado. Los módulos registran sus acciones en Auditoría.', { anchor: 'middle', size: 15, italic: true });
  b += leyenda(30, 590);
  save('package_diagram', H.svgDoc(1100, 605, b));
}

// ================================================================ SECUENCIAS
/** msgs: [desde, hasta, texto, opciones] — opciones: { punteada } o { nota } (texto sobre una franja). */
function secuencia(archivo, nombres, msgs, opts = {}) {
  const paso = opts.paso || 40;
  const W = opts.width || 1180;
  const margen = 95;
  const sep = (W - 2 * margen) / (nombres.length - 1);
  const xs = nombres.map((_, i) => margen + i * sep);
  const H_ = 100 + msgs.length * paso + 20;
  let b = '';
  nombres.forEach((n, i) => {
    const medio = nombres.length > 5 ? 90 : 95;
    b += H.box(xs[i] - medio, 20, medio * 2, 34, { fill: H.FILL_ACCENT });
    b += H.text(xs[i], 43, n, { anchor: 'middle', weight: 'bold', size: 15 });
    b += H.line(xs[i], 54, xs[i], H_ - 14, { dashed: true });
  });
  msgs.forEach(([f, t, l, o = {}], i) => {
    const y = 90 + i * paso;
    if (o.nota) {
      b += H.box(40, y - 18, W - 80, 24, { fill: '#fff7e6', stroke: '#c9a86a' });
      b += H.text(W / 2, y - 1, l, { anchor: 'middle', size: 15, italic: true });
    } else if (f === t) {
      const dir = f === xs.length - 1 ? -1 : 1;
      b += `<path d="M ${xs[f]} ${y - 14} h ${34 * dir} v 18 h ${-34 * dir}" fill="none" stroke="${H.LINE}" stroke-width="1.4" marker-end="url(#arrow)"/>`;
      b += H.text(xs[f] + 42 * dir, y - 1, l, { size: 15, anchor: dir > 0 ? 'start' : 'end' });
    } else {
      b += H.line(xs[f], y, xs[t], y, { arrow: 'arrow', dashed: !!o.punteada });
      const ancho = l.length * 6.9 + 8;
      const mx = Math.min(Math.max((xs[f] + xs[t]) / 2, ancho / 2 + 4), W - ancho / 2 - 4);
      b += `<rect x="${mx - ancho / 2}" y="${y - 22}" width="${ancho}" height="18" fill="#ffffff"/>`;
      b += H.text(mx, y - 8, l, { anchor: 'middle', size: 15 });
    }
  });
  save(archivo, H.svgDoc(W, H_, b));
}

function secuencias() {
  secuencia('sequence_diagram', ['Residente', 'App (Flutter)', 'API (Express)', 'PostgreSQL'], [
    [0, 1, 'Elige zona y día'],
    [1, 2, 'GET /zonas/:id/disponibilidad?fecha='],
    [2, 3, 'SELECT reservas confirmadas del día'],
    [3, 2, 'horarios ocupados', { punteada: true }],
    [2, 1, '200 OK {zona, regla, ocupados}', { punteada: true }],
    [1, 0, 'Muestra horas y duraciones libres', { punteada: true }],
    [0, 1, 'Elige hora y duración y confirma'],
    [1, 2, 'POST /reservas {zona_id, inicio, fin}'],
    [2, 2, 'Valida las reglas de la zona'],
    [2, 3, 'BEGIN; bloqueo por unidad; INSERT'],
    [3, 2, 'OK, o error 23P01 si hay solape', { punteada: true }],
    [2, 1, '201 Created, o 409 Conflict', { punteada: true }],
    [1, 0, 'Confirma o explica el motivo', { punteada: true }],
  ], { width: 1000 });

  secuencia('sequence_porton', ['Residente', 'App residente', 'API', 'PostgreSQL', 'App vigilante', 'Vigilante'], [
    [0, 1, 'Elige vehículo y toca «Avisar»'],
    [1, 2, 'POST /porton'],
    [2, 3, 'INSERT aviso (pendiente)'],
    [2, 4, 'Aviso en bandeja y push', { punteada: true }],
    [4, 5, 'Banner «Abrir portón»', { punteada: true }],
    [5, 4, 'Abre el portón y toca «Ya abrí»'],
    [4, 2, 'POST /porton/:id/atender'],
    [2, 3, 'UPDATE estado = atendido'],
    [2, 1, 'Aviso «Portón abierto»', { punteada: true }],
    [1, 0, 'Muestra «Portón abierto»', { punteada: true }],
    [0, 0, 'Si nadie atiende en 30 min, el servidor marca el aviso como vencido y avisa al residente', { nota: true }],
  ]);

  secuencia('sequence_visita', ['Vigilante', 'App vigilante', 'API', 'PostgreSQL', 'App residente', 'Residente'], [
    [0, 1, 'Registra visitante y elige a quién visita'],
    [1, 2, 'POST /visitas/porteria'],
    [2, 3, 'INSERT visita (solicitada, 10 min)'],
    [2, 4, 'Bandeja y push «Tienes una visita»', { punteada: true }],
    [4, 5, 'Banner con Autorizar / Rechazar', { punteada: true }],
    [5, 4, 'Toca «Autorizar»'],
    [4, 2, 'POST /visitas/:id/responder'],
    [2, 3, 'UPDATE autorizada (30 min), solo si es el visitado'],
    [2, 1, 'Aviso «Visita autorizada»', { punteada: true }],
    [0, 1, 'Toca «Registrar entrada»'],
    [1, 2, 'POST /visitas/:id/entrada'],
    [2, 3, 'UPDATE dentro (hora y quién registró)'],
    [2, 4, 'Aviso «Tu visita ingresó»', { punteada: true }],
    [0, 0, 'Alternativa: sin respuesta en 10 min, la tarea de cada 20 s marca «sin_respuesta» y avisa a ambos', { nota: true }],
  ]);

  secuencia('sequence_avisos', ['Módulo de la API', 'Centro de avisos', 'PostgreSQL', 'Firebase (FCM)', 'App del destinatario'], [
    [0, 1, 'notificarUsuarios(ids, aviso)'],
    [1, 2, 'Borra el aviso sin leer del mismo asunto'],
    [1, 2, 'INSERT en la bandeja (notificacion)'],
    [1, 3, 'Envío push en segundo plano', { punteada: true }],
    [3, 4, 'Notificación del sistema (app cerrada)', { punteada: true }],
    [4, 1, 'GET /notificaciones/resumen (cada 4 s)'],
    [1, 4, 'contadores y avisos nuevos', { punteada: true }],
    [4, 4, 'Banner con acciones y actualización de la pantalla'],
    [4, 1, 'Al actuar: acción sobre el asunto'],
    [1, 2, 'resolverAvisos(): marca como leídos', { punteada: true }],
    [0, 0, 'Sin Firebase configurado, la bandeja funciona igual; el push es un refuerzo', { nota: true }],
  ]);

  secuencia('sequence_clave', ['Usuario', 'Administración', 'App administración', 'API', 'PostgreSQL', 'App usuario'], [
    [0, 1, 'Olvidó la contraseña: la pide'],
    [1, 1, 'Confirma su identidad'],
    [2, 3, 'POST /usuarios/:id/restablecer-clave'],
    [3, 4, 'Hash temporal, vence 24 h, versión+1'],
    [3, 4, 'Desconecta los teléfonos y audita'],
    [3, 2, 'Temporal (una sola vez, sin caché)', { punteada: true }],
    [1, 0, 'La entrega en persona o por llamada'],
    [0, 5, 'Entra con la contraseña temporal'],
    [5, 3, 'POST /auth/login'],
    [3, 5, 'token y «cambio pendiente»', { punteada: true }],
    [5, 0, 'Pantalla obligatoria «Crea tu contraseña»', { punteada: true }],
    [5, 3, 'PUT /auth/me/password'],
    [3, 4, 'Nuevo hash, versión+1, sin vencimiento'],
    [3, 5, 'Token nuevo; la temporal deja de servir', { punteada: true }],
  ]);
}

// ================================================================ ESTADOS
const pill = (cx, cy, w, label, fill = '#eaf3ff') => H.box(cx - w / 2, cy - 22, w, 44, { rx: 22, fill }) + H.text(cx, cy + 5, label, { anchor: 'middle', size: 15, weight: 'bold' });
const inicioE = (x, y) => `<circle cx="${x}" cy="${y}" r="8" fill="${H.INK}"/>`;
const finE = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${H.INK}" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="4" fill="${H.INK}"/>`;
const rot = (x, y, t, anchor = 'middle') => H.text(x, y, t, { size: 14, anchor, italic: true });
const flecha = (pts, dashed) => H.polyline(pts, { arrow: 'arrow', dashed });

function stateDiagram() {
  const W = 1080;
  let b = '';
  b += H.text(30, 28, 'Reserva', { weight: 'bold', size: 17 });
  b += inicioE(46, 80) + flecha([[54, 80], [150, 80]]) + rot(102, 72, 'crear');
  b += pill(230, 80, 160, 'Confirmada') + flecha([[310, 80], [560, 80]]) + rot(435, 72, 'cancelar (residente o vigilante)');
  b += pill(640, 80, 160, 'Cancelada', '#fdeaea') + flecha([[720, 80], [790, 80]]) + finE(805, 80);
  b += rot(830, 66, 'Solo se cancela antes de empezar.', 'start') + rot(830, 84, 'La cancelada se borra a las 24 h', 'start') + rot(830, 100, 'o antes si la elimina el vigilante.', 'start');
  b += flecha([[230, 102], [230, 132], [805, 132], [805, 92]], true) + rot(520, 126, 'al terminar su horario se elimina automáticamente');

  b += H.text(30, 175, 'Zona común', { weight: 'bold', size: 17 });
  b += inicioE(46, 240) + flecha([[54, 240], [150, 240]]) + rot(102, 232, 'crear');
  b += pill(230, 240, 160, 'Activa') + flecha([[300, 226], [520, 226]]) + rot(410, 219, 'poner en mantenimiento');
  b += flecha([[520, 256], [300, 256]]) + rot(410, 272, 'reactivar');
  b += pill(600, 240, 160, 'En mantenimiento', '#fff3dc') + flecha([[230, 262], [230, 320]], true) + rot(240, 297, 'ocultar', 'start');
  b += pill(230, 342, 160, 'Inactiva', '#eeeeee') + flecha([[310, 342], [560, 342]], true) + rot(435, 334, 'eliminar (sin reservas futuras)');
  b += pill(640, 342, 160, 'Eliminada', '#fdeaea') + flecha([[720, 342], [790, 342]]) + finE(805, 342);
  b += rot(830, 346, 'Eliminación lógica: queda el historial.', 'start');

  b += H.text(30, 400, 'Aviso de llegada al portón', { weight: 'bold', size: 17 });
  b += inicioE(46, 480) + flecha([[54, 480], [150, 480]]) + rot(102, 472, 'avisar');
  b += pill(230, 480, 160, 'Pendiente', '#fff3dc');
  b += flecha([[310, 480], [420, 480], [420, 440], [560, 440]]) + rot(492, 433, 'el vigilante abre');
  b += flecha([[310, 480], [560, 480]]) + rot(492, 473, 'el residente cancela');
  b += flecha([[310, 480], [420, 480], [420, 525], [560, 525]], true) + rot(492, 518, '30 min sin atender');
  b += pill(640, 440, 160, 'Atendido') + pill(640, 482, 160, 'Cancelado', '#fdeaea') + pill(640, 527, 160, 'Vencido', '#eeeeee');
  b += rot(740, 486, 'Los avisos se borran a las 24 h.', 'start');
  save('state_diagram', H.svgDoc(W, 565, b));
}

function stateOps() {
  const W = 1080;
  let b = '';
  b += H.text(30, 28, 'Visita', { weight: 'bold', size: 17 });
  b += inicioE(46, 90) + flecha([[54, 90], [140, 90]]) + rot(98, 70, 'portería') + rot(98, 82, 'pide');
  b += pill(220, 90, 150, 'Solicitada', '#fff3dc');
  b += flecha([[295, 82], [390, 82]]) + rot(342, 74, 'autoriza');
  b += pill(470, 90, 160, 'Autorizada') + flecha([[550, 90], [660, 90]]) + rot(605, 82, 'entrada');
  b += pill(730, 90, 140, 'Dentro') + flecha([[800, 90], [895, 90]]) + rot(848, 82, 'salida');
  b += pill(975, 90, 150, 'Finalizada', '#eeeeee');
  b += inicioE(470, 30) + flecha([[470, 38], [470, 67]]) + rot(482, 52, 'residente autoriza (QR)', 'start');
  b += flecha([[250, 112], [250, 160], [300, 160]]) + rot(258, 132, 'rechaza', 'start');
  b += pill(380, 160, 150, 'Rechazada', '#fdeaea');
  b += flecha([[190, 112], [190, 215], [300, 215]], true) + rot(182, 200, '10 min', 'end');
  b += pill(380, 215, 150, 'Sin respuesta', '#eeeeee');
  b += flecha([[470, 112], [470, 140], [610, 140], [610, 160], [630, 160]]) + rot(556, 134, 'cancela', 'start');
  b += pill(705, 160, 140, 'Cancelada', '#fdeaea');
  b += flecha([[490, 112], [490, 125], [560, 125], [560, 215], [630, 215]], true) + rot(552, 205, 'vence la vigencia', 'end');
  b += pill(705, 215, 140, 'Vencida', '#eeeeee');
  b += rot(790, 190, 'Visitas sin ingreso: se borran a los 7 días.', 'start') + rot(790, 208, 'Registro de ingresos: 90 días.', 'start');

  b += H.text(30, 280, 'PQRS', { weight: 'bold', size: 17 });
  b += inicioE(46, 330) + flecha([[54, 330], [140, 330]]) + rot(97, 322, 'radicar');
  b += pill(220, 330, 150, 'Registrada') + flecha([[295, 330], [460, 330]]) + rot(378, 322, 'poner en proceso');
  b += pill(540, 330, 150, 'En proceso', '#fff3dc') + flecha([[615, 330], [780, 330]]) + rot(697, 322, 'resolver (con respuesta)');
  b += pill(860, 330, 150, 'Cerrada', '#eeeeee') + flecha([[220, 352], [220, 378], [860, 378], [860, 352]]) + rot(540, 372, 'resolver directamente (con respuesta)');

  b += H.text(30, 420, 'Incidencia', { weight: 'bold', size: 17 });
  b += inicioE(46, 470) + flecha([[54, 470], [105, 470]]);
  b += pill(180, 470, 150, 'Registrada') + flecha([[255, 470], [345, 470]]) + rot(300, 462, 'revisar');
  b += pill(420, 470, 150, 'En revisión', '#fff3dc') + flecha([[495, 470], [585, 470]]) + rot(540, 462, 'atender');
  b += pill(660, 470, 150, 'En proceso', '#fff3dc') + flecha([[735, 470], [825, 470]]) + rot(780, 462, 'cerrar');
  b += pill(900, 470, 150, 'Cerrada', '#eeeeee');
  b += rot(540, 508, 'La administración puede saltar estados; para cerrar es obligatorio escribir qué se hizo.');

  b += H.text(30, 545, 'Paquete / domicilio', { weight: 'bold', size: 17 });
  b += inicioE(46, 595) + flecha([[54, 595], [180, 595]]) + rot(117, 587, 'registrar');
  b += pill(270, 595, 170, 'Por recoger', '#fff3dc') + flecha([[355, 595], [600, 595]]) + rot(478, 587, 'entregar (a quién)');
  b += pill(680, 595, 160, 'Entregado', '#eeeeee') + rot(775, 600, 'Se borra a los 30 días.', 'start');
  b += rot(270, 636, 'El residente puede avisar «ya voy» mientras está por recoger.');
  save('state_ops', H.svgDoc(W, 655, b));
}

// ================================================================ COMPONENTES Y DESPLIEGUE
function componente(b, x, y, w, h, lines, fill = '#eef2f7') {
  let s = H.box(x, y, w, h, { fill });
  s += H.box(x + 10, y + 8, 22, 10, { fill: '#ffffff' });
  s += H.box(x + 10, y + 24, 22, 10, { fill: '#ffffff' });
  const cy = y + h / 2 - (lines.length - 1) * 8 + 4;
  lines.forEach((l, i) => { s += H.text(x + w / 2 + 10, cy + i * 18, l, { anchor: 'middle', size: 15, weight: i === 0 ? 'bold' : 'normal' }); });
  return b + s;
}

function componentDiagram() {
  let b = '';
  b += H.box(30, 30, 310, 470, { fill: '#fbfcfe', rx: 8 });
  b += H.text(185, 52, 'App móvil (Flutter / Dart)', { anchor: 'middle', weight: 'bold', size: 16 });
  [['Pantallas por perfil', 'residente · vigilante · administración'], ['Cliente de la API', 'sesión y errores'], ['Centro de avisos', 'consulta cada 4 s y banner'], ['Servicio push', 'firebase_messaging'], ['Almacenamiento seguro', 'sesión cifrada'], ['Marcador telefónico', 'url_launcher']]
    .forEach((c, i) => { b = componente(b, 50, 68 + i * 70, 270, 56, c); });
  b += H.box(450, 30, 400, 540, { fill: '#fbfcfe', rx: 8 });
  b += H.text(650, 52, 'API REST (Node.js + Express): monolito modular', { anchor: 'middle', weight: 'bold', size: 16 });
  [['Autenticación y usuarios', 'JWT, versión de sesión, claves'], ['Zonas y reservas', 'reglas y disponibilidad'], ['Portería', 'portón, visitas, paquetes, minuta, chat'], ['Gestión del conjunto', 'comunicados, PQRS, incidencias, reportes'], ['Notificaciones', 'bandeja y envío push'], ['Mantenimiento automático', 'vencimientos, recordatorios, borrado'], ['Auditoría', 'registro de acciones']]
    .forEach((c, i) => { b = componente(b, 480, 68 + i * 70, 340, 56, c); });
  b = componente(b, 930, 190, 200, 90, ['PostgreSQL', 'base de datos']);
  b = componente(b, 930, 360, 200, 90, ['Firebase Cloud', 'Messaging']);
  b += H.line(340, 180, 450, 180, { arrow: 'arrow' }) + H.text(395, 172, 'REST/JSON', { size: 14, anchor: 'middle', italic: true });
  b += H.line(850, 235, 924, 235, { arrow: 'arrow' }) + H.text(887, 227, 'SQL', { size: 14, anchor: 'middle', italic: true });
  b += H.polyline([[820, 376], [880, 376], [880, 405], [924, 405]], { arrow: 'arrow', dashed: true });
  b += H.polyline([[1030, 450], [1030, 590], [185, 590], [185, 506]], { arrow: 'arrow', dashed: true });
  b += H.text(610, 606, 'notificación push al teléfono', { size: 14, anchor: 'middle', italic: true });
  save('component_diagram', H.svgDoc(1160, 620, b));
}

function deploymentDiagram() {
  let b = '';
  const node = (x, y, w, h, lines, fill = '#f4f6f9') => {
    b += H.box(x, y, w, h, { fill });
    b += `<rect x="${x - 6}" y="${y - 10}" width="${w}" height="${h}" fill="none" stroke="${H.LINE}" stroke-width="1.2"/>`;
    [[0, 0], [w, 0], [0, h]].forEach(([dx, dy]) => { b += H.line(x - 6 + dx, y - 10 + dy, x + dx, y + dy, {}); });
    const cy = y + h / 2 - (lines.length - 1) * 8 + 4;
    lines.forEach((l, i) => { b += H.text(x + w / 2, cy + i * 18, l, { anchor: 'middle', size: 15, weight: i === 0 ? 'bold' : 'normal' }); });
  };
  node(40, 80, 240, 120, ['Teléfono Android', '«device»', 'App Flutter (APK)', 'Marcador telefónico']);
  node(440, 60, 270, 110, ['Servidor de aplicación', '«execution environment»', 'Node.js 22 + API Express']);
  node(440, 250, 270, 100, ['Servidor de datos', '«database server»', 'PostgreSQL 18']);
  node(840, 60, 240, 110, ['Firebase Cloud Messaging', '«cloud service»', 'entrega de notificaciones']);
  node(840, 250, 240, 100, ['Nube con HTTPS', '«previsto»', 'copias de seguridad'], GRIS);
  b += H.line(284, 125, 434, 105, { arrow: 'arrow' }) + H.text(358, 100, 'HTTP/REST (JSON)', { size: 14, anchor: 'middle', italic: true });
  b += H.line(575, 172, 575, 238, { arrow: 'arrow' }) + H.text(586, 210, 'SQL (pg)', { size: 14, italic: true });
  b += H.line(712, 105, 832, 105, { arrow: 'arrow' }) + H.text(772, 97, 'HTTPS', { size: 14, anchor: 'middle', italic: true });
  b += H.polyline([[960, 50], [960, 24], [160, 24], [160, 70]], { arrow: 'arrow', dashed: true }) + H.text(560, 18, 'push', { size: 14, anchor: 'middle', italic: true });
  b += H.line(712, 160, 832, 270, { dashed: true, arrow: 'arrow', stroke: '#8a97a8' });
  b += H.text(40, 385, 'En desarrollo, la API y PostgreSQL se ejecutan en el computador de los autores y la app en un emulador Android,', { size: 15, italic: true });
  b += H.text(40, 403, 'que llega al computador por la dirección 10.0.2.2. El despliegue en la nube con HTTPS está previsto.', { size: 15, italic: true });
  b += leyenda(40, 440);
  save('deployment_diagram', H.svgDoc(1120, 460, b));
}

useCases();
diagramasNucleo();
diagramasOperacion();
packageDiagram();
secuencias();
stateDiagram();
stateOps();
componentDiagram();
deploymentDiagram();
console.log('Diagramas en', OUT);
