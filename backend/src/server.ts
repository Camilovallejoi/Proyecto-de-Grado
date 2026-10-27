import { config } from './config.js';
import { app } from './app.js';
import { iniciarLimpieza } from './limpieza.js';

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`API escuchando en http://localhost:${config.PORT}`);
  iniciarLimpieza();
});
