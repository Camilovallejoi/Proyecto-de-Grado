// Numeración automática de figuras y tablas, y listas (con número de página) que se generan a partir de lo realmente usado.
const fs = require('fs');
const path = require('path');
const {
  Paragraph, TextRun, AlignmentType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  Bookmark, PageReference, InternalHyperlink, TabStopType,
} = require('docx');
const { SimpleTable } = require('../doc_helpers');

const FIG_ORDER = [
  // capítulo 4: análisis
  'use_case_residente', 'use_case_vigilante', 'use_case_admin', 'domain_model', 'domain_ops', 'er_model', 'er_ops', 'package_diagram',
  // capítulo 4: diseño
  'class_diagram', 'class_ops', 'sequence_diagram', 'sequence_porton', 'sequence_visita', 'sequence_avisos', 'sequence_clave',
  'relational_model', 'relational_ops', 'state_diagram', 'state_ops', 'component_diagram', 'deployment_diagram',
  // capítulos 5 y 6
  'app_acceso', 'app_res_reservas', 'app_res_inicio', 'app_vig_porteria', 'app_adm_resumen',
  'cod2_sql', 'cod2_reglas', 'cod2_responder', 'cod2_autenticar', 'cod2_clave', 'cap2_pruebas',
  // anexo A
  'app_clave', 'app_res_acceso', 'app_res_chat', 'app_res_conjunto', 'app_res_perfil',
  'app_vig_registro', 'app_vig_zonas', 'app_vig_comunica', 'app_vig_novedades',
  'app_adm_gestion', 'app_adm_usuarios', 'app_adm_clave', 'app_adm_unidades',
];

const TAB_ORDER = [
  'comparativo', 'comparativa_co', 'comparativa_roles',
  'sprints', 'marco_tipo', 'marco_localidad', 'muestra', 'variables', 'validacion', 'cruces', 'fases',
  'tecnologias', 'rf', 'rnf', 'permisos',
  'cu_reservar', 'cu_visita', 'cu_porton', 'cu_clave', 'cu_zonas', 'cu_paquete',
  'diccionario', 'api', 'reglas', 'retencion',
  'diagnostico', 'diagnostico_local', 'hojaruta', 'objetivos',
  'pruebas_api', 'pruebas_limpieza', 'pruebas_ui', 'pruebas_manual', 'defectos',
  'entorno', 'problemas', 'juicio', 'tareas_usabilidad', 'sus',
];

const usadasFig = [];
const usadasTab = [];
const titulosFig = {};
const titulosTab = {};

const F = (k) => {
  const i = FIG_ORDER.indexOf(k);
  if (i < 0) throw new Error('Figura desconocida: ' + k);
  return 'Figura ' + (i + 1);
};
const T = (k) => {
  const i = TAB_ORDER.indexOf(k);
  if (i < 0) throw new Error('Tabla desconocida: ' + k);
  return 'Tabla ' + (i + 1);
};

const DIAG = path.join(__dirname, '..', '..', 'diagramas');
const CAPT = path.join(__dirname, '..', '..', 'capturas');
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const sinBordes = { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE };

const imagen = (data, width, height) => new ImageRun({ type: 'png', data, transformation: { width, height } });

function leyendaFigura(key, titulo) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 220 },
    children: [new Bookmark({ id: 'fig_' + key, children: [new TextRun({ text: `${F(key)}. ${titulo}.`, italics: true, bold: true, size: 20, font: 'Calibri' })] })],
  });
}

/** Diagrama UML. `ancho` en píxeles de la página (600 = todo el ancho útil); se reduce si quedara demasiado alto. */
function Fig(key, titulo, ancho = 600, altoMax = 700) {
  usadasFig.push(key);
  titulosFig[key] = titulo;
  const buf = fs.readFileSync(path.join(DIAG, key + '.png'));
  const { w, h } = pngSize(buf);
  let an = ancho;
  let al = Math.round((an * h) / w);
  if (al > altoMax) { al = altoMax; an = Math.round((al * w) / h); }
  return [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 100, after: 20 }, children: [imagen(buf, an, al)] }), leyendaFigura(key, titulo)];
}

/** Capturas de docs/capturas (clave_1.png, clave_2.png...). Las de teléfono van lado a lado, con un rótulo cada una. */
function FigCaptura(key, titulo, rotulos = [], opciones = {}) {
  usadasFig.push(key);
  titulosFig[key] = titulo;
  const imgs = [];
  for (let i = 1; fs.existsSync(path.join(CAPT, `${key}_${i}.png`)); i++) imgs.push(fs.readFileSync(path.join(CAPT, `${key}_${i}.png`)));
  if (!imgs.length) throw new Error('Falta la captura ' + key);
  const dims = imgs.map(pngSize);
  if (dims[0].h / dims[0].w <= 1.3) {
    const anchoImg = opciones.ancho || 540;
    return [
      ...imgs.map((b, i) => new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 100, after: 20 }, children: [imagen(b, anchoImg, Math.round((anchoImg * dims[i].h) / dims[i].w))] })),
      leyendaFigura(key, titulo),
    ];
  }
  if (rotulos.length && rotulos.length !== imgs.length) throw new Error(`${key}: ${imgs.length} imágenes y ${rotulos.length} rótulos`);
  const ancho = opciones.ancho || (imgs.length === 3 ? 160 : 180);
  const col = Math.floor(9000 / 3);
  const columnas = imgs.map(() => col);
  const celda = (children) => new TableCell({ width: { size: col, type: WidthType.DXA }, borders: sinBordes, children });
  const filas = [new TableRow({
    cantSplit: true,
    children: imgs.map((b, i) => celda([new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [imagen(b, ancho, Math.round((ancho * dims[i].h) / dims[i].w))] })])),
  })];
  if (rotulos.length) {
    filas.push(new TableRow({
      cantSplit: true,
      children: rotulos.map((t, i) => celda([new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 40 }, children: [new TextRun({ text: `(${'abc'[i]}) ${t}`, size: 17, font: 'Calibri', color: '444444' })] })])),
    }));
  }
  const tabla = new Table({
    width: { size: col * imgs.length, type: WidthType.DXA },
    columnWidths: columnas,
    alignment: AlignmentType.CENTER,
    borders: { ...sinBordes, insideHorizontal: SIN_BORDE, insideVertical: SIN_BORDE },
    rows: filas,
  });
  return [tabla, leyendaFigura(key, titulo)];
}

function Tab(key, titulo, header, rows, widths, opts = {}) {
  usadasTab.push(key);
  titulosTab[key] = titulo;
  const caption = new Paragraph({
    alignment: AlignmentType.LEFT,
    keepNext: true,
    spacing: { before: 160, after: 80 },
    children: [new Bookmark({ id: 'tab_' + key, children: [new TextRun({ text: `${T(key)}. ${titulo}.`, bold: true, italics: true, size: 20, font: 'Calibri' })] })],
  });
  return [caption, SimpleTable(header, rows, widths, opts), new Paragraph({ spacing: { after: 120 }, children: [] })];
}

function verificarOrden() {
  const revisar = (orden, usadas, que) => {
    const sinUsar = orden.filter((k) => !usadas.includes(k));
    if (sinUsar.length) throw new Error(`${que} sin usar: ${sinUsar.join(', ')}`);
    usadas.forEach((k, i) => { if (orden[i] !== k) throw new Error(`${que} fuera de orden en la posición ${i + 1}: se usó "${k}" y se esperaba "${orden[i]}"`); });
  };
  revisar(FIG_ORDER, usadasFig, 'Figuras');
  revisar(TAB_ORDER, usadasTab, 'Tablas');
}

function entradaLista(id, texto) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9000, leader: 'dot' }],
    spacing: { after: 40 },
    indent: { right: 500 },
    children: [new InternalHyperlink({ anchor: id, children: [new TextRun({ text: texto, size: 21, font: 'Calibri' }), new TextRun({ text: '\t', size: 21 })] }), new PageReference(id)],
  });
}

const listaFiguras = () => usadasFig.map((k) => entradaLista('fig_' + k, `${F(k)}. ${titulosFig[k]}`));
const listaTablas = () => usadasTab.map((k) => entradaLista('tab_' + k, `${T(k)}. ${titulosTab[k]}`));
const conteo = () => ({ figuras: usadasFig.length, tablas: usadasTab.length });

module.exports = { F, T, Fig, FigCaptura, Tab, verificarOrden, listaFiguras, listaTablas, conteo };
