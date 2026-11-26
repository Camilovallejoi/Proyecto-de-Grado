import { Router } from 'express';
import { z } from 'zod';
import { pool, auditar } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar } from '../auth.js';
import { notificarPersonal, notificarUsuarios, resolverAvisos } from '../push.js';

export const portonRouter = Router();
portonRouter.use(autenticar);

/** Minutos que un aviso puede esperar antes de darse por vencido. */
export const VIGENCIA_AVISO_MIN = 30;

const crearSchema = z.object({
  tipo_vehiculo: z.enum(['carro', 'moto', 'otro']).default('carro'),
  placa: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{5,7}$/, 'La placa debe tener entre 5 y 7 letras o números')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const SELECT_AVISO = `
  SELECT a.id, a.tipo_vehiculo, a.placa, a.estado, a.creado_en, a.atendido_en,
         u.nombre AS usuario, ur.identificador AS unidad, adm.nombre AS atendido_por
    FROM aviso_porton a
    JOIN usuario u ON u.id = a.usuario_id
    JOIN unidad_residencial ur ON ur.id = a.unidad_id
    LEFT JOIN usuario adm ON adm.id = a.atendido_por`;

/**
 * Pasa a "vencido" los avisos pendientes que llevan demasiado tiempo sin atenderse y avisa a cada residente.
 * El UPDATE ... RETURNING garantiza que cada vencimiento se notifica una sola vez, lo dispare quien lo dispare.
 */
export async function vencerAvisos(copropiedadId?: number) {
  const { rows } = await pool.query(
    `UPDATE aviso_porton SET estado = 'vencido'
      WHERE estado = 'pendiente' AND creado_en < now() - make_interval(mins => $1::int)
        AND ($2::int IS NULL OR copropiedad_id = $2)
      RETURNING id, usuario_id`,
    [VIGENCIA_AVISO_MIN, copropiedadId ?? null],
  );
  for (const a of rows) {
    await resolverAvisos('aviso_porton', a.id);
    await notificarUsuarios([a.usuario_id], {
      titulo: 'Nadie atendió tu aviso del portón',
      cuerpo: `Pasaron ${VIGENCIA_AVISO_MIN} minutos. Llama a portería para que te abran.`,
      datos: { tipo: 'porton', aviso_id: String(a.id) },
    });
  }
  return rows.length;
}

function idDe(valor: string) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  return id;
}

// El residente avisa que va llegando y necesita que abran el portón.
portonRouter.post('/', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'residente' || !user.unidadId) throw new HttpError(403, 'Solo un residente con unidad asignada puede enviar este aviso');
  const d = crearSchema.parse(req.body ?? {});
  await vencerAvisos(user.copropiedadId);
  try {
    const { rows } = await pool.query(
      `INSERT INTO aviso_porton (copropiedad_id, usuario_id, unidad_id, tipo_vehiculo, placa)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [user.copropiedadId, user.id, user.unidadId, d.tipo_vehiculo, d.placa ?? null],
    );
    await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'crear_aviso_porton', entidad: 'aviso_porton', entidadId: rows[0].id, detalle: d });
    const aviso = (await pool.query(`${SELECT_AVISO} WHERE a.id = $1`, [rows[0].id])).rows[0];
    // Notificación al celular del personal; si falla no afecta el aviso.
    await notificarPersonal(user.copropiedadId, ['vigilante'], {
      titulo: 'Abrir portón',
      cuerpo: `${aviso.usuario} · ${aviso.unidad} va llegando en ${aviso.tipo_vehiculo}${aviso.placa ? ` (placa ${aviso.placa})` : ''}`,
      datos: { tipo: 'aviso_porton', aviso_id: String(aviso.id) },
    });
    res.status(201).json(aviso);
  } catch (e: any) {
    if (e.code === '23505') throw new HttpError(409, 'Ya tienes un aviso pendiente: espera a que portería lo atienda o cancélalo');
    throw e;
  }
});

// Avisos recientes del propio residente (el más nuevo primero).
portonRouter.get('/mios', async (req, res) => {
  await vencerAvisos(req.user!.copropiedadId);
  const { rows } = await pool.query(`${SELECT_AVISO} WHERE a.usuario_id = $1 ORDER BY a.creado_en DESC LIMIT 5`, [req.user!.id]);
  res.json(rows);
});

// Cola del portón para el vigilante: pendientes primero y luego los atendidos o cancelados recientemente.
portonRouter.get('/', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'vigilante') throw new HttpError(403, 'La operación del portón es del vigilante');
  await vencerAvisos(user.copropiedadId);
  const { rows } = await pool.query(
    `${SELECT_AVISO} WHERE a.copropiedad_id = $1
      ORDER BY (a.estado = 'pendiente') DESC, a.creado_en DESC LIMIT 50`,
    [user.copropiedadId],
  );
  res.json(rows);
});

// El vigilante confirma que ya abrió el portón.
portonRouter.post('/:id/atender', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'vigilante') throw new HttpError(403, 'Solo el vigilante atiende los avisos del portón');
  const id = idDe(String(req.params.id));
  await vencerAvisos(user.copropiedadId);
  const { rows } = await pool.query(
    `UPDATE aviso_porton SET estado = 'atendido', atendido_en = now(), atendido_por = $3
      WHERE id = $1 AND copropiedad_id = $2 AND estado = 'pendiente' RETURNING id`,
    [id, user.copropiedadId, user.id],
  );
  if (!rows[0]) {
    const existe = await pool.query('SELECT estado FROM aviso_porton WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!existe.rows[0]) throw new HttpError(404, 'Aviso no encontrado');
    throw new HttpError(409, `El aviso ya no está pendiente (${existe.rows[0].estado})`);
  }
  await auditar(pool, { copropiedadId: user.copropiedadId, usuarioId: user.id, accion: 'atender_aviso_porton', entidad: 'aviso_porton', entidadId: id });
  await resolverAvisos('aviso_porton', id);
  const residente = await pool.query('SELECT usuario_id FROM aviso_porton WHERE id = $1', [id]);
  await notificarUsuarios([residente.rows[0].usuario_id], {
    titulo: 'Portón abierto',
    cuerpo: `${user.nombre} abrió el portón. Ya puedes ingresar.`,
    datos: { tipo: 'porton', aviso_id: String(id) },
  });
  res.json((await pool.query(`${SELECT_AVISO} WHERE a.id = $1`, [id])).rows[0]);
});

// El residente cancela su propio aviso si todavía está pendiente.
portonRouter.post('/:id/cancelar', async (req, res) => {
  const user = req.user!;
  const id = idDe(String(req.params.id));
  const { rows } = await pool.query(
    `UPDATE aviso_porton SET estado = 'cancelado' WHERE id = $1 AND usuario_id = $2 AND estado = 'pendiente' RETURNING id`,
    [id, user.id],
  );
  if (!rows[0]) {
    const existe = await pool.query('SELECT usuario_id, estado FROM aviso_porton WHERE id = $1 AND copropiedad_id = $2', [id, user.copropiedadId]);
    if (!existe.rows[0]) throw new HttpError(404, 'Aviso no encontrado');
    if (existe.rows[0].usuario_id !== user.id) throw new HttpError(403, 'No puedes cancelar el aviso de otra persona');
    throw new HttpError(409, `El aviso ya no está pendiente (${existe.rows[0].estado})`);
  }
  // El vigilante deja de ver el aviso pendiente y se entera de que ya no hace falta abrir.
  await resolverAvisos('aviso_porton', id);
  const aviso = (await pool.query(`${SELECT_AVISO} WHERE a.id = $1`, [id])).rows[0];
  await notificarPersonal(user.copropiedadId, ['vigilante'], {
    titulo: 'Aviso de portón cancelado',
    cuerpo: `${aviso.usuario} · ${aviso.unidad} canceló su aviso de llegada.`,
    datos: { tipo: 'porton_cancelado', aviso_id: String(id) },
  });
  res.json(aviso);
});
