import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { autenticar, exigirRol } from '../auth.js';
import { telefonoSchema } from '../telefono.js';

/**
 * Teléfonos para llamar. Reparto de visibilidad (mínimo privilegio):
 *  - Todos ven el número único de portería.
 *  - Solo el vigilante ve el directorio con los teléfonos de los residentes que autorizaron compartirlo.
 *  - Un residente nunca ve el teléfono de otro.
 */
export const contactoRouter = Router();
contactoRouter.use(autenticar);

contactoRouter.get('/porteria', async (req, res) => {
  const { rows } = await pool.query('SELECT telefono_porteria AS telefono FROM copropiedad WHERE id = $1', [req.user!.copropiedadId]);
  res.json({ telefono: rows[0]?.telefono ?? null });
});

// La administración define (o quita, con texto vacío) el número de portería.
contactoRouter.put('/porteria', exigirRol('administrador'), async (req, res) => {
  const user = req.user!;
  const { telefono } = z.object({ telefono: z.union([z.literal('').transform(() => null), telefonoSchema]) }).parse(req.body ?? {});
  await pool.query('UPDATE copropiedad SET telefono_porteria = $2 WHERE id = $1', [user.copropiedadId, telefono]);
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'cambiar_telefono_porteria', entidad: 'copropiedad', entidadId: user.copropiedadId });
  res.json({ telefono });
});

// Directorio de residentes para el vigilante: nombre, unidad y teléfono (solo si autorizaron).
contactoRouter.get('/residentes', exigirRol('vigilante'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, ur.identificador AS unidad,
            CASE WHEN u.telefono_autorizado_en IS NOT NULL THEN u.telefono END AS telefono
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id AND r.nombre = 'residente'
       LEFT JOIN unidad_residencial ur ON ur.id = u.unidad_id
      WHERE u.copropiedad_id = $1 AND u.estado = 'activo'
      ORDER BY ur.identificador, u.nombre`,
    [req.user!.copropiedadId],
  );
  res.json(rows);
});
