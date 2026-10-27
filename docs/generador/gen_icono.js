// Genera el ícono de la app (luna creciente sobre fondo beige) en los tamaños de Android.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <mask id="corte"><rect width="512" height="512" fill="white"/><circle cx="326" cy="214" r="150" fill="black"/></mask>
  </defs>
  <rect width="512" height="512" rx="118" fill="#EADCC9"/>
  <circle cx="256" cy="270" r="170" fill="#7A5C45" mask="url(#corte)"/>
  <circle cx="360" cy="150" r="17" fill="#A68B73"/>
  <circle cx="410" cy="232" r="12" fill="#A68B73"/>
</svg>`;

const res = path.join(__dirname, '..', '..', 'mobile', 'android', 'app', 'src', 'main', 'res');
const tamanos = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };
for (const [carpeta, px] of Object.entries(tamanos)) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng();
  fs.writeFileSync(path.join(res, carpeta, 'ic_launcher.png'), png);
}
fs.writeFileSync(path.join(__dirname, '..', 'diagramas', 'icono_cantaluna.svg'), svg);
console.log('Íconos generados');
