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
  const db = await openDatabase(config.databaseUrl, config.dataDir);
  await migrate(db, log);
  mkdirSync(config.storageDir, { recursive: true });
  const storage = new ObjectStore(config.storageDir, config.signingSecret, config.signedUrlTtlSeconds, config.publicApiBase);
  return { config, db, storage, jobs: new JobQueue(log), log };
}
