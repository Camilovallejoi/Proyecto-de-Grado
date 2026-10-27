// Minimal SVG primitive helpers for hand-built UML-style diagrams.
const INK = '#1f2933';
const LINE = '#334155';
const FILL_LIGHT = '#eef2f7';
const FILL_ACCENT = '#dbe7f5';
const FONT = "font-family='Calibri, Arial, sans-serif'";

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function text(x, y, s, opts = {}) {
  const size = opts.size || 14;
  const anchor = opts.anchor || 'start';
  const weight = opts.weight || 'normal';
  const fill = opts.fill || INK;
  const style = opts.italic ? "font-style='italic'" : '';
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${fill}" ${FONT} ${style}>${esc(s)}</text>`;
}

function multilineText(x, y, lines, opts = {}) {
  const lh = opts.lineHeight || (opts.size || 14) + 4;
  return lines.map((l, i) => text(x, y + i * lh, l, opts)).join('\n');
}

function box(x, y, w, h, opts = {}) {
  const fill = opts.fill || FILL_LIGHT;
  const stroke = opts.stroke || LINE;
  const rx = opts.rx != null ? opts.rx : 4;
  const sw = opts.strokeWidth || 1.5;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

// A UML class box: title bar + attribute list + optional method list, separated by lines.
function classBox(x, y, w, title, attrs = [], methods = [], opts = {}) {
  const titleH = 28;
  const rowH = 16;
  const attrsH = Math.max(attrs.length, 1) * rowH + 8;
  const methodsH = methods.length ? methods.length * rowH + 8 : 10;
  const totalH = titleH + attrsH + methodsH;
  let s = box(x, y, w, totalH, { fill: opts.fill || '#ffffff' });
  s += box(x, y, w, titleH, { fill: opts.fill || FILL_ACCENT, rx: 0 });
  s += `<rect x="${x}" y="${y}" width="${w}" height="${totalH}" rx="4" fill="none" stroke="${LINE}" stroke-width="1.5"/>`;
  s += `<line x1="${x}" y1="${y + titleH}" x2="${x + w}" y2="${y + titleH}" stroke="${LINE}" stroke-width="1.2"/>`;
  s += text(x + w / 2, y + titleH - 9, title, { anchor: 'middle', weight: 'bold', size: 13 });
  let ay = y + titleH + 14;
  attrs.forEach((a) => {
    s += text(x + 8, ay, a, { size: 11 });
    ay += rowH;
  });
  if (methods.length) {
    s += `<line x1="${x}" y1="${y + titleH + attrsH}" x2="${x + w}" y2="${y + titleH + attrsH}" stroke="${LINE}" stroke-width="1.2"/>`;
    let my = y + titleH + attrsH + 14;
    methods.forEach((m) => {
      s += text(x + 8, my, m, { size: 11 });
      my += rowH;
    });
  }
  return { svg: s, height: totalH };
}

function line(x1, y1, x2, y2, opts = {}) {
  const stroke = opts.stroke || LINE;
  const sw = opts.strokeWidth || 1.4;
  const dash = opts.dashed ? "stroke-dasharray='5,4'" : '';
  const marker = opts.arrow ? `marker-end="url(#${opts.arrow})"` : '';
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${dash} ${marker}/>`;
}

function polyline(points, opts = {}) {
  const stroke = opts.stroke || LINE;
  const sw = opts.strokeWidth || 1.4;
  const dash = opts.dashed ? "stroke-dasharray='5,4'" : '';
  const marker = opts.arrow ? `marker-end="url(#${opts.arrow})"` : '';
  const pts = points.map((p) => p.join(',')).join(' ');
  return `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}" ${dash} ${marker}/>`;
}

function ellipseUC(cx, cy, rx, ry, label, opts = {}) {
  const fill = opts.fill || '#ffffff';
  let s = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${LINE}" stroke-width="1.5"/>`;
  const lines = Array.isArray(label) ? label : [label];
  const lh = 13;
  const startY = cy - ((lines.length - 1) * lh) / 2 + 4;
  lines.forEach((l, i) => {
    s += text(cx, startY + i * lh, l, { anchor: 'middle', size: 11.5 });
  });
  return s;
}

// Simple stick-figure actor with a caption below.
function actor(cx, y, label) {
  const headR = 9;
  const bodyTop = y + headR * 2;
  const bodyBot = bodyTop + 26;
  let s = `<circle cx="${cx}" cy="${y + headR}" r="${headR}" fill="#ffffff" stroke="${LINE}" stroke-width="1.6"/>`;
  s += line(cx, bodyTop, cx, bodyBot, {});
  s += line(cx - 14, bodyTop + 10, cx + 14, bodyTop + 10, {});
  s += line(cx, bodyBot, cx - 12, bodyBot + 20, {});
  s += line(cx, bodyBot, cx + 12, bodyBot + 20, {});
  s += text(cx, bodyBot + 36, label, { anchor: 'middle', weight: 'bold', size: 12 });
  return s;
}

function pkgBox(x, y, w, h, title, items = [], fill = '#ffffff') {
  const tabW = Math.min(90, w * 0.42);
  const tabH = 16;
  let s = `<rect x="${x}" y="${y}" width="${tabW}" height="${tabH}" fill="${FILL_ACCENT}" stroke="${LINE}" stroke-width="1.3"/>`;
  s += box(x, y + tabH, w, h - tabH, { fill });
  s += text(x + 6, y + tabH - 4, title, { size: 11.5, weight: 'bold' });
  let iy = y + tabH + 18;
  items.forEach((it) => {
    s += text(x + w / 2, iy, it, { size: 10.5, anchor: 'middle' });
    iy += 15;
  });
  return s;
}

function svgDoc(width, height, body, opts = {}) {
  const bg = opts.bg || '#ffffff';
  const defs = `
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L8,3 L0,6 Z" fill="${LINE}"/>
    </marker>
    <marker id="arrowOpen" markerWidth="12" markerHeight="12" refX="9" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L9,4 L0,8" fill="none" stroke="${LINE}" stroke-width="1.3"/>
    </marker>
  </defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>
  ${defs}
  ${body}
  </svg>`;
}

// Orthogonal (Manhattan) connector routed through a horizontal lane that sits
// in empty space (above all rows, or in the gutter between two rows), so the
// path never cuts through a box. `fromSide`/`toSide` are 'top' or 'bottom'.
function laneConnect(A, B, laneY, fromSide, toSide, opts = {}) {
  const cxA = A.x + A.w / 2;
  const cxB = B.x + B.w / 2;
  const ay = fromSide === 'top' ? A.y : A.y + A.h;
  const by = toSide === 'top' ? B.y : B.y + B.h;
  const points = [[cxA, ay], [cxA, laneY], [cxB, laneY], [cxB, by]];
  return polyline(points, opts);
}

// Straight horizontal connector between two boxes that sit on the same row.
// Sale por el costado derecho de A, sube por el pasillo vertical gx hasta laneY y baja a B. Evita cruzar cajas.
function gutterConnect(A, B, gx, laneY, opts = {}) {
  const ay = A.y + A.h / 2;
  const points = [[A.x + A.w, ay], [gx, ay], [gx, laneY], [B.x + B.w / 2, laneY], [B.x + B.w / 2, B.y]];
  return polyline(points, opts);
}

function rowConnect(A, B, opts = {}) {
  const ay = A.y + A.h / 2;
  const by = B.y + B.h / 2;
  const x1 = A.x + A.w <= B.x ? A.x + A.w : A.x;
  const x2 = A.x + A.w <= B.x ? B.x : B.x + B.w;
  return line(x1, ay, x2, by, opts);
}

// Straight vertical connector between two boxes stacked in the same column.
function colConnect(A, B, opts = {}) {
  const ax = A.x + A.w / 2;
  const y1 = A.y + A.h <= B.y ? A.y + A.h : A.y;
  const y2 = A.y + A.h <= B.y ? B.y : B.y + B.h;
  return line(ax, y1, ax, y2, opts);
}

module.exports = {
  esc, text, multilineText, box, classBox, line, polyline, ellipseUC, actor, pkgBox, svgDoc,
  laneConnect, rowConnect, colConnect, gutterConnect,
  INK, LINE, FILL_LIGHT, FILL_ACCENT,
};
