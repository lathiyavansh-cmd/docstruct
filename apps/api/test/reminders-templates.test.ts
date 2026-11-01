/**
 * What this file does
 *   Tests review reminders (overdue tracking and nudging the reviewer) and document templates (checking a
 *   document's headings against a checklist).
 *
 * How it works
 *   - Boots the API on an in-memory database with createTestEnv() and creates an owner, editor and reviewer.
 *   - Reviews cannot be submitted with a past due date, so the test moves the due date back with SQL to
 *     make a review overdue, exactly as time passing would.
 *   - The template tests upload Markdown with known headings and check what the checker finds and misses.
 *
 * Where it fits
 *   Covers modules/reviews (nudge, reminders) and modules/templates. Module: reviews (owner: Vivan) and
 *   templates (owner: Vansh).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonical, checkHeadings } from '../src/modules/templates/check.js';
import { createDocument, createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let reviewer: TestUser;
let projectId: string;

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  reviewer = await signUp(env, 'Reviewer');
  projectId = await createProject(env, owner, [
    [editor, 'EDITOR'],
    [reviewer, 'REVIEWER'],
  ]);
});
afterAll(() => env.close());

const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

describe('review reminders', () => {
  it('lists overdue and soon-due reviews for the reviewer and overdue ones for the submitter', async () => {
    const soon = await createDocument(env, editor, projectId, 'soon.md', '# Soon\n\nDue soon.', { title: 'Soon' });
    const late = await createDocument(env, editor, projectId, 'late.md', '# Late\n\nOverdue.', { title: 'Late' });
    const far = await createDocument(env, editor, projectId, 'far.md', '# Far\n\nNot due for a while.', { title: 'Far' });
    await env.http.post(`/api/documents/${soon.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId, dueDate: inDays(1) }).expect(201);
    const lateReview = (await env.http.post(`/api/documents/${late.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId, dueDate: inDays(3) }).expect(201)).body;
    await env.http.post(`/api/documents/${far.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId, dueDate: inDays(10) }).expect(201);
    // Time passes: the "late" review's due date is now two days ago.
    await env.ctx.db.query(`UPDATE reviews SET due_date = current_date - 2 WHERE review_id = $1`, [lateReview.reviewId]);

    const mine = (await env.http.get('/api/me/reminders').set(reviewer.auth).expect(200)).body;
    expect(mine.items.map((i: { kind: string; review: { documentTitle: string } }) => [i.kind, i.review.documentTitle])).toEqual([
      ['review_overdue', 'Late'],
      ['review_due_soon', 'Soon'],
    ]);
    expect(mine.attention).toBe(2);
    expect(mine.items[0].review).toMatchObject({ overdue: true, daysUntilDue: -2 });

    const sent = (await env.http.get('/api/me/reminders').set(editor.auth).expect(200)).body;
    expect(sent.items.map((i: { kind: string }) => i.kind)).toEqual(['sent_overdue']);

    // The queue carries the same flags, so the reviewer sees "overdue" there too.
    const queue = (await env.http.get('/api/reviews/queue').set(reviewer.auth).expect(200)).body;
    expect(queue.find((r: { documentTitle: string }) => r.documentTitle === 'Late')).toMatchObject({ overdue: true });
    expect(queue.find((r: { documentTitle: string }) => r.documentTitle === 'Far')).toMatchObject({ overdue: false, daysUntilDue: 10 });
  });

  it('lets the submitter nudge the reviewer once a day, and shows the nudge to the reviewer', async () => {
    const doc = await createDocument(env, editor, projectId, 'nudge.md', '# Nudge\n\nPlease.');
    const review = (await env.http.post(`/api/documents/${doc.documentId}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId, dueDate: inDays(5) }).expect(201)).body;

    // The reviewer cannot nudge themselves; a viewer-level role cannot nudge at all (needs review.submit).
    await env.http.post(`/api/reviews/${review.reviewId}/nudge`).set(reviewer.auth).expect(403);

    const nudged = (await env.http.post(`/api/reviews/${review.reviewId}/nudge`).set(editor.auth).expect(200)).body;
    expect(nudged.nudgeCount).toBe(1);
    expect(nudged.nudgedAt).toBeTruthy();
    // A second nudge the same day is refused.
    const again = await env.http.post(`/api/reviews/${review.reviewId}/nudge`).set(editor.auth).expect(409);
    expect(again.body.error.code).toBe('NUDGED_RECENTLY');
    // An owner may also nudge, once the day has passed.
    await env.ctx.db.query(`UPDATE reviews SET nudged_at = now() - interval '25 hours' WHERE review_id = $1`, [review.reviewId]);
    expect((await env.http.post(`/api/reviews/${review.reviewId}/nudge`).set(owner.auth).expect(200)).body.nudgeCount).toBe(2);

    const mine = (await env.http.get('/api/me/reminders').set(reviewer.auth).expect(200)).body;
    expect(mine.items.find((i: { review: { reviewId: string } }) => i.review.reviewId === review.reviewId).kind).toBe('nudged');

    // Once decided, the submitter sees the decision and nobody can nudge any more.
    await env.http.post(`/api/reviews/${review.reviewId}/approve`).set(reviewer.auth).send({}).expect(200);
    await env.http.post(`/api/reviews/${review.reviewId}/nudge`).set(editor.auth).expect(409);
    const sent = (await env.http.get('/api/me/reminders').set(editor.auth).expect(200)).body;
    expect(sent.items.find((i: { review: { reviewId: string } }) => i.review.reviewId === review.reviewId).kind).toBe('decided');
    // Decisions are information, not work to do.
    expect(sent.attention).toBe(sent.items.filter((i: { kind: string }) => i.kind !== 'decided').length);
  });
});

describe('template checker', () => {
  it('ignores numbering, case and punctuation when comparing headings', () => {
    expect(canonical('## 3.2 Functional Requirements:')).toBe('functional requirements');
    expect(canonical('Section 4 - Non-Functional Requirements')).toBe('non functional requirements');
    expect(canonical('Appendix A Glossary')).toBe('glossary');
  });

  it('matches equal, containing and closely worded headings, each document heading at most once', () => {
    const { items, extraHeadings } = checkHeadings(
      ['Introduction', 'Functional Requirements', 'Non-functional Requirements', 'Acceptance Criteria', 'References'],
      ['1 Introduction', '2 Functional requirements and use cases', '3 Non functional requirement', '4 Glossary'],
    );
    expect(items.map((i) => [i.heading, i.found, i.matchedHeading])).toEqual([
      ['Introduction', true, '1 Introduction'],
      ['Functional Requirements', true, '2 Functional requirements and use cases'],
      ['Non-functional Requirements', true, '3 Non functional requirement'],
      ['Acceptance Criteria', false, null],
      ['References', false, null],
    ]);
    expect(extraHeadings).toEqual(['4 Glossary']);
  });
});

describe('document templates', () => {
  const srs = ['Introduction', 'Functional Requirements', 'Non-functional Requirements', 'Acceptance Criteria'];

  it('lets an owner manage templates and any member read them', async () => {
    await env.http.post(`/api/projects/${projectId}/templates`).set(editor.auth).send({ name: 'Nope', headings: srs }).expect(403);
    const created = (await env.http.post(`/api/projects/${projectId}/templates`).set(owner.auth).send({ name: 'SRS checklist', headings: [...srs, ' Introduction ', ''] }).expect(201)).body;
    // Blanks and duplicates are dropped; order is kept.
    expect(created.headings).toEqual(srs);
    expect(created.documentCount).toBe(0);
    await env.http.post(`/api/projects/${projectId}/templates`).set(owner.auth).send({ name: 'SRS checklist', headings: srs }).expect(409);

    const list = (await env.http.get(`/api/projects/${projectId}/templates`).set(reviewer.auth).expect(200)).body;
    expect(list.map((t: { name: string }) => t.name)).toEqual(['SRS checklist']);

    const updated = (await env.http.patch(`/api/projects/${projectId}/templates/${created.templateId}`).set(owner.auth).send({ headings: [...srs, 'References'] }).expect(200)).body;
    expect(updated.headings).toHaveLength(5);
  });

  it('checks a document against its template and lists compliance for the project', async () => {
    const [template] = (await env.http.get(`/api/projects/${projectId}/templates`).set(owner.auth).expect(200)).body;
    const complete = await createDocument(env, editor, projectId, 'complete.md', '# Canteen SRS\n\n## 1 Introduction\n\nText.\n\n## 2 Functional Requirements\n\nText.\n\n## 3 Non-Functional Requirements\n\nText.\n\n## 4 Acceptance Criteria\n\nText.\n\n## 5 References\n\nText.\n', { title: 'Canteen SRS' });
    const partial = await createDocument(env, editor, projectId, 'partial.md', '# Draft\n\n## Introduction\n\nText.\n\n## Functional requirements\n\nText.\n\n## Glossary\n\nText.\n', { title: 'Draft' });
    await env.ctx.jobs.idle();

    // No template yet: the check is null.
    expect((await env.http.get(`/api/documents/${partial.documentId}/template-check`).set(reviewer.auth).expect(200)).body).toBeNull();

    const check = (await env.http.put(`/api/documents/${partial.documentId}/template`).set(editor.auth).send({ templateId: template.templateId }).expect(200)).body;
    expect(check).toMatchObject({ status: 'DONE', missing: 3, complete: false, extraHeadings: ['Glossary'] });
    expect(check.items.filter((i: { found: boolean }) => !i.found).map((i: { heading: string }) => i.heading)).toEqual(['Non-functional Requirements', 'Acceptance Criteria', 'References']);
    expect((await env.http.get(`/api/documents/${partial.documentId}`).set(editor.auth).expect(200)).body.templateId).toBe(template.templateId);

    const full = (await env.http.put(`/api/documents/${complete.documentId}/template`).set(editor.auth).send({ templateId: template.templateId }).expect(200)).body;
    expect(full).toMatchObject({ status: 'DONE', missing: 0, complete: true });

    const compliance = (await env.http.get(`/api/projects/${projectId}/templates/${template.templateId}/compliance`).set(reviewer.auth).expect(200)).body;
    expect(compliance.map((c: { document: { title: string }; check: { missing: number } }) => [c.document.title, c.check.missing])).toEqual([
      ['Draft', 3],
      ['Canteen SRS', 0],
    ]);

    // A template from another project cannot be attached.
    const other = await createProject(env, owner, [], 'Other');
    const foreign = (await env.http.post(`/api/projects/${other}/templates`).set(owner.auth).send({ name: 'Foreign', headings: ['A'] }).expect(201)).body;
    await env.http.put(`/api/documents/${partial.documentId}/template`).set(editor.auth).send({ templateId: foreign.templateId }).expect(404);

    // Clearing the template, and deleting one detaches its documents.
    expect((await env.http.put(`/api/documents/${partial.documentId}/template`).set(editor.auth).send({ templateId: null }).expect(200)).body).toBeNull();
    await env.http.delete(`/api/projects/${projectId}/templates/${template.templateId}`).set(owner.auth).expect(204);
    expect((await env.http.get(`/api/documents/${complete.documentId}`).set(editor.auth).expect(200)).body.templateId).toBeNull();
  });
});
