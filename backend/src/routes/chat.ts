import { Router, type Request } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { autenticar } from '../auth.js';
import { notificarPersonal, notificarUsuarios, resolverAvisos } from '../push.js';

export const chatRouter = Router();
chatRouter.use(autenticar);

const enviarSchema = z.object({ cuerpo: z.string().trim().min(1, 'Escribe un mensaje').max(1000) });
const desdeSchema = z.object({ desde: z.coerce.number().int().min(0).default(0) });

const COLUMNAS = `m.id, m.cuerpo, m.creado_en, m.autor_id, a.nombre AS autor, r.nombre AS rol`;
const DESDE = `FROM mensaje_chat m JOIN usuario a ON a.id = m.autor_id JOIN rol r ON r.id = a.rol_id`;

/** Mensajes nuevos (id > desde) en orden cronológico; en la primera carga trae los últimos 100. */
async function mensajes(where: string, params: unknown[], desde: number) {
  const { rows } = await pool.query(
    `SELECT * FROM (SELECT ${COLUMNAS} ${DESDE} WHERE ${where} AND m.id > $${params.length + 1} ORDER BY m.id DESC LIMIT 100) t ORDER BY id`,
    [...params, desde],
  );
  return rows;
}

function resumen(cuerpo: string) {
  return cuerpo.length > 100 ? cuerpo.slice(0, 97) + '…' : cuerpo;
}

// ---- Chat de portería: un hilo por residente, que atiende el vigilante.
// Lista de residentes con su último mensaje (personal); permite iniciar una conversación.
chatRouter.get('/porteria/hilos', async (req, res) => {
  const user = req.user!;
  if (user.rol !== 'vigilante') throw new HttpError(403, 'Solo el vigilante ve las conversaciones con los residentes');
  const { rows } = await pool.query(
    `SELECT u.id AS residente_id, u.nombre, ur.identificador AS unidad, ult.cuerpo AS ultimo, ult.creado_en AS ultimo_en, ult.autor_id AS ultimo_autor_id,
            CASE WHEN u.telefono_autorizado_en IS NOT NULL THEN u.telefono END AS telefono,
            EXISTS (SELECT 1 FROM notificacion n WHERE n.usuario_id = $2 AND n.tipo = 'chat' AND n.referencia_id = u.id AND NOT n.leida) AS sin_leer
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id AND r.nombre = 'residente'
       LEFT JOIN unidad_residencial ur ON ur.id = u.unidad_id
       LEFT JOIN LATERAL (SELECT cuerpo, creado_en, autor_id FROM mensaje_chat
                           WHERE canal = 'porteria' AND residente_id = u.id ORDER BY id DESC LIMIT 1) ult ON true
      WHERE u.copropiedad_id = $1 AND u.estado = 'activo'
      ORDER BY ult.creado_en DESC NULLS LAST, u.nombre`,
    [user.copropiedadId, user.id],
  );
  res.json(rows);
});

/** El residente solo ve su propio hilo ("mi"); el vigilante puede abrir el de cualquier residente. La administración no participa. */
async function hiloDe(req: Request, param: string) {
  const user = req.user!;
  if (user.rol === 'residente') {
    if (param !== 'mi' && Number(param) !== user.id) throw new HttpError(403, 'Solo puedes ver tu propia conversación con portería');
    return user.id;
  }
  if (user.rol !== 'vigilante') throw new HttpError(403, 'Solo el residente y el vigilante participan en este chat');
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  const r = await pool.query(
    `SELECT 1 FROM usuario u JOIN rol ro ON ro.id = u.rol_id WHERE u.id = $1 AND u.copropiedad_id = $2 AND ro.nombre = 'residente'`,
    [id, user.copropiedadId],
  );
  if (!r.rowCount) throw new HttpError(404, 'Residente no encontrado');
  return id;
}

chatRouter.get('/porteria/:residente', async (req, res) => {
  const residenteId = await hiloDe(req, String(req.params.residente));
  const { desde } = desdeSchema.parse(req.query);
  const lista = await mensajes(`m.copropiedad_id = $1 AND m.canal = 'porteria' AND m.residente_id = $2`, [req.user!.copropiedadId, residenteId], desde);
  // Abrir la conversación marca como leídos sus avisos (el contador del chat se actualiza solo).
  await resolverAvisos('chat', residenteId, req.user!.id);
  res.json(lista);
});

chatRouter.post('/porteria/:residente', async (req, res) => {
  const user = req.user!;
  const residenteId = await hiloDe(req, String(req.params.residente));
  const { cuerpo } = enviarSchema.parse(req.body ?? {});
  const { rows } = await pool.query(
    `INSERT INTO mensaje_chat (copropiedad_id, canal, residente_id, autor_id, cuerpo) VALUES ($1,'porteria',$2,$3,$4) RETURNING id`,
    [user.copropiedadId, residenteId, user.id, cuerpo],
  );
  const aviso = { titulo: `Mensaje de ${user.nombre}`, cuerpo: resumen(cuerpo), datos: { tipo: 'chat', residente_id: String(residenteId) } };
  // Notificación al otro lado de la conversación; si falla no afecta el mensaje.
  if (user.rol === 'residente') await notificarPersonal(user.copropiedadId, ['vigilante'], aviso);
  else {
    await resolverAvisos('chat', residenteId, user.id);
    await notificarUsuarios([residenteId], aviso);
  }
  res.status(201).json((await pool.query(`SELECT ${COLUMNAS} ${DESDE} WHERE m.id = $1`, [rows[0].id])).rows[0]);
});
