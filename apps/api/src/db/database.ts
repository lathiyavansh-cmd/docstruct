/**
 * What this file does
 *   Gives the rest of the API one simple database interface that works with either an
 *   embedded database (PGlite) or a real PostgreSQL server. See the interface comment below.
 *
 * How it works
 *   - EmbeddedDatabase wraps PGlite, a PostgreSQL engine that runs inside Node.
 *   - PostgresDatabase wraps a pg connection pool and runs transactions with BEGIN/COMMIT/ROLLBACK.
 *   - openDatabase() picks one based on DATABASE_URL (postgres URL, 'memory://', or empty).
 *
 * Where it fits
 *   Called by bootstrap.ts and migrate-cli.ts. Every module service uses query() and tx().
 *   Module: server core (owner: Vansh).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
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
  /** The transaction the current async call chain is running inside, if any. */
  private readonly current = new AsyncLocalStorage<Queryable>();
  constructor(private readonly pglite: PGlite) {}

  async query<T>(sql: string, params: unknown[] = []) {
    // PGlite runs one statement at a time. A plain query issued while a transaction is open (for example the
    // file store reading an upload inside the upload transaction) would wait for that transaction forever,
    // so it joins the open transaction instead.
    const inTx = this.current.getStore();
    if (inTx) return inTx.query<T>(sql, params);
    const result = await this.pglite.query<T>(sql, params);
    return { rows: result.rows };
  }

  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    // PGlite handles BEGIN/COMMIT itself; we only hand fn a query function bound to the transaction.
    return this.pglite.transaction(async (tx) => {
      const q: Queryable = {
        query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await tx.query<R>(sql, params)).rows }),
      };
      return this.current.run(q, () => fn(q));
    });
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
    // A transaction must run on one connection, so we borrow a single client from the pool.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn({
        query: async <R>(sql: string, params: unknown[] = []) => ({ rows: (await client.query(sql, params)).rows as R[] }),
      });
      await client.query('COMMIT');
      return value;
    } catch (error) {
      // Undo every statement in this transaction, then pass the error on.
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Always give the connection back to the pool, even after an error.
      client.release();
    }
  }

  close() {
    return this.pool.end();
  }
}

export async function openDatabase(databaseUrl: string, dataDir: string, poolMax = 10): Promise<Database> {
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: poolMax,
      // Local servers run without SSL; hosted servers (like Supabase) need an SSL connection.
      ssl: databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
    });
    return new PostgresDatabase(pool);
  }

  // No location means PGlite keeps everything in memory (used by tests).
  // Otherwise the data is saved on disk in dataDir/pgdata. The pg_trgm extension is loaded for the title search index.
  let location: string | undefined;
  if (databaseUrl !== 'memory://') {
    location = path.join(dataDir, 'pgdata');
    mkdirSync(location, { recursive: true });
  }
  const pglite = await PGlite.create(location, { extensions: { pg_trgm } });
  return new EmbeddedDatabase(pglite);
}
