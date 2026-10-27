import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

// Datos de prueba ficticios (no contienen información personal real).
const PASSWORD_DEMO = 'Demo12345!';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en backend/.env');
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    if ((await c.query("SELECT 1 FROM copropiedad WHERE nit = '900000001-1'")).rowCount) {
      console.log('Los datos de prueba ya existen.');
      return;
    }
    await c.query('BEGIN');
    const cop = (await c.query(
      `INSERT INTO copropiedad (nombre, nit, ciudad) VALUES ('Cantaluna', '900000001-1', 'Barranquilla') RETURNING id`,
    )).rows[0].id;
    const unidades: Record<string, number> = {};
    for (const nombre of ['Torre 1 - Apto 101', 'Torre 1 - Apto 102', 'Torre 2 - Apto 201']) {
      unidades[nombre] = (await c.query('INSERT INTO unidad_residencial (copropiedad_id, identificador) VALUES ($1,$2) RETURNING id', [cop, nombre])).rows[0].id;
    }
    const hash = await bcrypt.hash(PASSWORD_DEMO, 10);
    const rol = async (n: string) => (await c.query('SELECT id FROM rol WHERE nombre = $1', [n])).rows[0].id;
    const admin = (await c.query(
      `INSERT INTO usuario (copropiedad_id, rol_id, nombre, correo, password_hash) VALUES ($1,$2,'Administrador Demo','admin@demo.test',$3) RETURNING id`,
      [cop, await rol('administrador'), hash],
    )).rows[0].id;
    await c.query(
      `INSERT INTO usuario (copropiedad_id, unidad_id, rol_id, nombre, correo, password_hash) VALUES ($1,$2,$3,'Residente Demo','residente@demo.test',$4)`,
      [cop, unidades['Torre 1 - Apto 101'], await rol('residente'), hash],
    );
    const zonas: [string, string, number, string, string, number, number][] = [
      ['Piscina', 'Piscina para adultos y niños', 30, '08:00', '20:00', 120, 2],
      ['Salón Social', 'Salón para eventos y reuniones', 60, '09:00', '22:00', 240, 1],
      ['Zona BBQ', 'Zona de asados con 4 parrilleras', 20, '10:00', '21:00', 180, 2],
      ['Cancha Múltiple', 'Cancha de fútbol sala y baloncesto', 20, '06:00', '21:00', 60, 3],
    ];
    for (const [nombre, desc, aforo, ap, ci, dur, max] of zonas) {
      const z = (await c.query(
        `INSERT INTO zona_comun (copropiedad_id, nombre, descripcion, aforo, hora_apertura, hora_cierre) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [cop, nombre, desc, aforo, ap, ci],
      )).rows[0].id;
      await c.query('INSERT INTO regla_reserva (zona_id, duracion_maxima_min, max_activas_por_unidad) VALUES ($1,$2,$3)', [z, dur, max]);
    }
    await c.query(
      `INSERT INTO codigo_invitacion (copropiedad_id, unidad_id, codigo, creado_por, expira_en)
       VALUES ($1,$2,'DEMO2026',$3, now() + interval '30 days')`,
      [cop, unidades['Torre 1 - Apto 102'], admin],
    );
    await c.query('COMMIT');
    console.log('Datos de prueba creados.');
    console.log('  Administrador: admin@demo.test / ' + PASSWORD_DEMO);
    console.log('  Residente:     residente@demo.test / ' + PASSWORD_DEMO);
    console.log('  Código de invitación para registrarse: DEMO2026');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
