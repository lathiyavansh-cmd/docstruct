import { loadConfig } from '../config.js';
import { openDatabase } from './database.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const db = await openDatabase(config.databaseUrl, config.dataDir);
const ran = await migrate(db, console.log);
console.log(ran.length ? `${ran.length} migration(s) applied` : 'database is up to date');
await db.close();
