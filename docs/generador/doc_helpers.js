const {
  Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, ImageRun, PageBreak, VerticalAlign, HeightRule,
} = require('docx');

const FONT = 'Calibri';

function P(text, opts = {}) {
  const runOpts = {
    text: text || '',
    italics: !!opts.italics,
    bold: !!opts.bold,
    size: opts.size || 24, // 12pt
    font: FONT,
    color: opts.color,
  };
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: opts.after != null ? opts.after : 200, line: opts.lineSpacing || 276 },
    indent: opts.indent,
    children: [new TextRun(runOpts)],
    pageBreakBefore: !!opts.pageBreakBefore,
  });
}

function Rich(runs, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: opts.after != null ? opts.after : 200, line: opts.lineSpacing || 276 },
    pageBreakBefore: !!opts.pageBreakBefore,
    children: runs.map((r) => new TextRun({ font: FONT, size: 24, ...r })),
  });
}

function H1(text, opts = {}) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: opts.pageBreakBefore !== false,
    spacing: { before: 240, after: 240 },
    children: [new TextRun({ text, bold: true, size: 30, font: FONT, color: '1F4E79' })],
  });
}

function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 240, after: 160 },
    children: [new TextRun({ text, bold: true, size: 27, font: FONT, color: '2E5A8C' })],
  });
}

function H3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    spacing: { before: 200, after: 140 },
    children: [new TextRun({ text, bold: true, italics: true, size: 24, font: FONT, color: '2E5A8C' })],
  });
}

function Bullet(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: 'bullet-list', level: 0 },
    spacing: { after: 100, line: 276 },
    children: [new TextRun({ text, size: 24, font: FONT, italics: !!opts.italics })],
  });
}

function NoteBox(lines) {
  const paras = lines.map((l, i) => new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: i === lines.length - 1 ? 0 : 120, line: 276 },
    children: [new TextRun({ text: l, italics: true, size: 22, font: FONT, color: '5B4636' })],
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allBorders('D9C8A9', 6),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FFF7E6' },
            margins: { top: 150, bottom: 150, left: 150, right: 150 },
            children: paras,
          }),
        ],
      }),
    ],
  });
}

function allBorders(color, size = 4) {
  const b = { style: BorderStyle.SINGLE, size, color };
  return { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b };
}

// Simple table: header row (array of strings) + body rows (array of array of strings).
// colWidths: array of DXA widths summing to totalWidth.
function SimpleTable(header, rows, colWidths, opts = {}) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  function cell(text, i, isHeader) {
    return new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: isHeader
        ? { type: ShadingType.CLEAR, color: 'auto', fill: '1F4E79' }
        : (opts.zebra && opts._rowIdx % 2 === 1 ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F6FA' } : undefined),
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      children: [new Paragraph({
        alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: String(text), bold: !!isHeader, color: isHeader ? 'FFFFFF' : '000000', size: 20, font: FONT })],
      })],
    });
  }
  const headerRow = new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => cell(h, i, true)) });
  const bodyRows = rows.map((r, ri) => {
    opts._rowIdx = ri;
    return new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) });
  });
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    borders: allBorders('B9C6D6', 4),
    rows: [headerRow, ...bodyRows],
  });
}

function Caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 240 },
    children: [new TextRun({ text, italics: true, bold: true, size: 20, font: FONT })],
  });
}

function ImageCentered(imagePath, pngBuffer, width, height) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { before: 120, after: 40 },
    children: [new ImageRun({ type: 'png', data: pngBuffer, transformation: { width, height } })],
  });
}

function BreakPage() {
  return new Paragraph({ children: [new PageBreak()] });
}

function Placeholder(titulo, detalle, alto = 4200) {
  const lineas = [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 80 }, children: [new TextRun({ text: 'ESPACIO PARA CAPTURA', bold: true, size: 20, font: FONT, color: '7A7A7A' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 80 }, children: [new TextRun({ text: titulo, bold: true, size: 22, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [new TextRun({ text: detalle, italics: true, size: 20, font: FONT, color: '555555' })] }),
  ];
  const b = { style: BorderStyle.DASHED, size: 8, color: '999999' };
  return new Table({
    width: { size: 7200, type: WidthType.DXA },
    columnWidths: [7200],
    alignment: AlignmentType.CENTER,
    borders: { top: b, bottom: b, left: b, right: b, insideHorizontal: b, insideVertical: b },
    rows: [new TableRow({
      height: { value: alto, rule: HeightRule.ATLEAST },
      children: [new TableCell({
        width: { size: 7200, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F5' },
        margins: { top: 200, bottom: 200, left: 200, right: 200 },
        children: lineas,
      })],
    })],
  });
}

module.exports = {
  Placeholder,
  P, Rich, H1, H2, H3, Bullet, NoteBox, SimpleTable, Caption, ImageCentered, BreakPage, allBorders, FONT,
};
