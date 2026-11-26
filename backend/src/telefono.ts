import { z } from 'zod';

/** Teléfono para marcar: de 7 a 15 dígitos, con "+" opcional. Se aceptan espacios, guiones y paréntesis al escribirlo. */
export const telefonoSchema = z
  .string()
  .trim()
  .max(30)
  .transform((t) => t.replace(/[\s().-]/g, ''))
  .refine((t) => /^\+?\d{7,15}$/.test(t), { message: 'Escribe un teléfono válido (de 7 a 15 dígitos)' });
