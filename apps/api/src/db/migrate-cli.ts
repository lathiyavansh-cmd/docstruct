/**
 * What this file does
 *   A small command-line script that runs database migrations without starting the server.
 *
 * How it works
 *   - Loads config and opens the database.
 *   - Calls migrate() and prints how many migrations were applied.
 *   - Closes the database so the process can exit.
 *
 * Where it fits
 *   Run by `npm run db:migrate`. Uses config.ts, database.ts and migrate.ts.
 *   Module: server core (owner: Vansh).
 */
import { loadConfig } from '../config.js';
import { openDatabase } from './database.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const db = await openDatabase(config.databaseUrl, config.dataDir);
const ran = await migrate(db, console.log);
console.log(ran.length ? `${ran.length} migration(s) applied` : 'database is up to date');
await db.close();
