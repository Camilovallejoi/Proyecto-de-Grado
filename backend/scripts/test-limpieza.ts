// Prueba de la limpieza automática de reservas (usa los datos de `npm run db:seed`).
import { pool } from '../src/db.js';
import { purgarReservas } from '../src/limpieza.js';

let fallos = 0;
const verificar = (nombre: string, ok: boolean) => {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}`);
  if (!ok) fallos++;
};

const u = (await pool.query(
  `SELECT u.id AS usuario, u.unidad_id AS unidad, u.copropiedad_id AS cop, z.id AS zona
     FROM usuario u JOIN zona_comun z ON z.copropiedad_id = u.copropiedad_id AND z.nombre = 'Piscina'
    WHERE u.correo = 'residente@demo.test'`,
)).rows[0];

async function insertar(inicio: string, estado: 'confirmada' | 'cancelada', canceladoEn: string | null) {
  const { rows } = await pool.query(
    `INSERT INTO reserva (copropiedad_id, zona_id, usuario_id, unidad_id, inicio, fin, estado, cancelado_en)
     VALUES ($1,$2,$3,$4, ${inicio}, (${inicio}) + interval '1 hour', $5, ${canceladoEn ?? 'NULL'}) RETURNING id`,
    [u.cop, u.zona, u.usuario, u.unidad, estado],
  );
  return rows[0].id as number;
}
const existe = async (id: number) => (await pool.query('SELECT 1 FROM reserva WHERE id = $1', [id])).rowCount === 1;

const pasada = await insertar("now() - interval '2 days'", 'confirmada', null);
const canceladaVieja = await insertar("now() + interval '400 days'", 'cancelada', "now() - interval '2 days'");
const canceladaReciente = await insertar("now() + interval '401 days'", 'cancelada', 'now()');
const futura = await insertar("now() + interval '402 days'", 'confirmada', null);

const borradas = await purgarReservas();
verificar('se eliminó al menos las 2 reservas esperadas', borradas >= 2);
verificar('la reserva que ya terminó se elimina', !(await existe(pasada)));
verificar('la cancelada hace más de 24 h se elimina', !(await existe(canceladaVieja)));
verificar('la cancelada recientemente se conserva (el administrador aún puede verla)', await existe(canceladaReciente));
verificar('la reserva futura confirmada se conserva', await existe(futura));
const aud = await pool.query(`SELECT 1 FROM registro_auditoria WHERE accion = 'purgar_reservas' AND creado_en > now() - interval '1 minute'`);
verificar('la limpieza deja constancia en la auditoría', aud.rowCount! >= 1);

await pool.query('DELETE FROM reserva WHERE id = ANY($1)', [[canceladaReciente, futura]]);
await pool.end();
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : '\nTodas las verificaciones pasaron');
process.exit(fallos ? 1 : 0);
