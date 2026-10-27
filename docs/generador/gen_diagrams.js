// Genera los 10 diagramas del documento a partir del estado REAL de la aplicación.
// Blanco/azul = implementado. Gris = previsto en fases futuras (existe en el diseño o en el esquema, pero la app aún no lo usa).
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const H = require('./svg_helpers');

const OUT = path.join(__dirname, '..', 'diagramas');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const GRIS = '#e4e4e4';
const GRIS_TXT = '#555555';

function save(name, svg) {
  const png = new Resvg(svg, { background: 'white', fitTo: { mode: 'width', value: 2000 } }).render().asPng();
  fs.writeFileSync(path.join(OUT, name + '.png'), png);
  console.log(name, 'ok', png.length);
}

function leyenda(x, y, textoGris) {
  return (
    `<rect x="${x}" y="${y - 12}" width="16" height="14" fill="#ffffff" stroke="${H.LINE}"/>` +
    H.text(x + 22, y, 'Implementado en esta fase', { size: 12 }) +
    `<rect x="${x + 190}" y="${y - 12}" width="16" height="14" fill="${GRIS}" stroke="${H.LINE}"/>` +
    H.text(x + 212, y, textoGris, { size: 12 })
  );
}

// ---------- 1. Casos de uso ----------
function useCaseDiagram() {
  const W = 1000, H_ = 720;
  let b = '';
  const sx = 220, sy = 30, sw = 560, sh = 620;
  b += H.box(sx, sy, sw, sh, { fill: '#fbfcfe' });
  b += H.text(sx + sw / 2, sy + 22, 'Sistema: Aplicación de Gestión de Zonas Comunes', { anchor: 'middle', weight: 'bold', size: 13 });
  const res = [
    ['Iniciar sesión / Registrarse', 90, false],
    ['Consultar disponibilidad de zona común', 150, false],
    ['Reservar zona común', 210, false],
    ['Cancelar / consultar mis reservas', 270, false],
    ['Registrar PQRS', 330, true],
    ['Reportar incidencia', 390, true],
    ['Consultar comunicaciones', 450, true],
    ['Recibir notificaciones', 510, true],
  ];
  const adm = [
    ['Gestionar zonas y reglas|(crear, editar, mantenimiento, eliminar)', 90, false],
    ['Consultar y cancelar reservas', 170, false],
    ['Gestionar PQRS', 250, true],
    ['Gestionar incidencias', 330, true],
    ['Publicar comunicaciones', 410, true],
    ['Consultar reportes y auditoría', 490, true],
  ];
  res.forEach(([l, y, p]) => { b += H.ellipseUC(sx + 150, y, 130, 30, l.split(' / '), { fill: p ? GRIS : '#ffffff' }); });
  adm.forEach(([l, y, p]) => { b += H.ellipseUC(sx + 410, y, 130, 30, l.split('|'), { fill: p ? GRIS : '#ffffff' }); });
  b += H.actor(60, 260, 'Residente');
  b += H.actor(910, 260, 'Administrador');
  res.forEach(([, y]) => { b += H.line(95, 300, sx + 20, y, {}); });
  adm.forEach(([, y]) => { b += H.line(905, 300, sx + sw - 20, y, {}); });
  b += H.line(sx + 150, 210 - 30, sx + 150, 150 + 30, { dashed: true, arrow: 'arrowOpen' });
  b += H.text(sx + 160, 188, '«include»', { size: 9.5, italic: true });
  b += leyenda(sx + 20, sy + sh - 14, 'Previsto en fases futuras');
  save('use_case', H.svgDoc(W, H_, b));
}

// ---------- Diseño en cuadrícula (dominio, ER, relacional, clases) ----------
const COLS = { A: 40, B: 300, C: 560, D: 830 };
const ROWS = { r1: 50, r2: 300, r3: 560 };

function boxDiagram(defs, rels, opts = {}) {
  const W = opts.width || 1180, Ht = opts.height || 740;
  let b = '';
  const boxes = {};
  Object.entries(defs).forEach(([id, d]) => {
    const fill = d.planned ? GRIS : opts.fill;
    const r = H.classBox(d.x, d.y, d.w, d.title, d.attrs || [], d.methods || [], { fill });
    b += r.svg;
    boxes[id] = { x: d.x, y: d.y, w: d.w, h: r.height };
  });
  rels.forEach((rel) => {
    const A = boxes[rel.a], B = boxes[rel.b];
    let lx, ly;
    if (rel.kind === 'row') { b += H.rowConnect(A, B, {}); lx = (A.x + A.w + B.x) / 2; ly = A.y + A.h / 2 - 6; }
    else if (rel.kind === 'col') { b += H.colConnect(A, B, {}); lx = A.x + A.w / 2 + 26; ly = (Math.min(A.y, B.y) + Math.min(A.y, B.y) === 0 ? 0 : (A.y + A.h + B.y) / 2); ly = (A.y < B.y ? (A.y + A.h + B.y) / 2 : (B.y + B.h + A.y) / 2); }
    else if (rel.kind === 'gutter') { b += H.gutterConnect(A, B, rel.gx, rel.laneY, {}); lx = (rel.gx + B.x + B.w / 2) / 2; ly = rel.laneY - 6; }
    else { b += H.laneConnect(A, B, rel.laneY, rel.fromSide, rel.toSide, {}); lx = (A.x + A.w / 2 + B.x + B.w / 2) / 2; ly = rel.laneY - 6; }
    if (rel.label) b += H.text(lx, ly, rel.label, { size: 10, anchor: 'middle', italic: true });
  });
  if (opts.legend) b += leyenda(40, Ht - 14, opts.legend);
  return H.svgDoc(W, Ht, b);
}

// Relaciones comunes a los 4 diagramas de la cuadrícula (cop = copropiedad)
function relsBase(l) {
  return [
    { a: 'cop', b: 'unidad', kind: 'col', label: l[0] },
    { a: 'cop', b: 'comunicacion', kind: 'row', label: l[0] },
    { a: 'cop', b: 'zona', kind: 'lane', laneY: 34, fromSide: 'top', toSide: 'top', label: l[0] },
    { a: 'unidad', b: 'usuario', kind: 'row', label: l[0] },
    { a: 'rol', b: 'usuario', kind: 'col', label: l[0] },
    { a: 'zona', b: 'regla', kind: 'col', label: l[1] },
    { a: 'zona', b: 'reserva', kind: 'row', label: l[0] },
    { a: 'usuario', b: 'reserva', kind: 'gutter', gx: 535, laneY: 14, label: l[0] },
    { a: 'usuario', b: 'pqrs', kind: 'gutter', gx: 535, laneY: 210, label: l[0] },
    { a: 'usuario', b: 'incidencia', kind: 'lane', laneY: 480, fromSide: 'bottom', toSide: 'top', label: l[0] },
    { a: 'usuario', b: 'notificacion', kind: 'lane', laneY: 465, fromSide: 'bottom', toSide: 'top', label: l[0] },
    { a: 'usuario', b: 'auditoria', kind: 'lane', laneY: 450, fromSide: 'bottom', toSide: 'top', label: l[2] },
  ];
}

function domainModel() {
  const defs = {
    cop: { x: COLS.A, y: ROWS.r1, w: 200, title: 'Copropiedad', attrs: ['nombre', 'nit', 'ciudad', 'reglamentoInterno'] },
    unidad: { x: COLS.A, y: ROWS.r2, w: 200, title: 'UnidadResidencial', attrs: ['identificador'] },
    auditoria: { x: COLS.A, y: ROWS.r3, w: 200, title: 'RegistroAuditoría', attrs: ['accion', 'entidad', 'fechaHora'] },
    comunicacion: { x: COLS.B, y: ROWS.r1, w: 210, title: 'Comunicación', attrs: ['titulo', 'contenido', 'fechaPublicacion'], planned: true },
    usuario: { x: COLS.B, y: ROWS.r2, w: 210, title: 'Usuario', attrs: ['nombre', 'correo', 'telefono', 'estado'] },
    rol: { x: COLS.B, y: ROWS.r3, w: 210, title: 'Rol', attrs: ['nombre'] },
    zona: { x: COLS.C, y: ROWS.r1, w: 210, title: 'ZonaComún', attrs: ['nombre', 'aforo', 'horarioApertura', 'horarioCierre', 'estado'] },
    regla: { x: COLS.C, y: ROWS.r2, w: 210, title: 'ReglaReserva', attrs: ['duracionMaxima', 'anticipacionMinima', 'maxActivasPorUnidad', 'diasHabilitados'] },
    notificacion: { x: COLS.C, y: ROWS.r3, w: 210, title: 'Notificación', attrs: ['tipo', 'mensaje', 'leida'], planned: true },
    reserva: { x: COLS.D, y: ROWS.r1, w: 210, title: 'Reserva', attrs: ['inicio', 'fin', 'estado'] },
    pqrs: { x: COLS.D, y: ROWS.r2, w: 210, title: 'PQRS', attrs: ['tipo', 'descripcion', 'estado'], planned: true },
    incidencia: { x: COLS.D, y: ROWS.r3, w: 210, title: 'Incidencia', attrs: ['descripcion', 'gravedad', 'estado'], planned: true },
  };
  save('domain_model', boxDiagram(defs, relsBase(['1..N', '1..1', 'registra']), { legend: 'Previsto en fases futuras' }));
}

function erModel() {
  const f = '#eaf3ff';
  const defs = {
    cop: { x: COLS.A, y: ROWS.r1, w: 200, title: 'COPROPIEDAD', attrs: ['PK id_copropiedad', 'nombre', 'nit', 'ciudad'] },
    unidad: { x: COLS.A, y: ROWS.r2, w: 200, title: 'UNIDAD_RESIDENCIAL', attrs: ['PK id_unidad', 'FK id_copropiedad', 'identificador'] },
    auditoria: { x: COLS.A, y: ROWS.r3, w: 200, title: 'REGISTRO_AUDITORIA', attrs: ['PK id', 'FK usuario_id', 'accion', 'entidad'] },
    comunicacion: { x: COLS.B, y: ROWS.r1, w: 210, title: 'COMUNICACION', attrs: ['PK id', 'FK copropiedad_id', 'titulo'], planned: true },
    usuario: { x: COLS.B, y: ROWS.r2, w: 210, title: 'USUARIO', attrs: ['PK id', 'FK copropiedad_id', 'FK unidad_id', 'FK rol_id', 'correo'] },
    rol: { x: COLS.B, y: ROWS.r3, w: 210, title: 'ROL', attrs: ['PK id', 'nombre'] },
    zona: { x: COLS.C, y: ROWS.r1, w: 210, title: 'ZONA_COMUN', attrs: ['PK id', 'FK copropiedad_id', 'nombre', 'estado'] },
    regla: { x: COLS.C, y: ROWS.r2, w: 210, title: 'REGLA_RESERVA', attrs: ['PK id', 'FK zona_id (único)', 'duracion_maxima_min'] },
    notificacion: { x: COLS.C, y: ROWS.r3, w: 210, title: 'NOTIFICACION', attrs: ['PK id', 'FK usuario_id', 'leida'], planned: true },
    reserva: { x: COLS.D, y: ROWS.r1, w: 220, title: 'RESERVA', attrs: ['PK id', 'FK zona_id', 'FK usuario_id', 'FK unidad_id', 'inicio / fin'] },
    pqrs: { x: COLS.D, y: ROWS.r2, w: 220, title: 'PQRS', attrs: ['PK id', 'FK usuario_id', 'estado'], planned: true },
    incidencia: { x: COLS.D, y: ROWS.r3, w: 220, title: 'INCIDENCIA', attrs: ['PK id', 'FK usuario_id', 'FK zona_id'], planned: true },
  };
  save('er_model', boxDiagram(defs, relsBase(['1:N', '1:1', '1:N']), { fill: f, legend: 'Previsto en fases futuras' }));
}

function relationalModel() {
  const f = '#fef7e6';
  const defs = {
    cop: { x: COLS.A, y: ROWS.r1, w: 215, title: 'copropiedad', attrs: ['PK id: SERIAL', 'nombre: VARCHAR(150)', 'nit: VARCHAR(20) UNIQUE', 'ciudad: VARCHAR(80)'] },
    unidad: { x: COLS.A, y: ROWS.r2, w: 215, title: 'unidad_residencial', attrs: ['PK id: SERIAL', 'FK copropiedad_id: INT', 'identificador: VARCHAR(40)'] },
    auditoria: { x: COLS.A, y: ROWS.r3, w: 215, title: 'registro_auditoria', attrs: ['PK id: BIGSERIAL', 'FK usuario_id: INT', 'accion: VARCHAR(60)', 'detalle: JSONB'] },
    comunicacion: { x: COLS.B, y: ROWS.r1, w: 215, title: 'comunicacion', attrs: ['PK id: SERIAL', 'FK copropiedad_id: INT', 'titulo: VARCHAR(150)'], planned: true },
    usuario: { x: COLS.B, y: ROWS.r2, w: 215, title: 'usuario', attrs: ['PK id: SERIAL', 'FK copropiedad_id: INT', 'FK unidad_id: INT', 'FK rol_id: SMALLINT', 'correo: VARCHAR(160)', 'password_hash: TEXT'] },
    rol: { x: COLS.B, y: ROWS.r3, w: 215, title: 'rol', attrs: ['PK id: SMALLSERIAL', 'nombre: VARCHAR(30) UNIQUE'] },
    zona: { x: COLS.C, y: ROWS.r1, w: 225, title: 'zona_comun', attrs: ['PK id: SERIAL', 'FK copropiedad_id: INT', 'hora_apertura / hora_cierre: TIME', 'estado: VARCHAR(15)', 'eliminada_en: TIMESTAMPTZ'] },
    regla: { x: COLS.C, y: ROWS.r2, w: 225, title: 'regla_reserva', attrs: ['PK id: SERIAL', 'FK zona_id: INT UNIQUE', 'duracion_maxima_min: INT', 'max_activas_por_unidad: INT'] },
    notificacion: { x: COLS.C, y: ROWS.r3, w: 225, title: 'notificacion', attrs: ['PK id: SERIAL', 'FK usuario_id: INT', 'leida: BOOLEAN'], planned: true },
    reserva: { x: COLS.D, y: ROWS.r1, w: 235, title: 'reserva', attrs: ['PK id: SERIAL', 'FK zona_id / FK unidad_id', 'FK usuario_id: INT', 'inicio, fin: TIMESTAMPTZ', 'estado: VARCHAR(12)', 'EXCLUDE (zona, rango)'] },
    pqrs: { x: COLS.D, y: ROWS.r2, w: 235, title: 'pqrs', attrs: ['PK id: SERIAL', 'FK usuario_id: INT', 'estado: VARCHAR(15)'], planned: true },
    incidencia: { x: COLS.D, y: ROWS.r3, w: 235, title: 'incidencia', attrs: ['PK id: SERIAL', 'FK usuario_id / FK zona_id', 'estado: VARCHAR(15)'], planned: true },
  };
  save('relational_model', boxDiagram(defs, relsBase(['FK', 'FK', 'FK']), { fill: f, legend: 'Tabla creada, módulo aún sin implementar' }));
}

function classDiagram() {
  const defs = {
    cop: { x: COLS.A, y: ROWS.r1, w: 215, title: 'Copropiedad', attrs: ['- id: int', '- nombre: String', '- nit: String'], methods: [] },
    unidad: { x: COLS.A, y: ROWS.r2, w: 215, title: 'UnidadResidencial', attrs: ['- id: int', '- identificador: String'], methods: [] },
    auditoria: { x: COLS.A, y: ROWS.r3, w: 215, title: 'RegistroAuditoria', attrs: ['- id: int', '- accion: String', '- entidad: String'], methods: ['+ registrar()'] },
    comunicacion: { x: COLS.B, y: ROWS.r1, w: 215, title: 'Comunicacion', attrs: ['- id: int', '- titulo: String'], methods: ['+ publicar()'], planned: true },
    usuario: { x: COLS.B, y: ROWS.r2, w: 215, title: 'Usuario', attrs: ['- id: int', '- nombre: String', '- correo: String', '- estado: String'], methods: ['+ autenticar()', '+ registrarse(codigo)'] },
    rol: { x: COLS.B, y: ROWS.r3, w: 215, title: 'Rol', attrs: ['- id: int', '- nombre: String'], methods: [] },
    zona: { x: COLS.C, y: ROWS.r1, w: 225, title: 'ZonaComun', attrs: ['- id: int', '- nombre: String', '- aforo: int', '- estado: String'], methods: ['+ disponibilidad(fecha)', '+ ponerEnMantenimiento()', '+ eliminar()'] },
    regla: { x: COLS.C, y: ROWS.r2, w: 225, title: 'ReglaReserva', attrs: ['- duracionMaximaMin: int', '- anticipacionMinimaMin: int', '- maxActivasPorUnidad: int'], methods: ['+ validar(reserva)'] },
    notificacion: { x: COLS.C, y: ROWS.r3, w: 225, title: 'Notificacion', attrs: ['- id: int', '- mensaje: String'], methods: ['+ marcarLeida()'], planned: true },
    reserva: { x: COLS.D, y: ROWS.r1, w: 235, title: 'Reserva', attrs: ['- id: int', '- inicio: DateTime', '- fin: DateTime', '- estado: String'], methods: ['+ crear()', '+ cancelar()'] },
    pqrs: { x: COLS.D, y: ROWS.r2, w: 235, title: 'PQRS', attrs: ['- id: int', '- tipo: String', '- estado: String'], methods: ['+ cambiarEstado()'], planned: true },
    incidencia: { x: COLS.D, y: ROWS.r3, w: 235, title: 'Incidencia', attrs: ['- id: int', '- estado: String'], methods: ['+ cerrar()'], planned: true },
  };
  save('class_diagram', boxDiagram(defs, relsBase(['1..N', '1..1', '1..N']), { width: 1240, height: 760, legend: 'Previsto en fases futuras' }));
}

// ---------- 4. Paquetes ----------
function packageDiagram() {
  const W = 1040, H_ = 540;
  let b = '';
  b += H.pkgBox(40, 40, 220, 130, 'Núcleo', ['Autenticación (JWT)', 'Usuarios y roles', 'Copropiedades y unidades']);
  b += H.pkgBox(320, 40, 220, 130, 'Zonas y Reservas', ['Zonas comunes', 'Reglas de reserva', 'Reservas']);
  b += H.pkgBox(600, 40, 220, 130, 'Atención al residente', ['PQRS', 'Incidencias'], GRIS);
  b += H.pkgBox(880, 40, 130, 130, 'Comunicaciones', [], GRIS);
  b += H.pkgBox(160, 260, 220, 130, 'Auditoría', ['Registro de acciones']);
  b += H.pkgBox(440, 260, 220, 130, 'Panel administrativo', ['Zonas y reservas (en la app)']);
  b += H.pkgBox(720, 260, 220, 130, 'Financiero (futuro)', ['Cuotas', 'Cartera', 'Pagos'], GRIS);
  const dep = (x1, y1, x2, y2) => { b += H.line(x1, y1, x2, y2, { dashed: true, arrow: 'arrowOpen' }); };
  dep(320, 105, 260, 105); dep(600, 105, 540, 105); dep(880, 105, 820, 105);
  dep(270, 260, 200, 170); dep(550, 260, 480, 170); dep(830, 260, 720, 170);
  b += H.text(W / 2, 440, '«dependency» — las flechas indican la dirección de dependencia entre paquetes', { anchor: 'middle', size: 11, italic: true });
  b += leyenda(40, 500, 'Previsto en fases futuras');
  save('package_diagram', H.svgDoc(W, H_, b));
}

// ---------- 6. Secuencia: Reservar zona común (flujo real) ----------
function sequenceDiagram() {
  const W = 1040, H_ = 640;
  let b = '';
  const names = ['Residente', 'App Móvil (Flutter)', 'API (Express)', 'PostgreSQL'];
  const xs = [90, 350, 610, 880];
  names.forEach((n, i) => {
    b += H.box(xs[i] - 85, 40, 170, 30, { fill: H.FILL_ACCENT });
    b += H.text(xs[i], 60, n, { anchor: 'middle', weight: 'bold', size: 11.5 });
    b += H.line(xs[i], 70, xs[i], 610, { dashed: true });
  });
  const msgs = [
    [0, 1, 100, 'Elige zona y día'],
    [1, 2, 135, 'GET /zonas/:id/disponibilidad?fecha='],
    [2, 3, 170, 'SELECT reservas confirmadas del día'],
    [3, 2, 205, 'horarios ocupados'],
    [2, 1, 240, '200 OK {zona, regla, ocupados}'],
    [1, 0, 275, 'muestra horas e intervalos libres'],
    [0, 1, 310, 'Elige hora, duración y confirma'],
    [1, 2, 345, 'POST /reservas {zona_id, inicio, fin}'],
    [2, 2, 380, 'valida reglas de negocio'],
    [2, 3, 415, 'INSERT reserva (BEGIN … COMMIT)'],
    [3, 2, 450, 'OK, o error 23P01 si hay solape'],
    [2, 1, 485, '201 Created, o 409 Conflict'],
    [1, 0, 520, 'confirma, o informa el motivo'],
  ];
  msgs.forEach(([f, t, y, l]) => {
    if (f === t) {
      b += `<path d="M ${xs[f]} ${y - 12} h 38 v 22 h -38" fill="none" stroke="${H.LINE}" stroke-width="1.4" marker-end="url(#arrow)"/>`;
      b += H.text(xs[f] + 46, y - 1, l, { size: 10 });
    } else {
      b += H.line(xs[f], y, xs[t], y, { arrow: 'arrow' });
      b += H.text((xs[f] + xs[t]) / 2, y - 6, l, { anchor: 'middle', size: 10 });
    }
  });
  b += H.box(xs[1] - 5, 100, 10, 430, { fill: '#ffffff' });
  b += H.box(xs[2] - 5, 135, 10, 380, { fill: '#ffffff' });
  b += H.box(xs[3] - 5, 170, 10, 40, { fill: '#ffffff' });
  b += H.box(xs[3] - 5, 415, 10, 40, { fill: '#ffffff' });
  save('sequence_diagram', H.svgDoc(W, H_, b));
}

// ---------- 8. Estados: Reserva y Zona común (reales) ----------
function stateDiagram() {
  const W = 1080, H_ = 470;
  let b = '';
  const pill = (cx, cy, w, label, fill = '#eaf3ff') => H.box(cx - w / 2, cy - 28, w, 56, { rx: 28, fill }) + H.text(cx, cy + 5, label, { anchor: 'middle', size: 12, weight: 'bold' });
  b += H.text(40, 30, 'Reserva', { weight: 'bold', size: 14 });
  b += `<circle cx="50" cy="90" r="8" fill="${H.INK}"/>`;
  b += H.line(58, 90, 150, 90, { arrow: 'arrow' });
  b += H.text(104, 80, 'crear', { size: 10, anchor: 'middle', italic: true });
  b += pill(230, 90, 160, 'Confirmada');
  b += H.line(310, 90, 560, 90, { arrow: 'arrow' });
  b += H.text(435, 80, 'cancelar (residente o administrador)', { size: 10, anchor: 'middle', italic: true });
  b += pill(640, 90, 160, 'Cancelada', '#fdeaea');
  b += H.line(720, 90, 790, 90, { arrow: 'arrow' });
  b += `<circle cx="805" cy="90" r="9" fill="none" stroke="${H.INK}" stroke-width="1.5"/><circle cx="805" cy="90" r="4" fill="${H.INK}"/>`;
  b += H.text(840, 78, 'Solo se cancela antes de comenzar.', { size: 10, italic: true });
  b += H.text(840, 96, 'La cancelada se elimina a las 24 h,', { size: 10, italic: true });
  b += H.text(840, 112, 'o antes si el administrador la elimina.', { size: 10, italic: true });
  b += H.polyline([[230, 118], [230, 150], [805, 150], [805, 100]], { dashed: true, arrow: 'arrow' });
  b += H.text(520, 143, 'al terminar su horario se elimina automáticamente', { size: 10, anchor: 'middle', italic: true });

  b += H.text(40, 190, 'Zona común', { weight: 'bold', size: 14 });
  b += `<circle cx="50" cy="270" r="8" fill="${H.INK}"/>`;
  b += H.line(58, 270, 150, 270, { arrow: 'arrow' });
  b += H.text(104, 260, 'crear', { size: 10, anchor: 'middle', italic: true });
  b += pill(230, 270, 160, 'Activa');
  b += H.line(300, 252, 520, 252, { arrow: 'arrow' });
  b += H.text(410, 244, 'poner en mantenimiento', { size: 10, anchor: 'middle', italic: true });
  b += H.line(520, 290, 300, 290, { arrow: 'arrow' });
  b += H.text(410, 308, 'reactivar', { size: 10, anchor: 'middle', italic: true });
  b += pill(600, 270, 160, 'En mantenimiento', '#fff3dc');
  b += H.line(230, 298, 230, 395, { arrow: 'arrow', dashed: true });
  b += H.text(240, 350, 'ocultar', { size: 10, italic: true });
  b += pill(230, 420, 160, 'Inactiva', '#eeeeee');
  b += H.line(310, 420, 560, 420, { arrow: 'arrow', dashed: true });
  b += H.text(435, 410, 'eliminar (cualquier estado, sin reservas futuras)', { size: 10, anchor: 'middle', italic: true });
  b += pill(640, 420, 160, 'Eliminada', '#fdeaea');
  b += `<circle cx="805" cy="420" r="9" fill="none" stroke="${H.INK}" stroke-width="1.5"/><circle cx="805" cy="420" r="4" fill="${H.INK}"/>`;
  b += H.line(720, 420, 790, 420, { arrow: 'arrow' });
  b += H.text(840, 425, 'Eliminación lógica: se conserva el historial.', { size: 10, italic: true });
  save('state_diagram', H.svgDoc(W, H_, b));
}

// ---------- 9. Componentes ----------
function componentDiagram() {
  const W = 1080, H_ = 520;
  let b = '';
  const comp = (x, y, w, h, lines, fill = '#eef2f7') => {
    b += H.box(x, y, w, h, { fill });
    b += H.box(x + 10, y + 8, 22, 10, { fill: '#ffffff' });
    b += H.box(x + 10, y + 24, 22, 10, { fill: '#ffffff' });
    const cy = y + h / 2 - (lines.length - 1) * 7;
    lines.forEach((l, i) => { b += H.text(x + w / 2 + 10, cy + i * 15, l, { anchor: 'middle', size: 12, weight: 'bold' }); });
  };
  comp(40, 150, 220, 100, ['App Móvil', '(Flutter / Dart)']);
  b += H.box(340, 30, 400, 430, { fill: '#fbfcfe', rx: 8 });
  b += H.text(540, 52, 'API REST (Node.js + Express) — monolito modular', { anchor: 'middle', weight: 'bold', size: 12.5 });
  comp(370, 70, 340, 50, ['Módulo de autenticación y usuarios']);
  comp(370, 135, 340, 50, ['Módulo de zonas comunes y reglas']);
  comp(370, 200, 340, 50, ['Módulo de reservas']);
  comp(370, 265, 340, 50, ['Módulo de auditoría']);
  comp(370, 330, 340, 50, ['Módulos PQRS e incidencias'], GRIS);
  comp(370, 395, 340, 50, ['Módulos de comunicaciones y notificaciones'], GRIS);
  comp(810, 150, 230, 100, ['Base de datos', 'PostgreSQL']);
  comp(810, 330, 230, 100, ['Proveedor push', '(Firebase Cloud Messaging)'], GRIS);
  b += H.line(260, 200, 340, 200, { arrow: 'arrow' });
  b += H.text(300, 192, 'HTTP/REST', { size: 10, anchor: 'middle', italic: true });
  b += H.line(740, 200, 810, 200, { arrow: 'arrow' });
  b += H.text(775, 192, 'SQL', { size: 10, anchor: 'middle', italic: true });
  b += H.line(710, 420, 810, 390, { arrow: 'arrow', dashed: true });
  b += leyenda(40, 500, 'Previsto en fases futuras');
  save('component_diagram', H.svgDoc(W, H_, b));
}

// ---------- 10. Despliegue ----------
function deploymentDiagram() {
  const W = 1080, H_ = 440;
  let b = '';
  const node = (x, y, w, h, lines, fill = '#f4f6f9') => {
    b += H.box(x, y, w, h, { fill });
    b += `<rect x="${x - 6}" y="${y - 10}" width="${w}" height="${h}" fill="none" stroke="${H.LINE}" stroke-width="1.2"/>`;
    b += `<line x1="${x - 6}" y1="${y - 10}" x2="${x}" y2="${y}" stroke="${H.LINE}" stroke-width="1.2"/>`;
    b += `<line x1="${x - 6 + w}" y1="${y - 10}" x2="${x + w}" y2="${y}" stroke="${H.LINE}" stroke-width="1.2"/>`;
    b += `<line x1="${x - 6}" y1="${y - 10 + h}" x2="${x}" y2="${y + h}" stroke="${H.LINE}" stroke-width="1.2"/>`;
    const cy = y + h / 2 - (lines.length - 1) * 7 + 6;
    lines.forEach((l, i) => { b += H.text(x + w / 2, cy + i * 15, l, { anchor: 'middle', size: 12, weight: 'bold' }); });
  };
  node(40, 90, 230, 110, ['Dispositivo Android', '«device»', 'App Flutter (APK)']);
  node(430, 60, 250, 110, ['Servidor de aplicación', '«execution environment»', 'API Node.js + Express']);
  node(430, 250, 250, 110, ['Servidor de datos', '«database server»', 'PostgreSQL']);
  node(810, 60, 230, 110, ['Servicio de notificaciones', '«cloud service»', 'Firebase Cloud Messaging'], GRIS);
  b += H.line(276, 145, 424, 115, { arrow: 'arrow' });
  b += H.text(350, 112, 'HTTP/REST (JSON)', { size: 10, italic: true, anchor: 'middle' });
  b += H.line(555, 170, 555, 244, { arrow: 'arrow' });
  b += H.text(600, 212, 'SQL (pg)', { size: 10, italic: true });
  b += H.line(680, 115, 804, 115, { arrow: 'arrow', dashed: true });
  b += H.text(742, 105, 'push (previsto)', { size: 10, italic: true, anchor: 'middle' });
  b += H.text(40, 330, 'En desarrollo, API y base de datos se ejecutan en el equipo del desarrollador', { size: 11, italic: true });
  b += H.text(40, 348, 'y la app en un emulador Android. El despliegue en la nube (con HTTPS) está previsto.', { size: 11, italic: true });
  b += leyenda(40, 420, 'Previsto en fases futuras');
  save('deployment_diagram', H.svgDoc(W, H_, b));
}

useCaseDiagram();
domainModel();
erModel();
packageDiagram();
classDiagram();
sequenceDiagram();
relationalModel();
stateDiagram();
componentDiagram();
deploymentDiagram();
console.log('Diagramas en', OUT);
