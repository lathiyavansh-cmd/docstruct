/**
 * What this file does
 *   Tests the basic platform pieces: the health endpoint, the 404 for unknown routes, database safety rules
 *   (row-level security on, activity log cannot be changed) and the signed upload and download links.
 *
 * How it works
 *   - createTestEnv() from helpers.ts boots the whole API on an in-memory PGlite database.
 *   - Tests send real HTTP requests with supertest, or run SQL directly through env.ctx.db.
 *   - The storage tests create signed URLs, then tamper with or expire them to check they are refused.
 *
 * Where it fits
 *   Run by vitest with the other API tests. Module: server core (owner: Vansh).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordActivity } from '../src/lib/activity.js';
import { createTestEnv, relative, type TestEnv } from './helpers.js';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

describe('core platform', () => {
  it('reports health and the database kind', async () => {
    const res = await env.http.get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'embedded' });
  });

  it('answers unknown endpoints with a structured 404', async () => {
    const res = await env.http.get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('enables row-level security on every application table (CO-6)', async () => {
    // Reads PostgreSQL's catalog to list every normal table in the public schema and its RLS flag.
    const { rows } = await env.ctx.db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.relrowsecurity, row.relname).toBe(true);
  });

  it('refuses to edit or delete activity log entries (Log.Immutable)', async () => {
    const user = await env.ctx.db.query<{ user_id: string }>(
      `INSERT INTO profiles (email, display_name) VALUES ('log@x.test', 'Log') RETURNING user_id`,
    );
    const project = await env.ctx.db.query<{ project_id: string }>(
      `INSERT INTO projects (name, created_by) VALUES ('Log test', $1) RETURNING project_id`,
      [user.rows[0].user_id],
    );
    const projectId = project.rows[0].project_id;
    await recordActivity(env.ctx.db, { projectId, actorId: null, action: 'project.created', entityType: 'project' });
    await expect(env.ctx.db.query(`UPDATE activity_log SET action = 'x'`)).rejects.toThrow(/immutable/);
    await expect(env.ctx.db.query(`DELETE FROM activity_log`)).rejects.toThrow(/immutable/);
  });
});

describe('object store signed URLs (CI-4, SE-13)', () => {
  it('uploads through a signed PUT and downloads through a signed GET', async () => {
    const put = env.ctx.storage.createUploadUrl('test/a.txt', 100);
    await env.http.put(relative(put)).set('Content-Type', 'text/plain').send('hello world').expect(201);

    const get = env.ctx.storage.createDownloadUrl('test/a.txt', { contentType: 'text/plain', fileName: 'a.txt', disposition: 'inline' });
    const res = await env.http.get(relative(get)).expect(200);
    expect(res.text).toBe('hello world');
    expect(res.headers['content-disposition']).toContain('inline');
  });

  it('never overwrites an existing object (CO-7)', async () => {
    const put = env.ctx.storage.createUploadUrl('test/a.txt', 100);
    const res = await env.http.put(relative(put)).set('Content-Type', 'text/plain').send('changed').expect(409);
    expect(res.body.error.code).toBe('ALREADY_UPLOADED');
    expect((await env.ctx.storage.read('test/a.txt')).toString()).toBe('hello world');
  });

  it('rejects a tampered signature and an oversized body', async () => {
    const put = env.ctx.storage.createUploadUrl('test/b.txt', 4);
    // Changing the key in the URL breaks the signature, so the upload is refused with 403.
    await env.http.put(relative(put).replace('key=test%2Fb.txt', 'key=test%2Fc.txt')).send('x').expect(403);
    await env.http.put(relative(put)).set('Content-Type', 'text/plain').send('too long').expect(413);
    expect(await env.ctx.storage.exists('test/b.txt')).toBe(false);
  });

  it('rejects an expired link', async () => {
    const store = env.ctx.storage;
    const sig = (store as unknown as { signature(p: object): string }).signature({ op: 'get', key: 'test/a.txt', exp: 1 });
    const res = await env.http.get(`/api/storage/object?op=get&key=test%2Fa.txt&exp=1&sig=${sig}`).expect(403);
    expect(res.body.error.code).toBe('LINK_EXPIRED');
  });
});
