import { createApp } from './app.js';
import { bootstrap } from './bootstrap.js';

const ctx = await bootstrap();
const app = createApp(ctx);
const server = app.listen(ctx.config.port, () => {
  ctx.log(`API listening on http://localhost:${ctx.config.port}/api (database: ${ctx.db.kind})`);
});

async function shutdown() {
  server.close();
  await ctx.jobs.idle();
  await ctx.db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
