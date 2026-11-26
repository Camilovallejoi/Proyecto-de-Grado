// Respaldo para la cuenta de administración (nadie dentro de la app puede restablecerla).
// Lo ejecuta quien administra el servidor:  npm run admin:clave -- correo@del.administrador
import 'dotenv/config';
import pg from 'pg';
import { restablecerClave, VIGENCIA_TEMPORAL_HORAS } from '../src/clave.js';

async function main() {
  const correo = process.argv[2]?.trim();
  if (!correo) throw new Error('Indique el correo:  npm run admin:clave -- correo@del.administrador');
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en backend/.env');
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT u.id, u.copropiedad_id, u.nombre FROM usuario u JOIN rol r ON r.id = u.rol_id
        WHERE lower(u.correo) = lower($1) AND r.nombre = 'administrador' AND u.estado = 'activo'`,
      [correo],
    );
    if (!rows[0]) throw new Error('No hay un administrador activo con ese correo. Las demás cuentas se restablecen desde la app.');
    await c.query('BEGIN');
    const { password } = await restablecerClave(c, rows[0].id);
    await c.query(
      `INSERT INTO registro_auditoria (copropiedad_id, accion, entidad, entidad_id, detalle)
       VALUES ($1, 'restablecer_clave_desde_servidor', 'usuario', $2, '{}')`,
      [rows[0].copropiedad_id, rows[0].id],
    );
    await c.query('COMMIT');
    console.log(`Contraseña temporal para ${rows[0].nombre}: ${password}`);
    console.log(`Vence en ${VIGENCIA_TEMPORAL_HORAS} horas. La app pedirá cambiarla al entrar.`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
