import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let reviewer: TestUser;
let outsider: TestUser;
let projectId: string;
let otherProject: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  reviewer = await signUp(env, 'Reviewer');
  outsider = await signUp(env, 'Outsider');
  projectId = await createProject(env, owner, [
    [editor, 'EDITOR'],
    [reviewer, 'REVIEWER'],
  ]);
  otherProject = await createProject(env, outsider, [], 'Secret project');

  const folders = await env.http.post(`/api/projects/${projectId}/folders`).set(editor.auth).send({ name: 'Specs' }).expect(201);
  const specs = folders.body[0].folderId as string;
  const sub = await env.http.post(`/api/projects/${projectId}/folders`).set(editor.auth).send({ name: 'Old', parentId: specs }).expect(201);
  const old = sub.body[0].children[0].folderId as string;
  ids.specsFolder = specs;

  ids.srs = (await createDocument(env, editor, projectId, 'Software_Requirements_Specification.md', 'Every upload creates an immutable version.', { folderId: specs })).documentId;
  ids.plan = (await createDocument(env, editor, projectId, 'Test_Plan.md', 'Integration testing of the review workflow and version history.', { folderId: old })).documentId;
  ids.minutes = (await createDocument(env, editor, projectId, 'Meeting_Minutes.txt', 'Discussed the dashboard layout.')).documentId;
  await createDocument(env, outsider, otherProject, 'Specification_secret.md', 'immutable version secrets');
  await env.ctx.jobs.idle(); // text extraction

  await env.http.post(`/api/documents/${ids.plan}/reviews`).set(editor.auth).send({ reviewerId: reviewer.userId }).expect(201);
});
afterAll(() => env.close());

const search = (query: string, user = editor) => env.http.get(`/api/projects/${projectId}/search?${query}`).set(user.auth).expect(200);
const titles = (body: Array<{ document: { title: string } }>) => body.map((r) => r.document.title);

describe('M08 search', () => {
  it('finds titles despite a spelling mistake (Search.Title)', async () => {
    const res = await search('q=specifcation');
    expect(titles(res.body)).toEqual(['Software Requirements Specification']);
    expect(res.body[0].matchedIn).toContain('title');
  });

  it('searches extracted content with stemming and returns a highlighted snippet (Search.Content)', async () => {
    const res = await search('q=uploads');
    expect(titles(res.body)).toEqual(['Software Requirements Specification']);
    expect(res.body[0].matchedIn).toEqual(['content']);
    expect(res.body[0].snippet).toContain('[[upload]]');
  });

  it('ranks a title hit above a content-only hit (Search.Rank)', async () => {
    await createDocument(env, editor, projectId, 'Version_Policy.md', 'Rules.');
    await env.ctx.jobs.idle();
    const res = await search('q=version');
    expect(res.body[0].document.title).toBe('Version Policy');
    expect(res.body[0].score).toBeGreaterThan(res.body[1].score);
  });

  it('never returns documents from projects the user is not in (Search.Scope)', async () => {
    const global = await env.http.get('/api/search?q=immutable').set(editor.auth).expect(200);
    expect(global.body.every((r: { projectName: string }) => r.projectName === 'Test Project')).toBe(true);
    await env.http.get(`/api/projects/${otherProject}/search?q=immutable`).set(editor.auth).expect(404);
  });
});

describe('M08 filters', () => {
  it('filters by status and by the open review\'s reviewer (Filter.Status, Filter.Reviewer)', async () => {
    expect(titles((await search('status=UNDER_REVIEW')).body)).toEqual(['Test Plan']);
    expect(titles((await search(`reviewerId=${reviewer.userId}`)).body)).toEqual(['Test Plan']);
  });

  it('filters to a folder and its descendants (Filter.Folder)', async () => {
    expect(titles((await search(`folderId=${ids.specsFolder}`)).body).sort()).toEqual(['Software Requirements Specification', 'Test Plan']);
  });

  it('filters by last-updated date (Filter.Date)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect((await search(`updatedFrom=${today}`)).body.length).toBeGreaterThanOrEqual(3);
    expect((await search('updatedTo=2000-01-01')).body).toEqual([]);
  });

  it('applies every active filter together with the search term (Filter.Combine)', async () => {
    expect(titles((await search(`q=review&folderId=${ids.specsFolder}&status=UNDER_REVIEW`)).body)).toEqual(['Test Plan']);
    expect((await search(`q=review&status=APPROVED`)).body).toEqual([]);
  });

  it('validates filter values (SE-14)', async () => {
    await env.http.get(`/api/projects/${projectId}/search?status=BOGUS`).set(editor.auth).expect(400);
  });
});
