// Numeración automática de figuras y tablas, y listas que se generan al final a partir de lo realmente usado.
const fs = require('fs');
const path = require('path');
const { ImageCentered, Caption, Placeholder, SimpleTable } = require('../doc_helpers');

const FIG_ORDER = [
  'use_case', 'domain_model', 'er_model', 'package_diagram', 'class_diagram', 'sequence_diagram',
  'relational_model', 'state_diagram', 'component_diagram', 'deployment_diagram',
  'cap_login', 'cap_zonas', 'cap_reservar', 'cap_misreservas',
  'cap_adminmenu', 'cap_adminform', 'cap_adminreservas',
  'cod_api', 'cod_reservar', 'cod_reglas', 'cod_sql', 'cod_eliminar', 'cap_tests',
];
const TAB_ORDER = [
  'comparativo', 'fases', 'tecnologias', 'rf', 'rnf', 'cu_reservar', 'cu_zonas',
  'diccionario', 'api', 'reglas', 'diagnostico', 'hojaruta', 'objetivos',
  'pruebas_auto', 'pruebas_manual', 'entorno',
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

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function Fig(key, titulo) {
  usadasFig.push(key);
  titulosFig[key] = titulo;
  const buf = fs.readFileSync(path.join(DIAG, key + '.png'));
  const { w, h } = pngSize(buf);
  const ancho = 600;
  const alto = Math.round((ancho * h) / w);
  return [ImageCentered(null, buf, ancho, alto), Caption(`${F(key)}. ${titulo}.`)];
}

function FigCaptura(key, titulo, detalle, alto) {
  usadasFig.push(key);
  titulosFig[key] = titulo;
  return [Placeholder(titulo, detalle, alto), Caption(`${F(key)}. ${titulo}.`)];
}

function Tab(key, titulo, header, rows, widths) {
  usadasTab.push(key);
  titulosTab[key] = titulo;
  const { Paragraph, TextRun, AlignmentType } = require('docx');
  const caption = new Paragraph({
    alignment: AlignmentType.LEFT,
    keepNext: true,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: `${T(key)}. ${titulo}.`, bold: true, italics: true, size: 20, font: 'Calibri' })],
  });
  return [caption, SimpleTable(header, rows, widths), new Paragraph({ spacing: { after: 160 }, children: [] })];
}

function verificarOrden() {
  const f = FIG_ORDER.filter((k) => usadasFig.includes(k));
  const t = TAB_ORDER.filter((k) => usadasTab.includes(k));
  if (JSON.stringify(f) !== JSON.stringify(usadasFig)) throw new Error('Las figuras no aparecen en el orden de FIG_ORDER: ' + usadasFig.join(','));
  if (JSON.stringify(t) !== JSON.stringify(usadasTab)) throw new Error('Las tablas no aparecen en el orden de TAB_ORDER: ' + usadasTab.join(','));
  const sinUsarF = FIG_ORDER.filter((k) => !usadasFig.includes(k));
  const sinUsarT = TAB_ORDER.filter((k) => !usadasTab.includes(k));
  if (sinUsarF.length || sinUsarT.length) throw new Error('Sin usar: ' + sinUsarF.concat(sinUsarT).join(','));
}

function listaFiguras() {
  return usadasFig.map((k) => `${F(k)}. ${titulosFig[k]}`);
}
function listaTablas() {
  return usadasTab.map((k) => `${T(k)}. ${titulosTab[k]}`);
}

module.exports = { F, T, Fig, FigCaptura, Tab, verificarOrden, listaFiguras, listaTablas };
