import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/bootstrap.js';
import type { AppContext } from '../src/context.js';

export interface TestEnv {
  ctx: AppContext;
  app: ReturnType<typeof createApp>;
  http: ReturnType<typeof request>;
  close(): Promise<void>;
}

/** Boots the whole API against an in-memory database and a throwaway object store. */
export async function createTestEnv(): Promise<TestEnv> {
  process.env.NODE_ENV = 'test';
  const dataDir = mkdtempSync(path.join(tmpdir(), 'docstruct-test-'));
  const ctx = await bootstrap({
    databaseUrl: 'memory://',
    dataDir,
    storageDir: path.join(dataDir, 'objects'),
    signingSecret: 'test-secret',
    extractor: { driver: 'builtin', pythonBin: '', timeoutMs: 5000 },
  });
  const app = createApp(ctx);
  return {
    ctx,
    app,
    http: request(app),
    async close() {
      await ctx.jobs.idle();
      await ctx.db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Splits a signed URL produced by the API into the path supertest should call. */
export function relative(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '');
}
