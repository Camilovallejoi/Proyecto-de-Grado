import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL en backend/.env');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );
    const hechas = new Set((await client.query('SELECT nombre FROM schema_migrations')).rows.map((r) => r.nombre));
    const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of archivos) {
      if (hechas.has(f)) continue;
      console.log(`Aplicando ${f} ...`);
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await client.query('INSERT INTO schema_migrations (nombre) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    console.log('Migraciones al día.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
