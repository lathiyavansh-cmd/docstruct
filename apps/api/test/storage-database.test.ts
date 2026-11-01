/**
 * What this file does
 *   Tests the database file store (STORAGE_DRIVER=database), which the deployed site uses because Render's
 *   free disk is wiped on every restart.
 *
 * How it works
 *   - Boots the whole API with createTestEnv({ storageDriver: 'database' }) on an in-memory database.
 *   - Uploads a document, then checks that its bytes are in stored_objects, that download returns the same
 *     bytes, that text extraction worked from the database copy, and that an upload link is still single-use.
 *
 * Where it fits
 *   Covers storage/object-store.ts and migration 010_stored_objects.sql. Module: storage, shared core (owner: Vansh).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, relative, signUp, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let projectId: string;

beforeAll(async () => {
  env = await createTestEnv({ storageDriver: 'database' });
  owner = await signUp(env, 'Owner');
  projectId = await createProject(env, owner);
});
afterAll(() => env.close());

const TEXT = '# Notes\n\nFiles kept in the database survive a restart of the server.';

describe('database file store', () => {
  it('keeps uploaded bytes in stored_objects and serves them back unchanged', async () => {
    expect(env.ctx.storage.driver).toBe('database');
    const doc = await createDocument(env, owner, projectId, 'notes.md', TEXT);
    await env.ctx.jobs.idle();

    const rows = await env.ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM stored_objects');
    expect(rows.rows[0].n).toBe(1);

    const download = await env.http.get(`/api/documents/${doc.documentId}/download`).set(owner.auth).expect(200);
    const file = await env.http.get(relative(download.body.url)).expect(200);
    // Markdown is a text type, so supertest gives the downloaded bytes as text.
    expect(file.text).toBe(TEXT);

    // Text extraction read the bytes from the database copy, so the summary can be built.
    const summary = await env.http.get(`/api/versions/${doc.currentVersion.versionId}/summary`).set(owner.auth).expect(200);
    expect(summary.body.status).toBe('READY');
  });

  it('refuses a second upload to the same key', async () => {
    const ticket = await env.http.post(`/api/projects/${projectId}/uploads`).set(owner.auth).send({ fileName: 'a.txt', byteSize: 5 }).expect(201);
    const url = relative(ticket.body.uploadUrl);
    await env.http.put(url).set('Content-Type', 'application/octet-stream').send(Buffer.from('hello')).expect(201);
    await env.http.put(url).set('Content-Type', 'application/octet-stream').send(Buffer.from('hello')).expect(409);
  });
});
