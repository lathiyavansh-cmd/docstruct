import type { ProjectRole } from './enums.js';

/**
 * Algorithm C - role-based permission resolution (SE-5 .. SE-9).
 *
 * Each role lists only the permissions it adds; a role inherits every permission of the roles it extends.
 * The API enforces these on every request (SE-10). The web client imports the same table only to hide
 * controls a role cannot use (UI-11) - hiding is never the enforcement.
 */
export const PERMISSIONS = [
  // read access - every member
  'project.read',
  'member.list',
  'document.read',
  'document.download',
  'document.search',
  'diff.read',
  'activity.read',
  'dashboard.read',
  'annotation.read',
  // reviewing
  'review.decide',
  'annotation.create',
  'annotation.reply',
  'annotation.resolve',
  // contributing
  'folder.create',
  'folder.update',
  'document.create',
  'document.update',
  'document.move',
  'version.create',
  'version.restore',
  'review.submit',
  // ownership
  'project.update',
  'project.archive',
  'member.add',
  'member.remove',
  'member.role.change',
  'folder.delete',
  'document.delete',
  'document.archive',
  'share.create',
  'share.revoke',
  'share.list',
  'review.cancel.any',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const OWN: Record<ProjectRole, Permission[]> = {
  VIEWER: [
    'project.read',
    'member.list',
    'document.read',
    'document.download',
    'document.search',
    'diff.read',
    'activity.read',
    'dashboard.read',
    'annotation.read',
  ],
  REVIEWER: ['review.decide', 'annotation.create', 'annotation.reply', 'annotation.resolve'],
  EDITOR: [
    'folder.create',
    'folder.update',
    'document.create',
    'document.update',
    'document.move',
    'version.create',
    'version.restore',
    'review.submit',
    'annotation.create',
    'annotation.reply',
    'annotation.resolve',
  ],
  OWNER: [
    'project.update',
    'project.archive',
    'member.add',
    'member.remove',
    'member.role.change',
    'folder.delete',
    'document.delete',
    'document.archive',
    'share.create',
    'share.revoke',
    'share.list',
    'review.cancel.any',
  ],
};

const PARENTS: Record<ProjectRole, ProjectRole[]> = {
  VIEWER: [],
  REVIEWER: ['VIEWER'],
  EDITOR: ['VIEWER'],
  OWNER: ['EDITOR', 'REVIEWER'],
};

const cache = new Map<ProjectRole, ReadonlySet<Permission>>();

/** Expands a role into its full permission set by walking the inheritance graph (cached per role). */
export function resolvePermissions(role: ProjectRole): ReadonlySet<Permission> {
  const hit = cache.get(role);
  if (hit) return hit;
  const collected = new Set<Permission>(OWN[role]);
  for (const parent of PARENTS[role]) for (const p of resolvePermissions(parent)) collected.add(p);
  cache.set(role, collected);
  return collected;
}

export function can(role: ProjectRole | null | undefined, permission: Permission): boolean {
  return role ? resolvePermissions(role).has(permission) : false;
}

/** Permissions that stay available after a project is archived (Project.Archive, SA-7: read-only). */
export const READ_ONLY_PERMISSIONS: ReadonlySet<Permission> = new Set(OWN.VIEWER);

/** Roles that may be designated as a document's reviewer (they hold review.decide). */
export const REVIEWER_ROLES: ProjectRole[] = ['OWNER', 'REVIEWER'];

/** UD-2: contextual help shown where a role is assigned. */
export const ROLE_DESCRIPTION: Record<ProjectRole, string> = {
  OWNER: 'Full control: manages members and roles, deletes documents and folders, creates share links and archives the project. Can also upload and review.',
  EDITOR: 'Contributor: creates folders, uploads documents and new versions, restores versions and submits documents for review.',
  REVIEWER: 'Examines submitted versions with the change summary, adds annotations, and approves or requests changes. Cannot upload.',
  VIEWER: 'Read-only: browses folders, opens, searches and downloads documents and views the dashboard.',
};
