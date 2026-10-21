/**
 * What this file does
 *   Starts up all the shared services the API needs and bundles them into one context object.
 *
 * How it works
 *   - Loads configuration from environment variables (config.ts).
 *   - Creates a small logger that stays quiet in tests unless there is an error.
 *   - Opens the database, runs pending migrations, and creates the storage folder.
 *   - Builds the ObjectStore and JobQueue and returns everything as an AppContext.
 *
 * Where it fits
 *   Called by server.ts, db/seed.ts and test/helpers.ts. Module: server core (owner: Vansh).
 */
import { mkdirSync } from 'node:fs';
import { loadConfig, type AppConfig } from './config.js';
import { JobQueue, type AppContext } from './context.js';
import { openDatabase } from './db/database.js';
import { migrate } from './db/migrate.js';
import { ObjectStore } from './storage/object-store.js';

/** Builds the application context: configuration, migrated database, object store, job queue. */
export async function bootstrap(overrides: Partial<AppConfig> = {}): Promise<AppContext> {
  const config = loadConfig(overrides);
  const log = (msg: string, err?: unknown) => {
    if (config.env === 'test' && !err) return;
    if (err) console.error(`[docstruct] ${msg}`, err);
    else console.log(`[docstruct] ${msg}`);
  };
  const db = await openDatabase(config.databaseUrl, config.dataDir, config.dbPoolMax);
  // Every start brings the schema up to date, so a fresh database works without a manual step.
  await migrate(db, log);
  mkdirSync(config.storageDir, { recursive: true });
  // STORAGE_DRIVER=database keeps file bytes in the database (see 010_stored_objects.sql).
  const storage = new ObjectStore(config.storageDir, config.signingSecret, config.signedUrlTtlSeconds, config.publicApiBase, config.storageDriver === 'database' ? db : null);
  return { config, db, storage, jobs: new JobQueue(log), log };
}
