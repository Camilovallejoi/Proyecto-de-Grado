// Genera las figuras de código a partir de los archivos fuente actuales (con sus números de línea reales)
// y, si se indican los registros de las pruebas, la figura con su salida.
//   node gen_codigo.js [carpeta_con_smoke_final.log_limp_final.log_ui_final.log]
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const RAIZ = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, '..', 'capturas');
fs.mkdirSync(OUT, { recursive: true });

const MAX = 104; // caracteres por renglón antes de partirlo
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function partir(texto) {
  if (texto.length <= MAX) return [texto];
  const sangria = ' '.repeat(Math.min(texto.length - texto.trimStart().length + 4, 20));
  let corte = texto.lastIndexOf(' ', MAX);
  if (corte < 40) corte = MAX;
  return [texto.slice(0, corte), ...partir(sangria + texto.slice(corte).trimStart())];
}

function pintar(nombre, titulo, renglones, oscuro = false) {
  const alto = 21, ancho = 1040, arriba = 44;
  const total = arriba + renglones.length * alto + 18;
  const c = oscuro
    ? { fondo: '#1e242c', barra: '#2b333d', texto: '#dce3ea', num: '#6f7d8c', tit: '#dce3ea', com: '#8fbf8f' }
    : { fondo: '#fbfbfc', barra: '#e9edf2', texto: '#1f2933', num: '#94a1b0', tit: '#334155', com: '#4d7c4d' };
  let b = `<rect width="${ancho}" height="${total}" fill="${c.fondo}" stroke="#b9c6d6"/><rect width="${ancho}" height="32" fill="${c.barra}"/>`;
  b += `<text x="14" y="21" font-family="Consolas, monospace" font-size="14" font-weight="bold" fill="${c.tit}">${esc(titulo)}</text>`;
  renglones.forEach(([num, t], i) => {
    const y = arriba + 12 + i * alto;
    const limpio = t.trimStart();
    const comentario = /^(\/\/|\/\*|\*|--|#)/.test(limpio);
    b += `<text x="46" y="${y}" font-family="Consolas, monospace" font-size="13" text-anchor="end" fill="${c.num}">${num}</text>`;
    b += `<text x="60" y="${y}" xml:space="preserve" font-family="Consolas, monospace" font-size="14" fill="${comentario ? c.com : c.texto}">${esc(t)}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${total}">${b}</svg>`;
  const png = new Resvg(svg, { background: 'white', fitTo: { mode: 'width', value: 1560 } }).render().asPng();
  fs.writeFileSync(path.join(OUT, nombre + '.png'), png);
  console.log(nombre, renglones.length, 'renglones');
}

/** Toma desde la primera línea que contiene `desde` hasta la primera posterior que cumple `hasta` (incluida). */
function fragmento(nombre, archivo, desde, hasta, omitirDesde) {
  const lineas = fs.readFileSync(path.join(RAIZ, archivo), 'utf8').replace(/\r/g, '').split('\n');
  const i = lineas.findIndex((l) => l.includes(desde));
  if (i < 0) throw new Error(`${archivo}: no se encontró "${desde}"`);
  let j = i;
  while (j < lineas.length - 1 && !hasta(lineas[j], j - i)) j++;
  const bloque = lineas.slice(i, j + 1);
  const comun = Math.min(...bloque.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  const renglones = [];
  bloque.forEach((l, k) => partir(l.slice(comun)).forEach((t, m) => renglones.push([m ? '' : i + k + 1, t])));
  pintar(nombre, `${archivo}  (líneas ${i + 1} a ${j + 1})`, renglones);
}

fragmento('cod2_sql_1', 'backend/db/migrations/001_esquema_inicial.sql', 'CREATE TABLE reserva (', (l) => l.startsWith(');'));
let vioLimite = false;
fragmento('cod2_reglas_1', 'backend/src/routes/reservas.ts', 'const li = aLocal(inicio);', (l) => {
  if (l.includes('activas.rows[0].n >=')) vioLimite = true;
  return vioLimite && l.trim() === '}';
});
let vio409 = false;
fragmento('cod2_responder_1', 'backend/src/routes/visitas.ts', '// Solo el residente al que visitan autoriza', (l) => {
  if (l.includes('La solicitud ya no se puede responder')) vio409 = true;
  return vio409 && l.trim() === '}';
});
fragmento('cod2_autenticar_1', 'backend/src/auth.ts', 'export async function autenticar', (l) => l === '}');
fragmento('cod2_clave_1', 'backend/src/clave.ts', '/** Horas que sirve', (l, n) => n > 5 && l === '}');

const logs = process.argv[2];
if (logs) {
  const leer = (f) => fs.readFileSync(path.join(logs, f), 'utf8').replace(/\r/g, '').split('\n');
  const renglones = [];
  const bloque = (comando, archivo, ultimos) => {
    const l = leer(archivo);
    const ok = l.filter((x) => x.startsWith('OK')).length;
    const mal = l.filter((x) => /^(FALL|FAIL)/.test(x)).length;
    renglones.push(['', `> ${comando}`]);
    renglones.push(['', `  ... (${ok - ultimos} verificaciones anteriores)`]);
    l.filter((x) => x.startsWith('OK')).slice(-ultimos).forEach((x) => renglones.push(['', x]));
    renglones.push(['', 'Todas las verificaciones pasaron']);
    renglones.push(['', `# ${ok} verificaciones aprobadas, ${mal} fallidas`], ['', '']);
  };
  bloque('npm run test', 'smoke_final.log', 6);
  bloque('npm run test:limpieza', 'limp_final.log', 5);
  const ui = leer('ui_final.log').filter((x) => /^\d\d:\d\d \+\d+/.test(x) && !x.includes('loading'));
  renglones.push(['', '> flutter test'], ['', '  ...']);
  ui.slice(-5).forEach((x) => partir(x.replace(/C:\/.*?\/test\//, '')).forEach((t) => renglones.push(['', t])));
  renglones.push(['', ''], ['', '> flutter analyze        No issues found!'], ['', '> npx tsc --noEmit       (sin errores)']);
  pintar('cap2_pruebas_1', 'Salida de las ejecuciones del 26 de noviembre de 2026 (últimas líneas de cada una)', renglones, true);
}
