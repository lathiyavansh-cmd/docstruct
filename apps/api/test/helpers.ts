/**
 * What this file does
 *   Shared setup code for the API tests. It starts a complete copy of the API for each test file and offers
 *   shortcuts for common steps like signing up, creating a project and uploading a document.
 *
 * How it works
 *   - createTestEnv() boots the API with an in-memory PGlite database ("memory://") and a temporary folder
 *     for stored files, and wraps the Express app in supertest so tests can send real HTTP requests.
 *   - signUp(), createProject(), uploadFile() and createDocument() call the real endpoints, step by step.
 *   - close() waits for background jobs, closes the database and deletes the temporary folder.
 *
 * Where it fits
 *   Imported by the *.test.ts files in this folder (run with vitest). Module: server core (owner: Vansh).
 */
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
  // The counter makes every e-mail unique, so tests never hit the duplicate-account check by accident.
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

/** Creates a project owned by `owner` and adds the other users with the given roles. */
export async function createProject(
  env: TestEnv,
  owner: TestUser,
  members: Array<[TestUser, 'OWNER' | 'EDITOR' | 'REVIEWER' | 'VIEWER']> = [],
  name = 'Test Project',
): Promise<string> {
  const res = await env.http.post('/api/projects').set(owner.auth).send({ name }).expect(201);
  const projectId: string = res.body.projectId;
  for (const [user, role] of members) {
    await env.http.post(`/api/projects/${projectId}/members`).set(owner.auth).send({ email: user.email, role }).expect(201);
  }
  return projectId;
}

/** Runs both upload steps; returns the finalise response (status checked by the caller via `expect`). */
export async function uploadFile(
  env: TestEnv,
  user: TestUser,
  projectId: string,
  fileName: string,
  content: string | Buffer,
): Promise<string> {
  const body = typeof content === 'string' ? Buffer.from(content) : content;
  // Step 1 asks the API for an upload ticket; step 2 sends the bytes to the signed upload URL it returns.
  const ticket = await env.http
    .post(`/api/projects/${projectId}/uploads`)
    .set(user.auth)
    .send({ fileName, byteSize: body.length })
    .expect(201);
  await env.http.put(relative(ticket.body.uploadUrl)).set('Content-Type', 'application/octet-stream').send(body).expect(201);
  return ticket.body.uploadKey;
}

export async function createDocument(
  env: TestEnv,
  user: TestUser,
  projectId: string,
  fileName: string,
  content: string | Buffer,
  extra: Record<string, unknown> = {},
) {
  const uploadKey = await uploadFile(env, user, projectId, fileName, content);
  const res = await env.http.post(`/api/projects/${projectId}/documents`).set(user.auth).send({ uploadKey, ...extra }).expect(201);
  return res.body as import('@docstruct/shared').DocumentDto;
}

/** Splits a signed URL produced by the API into the path supertest should call. */
export function relative(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, '');
}
