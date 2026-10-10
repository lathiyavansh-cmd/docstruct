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

export interface TestUser {
  token: string;
  userId: string;
  email: string;
  displayName: string;
  auth: { Authorization: string };
}

let counter = 0;
/** Registers a fresh user and returns their session. */
export async function signUp(env: TestEnv, displayName = 'User'): Promise<TestUser> {
  counter += 1;
  const email = `${displayName.toLowerCase().replace(/\W+/g, '.')}.${counter}@example.test`;
  const res = await env.http.post('/api/auth/signup').send({ email, password: 'correct-horse-1', displayName }).expect(201);
  return {
    token: res.body.token,
    userId: res.body.user.userId,
    email,
    displayName,
    auth: { Authorization: `Bearer ${res.body.token}` },
  };
}

/** Splits a signed URL produced by the API into the path supertest should call. */
export function relative(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '');
}
