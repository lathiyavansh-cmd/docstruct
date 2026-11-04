/**
 * What this file does
 *   Command-line entry point for loading the demo data:  npm run db:seed
 *
 * Why it exists
 *   demo-data.ts holds the logic; this entry point lets it run from the command line and close the database
 *   afterwards, without starting the HTTP server.
 *
 * How it works
 *   - Boots the application context (configuration, migrated database, file store).
 *   - Calls seedDemoData() from demo-data.ts, which does nothing if the demo data already exists.
 *
 * Where it fits
 *   Run by `npm run db:seed` and by `npm run setup -- --seed`. Module: scripts / server core (owner: Vansh).
 */
import { bootstrap } from '../bootstrap.js';
import { seedDemoData } from './demo-data.js';

const ctx = await bootstrap();
if (!(await seedDemoData(ctx))) console.log('Demo data was already there; demo passwords were reset to demo1234');
await ctx.db.close();
