/**
 * What this file does
 *   Tests password-protected documents end to end: locking, the 423 answer on every content route,
 *   unlocking per login session, changing, removing and resetting the password, search and public links.
 *
 * How it works
 *   - Boots the whole API on an in-memory database with createTestEnv() and sends real HTTP requests.
 *   - Uses an owner, an editor, a viewer and an outsider in one project, so role rules are checked too.
 *
 * Where it fits
 *   Covers modules/protection, protection/guard.ts, search and share-link changes, and migration 011.
 *   Module: M06 Security, document protection (owner: Vansh).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let projectId: string;

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  viewer = await signUp(env, 'Viewer');
  projectId = await createProject(env, owner, [
    [editor, 'EDITOR'],
    [viewer, 'VIEWER'],
  ]);
});
afterAll(() => env.close());

const TEXT = '# Salaries\n\nThe confidential pay scale for the canteen staff is attached below. Each grade has a fixed allowance.';
const PASSWORD = 'canteen2026';

async function protectedDoc(name: string) {
  const doc = await createDocument(env, editor, projectId, `${name}.md`, TEXT);
  await env.ctx.jobs.idle();
  await env.http.post(`/api/documents/${doc.documentId}/protection`).set(editor.auth).send({ password: PASSWORD }).expect(204);
  return doc;
}

const contentRoutes = (doc: { documentId: string; currentVersion: { versionId: string } }) => [
  `/api/documents/${doc.documentId}/preview`,
  `/api/documents/${doc.documentId}/download`,
  `/api/versions/${doc.currentVersion.versionId}/preview`,
  `/api/versions/${doc.currentVersion.versionId}/download`,
  `/api/versions/${doc.currentVersion.versionId}/summary`,
  `/api/versions/${doc.currentVersion.versionId}/annotations`,
];

async function login(user: TestUser) {
  const res = await env.http.post('/api/auth/login').send({ email: user.email, password: 'correct-horse-1' }).expect(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

describe('password-protected documents', () => {
  it('locks every content route for everyone without the password, even the project owner', async () => {
    const doc = await protectedDoc('a');
    const detail = await env.http.get(`/api/documents/${doc.documentId}`).set(owner.auth).expect(200);
    expect(detail.body).toMatchObject({ isProtected: true, unlocked: false, unlockedUntil: null });
    for (const url of contentRoutes(doc)) {
      const res = await env.http.get(url).set(owner.auth);
      expect(res.status, url).toBe(423);
      expect(res.body.error.code).toBe('DOCUMENT_LOCKED');
    }
    // The title is still listed, so members know the document exists.
    const list = await env.http.get(`/api/projects/${projectId}/documents`).set(viewer.auth).expect(200);
    expect(list.body.find((d: { documentId: string }) => d.documentId === doc.documentId).isProtected).toBe(true);
  });

  it('stores only a hash of the password', async () => {
    const doc = await protectedDoc('b');
    const { rows } = await env.ctx.db.query<{ password_hash: string }>('SELECT password_hash FROM documents WHERE document_id = $1', [doc.documentId]);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
    expect(rows[0].password_hash).toMatch(/^scrypt\$/);
  });

  it('opens for 12 hours after the right password, for that login only', async () => {
    const doc = await protectedDoc('c');
    await env.http.post(`/api/documents/${doc.documentId}/unlock`).set(viewer.auth).send({ password: 'wrong-one' }).expect(403);
    const ok = await env.http.post(`/api/documents/${doc.documentId}/unlock`).set(viewer.auth).send({ password: PASSWORD }).expect(200);
    const hours = (new Date(ok.body.unlockedUntil).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);
    for (const url of contentRoutes(doc)) await env.http.get(url).set(viewer.auth).expect(200);

    // The same person on another login (another device) must type it again.
    const otherLogin = await login(viewer);
    await env.http.get(`/api/documents/${doc.documentId}/preview`).set(otherLogin).expect(423);
    // Other members are still locked out, and cannot replace the contents with a new version either.
    await env.http.get(`/api/documents/${doc.documentId}/preview`).set(owner.auth).expect(423);
    await env.http.post(`/api/documents/${doc.documentId}/versions`).set(owner.auth).send({ uploadKey: 'any' }).expect(423);
  });

  it('locks everyone out again when the password changes', async () => {
    const doc = await protectedDoc('d');
    await env.http.post(`/api/documents/${doc.documentId}/unlock`).set(owner.auth).send({ password: PASSWORD }).expect(200);
    await env.http.post(`/api/documents/${doc.documentId}/protection/change`).set(editor.auth).send({ currentPassword: 'nope-nope', newPassword: 'newpass1' }).expect(403);
    await env.http.post(`/api/documents/${doc.documentId}/protection/change`).set(editor.auth).send({ currentPassword: PASSWORD, newPassword: 'newpass1' }).expect(204);
    await env.http.get(`/api/documents/${doc.documentId}/preview`).set(owner.auth).expect(423);
    await env.http.post(`/api/documents/${doc.documentId}/unlock`).set(owner.auth).send({ password: 'newpass1' }).expect(200);
  });

  it('lets only editors and owners protect, needs the current password to remove, and lets owners reset', async () => {
    const plain = await createDocument(env, editor, projectId, 'e.md', TEXT);
    await env.http.post(`/api/documents/${plain.documentId}/protection`).set(viewer.auth).send({ password: PASSWORD }).expect(403);
    await env.http.post(`/api/documents/${plain.documentId}/protection`).set(editor.auth).send({ password: 'abc' }).expect(400);

    const doc = await protectedDoc('f');
    await env.http.post(`/api/documents/${doc.documentId}/protection/reset`).set(editor.auth).send({ newPassword: 'forgotten1' }).expect(403);
    await env.http.post(`/api/documents/${doc.documentId}/protection/reset`).set(owner.auth).send({ newPassword: 'forgotten1' }).expect(204);
    await env.http.post(`/api/documents/${doc.documentId}/protection/remove`).set(editor.auth).send({ currentPassword: PASSWORD }).expect(403);
    await env.http.post(`/api/documents/${doc.documentId}/protection/remove`).set(editor.auth).send({ currentPassword: 'forgotten1' }).expect(204);
    await env.http.get(`/api/documents/${doc.documentId}/preview`).set(viewer.auth).expect(200);

    // The log records what happened, never the password.
    const log = await env.ctx.db.query<{ action: string; detail: unknown }>(
      `SELECT action, detail FROM activity_log WHERE entity_id = $1 ORDER BY log_id`,
      [doc.documentId],
    );
    expect(log.rows.map((r) => r.action)).toEqual(['document.uploaded', 'document.protected', 'document.password_reset', 'document.unprotected']);
    expect(JSON.stringify(log.rows)).not.toContain('forgotten1');
  });

  it('blocks guessing after five wrong passwords', async () => {
    const doc = await protectedDoc('g');
    for (let i = 0; i < 5; i++) await env.http.post(`/api/documents/${doc.documentId}/unlock`).set(viewer.auth).send({ password: `guess${i}x` }).expect(403);
    await env.http.post(`/api/documents/${doc.documentId}/unlock`).set(viewer.auth).send({ password: PASSWORD }).expect(429);
  });

  it('finds a protected document by title but never by its text', async () => {
    await protectedDoc('Payroll grades');
    const byText = await env.http.get(`/api/projects/${projectId}/search`).query({ q: 'allowance' }).set(viewer.auth).expect(200);
    expect(byText.body.filter((r: { document: { isProtected: boolean } }) => r.document.isProtected)).toHaveLength(0);
    const byTitle = await env.http.get(`/api/projects/${projectId}/search`).query({ q: 'Payroll' }).set(viewer.auth).expect(200);
    expect(byTitle.body[0]).toMatchObject({ document: { title: 'Payroll grades', isProtected: true }, snippet: null, matchedIn: ['title'] });
  });

  it('asks for the password on a public share link', async () => {
    const doc = await protectedDoc('h');
    const link = (await env.http.post(`/api/documents/${doc.documentId}/shares`).set(owner.auth).send({}).expect(201)).body;
    const locked = await env.http.get(`/api/public/shares/${link.token}`).expect(200);
    expect(locked.body).toMatchObject({ isProtected: true, file: null, download: null });
    await env.http.post(`/api/public/shares/${link.token}/unlock`).send({ password: 'wrongpass' }).expect(403);
    const open = await env.http.post(`/api/public/shares/${link.token}/unlock`).send({ password: PASSWORD }).expect(200);
    expect(open.body.file.url).toBeTruthy();
  });
});
