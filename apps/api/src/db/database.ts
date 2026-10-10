import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import pg from 'pg';

/**
 * The minimal query surface every module uses. Both the embedded PGlite database (development, tests)
 * and a real PostgreSQL server (Supabase) implement it, so module code never knows which one it runs on.
 *
 * Conventions: counts are cast to ::int and bigint identifiers to ::text in SQL, because the two drivers
 * return those types differently.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Queryable {
  readonly kind: 'embedded' | 'postgres';
  /** Runs `fn` inside one transaction; any thrown error rolls the whole transaction back. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class EmbeddedDatabase implements Database {
  readonly kind = 'embedded' as const;
  constructor(private readonly pglite: PGlite) {}

  async query<T>(sql: string, params: unknown[] = []) {
    const result = await this.pglite.query<T>(sql, params);
    return { rows: result.rows };
  }

  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    return this.pglite.transaction(async (tx) =>
      fn({
        query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await tx.query<R>(sql, params)).rows }),
      }),
    );
  }

  close() {
    return this.pglite.close();
  }
}

class PostgresDatabase implements Database {
  readonly kind = 'postgres' as const;
  constructor(private readonly pool: pg.Pool) {}

  async query<T>(sql: string, params: unknown[] = []) {
    const result = await this.pool.query(sql, params);
    return { rows: result.rows as T[] };
  }

  async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn({
        query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await client.query(sql, params)).rows as R[] }),
      });
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  close() {
    return this.pool.end();
  }
}

export async function openDatabase(databaseUrl: string, dataDir: string): Promise<Database> {
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 20,
      ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
    });
    return new PostgresDatabase(pool);
  }

  let location: string | undefined;
  if (databaseUrl !== 'memory://') {
    location = path.join(dataDir, 'pgdata');
    mkdirSync(location, { recursive: true });
  }
  const pglite = await PGlite.create(location, { extensions: { pg_trgm } });
  return new EmbeddedDatabase(pglite);
}
