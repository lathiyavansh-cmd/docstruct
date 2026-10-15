/**
 * What this file does
 *   Pure helper functions for the folder tree. They take a list or map of folders and never touch
 *   the database, which makes them easy to unit test.
 *
 * How it works
 *   - buildFolderTree() turns a flat list into a nested tree using one Map lookup per folder.
 *   - wouldCreateCycle() walks up from the new parent to see if the moved folder is above it.
 *   - depthOf(), subtreeHeight() and descendantsOf() measure the tree for depth limits and deletes.
 *
 * Where it fits
 *   Used by folders/service.ts and tested directly in test/folders.test.ts. Module: M03 Document &
 *   Folder Management (owner: Shrut).
 */
import { MAX_FOLDER_DEPTH } from '@docstruct/shared';

/** Algorithm B - folder tree construction and cycle prevention. */

export interface FlatFolder {
  folderId: string;
  parentId: string | null;
  name: string;
  documentCount: number;
}

export interface FolderNode extends FlatFolder {
  children: FolderNode[];
}

/**
 * Builds the hierarchy from a flat list in O(n): every folder is attached to its parent through one map
 * lookup. A folder whose parent is missing is treated as a root rather than dropped, so a damaged tree
 * still shows every folder. Siblings are sorted by name.
 */
export function buildFolderTree(folders: FlatFolder[]): FolderNode[] {
  // Pass 1: index every folder by id. Pass 2 (below): attach each one to its parent's children list.
  const index = new Map<string, FolderNode>();
  for (const f of folders) index.set(f.folderId, { ...f, children: [] });

  const roots: FolderNode[] = [];
  for (const node of index.values()) {
    const parent = node.parentId ? index.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const n of nodes) sort(n.children);
  };
  sort(roots);
  return roots;
}

/**
 * Folder.Move.Cycle: reports whether moving `folderId` under `newParentId` would put the folder inside
 * itself or one of its own descendants. Walks upward from the proposed parent - O(depth). The depth limit
 * also stops the walk on a tree that is already malformed instead of looping forever.
 */
export function wouldCreateCycle(
  parentOf: ReadonlyMap<string, string | null>,
  folderId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === folderId) return true;
  let cursor: string | null | undefined = newParentId;
  let depth = 0;
  while (cursor) {
    if (++depth > MAX_FOLDER_DEPTH * 4) return true;
    // If we reach the folder being moved while climbing up, the new parent is inside it: a cycle.
    if (cursor === folderId) return true;
    cursor = parentOf.get(cursor);
  }
  return false;
}

/** Depth of a folder counted from the root (a root folder has depth 1). */
export function depthOf(parentOf: ReadonlyMap<string, string | null>, folderId: string | null): number {
  let depth = 0;
  let cursor = folderId;
  while (cursor && depth <= MAX_FOLDER_DEPTH * 4) {
    depth += 1;
    cursor = parentOf.get(cursor) ?? null;
  }
  return depth;
}

/** Height of the subtree rooted at `folderId` (a leaf has height 1). */
export function subtreeHeight(parentOf: ReadonlyMap<string, string | null>, folderId: string): number {
  // Flip the parent map into a children map, then recursively take 1 + the tallest child.
  const children = new Map<string, string[]>();
  for (const [id, parent] of parentOf) {
    if (parent) children.set(parent, [...(children.get(parent) ?? []), id]);
  }
  const walk = (id: string, guard: number): number =>
    guard > MAX_FOLDER_DEPTH * 4 ? guard : 1 + Math.max(0, ...(children.get(id) ?? []).map((c) => walk(c, guard + 1)));
  return walk(folderId, 0);
}

/** Ids of `folderId` and every folder below it. */
export function descendantsOf(parentOf: ReadonlyMap<string, string | null>, folderId: string): string[] {
  // Breadth-first: the list grows while we loop, so each newly found child is scanned for its own children.
  const result = [folderId];
  for (let i = 0; i < result.length; i++) {
    for (const [id, parent] of parentOf) if (parent === result[i]) result.push(id);
  }
  return result;
}
