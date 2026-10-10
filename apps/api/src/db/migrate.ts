import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './database.js';

/** Versioned SQL migrations held in source control (Maintainability-5). */
export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export async function migrate(db: Database, log: (msg: string) => void = () => {}): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.tx(async (q) => {
      // Statements are separated by a line containing only "-- ;;" so plpgsql bodies may contain ';'.
      for (const statement of sql.split(/^--\s*;;\s*$/m)) {
        if (statement.trim()) await q.query(statement);
      }
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    log(`applied migration ${file}`);
    ran.push(file);
  }
  return ran;
}
