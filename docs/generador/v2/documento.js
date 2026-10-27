const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, PageNumber, Header, Footer, LevelFormat, convertInchesToTwip,
} = require('docx');
const { P, H1, BreakPage } = require('../doc_helpers');

const p1 = require('./parte1');
const p2 = require('./parte2');
const p3 = require('./parte3');
const ctx = require('./ctx');
ctx.verificarOrden();

const lista = (titulo, items) => [
  H1(titulo),
  P('Nota: la numeración de página puede generarse automáticamente en Word con Referencias > Insertar tabla de ilustraciones, una vez diagramada la versión final.', { italics: true, size: 20, after: 200 }),
  ...items.map((t) => P(t, { after: 100, align: 'left' })),
];

const frontMatter = [
  ...p1.portada, BreakPage(),
  ...p1.notaAceptacion, BreakPage(),
  ...p1.agradecimientos, BreakPage(),
  ...p1.resumen, BreakPage(),
  ...p1.listaSimbolos, BreakPage(),
  ...lista('Lista de Figuras', ctx.listaFiguras()), BreakPage(),
  ...lista('Lista de Tablas', ctx.listaTablas()),
];

const body = [
  ...p1.cap1, ...p1.cap2, ...p1.cap3,
  ...p2.cap4,
  ...p3.cap5, ...p3.cap6, ...p3.cap7,
  ...p3.referencias,
  ...p3.anexos,
];

const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 20 })] })] });
const header = new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Gestión de Zonas Comunes y Servicios Residenciales — Propiedad Horizontal', font: 'Calibri', size: 16, italics: true, color: '808080' })] })] });

const doc = new Document({
  creator: 'Camilo José Vallejo Isaza, Jesús Mendoza',
  title: 'Aplicación móvil para la gestión integral de zonas comunes y servicios residenciales en conjuntos y edificios de propiedad horizontal',
  numbering: {
    config: [{
      reference: 'bullet-list',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.2) } } } }],
    }],
  },
  sections: [{
    properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: { default: header, first: new Header({ children: [new Paragraph({ children: [] })] }) },
    footers: { default: footer, first: new Footer({ children: [new Paragraph({ children: [] })] }) },
    children: [...frontMatter, BreakPage(), ...body],
  }],
});

const salida = path.join(__dirname, '..', '..', 'documento', 'Proyecto_de_Grado_Corregido.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(salida, buf);
  console.log('Documento escrito:', salida, buf.length, 'bytes');
  console.log('Figuras:', ctx.listaFiguras().length, 'Tablas:', ctx.listaTablas().length);
});
