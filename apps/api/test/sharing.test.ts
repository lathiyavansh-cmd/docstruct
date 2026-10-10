import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, relative, signUp, uploadFile, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let reviewer: TestUser;
let viewer: TestUser;
let projectId: string;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

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

describe('M07 annotations', () => {
  it('anchors an annotation to a PDF page and region on the current version (Annot.Create, .Anchor, .Version.Scope)', async () => {
    const doc = await createDocument(env, editor, projectId, 'spec.pdf', PDF);
    const review = (await env.http.post(`/api/documents/${doc.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId }).expect(201)).body;
    const res = await env.http
      .post(`/api/documents/${doc.documentId}/annotations`)
      .set(reviewer.auth)
      .send({ body: 'Clarify this limit', pageNumber: 2, region: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 } })
      .expect(201);
    expect(res.body).toMatchObject({
      versionId: doc.currentVersion.versionId,
      versionNo: 1,
      pageNumber: 2,
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.05 },
      reviewId: review.reviewId,
      resolvedAt: null,
    });
    await env.http
      .post(`/api/documents/${doc.documentId}/annotations`)
      .set(reviewer.auth)
      .send({ body: 'bad', pageNumber: 1, region: { x: 0.9, y: 0, width: 0.5, height: 0.1 } })
      .expect(400);
  });

  it('refuses page anchors on non-PDF documents and annotation by viewers (SE-7)', async () => {
    const doc = await createDocument(env, editor, projectId, 'note.txt', 'text');
    await env.http.post(`/api/documents/${doc.documentId}/annotations`).set(editor.auth).send({ body: 'x', pageNumber: 1 }).expect(400);
    await env.http.post(`/api/documents/${doc.documentId}/annotations`).set(viewer.auth).send({ body: 'x' }).expect(403);
  });

  it('threads replies on the same version and resolves threads (Annot.Reply, .Reply.Scope, .Resolve, .List)', async () => {
    const doc = await createDocument(env, editor, projectId, 'thread.txt', 'text');
    const a = (await env.http.post(`/api/documents/${doc.documentId}/annotations`).set(editor.auth).send({ body: 'First point' }).expect(201)).body;
    const b = (await env.http.post(`/api/documents/${doc.documentId}/annotations`).set(editor.auth).send({ body: 'Second point' }).expect(201)).body;
    const replied = await env.http.post(`/api/annotations/${a.annotationId}/replies`).set(reviewer.auth).send({ body: 'Agreed' }).expect(201);
    expect(replied.body.replies.map((r: { body: string }) => r.body)).toEqual(['Agreed']);

    const resolved = await env.http.post(`/api/annotations/${a.annotationId}/resolve`).set(editor.auth).expect(200);
    expect(resolved.body.resolvedBy.displayName).toBe('Editor');
    await env.http.post(`/api/annotations/${a.annotationId}/resolve`).set(editor.auth).expect(409);

    const list = await env.http.get(`/api/versions/${doc.currentVersion.versionId}/annotations`).set(viewer.auth).expect(200);
    expect(list.body.map((t: { annotationId: string }) => t.annotationId)).toEqual([b.annotationId, a.annotationId]); // open first

    // Feedback stays with the version it was written on.
    const uploadKey = await uploadFile(env, editor, projectId, 'thread.txt', 'revised');
    const v2 = (await env.http.post(`/api/documents/${doc.documentId}/versions`).set(editor.auth).send({ uploadKey }).expect(201)).body.currentVersion;
    const onV2 = await env.http.get(`/api/versions/${v2.versionId}/annotations`).set(viewer.auth).expect(200);
    expect(onV2.body).toEqual([]);
  });

  it('enforces reply scope in the database (Annot.Reply.Scope)', async () => {
    const d1 = await createDocument(env, editor, projectId, 'x1.txt', 'a');
    const d2 = await createDocument(env, editor, projectId, 'x2.txt', 'b');
    const a = (await env.http.post(`/api/documents/${d1.documentId}/annotations`).set(editor.auth).send({ body: 'p' }).expect(201)).body;
    await expect(
      env.ctx.db.query('INSERT INTO annotations (version_id, parent_id, author_id, body) VALUES ($1, $2, $3, $4)', [
        d2.currentVersion.versionId,
        a.annotationId,
        editor.userId,
        'wrong version',
      ]),
    ).rejects.toThrow(/same version/);
  });
});

describe('M07 share links', () => {
  it('lets owners create a view-only link that opens exactly one document (Share.Create, .ViewOnly, .Scope)', async () => {
    const doc = await createDocument(env, editor, projectId, 'public.txt', 'shared content');
    await env.http.post(`/api/documents/${doc.documentId}/shares`).set(editor.auth).send({}).expect(403);
    const created = await env.http.post(`/api/documents/${doc.documentId}/shares`).set(owner.auth).send({ label: 'Client' }).expect(201);
    expect(created.body.url).toMatch(/\/s\/[\w-]{40,}$/);

    const opened = await env.http.get(`/api/public/shares/${created.body.token}`).expect(200);
    expect(opened.body).toMatchObject({ title: 'public', versionNo: 1 });
    expect((await env.http.get(relative(opened.body.file.url)).expect(200)).text).toBe('shared content');

    // A share token is not a session: it cannot reach any other endpoint.
    await env.http.get(`/api/documents/${doc.documentId}`).set('Authorization', `Bearer ${created.body.token}`).expect(401);
  });

  it('stores only a hash of the token (SE-15)', async () => {
    const doc = await createDocument(env, editor, projectId, 'hash.txt', 'x');
    const created = await env.http.post(`/api/documents/${doc.documentId}/shares`).set(owner.auth).send({}).expect(201);
    const { rows } = await env.ctx.db.query<{ token_hash: string }>('SELECT token_hash FROM share_links WHERE share_id = $1', [created.body.shareId]);
    expect(rows[0].token_hash).not.toContain(created.body.token);
    const list = await env.http.get(`/api/documents/${doc.documentId}/shares`).set(owner.auth).expect(200);
    expect(list.body[0]).not.toHaveProperty('token');
  });

  it('stops granting access after revocation or expiry (Share.Revoke, Share.Create.Expiry)', async () => {
    const doc = await createDocument(env, editor, projectId, 'temp.txt', 'x');
    const link = (await env.http.post(`/api/documents/${doc.documentId}/shares`).set(owner.auth).send({}).expect(201)).body;
    await env.http.post(`/api/shares/${link.shareId}/revoke`).set(owner.auth).expect(200);
    expect((await env.http.get(`/api/public/shares/${link.token}`).expect(410)).body.error.code).toBe('LINK_REVOKED');

    const soon = new Date(Date.now() + 60_000).toISOString();
    const expiring = (await env.http.post(`/api/documents/${doc.documentId}/shares`).set(owner.auth).send({ expiresAt: soon }).expect(201)).body;
    await env.http.get(`/api/public/shares/${expiring.token}`).expect(200);
    await env.ctx.db.query(`UPDATE share_links SET expires_at = now() - interval '1 second' WHERE share_id = $1`, [expiring.shareId]);
    expect((await env.http.get(`/api/public/shares/${expiring.token}`).expect(410)).body.error.code).toBe('LINK_EXPIRED');

    await env.http.post(`/api/documents/${doc.documentId}/shares`).set(owner.auth).send({ expiresAt: '2001-01-01T00:00:00Z' }).expect(400);
  });

  it('answers unknown tokens with 404 and logs creation and revocation (Log.Record)', async () => {
    await env.http.get('/api/public/shares/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').expect(404);
    const doc = await createDocument(env, editor, projectId, 'logged.txt', 'x');
    const link = (await env.http.post(`/api/documents/${doc.documentId}/shares`).set(owner.auth).send({}).expect(201)).body;
    await env.http.post(`/api/shares/${link.shareId}/revoke`).set(owner.auth).expect(200);
    const log = await env.ctx.db.query<{ action: string }>('SELECT action FROM activity_log WHERE entity_id = $1 ORDER BY log_id', [doc.documentId]);
    expect(log.rows.map((r) => r.action)).toEqual(['document.uploaded', 'share.created', 'share.revoked']);
  });
});
