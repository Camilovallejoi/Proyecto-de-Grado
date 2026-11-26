import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'Falta DATABASE_URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  // Horas que una reserva cancelada sigue visible (para el administrador) antes de borrarse sola.
  // Ruta al JSON de la cuenta de servicio de Firebase (opcional: sin ella no se envían notificaciones push).
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  RETENCION_CANCELADAS_HORAS: z.coerce.number().min(0).default(24),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuración inválida en backend/.env:');
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}

export const config = parsed.data;
