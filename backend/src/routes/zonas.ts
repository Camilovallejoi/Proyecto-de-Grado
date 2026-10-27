import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar, exigirRol } from '../auth.js';
import { limitesDelDia, minutosDeHora } from '../tiempo.js';

export const zonasRouter = Router();
zonasRouter.use(autenticar);

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato HH:MM');
const reglaSchema = z.object({
  duracion_maxima_min: z.number().int().min(15).max(720),
  anticipacion_minima_min: z.number().int().min(0).max(60 * 24 * 30),
  max_activas_por_unidad: z.number().int().min(1).max(20),
  dias_habilitados: z.array(z.number().int().min(0).max(6)).min(1),
});
const zonaBase = z.object({
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().trim().max(500).nullish(),
  aforo: z.number().int().min(1).nullish(),
  hora_apertura: hora,
  hora_cierre: hora,
  estado: z.enum(['activa', 'inactiva', 'mantenimiento']),
});
const crearSchema = zonaBase.extend({ estado: zonaBase.shape.estado.default('activa'), regla: reglaSchema.partial().default({}) });
const editarSchema = zonaBase.partial().extend({ regla: reglaSchema.partial().optional() });

const SELECT_ZONA = `
  SELECT z.id, z.nombre, z.descripcion, z.aforo,
         to_char(z.hora_apertura,'HH24:MI') AS hora_apertura,
         to_char(z.hora_cierre,'HH24:MI')   AS hora_cierre,
         z.estado,
         json_build_object(
           'duracion_maxima_min', r.duracion_maxima_min,
           'anticipacion_minima_min', r.anticipacion_minima_min,
           'max_activas_por_unidad', r.max_activas_por_unidad,
           'dias_habilitados', r.dias_habilitados
         ) AS regla
    FROM zona_comun z LEFT JOIN regla_reserva r ON r.zona_id = z.id`;

zonasRouter.get('/', async (req, res) => {
  const soloActivas = req.user!.rol === 'residente' ? "AND z.estado <> 'inactiva'" : '';
  const { rows } = await pool.query(`${SELECT_ZONA} WHERE z.copropiedad_id = $1 AND z.eliminada_en IS NULL ${soloActivas} ORDER BY z.nombre`, [req.user!.copropiedadId]);
  res.json(rows);
});

zonasRouter.post('/', exigirRol('administrador'), async (req, res) => {
  const d = crearSchema.parse(req.body);
  if (minutosDeHora(d.hora_cierre) <= minutosDeHora(d.hora_apertura)) throw new HttpError(400, 'La hora de cierre debe ser posterior a la de apertura');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const z = await client.query(
      `INSERT INTO zona_comun (copropiedad_id, nombre, descripcion, aforo, hora_apertura, hora_cierre, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user!.copropiedadId, d.nombre, d.descripcion ?? null, d.aforo ?? null, d.hora_apertura, d.hora_cierre, d.estado],
    );
    const r = d.regla;
    await client.query(
      `INSERT INTO regla_reserva (zona_id, duracion_maxima_min, anticipacion_minima_min, max_activas_por_unidad, dias_habilitados)
       VALUES ($1,$2,$3,$4,$5)`,
      [z.rows[0].id, r.duracion_maxima_min ?? 120, r.anticipacion_minima_min ?? 60, r.max_activas_por_unidad ?? 2, r.dias_habilitados ?? [0, 1, 2, 3, 4, 5, 6]],
    );
    await auditar(client, { copropiedadId: req.user!.copropiedadId, usuarioId: req.user!.id, accion: 'crear_zona', entidad: 'zona_comun', entidadId: z.rows[0].id, detalle: d });
    await client.query('COMMIT');
    const { rows } = await pool.query(`${SELECT_ZONA} WHERE z.id = $1`, [z.rows[0].id]);
    res.status(201).json(rows[0]);
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw new HttpError(409, 'Ya existe una zona con ese nombre');
    throw e;
  } finally {
    client.release();
  }
});

zonasRouter.put('/:id', exigirRol('administrador'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const d = editarSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const actual = await client.query(
      `SELECT to_char(hora_apertura,'HH24:MI') AS a, to_char(hora_cierre,'HH24:MI') AS c FROM zona_comun WHERE id=$1 AND copropiedad_id=$2 AND eliminada_en IS NULL FOR UPDATE`,
      [id, req.user!.copropiedadId],
    );
    if (!actual.rowCount) throw new HttpError(404, 'Zona no encontrada');
    const ap = d.hora_apertura ?? actual.rows[0].a;
    const ci = d.hora_cierre ?? actual.rows[0].c;
    if (minutosDeHora(ci) <= minutosDeHora(ap)) throw new HttpError(400, 'La hora de cierre debe ser posterior a la de apertura');

    const campos = ['nombre', 'descripcion', 'aforo', 'hora_apertura', 'hora_cierre', 'estado'] as const;
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const c of campos) {
      if (d[c] !== undefined) {
        vals.push(d[c]);
        sets.push(`${c} = $${vals.length}`);
      }
    }
    if (sets.length) await client.query(`UPDATE zona_comun SET ${sets.join(', ')} WHERE id = $${vals.length + 1}`, [...vals, id]);

    if (d.regla) {
      const rs: string[] = [];
      const rv: unknown[] = [];
      for (const [k, v] of Object.entries(d.regla)) {
        if (v !== undefined) {
          rv.push(v);
          rs.push(`${k} = $${rv.length}`); // k proviene de las claves validadas por zod
        }
      }
      if (rs.length) await client.query(`UPDATE regla_reserva SET ${rs.join(', ')} WHERE zona_id = $${rv.length + 1}`, [...rv, id]);
    }
    await auditar(client, { copropiedadId: req.user!.copropiedadId, usuarioId: req.user!.id, accion: 'editar_zona', entidad: 'zona_comun', entidadId: id, detalle: d });
    await client.query('COMMIT');
    const { rows } = await pool.query(`${SELECT_ZONA} WHERE z.id = $1`, [id]);
    res.json(rows[0]);
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e.code === '23505') throw new HttpError(409, 'Ya existe una zona con ese nombre');
    throw e;
  } finally {
    client.release();
  }
});

// Horarios ocupados de una zona en un día (fecha en hora de Bogotá). El cliente construye las franjas libres.
zonasRouter.get('/:id/disponibilidad', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const { fecha } = z.object({ fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato YYYY-MM-DD') }).parse(req.query);
  const zona = await pool.query(`${SELECT_ZONA} WHERE z.id = $1 AND z.copropiedad_id = $2 AND z.eliminada_en IS NULL`, [id, req.user!.copropiedadId]);
  if (!zona.rowCount) throw new HttpError(404, 'Zona no encontrada');
  const { inicio, fin } = limitesDelDia(fecha);
  const { rows } = await pool.query(
    `SELECT id, inicio, fin FROM reserva
      WHERE zona_id = $1 AND estado = 'confirmada' AND inicio < $3 AND fin > $2 ORDER BY inicio`,
    [id, inicio, fin],
  );
  res.json({ zona: zona.rows[0], fecha, ocupados: rows });
});

// Elimina una zona (eliminación lógica: se conserva el historial). No se puede si tiene reservas futuras confirmadas.
zonasRouter.delete('/:id', exigirRol('administrador'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const z = await client.query(
      'SELECT nombre FROM zona_comun WHERE id = $1 AND copropiedad_id = $2 AND eliminada_en IS NULL FOR UPDATE',
      [id, req.user!.copropiedadId],
    );
    if (!z.rowCount) throw new HttpError(404, 'Zona no encontrada');
    const futuras = await client.query(
      `SELECT count(*)::int AS n FROM reserva WHERE zona_id = $1 AND estado = 'confirmada' AND fin > now()`,
      [id],
    );
    if (futuras.rows[0].n > 0) {
      throw new HttpError(409, `La zona tiene ${futuras.rows[0].n} reserva(s) futura(s). Cancélalas primero o ponla en mantenimiento.`);
    }
    await client.query('UPDATE zona_comun SET eliminada_en = now() WHERE id = $1', [id]);
    await auditar(client, { copropiedadId: req.user!.copropiedadId, usuarioId: req.user!.id, accion: 'eliminar_zona', entidad: 'zona_comun', entidadId: id, detalle: { nombre: z.rows[0].nombre } });
    await client.query('COMMIT');
    res.status(204).end();
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});
