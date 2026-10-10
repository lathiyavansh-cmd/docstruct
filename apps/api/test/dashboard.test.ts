import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let reviewer: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let projectId: string;

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  reviewer = await signUp(env, 'Reviewer');
  viewer = await signUp(env, 'Viewer');
  outsider = await signUp(env, 'Outsider');
  projectId = await createProject(env, owner, [
    [editor, 'EDITOR'],
    [reviewer, 'REVIEWER'],
    [viewer, 'VIEWER'],
  ]);
});
afterAll(() => env.close());

describe('M09 dashboard', () => {
  it('shows status counts, pending actions, review progress and recent activity (Dash.*)', async () => {
    const a = await createDocument(env, editor, projectId, 'a.txt', 'a');
    const b = await createDocument(env, editor, projectId, 'b.txt', 'b');
    await createDocument(env, editor, projectId, 'c.txt', 'c');
    await env.http.post(`/api/documents/${a.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId, dueDate: '2099-12-31' }).expect(201);
    const rb = (await env.http.post(`/api/documents/${b.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId }).expect(201)).body;
    await env.http.post(`/api/reviews/${rb.reviewId}/request-changes`).set(reviewer.auth).send({ note: 'Fix it' }).expect(200);
    await env.http.post(`/api/documents/${a.documentId}/annotations`).set(reviewer.auth).send({ body: 'Check this' }).expect(201);

    const forReviewer = (await env.http.get(`/api/projects/${projectId}/dashboard`).set(reviewer.auth).expect(200)).body;
    expect(forReviewer.statusCounts).toEqual({ DRAFT: 1, UNDER_REVIEW: 1, CHANGES_REQUESTED: 1, APPROVED: 0, ARCHIVED: 0 });
    expect(forReviewer.totalDocuments).toBe(3);
    expect(forReviewer.awaitingMyReview.map((r: { documentId: string }) => r.documentId)).toEqual([a.documentId]);
    expect(forReviewer.underReview[0]).toMatchObject({ reviewer: { userId: reviewer.userId }, dueDate: '2099-12-31', overdue: false });
    expect(forReviewer.openAnnotations).toBe(1);
    expect(forReviewer.recentActivity[0].action).toBe('annotation.created');

    const forEditor = (await env.http.get(`/api/projects/${projectId}/dashboard`).set(editor.auth).expect(200)).body;
    expect(forEditor.myChangesRequested.map((d: { documentId: string }) => d.documentId)).toEqual([b.documentId]);
    expect(forEditor.awaitingMyReview).toEqual([]);
  });

  it('reflects a decision immediately (PE-9)', async () => {
    const doc = await createDocument(env, editor, projectId, 'fast.txt', 'x');
    const review = (await env.http.post(`/api/documents/${doc.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId }).expect(201)).body;
    await env.http.post(`/api/reviews/${review.reviewId}/approve`).set(reviewer.auth).send({}).expect(200);
    const dash = (await env.http.get(`/api/projects/${projectId}/dashboard`).set(viewer.auth).expect(200)).body;
    expect(dash.statusCounts.APPROVED).toBe(1);
  });

  it('is visible to every member and hidden from outsiders', async () => {
    await env.http.get(`/api/projects/${projectId}/dashboard`).set(viewer.auth).expect(200);
    await env.http.get(`/api/projects/${projectId}/dashboard`).set(outsider.auth).expect(404);
  });
});

describe('M09 activity log', () => {
  it('lists actor, action and entity newest first, keeping deleted documents (Log.View, .Record.Detail, .Retention)', async () => {
    const doc = await createDocument(env, editor, projectId, 'gone.txt', 'x');
    await env.http.delete(`/api/documents/${doc.documentId}`).set(owner.auth).expect(204);
    const log = (await env.http.get(`/api/projects/${projectId}/activity?limit=2`).set(viewer.auth).expect(200)).body;
    expect(log[0]).toMatchObject({ action: 'document.deleted', actor: { displayName: 'Owner' }, entityType: 'document', entityLabel: 'gone' });
    expect(log[1]).toMatchObject({ action: 'document.uploaded', actor: { displayName: 'Editor' } });
    expect(new Date(log[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(log[1].createdAt).getTime());
  });

  it('pages with a cursor and filters by document', async () => {
    const page1 = (await env.http.get(`/api/projects/${projectId}/activity?limit=3`).set(viewer.auth).expect(200)).body;
    const page2 = (await env.http.get(`/api/projects/${projectId}/activity?limit=3&before=${page1[2].logId}`).set(viewer.auth).expect(200)).body;
    expect(Number(page2[0].logId)).toBeLessThan(Number(page1[2].logId));

    const doc = await createDocument(env, editor, projectId, 'only.txt', 'x');
    const filtered = (await env.http.get(`/api/projects/${projectId}/activity?documentId=${doc.documentId}`).set(viewer.auth).expect(200)).body;
    expect(filtered.map((e: { action: string }) => e.action)).toEqual(['document.uploaded']);
  });

  it('records the project, member and role history from creation (Log.Record)', async () => {
    const log = (await env.http.get(`/api/projects/${projectId}/activity?limit=200`).set(owner.auth).expect(200)).body;
    const actions = log.map((e: { action: string }) => e.action);
    expect(actions.slice(-4)).toEqual(['member.added', 'member.added', 'member.added', 'project.created']);
  });
});
