/**
 * What this file does
 *   The entry point that starts the real API server and listens on the configured port.
 *
 * How it works
 *   - Calls bootstrap() to get the context, then createApp() to get the Express app.
 *   - With SEED_DEMO=true it first loads the demo data into an empty database (used on the first deployment).
 *   - Starts listening and logs the URL, which database and which file store are in use.
 *   - On Ctrl+C or a stop signal, shutdown() finishes background jobs and closes the database.
 *
 * Where it fits
 *   Run by `npm run dev` (through scripts/dev.mjs) and in production. Module: server core (owner: Vansh).
 */
import { createApp } from './app.js';
import { bootstrap } from './bootstrap.js';
import { seedDemoData } from './db/demo-data.js';

const ctx = await bootstrap();
// A fresh deployment has an empty database; SEED_DEMO=true fills it with the demo accounts once.
// A failure here is logged but never stops the server from starting.
if (process.env.SEED_DEMO === 'true') {
  try {
    if (await seedDemoData(ctx)) ctx.log('demo data loaded');
  } catch (err) {
    ctx.log('could not load the demo data', err);
  }
}
const app = createApp(ctx);
const server = app.listen(ctx.config.port, () => {
  ctx.log(`API listening on http://localhost:${ctx.config.port}/api (database: ${ctx.db.kind}, files: ${ctx.storage.driver})`);
});

// Graceful shutdown: stop new requests, let running jobs finish, then close the database
// so no write is cut off halfway.
async function shutdown() {
  server.close();
  await ctx.jobs.idle();
  await ctx.db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
