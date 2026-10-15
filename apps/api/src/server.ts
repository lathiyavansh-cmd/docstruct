/**
 * What this file does
 *   The entry point that starts the real API server and listens on the configured port.
 *
 * How it works
 *   - Calls bootstrap() to get the context, then createApp() to get the Express app.
 *   - Starts listening and logs the URL and which database is in use.
 *   - On Ctrl+C or a stop signal, shutdown() finishes background jobs and closes the database.
 *
 * Where it fits
 *   Run by `npm run dev` (through scripts/dev.mjs) and in production. Module: server core (owner: Vansh).
 */
import { createApp } from './app.js';
import { bootstrap } from './bootstrap.js';

const ctx = await bootstrap();
const app = createApp(ctx);
const server = app.listen(ctx.config.port, () => {
  ctx.log(`API listening on http://localhost:${ctx.config.port}/api (database: ${ctx.db.kind})`);
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
