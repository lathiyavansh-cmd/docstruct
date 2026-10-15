/**
 * What this file does
 *   Applies the SQL migration files in apps/api/migrations to the database, each one only once.
 *
 * How it works
 *   - Creates a schema_migrations table that records which files have already run.
 *   - Reads all .sql files, sorted by name (001, 002, ...), and skips those already applied.
 *   - Runs each new file inside one transaction, statement by statement.
 *   - Records the file name in schema_migrations in the same transaction.
 *
 * Where it fits
 *   Called by bootstrap.ts on every start and by migrate-cli.ts. Module: server core (owner: Vansh).
 */
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

  // Sorting by file name gives the run order, which is why files start with 001_, 002_, ...
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // One transaction per file: if any statement fails, the whole file is undone and not
    // marked as applied, so it runs again cleanly next time.
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
