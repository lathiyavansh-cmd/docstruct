/**
 * What this file does
 *   Tests document upload and management: the two-step upload, format and size checks, content
 *   checks, rollback on failure, permissions, preview and download, rename, move, folder listing,
 *   soft delete and version immutability.
 *
 * How it works
 *   - beforeAll calls createTestEnv() from helpers.ts, which boots the whole API on an in-memory PGlite
 *     database with a temporary file store, and creates a project with four users.
 *   - Tests send real HTTP requests with supertest; helpers uploadFile() and createDocument() run
 *     the upload steps.
 *   - Some tests check the file store or the database directly to prove nothing was left behind.
 *
 * Where it fits
 *   Run by Vitest. Covers documents/routes.ts, service.ts, uploads.ts and content.ts. Module: M03
 *   Document & Folder Management (owner: Shrut).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, relative, signUp, uploadFile, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let projectId: string;

// A tiny fake PNG: the real 8-byte PNG signature followed by zeros, enough to pass the content check.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  viewer = await signUp(env, 'Viewer');
  outsider = await signUp(env, 'Outsider');
  projectId = await createProject(env, owner, [
    [editor, 'EDITOR'],
    [viewer, 'VIEWER'],
  ]);
});
afterAll(() => env.close());

describe('M03 document upload', () => {
  it('creates a Draft document with version 1 and logs it in one step (Doc.Upload.Done)', async () => {
    const doc = await createDocument(env, editor, projectId, 'Project_Plan.md', '# Plan\n\nShip it.', { changeNote: 'first draft' });
    expect(doc).toMatchObject({ title: 'Project Plan', status: 'DRAFT', openReview: null });
    expect(doc.currentVersion).toMatchObject({ versionNo: 1, fileName: 'Project_Plan.md', mimeType: 'text/markdown', changeNote: 'first draft', isCurrent: true });
    expect(doc.currentVersion.checksum).toMatch(/^[0-9a-f]{64}$/);

    const log = await env.ctx.db.query<{ action: string }>(`SELECT action FROM activity_log WHERE entity_id = $1`, [doc.documentId]);
    expect(log.rows.map((r) => r.action)).toEqual(['document.uploaded']);
  });

  it('rejects unsupported formats and oversize files before uploading (Doc.Upload.Format, Doc.Upload.Size)', async () => {
    const exe = await env.http.post(`/api/projects/${projectId}/uploads`).set(editor.auth).send({ fileName: 'virus.exe', byteSize: 10 }).expect(415);
    expect(exe.body.error.message).toContain('PDF, DOCX, TXT, MD, PNG or JPEG');
    const big = await env.http.post(`/api/projects/${projectId}/uploads`).set(editor.auth).send({ fileName: 'big.pdf', byteSize: 60 * 1024 * 1024 }).expect(413);
    expect(big.body.error.message).toContain('50.0 MB');
  });

  it('rejects a file whose contents do not match its extension, leaving nothing behind (Robustness-4)', async () => {
    // The name says .pdf but the bytes are plain text, so finalising must fail with 415.
    const key = await uploadFile(env, editor, projectId, 'fake.pdf', 'this is not a pdf');
    await env.http.post(`/api/projects/${projectId}/documents`).set(editor.auth).send({ uploadKey: key }).expect(415);
    expect(await env.ctx.storage.exists(key)).toBe(false);
  });

  it('rolls back and removes the stored file when finalising fails (Doc.Upload.Failure, Reliability-2)', async () => {
    const key = await uploadFile(env, editor, projectId, 'ok.txt', 'fine');
    const before = await env.ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM documents');
    // An unknown folder makes the transaction fail after the ticket was consumed.
    await env.http
      .post(`/api/projects/${projectId}/documents`)
      .set(editor.auth)
      .send({ uploadKey: key, folderId: '11111111-1111-4111-8111-111111111111' })
      .expect(404);
    const after = await env.ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM documents');
    expect(after.rows[0].n).toBe(before.rows[0].n);
    // The ticket is still unused because its consumption rolled back too; the object is gone.
    expect(await env.ctx.storage.exists(key)).toBe(false);
  });

  it('refuses to finalise without a completed upload or with someone else\'s key', async () => {
    const ticket = await env.http.post(`/api/projects/${projectId}/uploads`).set(editor.auth).send({ fileName: 'x.txt', byteSize: 3 }).expect(201);
    const missing = await env.http.post(`/api/projects/${projectId}/documents`).set(editor.auth).send({ uploadKey: ticket.body.uploadKey }).expect(400);
    expect(missing.body.error.code).toBe('UPLOAD_INCOMPLETE');

    const key = await uploadFile(env, editor, projectId, 'mine.txt', 'mine');
    await env.http.post(`/api/projects/${projectId}/documents`).set(owner.auth).send({ uploadKey: key }).expect(400);
  });

  it('forbids viewers and non-members from uploading (SE-7, SE-6)', async () => {
    await env.http.post(`/api/projects/${projectId}/uploads`).set(viewer.auth).send({ fileName: 'a.txt', byteSize: 1 }).expect(403);
    await env.http.post(`/api/projects/${projectId}/uploads`).set(outsider.auth).send({ fileName: 'a.txt', byteSize: 1 }).expect(404);
  });
});

describe('M03 document management', () => {
  it('previews previewable formats inline and offers download otherwise (Doc.Preview, .Unavailable, Doc.Download)', async () => {
    const image = await createDocument(env, editor, projectId, 'diagram.png', PNG);
    const preview = await env.http.get(`/api/documents/${image.documentId}/preview`).set(viewer.auth).expect(200);
    expect(preview.body).toMatchObject({ previewable: true, mimeType: 'image/png' });
    const file = await env.http.get(relative(preview.body.url)).expect(200);
    expect(file.headers['content-disposition']).toContain('inline');

    const docx = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('....word/document.xml....')]);
    const word = await createDocument(env, editor, projectId, 'report.docx', docx);
    const wordPreview = await env.http.get(`/api/documents/${word.documentId}/preview`).set(viewer.auth).expect(200);
    expect(wordPreview.body.previewable).toBe(false);

    const download = await env.http.get(`/api/documents/${word.documentId}/download`).set(viewer.auth).expect(200);
    const got = await env.http.get(relative(download.body.url)).expect(200);
    expect(got.headers['content-disposition']).toContain('attachment');
  });

  it('renames, moves and lists documents by folder (Doc.Rename, Doc.Move, Filter.Folder)', async () => {
    const folders = await env.http.post(`/api/projects/${projectId}/folders`).set(editor.auth).send({ name: 'Specs' }).expect(201);
    const specs = folders.body.find((f: { name: string }) => f.name === 'Specs');
    const sub = await env.http.post(`/api/projects/${projectId}/folders`).set(editor.auth).send({ name: 'Drafts', parentId: specs.folderId }).expect(201);
    const drafts = sub.body.find((f: { name: string }) => f.name === 'Specs').children[0];

    const doc = await createDocument(env, editor, projectId, 'srs.txt', 'requirements');
    const renamed = await env.http.patch(`/api/documents/${doc.documentId}`).set(editor.auth).send({ title: 'SRS', description: 'IEEE 830' }).expect(200);
    expect(renamed.body).toMatchObject({ title: 'SRS', description: 'IEEE 830' });

    await env.http.post(`/api/documents/${doc.documentId}/move`).set(editor.auth).send({ folderId: drafts.folderId }).expect(200);
    const direct = await env.http.get(`/api/projects/${projectId}/documents?folderId=${specs.folderId}`).set(viewer.auth).expect(200);
    const recursive = await env.http.get(`/api/projects/${projectId}/documents?folderId=${specs.folderId}&recursive=true`).set(viewer.auth).expect(200);
    expect(direct.body).toHaveLength(0);
    expect(recursive.body.map((d: { title: string }) => d.title)).toEqual(['SRS']);

    const detail = await env.http.get(`/api/documents/${doc.documentId}`).set(viewer.auth).expect(200);
    expect(detail.body.folderPath.map((f: { name: string }) => f.name)).toEqual(['Specs', 'Drafts']);
  });

  it('lets only owners delete, hides the document and keeps its history (Doc.Delete, Log.Retention)', async () => {
    const doc = await createDocument(env, editor, projectId, 'temp.txt', 'temp');
    await env.http.delete(`/api/documents/${doc.documentId}`).set(editor.auth).expect(403);
    await env.http.delete(`/api/documents/${doc.documentId}`).set(owner.auth).expect(204);
    await env.http.get(`/api/documents/${doc.documentId}`).set(owner.auth).expect(404);
    const log = await env.ctx.db.query<{ action: string }>('SELECT action FROM activity_log WHERE entity_id = $1 ORDER BY log_id', [doc.documentId]);
    expect(log.rows.map((r) => r.action)).toEqual(['document.uploaded', 'document.deleted']);
  });

  it('keeps versions immutable at the database level (Version.Immutable, CO-7)', async () => {
    const doc = await createDocument(env, editor, projectId, 'locked.txt', 'v1');
    const id = doc.currentVersion.versionId;
    await expect(env.ctx.db.query(`UPDATE document_versions SET version_no = 9 WHERE version_id = $1`, [id])).rejects.toThrow(/immutable/);
    await expect(env.ctx.db.query(`UPDATE document_versions SET storage_key = 'x' WHERE version_id = $1`, [id])).rejects.toThrow(/immutable/);
    await expect(env.ctx.db.query(`DELETE FROM document_versions WHERE version_id = $1`, [id])).rejects.toThrow(/cannot be deleted/);
  });
});
