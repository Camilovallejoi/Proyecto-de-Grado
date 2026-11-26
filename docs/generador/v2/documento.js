// Arma el documento del proyecto: node v2/documento.js
// Después conviene ejecutar v2/actualizar_word.ps1 para calcular la tabla de contenido y los números de página.
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, PageNumber, Header, Footer, LevelFormat, convertInchesToTwip,
  TableOfContents,
} = require('docx');
const { H1 } = require('../doc_helpers');

// El orden de estos require fija la numeración de figuras y tablas (se registran al construir cada capítulo).
const p1 = require('./parte1');
const metodo = require('./metodo');
const p2 = require('./parte2');
const p3 = require('./parte3');
const { referencias } = require('./referencias');
const { anexos } = require('./anexos');
const ctx = require('./ctx');
ctx.verificarOrden();

const tituloSuelto = (texto, saltar = true) => new Paragraph({
  pageBreakBefore: saltar,
  spacing: { before: 240, after: 200 },
  children: [new TextRun({ text: texto, bold: true, size: 30, font: 'Calibri', color: '1F4E79' })],
});

const estiloIndice = (id, nombre, sangria, negrita) => ({
  id, name: nombre, basedOn: 'Normal', next: 'Normal',
  run: { font: 'Calibri', size: 19, bold: negrita },
  paragraph: { spacing: { after: 0, line: 235 }, indent: { left: sangria }, tabStops: [{ type: 'right', position: 9020, leader: 'dot' }] },
});

const frontMatter = [
  ...p1.portada,
  ...p1.notaAceptacion,
  ...p1.agradecimientos,
  ...p1.resumen,
  tituloSuelto('Tabla de Contenido'),
  new TableOfContents('Tabla de Contenido', { hyperlink: true, headingStyleRange: '1-2' }),
  ...p1.listaSimbolos,
  H1('Lista de Figuras'), ...ctx.listaFiguras(),
  H1('Lista de Tablas'), ...ctx.listaTablas(),
];

const body = [
  ...p1.cap1, ...p1.cap2, ...metodo.cap3,
  ...p2.cap4,
  ...p3.cap5, ...p3.cap6, ...p3.cap7,
  ...referencias,
  ...anexos,
];

const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 20 })] })] });
const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Gestión de Zonas Comunes y Servicios Residenciales — Propiedad Horizontal', font: 'Calibri', size: 16, italics: true, color: '808080' })] })] });

const doc = new Document({
  creator: 'Camilo José Vallejo Isaza, Jesús Mendoza',
  title: 'Aplicación móvil para la gestión integral de zonas comunes y servicios residenciales en conjuntos y edificios de propiedad horizontal',
  features: { updateFields: false },
  styles: {
    default: { document: { run: { font: 'Calibri' } } },
    paragraphStyles: [estiloIndice('TOC1', 'toc 1', 0, true), estiloIndice('TOC2', 'toc 2', 340, false)],
  },
  numbering: {
    config: [{
      reference: 'bullet-list',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.2) } } } }],
    }],
  },
  sections: [{
    properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1300, left: 1440, right: 1440 } } },
    headers: { default: header, first: new Header({ children: [new Paragraph({ children: [] })] }) },
    footers: { default: footer, first: new Footer({ children: [new Paragraph({ children: [] })] }) },
    children: [...frontMatter, ...body],
  }],
});

const salida = path.join(__dirname, '..', '..', 'documento', 'Proyecto_de_Grado_Corregido.docx');
fs.mkdirSync(path.dirname(salida), { recursive: true });
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(salida, buf);
  console.log('Documento escrito:', salida, buf.length, 'bytes');
  console.log(ctx.conteo());
});
