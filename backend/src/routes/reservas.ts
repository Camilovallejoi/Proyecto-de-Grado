import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar } from '../auth.js';
import { aLocal, limitesDelDia, minutosDeHora } from '../tiempo.js';

export const reservasRouter = Router();
reservasRouter.use(autenticar);

const crearSchema = z.object({
  zona_id: z.number().int().positive(),
  inicio: z.string().datetime({ offset: true }),
  fin: z.string().datetime({ offset: true }),
});

const SELECT_RESERVA = `
  SELECT r.id, r.zona_id, z.nombre AS zona, r.inicio, r.fin, r.estado, r.creado_en,
         u.nombre AS usuario, ur.identificador AS unidad
    FROM reserva r
    JOIN zona_comun z ON z.id = r.zona_id
    JOIN usuario u ON u.id = r.usuario_id
    JOIN unidad_residencial ur ON ur.id = r.unidad_id`;

// Todas las reglas de negocio se validan aquí (backend); la app solo las refleja.
reservasRouter.post('/', async (req, res) => {
  const user = req.user!;
  const d = crearSchema.parse(req.body);
  if (!user.unidadId) throw new HttpError(403, 'Tu usuario no tiene una unidad residencial asociada');
  const inicio = new Date(d.inicio);
  const fin = new Date(d.fin);
  if (fin <= inicio) throw new HttpError(400, 'La hora de fin debe ser posterior a la de inicio');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT z.id, z.estado, to_char(z.hora_apertura,'HH24:MI') AS ap, to_char(z.hora_cierre,'HH24:MI') AS ci,
              r.duracion_maxima_min, r.anticipacion_minima_min, r.max_activas_por_unidad, r.dias_habilitados
         FROM zona_comun z JOIN regla_reserva r ON r.zona_id = z.id
        WHERE z.id = $1 AND z.copropiedad_id = $2 AND z.eliminada_en IS NULL`,
      [d.zona_id, user.copropiedadId],
    );
    const z = rows[0];
    if (!z) throw new HttpError(404, 'Zona no encontrada');
    if (z.estado !== 'activa') throw new HttpError(409, `La zona no está disponible (${z.estado})`);

    const li = aLocal(inicio);
    const lf = aLocal(fin);
    if (li.dia !== lf.dia) throw new HttpError(400, 'La reserva debe iniciar y terminar el mismo día');
    if (!z.dias_habilitados.includes(li.diaSemana)) throw new HttpError(400, 'La zona no está habilitada ese día de la semana');
    if (li.minutos < minutosDeHora(z.ap) || lf.minutos > minutosDeHora(z.ci)) {
      throw new HttpError(400, `La reserva debe estar dentro del horario de la zona (${z.ap} - ${z.ci})`);
    }
    const duracionMin = (fin.getTime() - inicio.getTime()) / 60000;
    if (duracionMin > z.duracion_maxima_min) throw new HttpError(400, `La duración máxima permitida es de ${z.duracion_maxima_min} minutos`);
    const anticipacionMin = (inicio.getTime() - Date.now()) / 60000;
    if (anticipacionMin < z.anticipacion_minima_min) {
      throw new HttpError(400, `Debes reservar con al menos ${z.anticipacion_minima_min} minutos de anticipación`);
    }

    // Serializa las reservas de una misma unidad para que el límite no se pueda saltar con peticiones simultáneas.
    await client.query('SELECT pg_advisory_xact_lock($1)', [user.unidadId]);
    const activas = await client.query(
      `SELECT count(*)::int AS n FROM reserva WHERE unidad_id = $1 AND zona_id = $2 AND estado = 'confirmada' AND fin > now()`,
      [user.unidadId, d.zona_id],
    );
    if (activas.rows[0].n >= z.max_activas_por_unidad) {
      throw new HttpError(409, `Tu unidad ya alcanzó el máximo de ${z.max_activas_por_unidad} reservas activas en esta zona`);
    }

    const ins = await client.query(
      `INSERT INTO reserva (copropiedad_id, zona_id, usuario_id, unidad_id, inicio, fin)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [user.copropiedadId, d.zona_id, user.id, user.unidadId, inicio, fin],
    );
    await auditar(client, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'crear_reserva', entidad: 'reserva', entidadId: ins.rows[0].id, detalle: d });
    await client.query('COMMIT');
    const out = await pool.query(`${SELECT_RESERVA} WHERE r.id = $1`, [ins.rows[0].id]);
    res.status(201).json(out.rows[0]);
  } catch (e: any) {
    await client.query('ROLLBACK');
    // 23P01 = violación de la restricción de exclusión: otro usuario reservó ese horario
    if (e.code === '23P01') throw new HttpError(409, 'Ese horario ya fue reservado por otra persona');
    throw e;
  } finally {
    client.release();
  }
});

reservasRouter.get('/mias', async (req, res) => {
  const { rows } = await pool.query(`${SELECT_RESERVA} WHERE r.usuario_id = $1 AND r.fin >= now() ORDER BY r.inicio DESC`, [req.user!.id]);
  res.json(rows);
});

// El administrador ve todas las reservas de su copropiedad (filtros opcionales).
reservasRouter.get('/', async (req, res) => {
  if (req.user!.rol !== 'administrador') throw new HttpError(403, 'No tienes permiso para esta acción');
  const q = z.object({ zona_id: z.coerce.number().int().optional(), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
  const params: unknown[] = [req.user!.copropiedadId];
  let where = 'WHERE r.copropiedad_id = $1 AND r.fin >= now()';
  if (q.zona_id) { params.push(q.zona_id); where += ` AND r.zona_id = $${params.length}`; }
  if (q.fecha) {
    const { inicio, fin } = limitesDelDia(q.fecha);
    params.push(inicio, fin);
    where += ` AND r.inicio < $${params.length} AND r.fin > $${params.length - 1}`;
  }
  const { rows } = await pool.query(`${SELECT_RESERVA} ${where} ORDER BY r.inicio DESC LIMIT 200`, params);
  res.json(rows);
});

// Cancela una reserva futura: la puede cancelar su autor o un administrador de la misma copropiedad.
reservasRouter.post('/:id/cancelar', async (req, res) => {
  const user = req.user!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const { rows } = await pool.query('SELECT usuario_id, estado, inicio FROM reserva WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
  const r = rows[0];
  if (!r) throw new HttpError(404, 'Reserva no encontrada');
  if (user.rol !== 'administrador' && r.usuario_id !== user.id) throw new HttpError(403, 'No puedes cancelar la reserva de otra persona');
  if (r.estado !== 'confirmada') throw new HttpError(409, 'La reserva ya estaba cancelada');
  if (new Date(r.inicio) <= new Date()) throw new HttpError(409, 'No se puede cancelar una reserva que ya comenzó');
  await pool.query(`UPDATE reserva SET estado = 'cancelada', cancelado_en = now() WHERE id = $1`, [id]);
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'cancelar_reserva', entidad: 'reserva', entidadId: id });
  const out = await pool.query(`${SELECT_RESERVA} WHERE r.id = $1`, [id]);
  res.json(out.rows[0]);
});

// El administrador elimina todas las reservas canceladas de su copropiedad.
// (Se declara antes de '/:id' para que 'canceladas' no se interprete como un identificador.)
reservasRouter.delete('/canceladas', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'administrador') throw new HttpError(403, 'No tienes permiso para esta acción');
  const { rowCount } = await pool.query(`DELETE FROM reserva WHERE copropiedad_id = $1 AND estado = 'cancelada'`, [user.copropiedadId]);
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'eliminar_reservas_canceladas', entidad: 'reserva', detalle: { cantidad: rowCount } });
  res.json({ eliminadas: rowCount });
});

// El administrador elimina una reserva (vigente o cancelada). Queda constancia en la auditoría.
reservasRouter.delete('/:id', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'administrador') throw new HttpError(403, 'No tienes permiso para esta acción');
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const { rows } = await pool.query(
    `DELETE FROM reserva WHERE id = $1 AND copropiedad_id = $2 RETURNING zona_id, usuario_id, unidad_id, inicio, fin, estado`,
    [id, user.copropiedadId],
  );
  if (!rows[0]) throw new HttpError(404, 'Reserva no encontrada');
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'eliminar_reserva', entidad: 'reserva', entidadId: id, detalle: rows[0] });
  res.status(204).end();
});
