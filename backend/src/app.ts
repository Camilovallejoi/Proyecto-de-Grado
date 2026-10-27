import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { manejarErrores } from './errors.js';
import { authRouter } from './routes/auth.js';
import { zonasRouter } from './routes/zonas.js';
import { reservasRouter } from './routes/reservas.js';
import { unidadesRouter } from './routes/unidades.js';

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

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(manejarErrores);
