import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALLOWED_TRANSITIONS, canTransition } from '@docstruct/shared';
import { createDocument, createProject, createTestEnv, signUp, uploadFile, type TestEnv, type TestUser } from './helpers.js';

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

const submit = (user: TestUser, documentId: string, body: Record<string, unknown>) =>
  env.http.post(`/api/documents/${documentId}/reviews`).set(user.auth).send(body);

async function newVersion(documentId: string, content: string) {
  const uploadKey = await uploadFile(env, editor, projectId, 'doc.txt', content);
  return env.http.post(`/api/documents/${documentId}/versions`).set(editor.auth).send({ uploadKey });
}

describe('Algorithm D - review state machine', () => {
  it('allows only the transitions in the analysis model', () => {
    expect(canTransition('DRAFT', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition('UNDER_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransition('CHANGES_REQUESTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('APPROVED', 'UNDER_REVIEW')).toBe(false);
    expect(ALLOWED_TRANSITIONS.ARCHIVED).toEqual([]);
  });
});

describe('M05 review workflow', () => {
  it('submits the current version to one reviewer and lists it in their queue (Review.Submit, .Status, Review.Queue.View)', async () => {
    const doc = await createDocument(env, editor, projectId, 'plan.txt', 'v1');
    const res = await submit(editor, doc.documentId, { reviewerId: reviewer.userId, dueDate: '2099-01-31', note: 'Please check scope' }).expect(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      versionNo: 1,
      versionId: doc.currentVersion.versionId,
      dueDate: '2099-01-31',
      submissionNote: 'Please check scope',
      decidedAt: null,
      reviewer: { displayName: 'Reviewer' },
    });

    const detail = await env.http.get(`/api/documents/${doc.documentId}`).set(viewer.auth).expect(200);
    expect(detail.body.status).toBe('UNDER_REVIEW');
    expect(detail.body.openReview).toMatchObject({ reviewer: { userId: reviewer.userId }, dueDate: '2099-01-31' });

    const queue = await env.http.get('/api/reviews/queue').set(reviewer.auth).expect(200);
    expect(queue.body.map((r: { documentId: string }) => r.documentId)).toContain(doc.documentId);
  });

  it('only accepts a project member holding a reviewing role as reviewer (Review.Reviewer.Member)', async () => {
    const doc = await createDocument(env, editor, projectId, 'r.txt', 'v1');
    await submit(editor, doc.documentId, { reviewerId: outsider.userId }).expect(400);
    await submit(editor, doc.documentId, { reviewerId: viewer.userId }).expect(400);
    await submit(editor, doc.documentId, {}).expect(400); // Review.Submit.Reviewer
  });

  it('allows one open review at a time (Review.Submit.Single)', async () => {
    const doc = await createDocument(env, editor, projectId, 'single.txt', 'v1');
    await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(201);
    const second = await submit(editor, doc.documentId, { reviewerId: owner.userId }).expect(409);
    expect(second.body.error.code).toBe('REVIEW_ALREADY_OPEN');
  });

  it('restricts submission to owners and editors (Review.Submit)', async () => {
    const doc = await createDocument(env, editor, projectId, 's.txt', 'v1');
    await submit(reviewer, doc.documentId, { reviewerId: reviewer.userId }).expect(403);
    await submit(viewer, doc.documentId, { reviewerId: reviewer.userId }).expect(403);
  });

  it('lets only the designated reviewer decide, once (Review.Decision.Authority, SE-9)', async () => {
    const doc = await createDocument(env, editor, projectId, 'decide.txt', 'v1');
    const review = (await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(201)).body;
    await env.http.post(`/api/reviews/${review.reviewId}/approve`).set(owner.auth).send({}).expect(403);
    await env.http.post(`/api/reviews/${review.reviewId}/approve`).set(editor.auth).send({}).expect(403);

    const approved = await env.http.post(`/api/reviews/${review.reviewId}/approve`).set(reviewer.auth).send({ note: 'Looks good' }).expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', decisionNote: 'Looks good' });
    expect(approved.body.decidedAt).not.toBeNull();

    const doc2 = await env.http.get(`/api/documents/${doc.documentId}`).set(editor.auth).expect(200);
    expect(doc2.body.status).toBe('APPROVED');
    expect(doc2.body.openReview).toBeNull();

    const again = await env.http.post(`/api/reviews/${review.reviewId}/request-changes`).set(reviewer.auth).send({ note: 'x' }).expect(409);
    expect(again.body.error.code).toBe('REVIEW_CLOSED');
  });

  it('runs the request-changes / revise / resubmit loop and keeps the history (Review.RequestChanges, .Resubmit, .History.*)', async () => {
    const doc = await createDocument(env, editor, projectId, 'loop.txt', 'draft one');
    const first = (await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(201)).body;
    await env.http.post(`/api/reviews/${first.reviewId}/request-changes`).set(reviewer.auth).send({}).expect(400); // note required
    const changes = await env.http.post(`/api/reviews/${first.reviewId}/request-changes`).set(reviewer.auth).send({ note: 'Add the log section' }).expect(200);
    expect(changes.body.status).toBe('CHANGES_REQUESTED');

    const same = await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(409);
    expect(same.body.error.code).toBe('REVISION_REQUIRED');

    await newVersion(doc.documentId, 'draft two').then((r) => expect(r.status).toBe(201));
    const second = (await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(201)).body;
    expect(second.versionNo).toBe(2);
    await env.http.post(`/api/reviews/${second.reviewId}/approve`).set(reviewer.auth).send({}).expect(200);

    const history = await env.http.get(`/api/documents/${doc.documentId}/reviews`).set(viewer.auth).expect(200);
    expect(history.body.map((r: { status: string; versionNo: number; superseded: boolean }) => [r.status, r.versionNo, r.superseded])).toEqual([
      ['APPROVED', 2, false],
      ['CHANGES_REQUESTED', 1, true],
    ]);
    expect(history.body[1].decisionNote).toBe('Add the log section');
  });

  it('cancels by submitter or owner and restores the previous status (Review.Cancel)', async () => {
    const doc = await createDocument(env, editor, projectId, 'cancel.txt', 'v1');
    const review = (await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(201)).body;
    await env.http.post(`/api/reviews/${review.reviewId}/cancel`).set(reviewer.auth).expect(403);
    const cancelled = await env.http.post(`/api/reviews/${review.reviewId}/cancel`).set(owner.auth).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect((await env.http.get(`/api/documents/${doc.documentId}`).set(editor.auth)).body.status).toBe('DRAFT');
  });

  it('blocks new versions, deletion and reviewer removal while a review is open (SA-6, Doc.Delete.UnderReview, DE-4)', async () => {
    const doc = await createDocument(env, editor, projectId, 'busy.txt', 'v1');
    await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(201);

    const upload = await newVersion(doc.documentId, 'v2');
    expect(upload.status).toBe(409);
    const del = await env.http.delete(`/api/documents/${doc.documentId}`).set(owner.auth).expect(409);
    expect(del.body.error.code).toBe('REVIEW_IN_PROGRESS');
    const remove = await env.http.delete(`/api/projects/${projectId}/members/${reviewer.userId}`).set(owner.auth).expect(409);
    expect(remove.body.error.code).toBe('PENDING_REVIEWER');
  });

  it('keeps completed reviews immutable in the database (Review.History.Retain)', async () => {
    const doc = await createDocument(env, editor, projectId, 'immutable.txt', 'v1');
    const review = (await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(201)).body;
    await env.http.post(`/api/reviews/${review.reviewId}/approve`).set(reviewer.auth).send({}).expect(200);
    await expect(env.ctx.db.query(`UPDATE reviews SET decision_note = 'edited' WHERE review_id = $1`, [review.reviewId])).rejects.toThrow(/immutable/);
    await expect(env.ctx.db.query(`DELETE FROM reviews WHERE review_id = $1`, [review.reviewId])).rejects.toThrow(/cannot be deleted/);
  });

  it('archives a document so it is read-only (SA-7)', async () => {
    const doc = await createDocument(env, editor, projectId, 'archive.txt', 'v1');
    await env.http.post(`/api/documents/${doc.documentId}/archive`).set(editor.auth).expect(403);
    const res = await env.http.post(`/api/documents/${doc.documentId}/archive`).set(owner.auth).expect(200);
    expect(res.body.status).toBe('ARCHIVED');
    expect((await newVersion(doc.documentId, 'v2')).status).toBe(409);
    await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(409);
  });

  it('logs submissions and decisions (Log.Record)', async () => {
    const doc = await createDocument(env, editor, projectId, 'log.txt', 'v1');
    const review = (await submit(editor, doc.documentId, { reviewerId: reviewer.userId }).expect(201)).body;
    await env.http.post(`/api/reviews/${review.reviewId}/approve`).set(reviewer.auth).send({}).expect(200);
    const log = await env.ctx.db.query<{ action: string }>('SELECT action FROM activity_log WHERE entity_id = $1 ORDER BY log_id', [doc.documentId]);
    expect(log.rows.map((r) => r.action)).toEqual(['document.uploaded', 'review.submitted', 'review.approved']);
  });
});
