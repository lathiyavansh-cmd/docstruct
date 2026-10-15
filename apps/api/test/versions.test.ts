/**
 * What this file does
 *   Tests version control: adding versions, numbering under concurrent uploads, downloading old versions,
 *   restoring, role checks, status reset after approval, and activity logging.
 *
 * How it works
 *   - createTestEnv() from helpers.ts boots the whole API on an in-memory PGlite database.
 *   - beforeAll signs up an owner, editor, reviewer and viewer and puts them in one project.
 *   - Each test sends real HTTP requests with supertest and checks the responses or the database.
 *
 * Where it fits
 *   Run by vitest. Covers modules/versions. Module: M04 Version Control (owner: Vansh).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, relative, signUp, uploadFile, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let reviewer: TestUser;
let viewer: TestUser;
let projectId: string;

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  reviewer = await signUp(env, 'Reviewer');
  viewer = await signUp(env, 'Viewer');
  projectId = await createProject(env, owner, [
    [editor, 'EDITOR'],
    [reviewer, 'REVIEWER'],
    [viewer, 'VIEWER'],
  ]);
});
afterAll(() => env.close());

async function newVersion(user: TestUser, documentId: string, content: string, changeNote = '') {
  const uploadKey = await uploadFile(env, user, projectId, 'doc.txt', content);
  return env.http.post(`/api/documents/${documentId}/versions`).set(user.auth).send({ uploadKey, changeNote });
}

describe('M04 version management', () => {
  it('adds sequential versions, keeps the old ones and marks the newest current (Version.Create, .Current, .Note)', async () => {
    const doc = await createDocument(env, editor, projectId, 'doc.txt', 'one');
    const res = await newVersion(editor, doc.documentId, 'two', 'second pass');
    expect(res.status).toBe(201);
    expect(res.body.currentVersion).toMatchObject({ versionNo: 2, changeNote: 'second pass', isCurrent: true });

    const history = await env.http.get(`/api/documents/${doc.documentId}/versions`).set(viewer.auth).expect(200);
    expect(history.body.map((v: { versionNo: number }) => v.versionNo)).toEqual([2, 1]);
    expect(history.body[1]).toMatchObject({ isCurrent: false, uploadedBy: { displayName: 'Editor' } });
    expect(history.body.filter((v: { isCurrent: boolean }) => v.isCurrent)).toHaveLength(1);
  });

  it('allocates distinct numbers for concurrent uploads and loses none (Version.Number.Concurrent, PE-8)', async () => {
    const doc = await createDocument(env, editor, projectId, 'busy.txt', 'base');
    const keys = await Promise.all([1, 2, 3, 4, 5].map((i) => uploadFile(env, editor, projectId, 'busy.txt', `edit ${i}`)));
    // Five uploads sent at the same time; the advisory lock must still give numbers 2 to 6 with no gaps or repeats.
    const results = await Promise.all(
      keys.map((uploadKey) => env.http.post(`/api/documents/${doc.documentId}/versions`).set(editor.auth).send({ uploadKey })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const history = await env.http.get(`/api/documents/${doc.documentId}/versions`).set(editor.auth).expect(200);
    expect(history.body.map((v: { versionNo: number }) => v.versionNo).sort((a: number, b: number) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('downloads any earlier version (Version.Download.Previous)', async () => {
    const doc = await createDocument(env, editor, projectId, 'old.txt', 'original text');
    await newVersion(editor, doc.documentId, 'newer text');
    const link = await env.http.get(`/api/versions/${doc.currentVersion.versionId}/download`).set(viewer.auth).expect(200);
    const file = await env.http.get(relative(link.body.url)).expect(200);
    expect(file.text).toBe('original text');
  });

  it('restores by appending a new version that records its source (Version.Restore.NewVersion)', async () => {
    const doc = await createDocument(env, editor, projectId, 'r.txt', 'first');
    await newVersion(editor, doc.documentId, 'second');
    const restored = await env.http
      .post(`/api/documents/${doc.documentId}/versions/${doc.currentVersion.versionId}/restore`)
      .set(editor.auth)
      .expect(201);
    expect(restored.body.currentVersion).toMatchObject({ versionNo: 3, restoredFromVersionNo: 1, changeNote: 'Restored from version 1' });
    // Same checksum proves the restored version reuses the original file.
    expect(restored.body.currentVersion.checksum).toBe(doc.currentVersion.checksum);

    const history = await env.http.get(`/api/documents/${doc.documentId}/versions`).set(editor.auth).expect(200);
    expect(history.body.map((v: { versionNo: number }) => v.versionNo)).toEqual([3, 2, 1]);

    const again = await env.http
      .post(`/api/documents/${doc.documentId}/versions/${restored.body.currentVersion.versionId}/restore`)
      .set(editor.auth)
      .expect(400);
    expect(again.body.error.message).toContain('already the current version');
  });

  it('restricts uploading and restoring to owners and editors (Version.Restore, SE-7)', async () => {
    const doc = await createDocument(env, editor, projectId, 'x.txt', 'x');
    await env.http.post(`/api/projects/${projectId}/uploads`).set(reviewer.auth).send({ fileName: 'x.txt', byteSize: 1 }).expect(403);
    await env.http.post(`/api/documents/${doc.documentId}/versions/${doc.currentVersion.versionId}/restore`).set(viewer.auth).expect(403);
  });

  it('refuses a version id from another document', async () => {
    const a = await createDocument(env, editor, projectId, 'a.txt', 'a');
    const b = await createDocument(env, editor, projectId, 'b.txt', 'b');
    await newVersion(editor, a.documentId, 'a2');
    await env.http.post(`/api/documents/${a.documentId}/versions/${b.currentVersion.versionId}/restore`).set(editor.auth).expect(404);
  });

  it('returns an approved document to Draft when a new version is added (Appendix B)', async () => {
    const doc = await createDocument(env, editor, projectId, 'approved.txt', 'v1');
    await env.ctx.db.query(`UPDATE documents SET status = 'APPROVED' WHERE document_id = $1`, [doc.documentId]);
    const res = await newVersion(editor, doc.documentId, 'v2');
    expect(res.body.status).toBe('DRAFT');
  });

  it('logs version uploads and restorations (Log.Record)', async () => {
    const doc = await createDocument(env, editor, projectId, 'logged.txt', 'v1');
    await newVersion(editor, doc.documentId, 'v2');
    await env.http.post(`/api/documents/${doc.documentId}/versions/${doc.currentVersion.versionId}/restore`).set(editor.auth).expect(201);
    const log = await env.ctx.db.query<{ action: string }>('SELECT action FROM activity_log WHERE entity_id = $1 ORDER BY log_id', [doc.documentId]);
    expect(log.rows.map((r) => r.action)).toEqual(['document.uploaded', 'version.uploaded', 'version.restored']);
  });
});
