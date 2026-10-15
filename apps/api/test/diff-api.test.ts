/**
 * What this file does
 *   Tests the version comparison and pre-review endpoints end to end: comparing two versions, caching the
 *   result, refusing versions of another document, the "unavailable" case, and the automatic pre-review.
 *
 * How it works
 *   - createTestEnv() from helpers.ts boots the whole API on an in-memory PGlite database.
 *   - twoVersions() uploads a document with two versions (V1 and V2) and waits for text extraction.
 *   - Tests call /compare and /pre-review with supertest and check the stats, changes, findings and summary.
 *
 * Where it fits
 *   Run by vitest. Covers modules/diff through the HTTP API. Module: F3.6 Version Comparison & Pre-Review (owner: Vansh).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, signUp, uploadFile, type TestEnv, type TestUser } from './helpers.js';

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

const V1 = '# Scope\n\nThe system shall store every uploaded version.\n\nSearch covers titles only.';
const V2 = '# Scope\n\nThe system shall store every uploaded version.\n\nSearch covers titles and document content.\n\nEvery decision is logged.';

async function twoVersions(name: string, second = V2, firstFile = 'spec.md') {
  const doc = await createDocument(env, editor, projectId, firstFile, V1);
  const uploadKey = await uploadFile(env, editor, projectId, 'spec.md', second);
  const res = await env.http.post(`/api/documents/${doc.documentId}/versions`).set(editor.auth).send({ uploadKey }).expect(201);
  // Wait for background text extraction, otherwise the comparison would come back PENDING.
  await env.ctx.jobs.idle();
  return { documentId: doc.documentId, v1: doc.currentVersion.versionId, v2: res.body.currentVersion.versionId as string, name };
}

describe('F3.6 version comparison', () => {
  it('compares any two versions at paragraph level with a labelled summary (Diff.Compare.*, Diff.PreReview.Attribution)', async () => {
    const { documentId, v1, v2 } = await twoVersions('a');
    const res = await env.http.get(`/api/documents/${documentId}/compare?from=${v1}&to=${v2}`).set(viewer.auth).expect(200);
    expect(res.body).toMatchObject({ status: 'READY', machineGenerated: true, from: { versionNo: 1 }, to: { versionNo: 2 } });
    expect(res.body.stats).toMatchObject({ added: 1, modified: 1, deleted: 0, substantive: 2 });
    expect(res.body.changes.map((c: { kind: string }) => c.kind)).toEqual(['MODIFIED', 'ADDED']);
    expect(res.body.changes[0].section).toBe('Scope');
    expect(res.body.changes[0].words.some((w: { op: string }) => w.op === 'insert')).toBe(true);
    expect(res.body.summary).toContain('version 2 changes 2 paragraph(s)');
    expect(res.body.engine).toMatch(/^docstruct-prereview/);
  });

  it('stores the result and reuses it (Diff.Summary.Store)', async () => {
    const { documentId, v1, v2 } = await twoVersions('b');
    const first = await env.http.get(`/api/documents/${documentId}/compare?from=${v1}&to=${v2}`).set(viewer.auth).expect(200);
    const second = await env.http.get(`/api/documents/${documentId}/compare?from=${v1}&to=${v2}`).set(viewer.auth).expect(200);
    expect(second.body.generatedAt).toBe(first.body.generatedAt);
    const rows = await env.ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM version_diffs WHERE from_version_id = $1', [v1]);
    expect(rows.rows[0].n).toBe(1);
  });

  it('refuses versions of another document', async () => {
    const a = await twoVersions('c');
    const b = await twoVersions('d');
    await env.http.get(`/api/documents/${a.documentId}/compare?from=${a.v1}&to=${b.v2}`).set(viewer.auth).expect(404);
  });

  it('reports a comparison as unavailable when text could not be extracted (Diff.Unavailable)', async () => {
    // A minimal PNG (just the file signature plus zero bytes): an image has no text to compare.
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    const doc = await createDocument(env, editor, projectId, 'pic.png', png);
    const uploadKey = await uploadFile(env, editor, projectId, 'pic.png', Buffer.concat([png, Buffer.alloc(4)]));
    const v2 = (await env.http.post(`/api/documents/${doc.documentId}/versions`).set(editor.auth).send({ uploadKey }).expect(201)).body.currentVersion.versionId;
    const res = await env.http.get(`/api/documents/${doc.documentId}/compare?from=${doc.currentVersion.versionId}&to=${v2}`).set(viewer.auth).expect(200);
    expect(res.body.status).toBe('UNAVAILABLE');
    expect(res.body.reason).toContain('Download the versions');
  });
});

describe('F3.6 automatic pre-review on submission', () => {
  it('compares the submitted version with its predecessor and leaves the decision to the reviewer (Diff.PreReview.Run, .Advisory)', async () => {
    const { documentId } = await twoVersions('e', V2 + '\n\nTODO: add retention rules.');
    const review = (await env.http.post(`/api/documents/${documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId }).expect(201)).body;
    await env.ctx.jobs.idle();

    const stored = await env.ctx.db.query('SELECT 1 FROM version_diffs WHERE document_id = $1', [documentId]);
    expect(stored.rows.length).toBe(1); // generated in the background at submission

    const pre = await env.http.get(`/api/reviews/${review.reviewId}/pre-review`).set(reviewer.auth).expect(200);
    expect(pre.body.firstVersion).toBe(false);
    expect(pre.body.diff.status).toBe('READY');
    expect(pre.body.diff.findings.some((f: { rule: string }) => f.rule === 'placeholder')).toBe(true);

    // Advisory only: the document is still waiting for the human decision.
    const doc = await env.http.get(`/api/documents/${documentId}`).set(reviewer.auth).expect(200);
    expect(doc.body.status).toBe('UNDER_REVIEW');
  });

  it('says no comparison is available for a first version (Diff.FirstVersion)', async () => {
    const doc = await createDocument(env, editor, projectId, 'first.md', V1);
    const review = (await env.http.post(`/api/documents/${doc.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId }).expect(201)).body;
    const pre = await env.http.get(`/api/reviews/${review.reviewId}/pre-review`).set(reviewer.auth).expect(200);
    expect(pre.body).toEqual({ reviewId: review.reviewId, firstVersion: true, diff: null });
  });
});
