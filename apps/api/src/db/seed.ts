/**
 * What this file does
 *   Command-line entry point for loading the demo data:  npm run db:seed
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
if (!(await seedDemoData(ctx))) console.log('Demo data already present. Log in as vansh@docstruct.test / docstruct-demo');
await ctx.db.close();
