/**
 * What this file does
 *   Tests project and membership behaviour: creating, listing, hiding from outsiders, adding,
 *   re-roling and removing members, the last-owner rule, renaming and archiving.
 *
 * How it works
 *   - beforeAll calls createTestEnv() from helpers.ts, which boots the whole API on an in-memory PGlite
 *     database, and signs up four users (owner, editor, viewer, outsider).
 *   - Each test sends real HTTP requests with supertest and checks the status code and JSON body.
 *   - Some tests also query the database directly, e.g. to read the activity log or to try a raw DELETE.
 *
 * Where it fits
 *   Run by Vitest. Covers projects/routes.ts and projects/service.ts. Module: M02 Project Management
 *   (owner: Vivan).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let outsider: TestUser;

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  viewer = await signUp(env, 'Viewer');
  outsider = await signUp(env, 'Outsider');
});
afterAll(() => env.close());

describe('M02 projects and membership', () => {
  it('creates a project with the creator as owner (Project.Create, .Owner)', async () => {
    const res = await env.http.post('/api/projects').set(owner.auth).send({ name: 'Thesis', description: 'Final year' }).expect(201);
    expect(res.body).toMatchObject({ name: 'Thesis', myRole: 'OWNER', memberCount: 1, archivedAt: null });

    const log = await env.ctx.db.query<{ action: string }>('SELECT action FROM activity_log WHERE project_id = $1', [res.body.projectId]);
    expect(log.rows.map((r) => r.action)).toEqual(['project.created']);
  });

  it('lists only projects the user belongs to (Project.List)', async () => {
    await createProject(env, owner, [], 'Private one');
    const mine = await env.http.get('/api/projects').set(owner.auth).expect(200);
    const theirs = await env.http.get('/api/projects').set(outsider.auth).expect(200);
    expect(mine.body.length).toBeGreaterThanOrEqual(2);
    expect(theirs.body).toEqual([]);
  });

  it('hides a project from non-members with 404 (SE-6)', async () => {
    const projectId = await createProject(env, owner);
    // 404, not 403: an outsider should not even learn that the project exists.
    await env.http.get(`/api/projects/${projectId}`).set(outsider.auth).expect(404);
  });

  it('adds registered users with a role and lists members (Project.Member.Add, .List)', async () => {
    const projectId = await createProject(env, owner, [
      [editor, 'EDITOR'],
      [viewer, 'VIEWER'],
    ]);
    const res = await env.http.get(`/api/projects/${projectId}/members`).set(viewer.auth).expect(200);
    expect(res.body.map((m: { role: string }) => m.role)).toEqual(['OWNER', 'EDITOR', 'VIEWER']);
    expect(res.body[0]).not.toHaveProperty('email'); // Account.Profile.Scope

    const dup = await env.http.post(`/api/projects/${projectId}/members`).set(owner.auth).send({ email: editor.email, role: 'VIEWER' }).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_MEMBER');
    const ghost = await env.http.post(`/api/projects/${projectId}/members`).set(owner.auth).send({ email: 'ghost@x.test', role: 'VIEWER' }).expect(404);
    expect(ghost.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('lets only owners manage members (SE-8)', async () => {
    const projectId = await createProject(env, owner, [[editor, 'EDITOR']]);
    await env.http.post(`/api/projects/${projectId}/members`).set(editor.auth).send({ email: viewer.email, role: 'VIEWER' }).expect(403);
  });

  it('changes roles and removes members, who then lose access (Project.Member.Role.Change, .Remove)', async () => {
    const projectId = await createProject(env, owner, [[editor, 'EDITOR']]);
    const changed = await env.http.patch(`/api/projects/${projectId}/members/${editor.userId}`).set(owner.auth).send({ role: 'REVIEWER' }).expect(200);
    expect(changed.body.find((m: { userId: string }) => m.userId === editor.userId).role).toBe('REVIEWER');

    await env.http.delete(`/api/projects/${projectId}/members/${editor.userId}`).set(owner.auth).expect(200);
    await env.http.get(`/api/projects/${projectId}`).set(editor.auth).expect(404);
  });

  it('never removes or demotes the last owner (Project.Member.LastOwner)', async () => {
    const projectId = await createProject(env, owner, [[editor, 'EDITOR']]);
    const demote = await env.http.patch(`/api/projects/${projectId}/members/${owner.userId}`).set(owner.auth).send({ role: 'EDITOR' }).expect(409);
    expect(demote.body.error.code).toBe('LAST_OWNER');
    await env.http.delete(`/api/projects/${projectId}/members/${owner.userId}`).set(owner.auth).expect(409);

    // With a second owner, the first may step down.
    await env.http.patch(`/api/projects/${projectId}/members/${editor.userId}`).set(owner.auth).send({ role: 'OWNER' }).expect(200);
    await env.http.patch(`/api/projects/${projectId}/members/${owner.userId}`).set(owner.auth).send({ role: 'EDITOR' }).expect(200);
  });

  it('enforces the last-owner rule in the database too (Reliability-5)', async () => {
    const projectId = await createProject(env, owner);
    // Bypasses the API and talks to the database directly; a database rule must still refuse it.
    await expect(env.ctx.db.query(`DELETE FROM project_members WHERE project_id = $1`, [projectId])).rejects.toThrow(/at least one owner/);
  });

  it('renames and archives; an archived project is read-only (Project.Rename, Project.Archive)', async () => {
    const projectId = await createProject(env, owner, [[editor, 'EDITOR']]);
    const renamed = await env.http.patch(`/api/projects/${projectId}`).set(owner.auth).send({ name: 'Renamed' }).expect(200);
    expect(renamed.body.name).toBe('Renamed');
    await env.http.patch(`/api/projects/${projectId}`).set(editor.auth).send({ name: 'Nope' }).expect(403);

    const archived = await env.http.post(`/api/projects/${projectId}/archive`).set(owner.auth).expect(200);
    expect(archived.body.archivedAt).not.toBeNull();
    const blocked = await env.http.patch(`/api/projects/${projectId}`).set(owner.auth).send({ name: 'After' }).expect(409);
    expect(blocked.body.error.code).toBe('PROJECT_ARCHIVED');
    await env.http.get(`/api/projects/${projectId}`).set(editor.auth).expect(200);
  });
});
