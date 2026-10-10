import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildFolderTree, wouldCreateCycle } from '../src/modules/folders/tree.js';
import { createDocument, createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

describe('Algorithm B - folder tree', () => {
  const parents = new Map<string, string | null>([
    ['a', null],
    ['b', 'a'],
    ['c', 'b'],
    ['d', null],
  ]);

  it('builds the hierarchy from a flat list', () => {
    const tree = buildFolderTree([
      { folderId: 'c', parentId: 'b', name: 'C', documentCount: 0 },
      { folderId: 'a', parentId: null, name: 'A', documentCount: 0 },
      { folderId: 'b', parentId: 'a', name: 'B', documentCount: 2 },
      { folderId: 'x', parentId: 'missing', name: 'Orphan', documentCount: 0 },
    ]);
    expect(tree.map((n) => n.name)).toEqual(['A', 'Orphan']);
    expect(tree[0].children[0].children[0].folderId).toBe('c');
  });

  it('detects moves into self or a descendant (Folder.Move.Cycle)', () => {
    expect(wouldCreateCycle(parents, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(parents, 'a', 'c')).toBe(true);
    expect(wouldCreateCycle(parents, 'c', 'a')).toBe(false);
    expect(wouldCreateCycle(parents, 'b', 'd')).toBe(false);
    expect(wouldCreateCycle(parents, 'b', null)).toBe(false);
  });

  it('terminates on an already malformed (cyclic) tree', () => {
    const broken = new Map<string, string | null>([
      ['p', 'q'],
      ['q', 'p'],
    ]);
    expect(wouldCreateCycle(broken, 'z', 'p')).toBe(true);
  });
});

let env: TestEnv;
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let projectId: string;

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  editor = await signUp(env, 'Editor');
  viewer = await signUp(env, 'Viewer');
  projectId = await createProject(env, owner, [
    [editor, 'EDITOR'],
    [viewer, 'VIEWER'],
  ]);
});
afterAll(() => env.close());

const findFolder = (nodes: Array<{ name: string; folderId: string; children: unknown[] }>, name: string): { folderId: string } | undefined => {
  for (const n of nodes) {
    if (n.name === name) return n;
    const hit = findFolder(n.children as never, name);
    if (hit) return hit;
  }
  return undefined;
};

describe('M03 folders', () => {
  it('creates nested folders and shows the tree (Folder.Create, Folder.Tree.View)', async () => {
    const root = await env.http.post(`/api/projects/${projectId}/folders`).set(editor.auth).send({ name: 'Reports' }).expect(201);
    const reports = findFolder(root.body, 'Reports')!;
    const nested = await env.http.post(`/api/projects/${projectId}/folders`).set(editor.auth).send({ name: 'Weekly', parentId: reports.folderId }).expect(201);
    expect(findFolder(nested.body, 'Weekly')).toBeTruthy();
    const tree = await env.http.get(`/api/projects/${projectId}/folders`).set(viewer.auth).expect(200);
    expect(tree.body[0].children[0].name).toBe('Weekly');
  });

  it('rejects a sibling name that differs only in case (Folder.Create.Name)', async () => {
    const res = await env.http.post(`/api/projects/${projectId}/folders`).set(editor.auth).send({ name: 'REPORTS' }).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_NAME');
  });

  it('forbids viewers from creating folders (SE-7)', async () => {
    await env.http.post(`/api/projects/${projectId}/folders`).set(viewer.auth).send({ name: 'Nope' }).expect(403);
  });

  it('renames and moves folders but refuses a cycle (Folder.Rename, Folder.Move, Folder.Move.Cycle)', async () => {
    const tree = (await env.http.get(`/api/projects/${projectId}/folders`).set(editor.auth)).body;
    const reports = findFolder(tree, 'Reports')!;
    const weekly = findFolder(tree, 'Weekly')!;

    const cycle = await env.http.post(`/api/folders/${reports.folderId}/move`).set(editor.auth).send({ parentId: weekly.folderId }).expect(409);
    expect(cycle.body.error.code).toBe('FOLDER_CYCLE');

    await env.http.patch(`/api/folders/${weekly.folderId}`).set(editor.auth).send({ name: 'Weekly Notes' }).expect(200);
    const moved = await env.http.post(`/api/folders/${weekly.folderId}/move`).set(editor.auth).send({ parentId: null }).expect(200);
    expect(moved.body.map((n: { name: string }) => n.name)).toEqual(['Reports', 'Weekly Notes']);
  });

  it('requires confirmation to delete a non-empty folder and keeps document history (Folder.Delete, SA-2, SA-3)', async () => {
    const res = await env.http.post(`/api/projects/${projectId}/folders`).set(editor.auth).send({ name: 'Old' }).expect(201);
    const old = findFolder(res.body, 'Old')!;
    const doc = await createDocument(env, editor, projectId, 'note.txt', 'hello', { folderId: old.folderId });

    await env.http.delete(`/api/folders/${old.folderId}`).set(editor.auth).expect(403); // owner only
    const refused = await env.http.delete(`/api/folders/${old.folderId}`).set(owner.auth).expect(409);
    expect(refused.body.error).toMatchObject({ code: 'FOLDER_NOT_EMPTY', details: { documents: 1 } });

    await env.http.delete(`/api/folders/${old.folderId}?confirm=true`).set(owner.auth).expect(200);
    await env.http.get(`/api/documents/${doc.documentId}`).set(owner.auth).expect(404);
    const kept = await env.ctx.db.query('SELECT 1 FROM document_versions WHERE document_id = $1', [doc.documentId]);
    expect(kept.rows.length).toBe(1);
  });
});
