import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { manejarErrores } from './errors.js';
import { authRouter } from './routes/auth.js';
import { zonasRouter } from './routes/zonas.js';
import { reservasRouter } from './routes/reservas.js';
import { unidadesRouter } from './routes/unidades.js';
import { portonRouter } from './routes/porton.js';
import { dispositivosRouter } from './routes/dispositivos.js';
import { visitasRouter } from './routes/visitas.js';
import { chatRouter } from './routes/chat.js';
import { comunicadosRouter } from './routes/comunicados.js';
import { pqrsRouter } from './routes/pqrs.js';
import { usuariosRouter } from './routes/usuarios.js';
import { reportesRouter } from './routes/reportes.js';
import { paquetesRouter } from './routes/paquetes.js';
import { incidenciasRouter } from './routes/incidencias.js';
import { minutaRouter } from './routes/minuta.js';
import { contactoRouter } from './routes/contacto.js';
import { notificacionesRouter } from './routes/notificaciones.js';
import { inicioRouter } from './routes/inicio.js';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'zonas-comunes-api', time: new Date().toISOString() });
});

app.use('/auth', authRouter);
app.use('/zonas', zonasRouter);
app.use('/reservas', reservasRouter);
app.use('/unidades', unidadesRouter);
app.use('/porton', portonRouter);
app.use('/dispositivos', dispositivosRouter);
app.use('/visitas', visitasRouter);
app.use('/chat', chatRouter);
app.use('/comunicados', comunicadosRouter);
app.use('/pqrs', pqrsRouter);
app.use('/usuarios', usuariosRouter);
app.use('/reportes', reportesRouter);
app.use('/paquetes', paquetesRouter);
app.use('/incidencias', incidenciasRouter);
app.use('/minuta', minutaRouter);
app.use('/contacto', contactoRouter);
app.use('/notificaciones', notificacionesRouter);
app.use('/inicio', inicioRouter);

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(manejarErrores);
