/**
 * What this file does
 *   Tests sending a document to all project members and the "Shared with me" list.
 *
 * How it works
 *   - Boots the whole API on an in-memory database with createTestEnv() and sends real HTTP requests.
 *   - Builds a project with an owner and many members to check that one request reaches all of them.
 *
 * Where it fits
 *   Covers modules/recipients and the document_recipients table from migration 011. Module: M07 Sharing (owner: Shrut).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let members: TestUser[];
let outsider: TestUser;
let projectId: string;

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  outsider = await signUp(env, 'Outsider');
  members = [];
  for (let i = 0; i < 25; i++) members.push(await signUp(env, `Member ${i}`));
  projectId = await createProject(env, owner, [[editor, 'EDITOR'], ...members.map((m) => [m, 'VIEWER'] as [TestUser, 'VIEWER'])]);
});
afterAll(() => env.close());

describe('send a document to all members', () => {
  it('reaches every member except the sender with one request', async () => {
    const doc = await createDocument(env, owner, projectId, 'notice.md', '# Notice\n\nThe review meeting moved to Friday.');
    const res = await env.http.post(`/api/documents/${doc.documentId}/share-members`).set(owner.auth).send({ note: 'Please read before Friday' }).expect(200);
    expect(res.body.recipients).toBe(26); // 25 viewers + 1 editor

    const inbox = await env.http.get('/api/me/shared').set(members[7].auth).expect(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({ note: 'Please read before Friday', readAt: null, sharedBy: { displayName: 'Owner' }, document: { title: 'notice' } });
    expect((await env.http.get('/api/me/shared').set(owner.auth).expect(200)).body).toHaveLength(0);
    expect((await env.http.get('/api/me/shared').set(outsider.auth).expect(200)).body).toHaveLength(0);
  });

  it('marks an entry read when opened, and unread again when sent again', async () => {
    const doc = await createDocument(env, owner, projectId, 'policy.md', '# Policy\n\nVersions are never overwritten.');
    await env.http.post(`/api/documents/${doc.documentId}/share-members`).set(owner.auth).send({}).expect(200);
    await env.http.post(`/api/documents/${doc.documentId}/shared/read`).set(members[0].auth).expect(204);
    const read = (await env.http.get('/api/me/shared').set(members[0].auth).expect(200)).body.find((e: { document: { documentId: string } }) => e.document.documentId === doc.documentId);
    expect(read.readAt).not.toBeNull();

    // Sending again does not duplicate the entry; it shows as new.
    await env.http.post(`/api/documents/${doc.documentId}/share-members`).set(owner.auth).send({ note: 'Updated' }).expect(200);
    const entries = (await env.http.get('/api/me/shared').set(members[0].auth).expect(200)).body.filter((e: { document: { documentId: string } }) => e.document.documentId === doc.documentId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ readAt: null, note: 'Updated' });
  });

  it('is limited to project owners and logged', async () => {
    const doc = await createDocument(env, editor, projectId, 'draft.md', '# Draft');
    await env.http.post(`/api/documents/${doc.documentId}/share-members`).set(editor.auth).send({}).expect(403);
    await env.http.post(`/api/documents/${doc.documentId}/share-members`).set(outsider.auth).send({}).expect(404);
    await env.http.post(`/api/documents/${doc.documentId}/share-members`).set(owner.auth).send({}).expect(200);
    const log = await env.ctx.db.query<{ detail: { recipients: number } }>(
      `SELECT detail FROM activity_log WHERE entity_id = $1 AND action = 'document.shared_members'`,
      [doc.documentId],
    );
    expect(log.rows[0].detail.recipients).toBe(26);
  });

  it('hides deleted documents from the list and keeps password protection', async () => {
    const gone = await createDocument(env, owner, projectId, 'old.md', '# Old');
    await env.http.post(`/api/documents/${gone.documentId}/share-members`).set(owner.auth).send({}).expect(200);
    await env.http.delete(`/api/documents/${gone.documentId}`).set(owner.auth).expect(204);
    const inbox = (await env.http.get('/api/me/shared').set(members[1].auth).expect(200)).body;
    expect(inbox.some((e: { document: { documentId: string } }) => e.document.documentId === gone.documentId)).toBe(false);

    const secret = await createDocument(env, owner, projectId, 'secret.md', '# Secret\n\nOnly with the password.');
    await env.http.post(`/api/documents/${secret.documentId}/protection`).set(owner.auth).send({ password: 'letmein1' }).expect(204);
    await env.http.post(`/api/documents/${secret.documentId}/share-members`).set(owner.auth).send({}).expect(200);
    await env.http.get(`/api/documents/${secret.documentId}/preview`).set(members[2].auth).expect(423);
  });
});
