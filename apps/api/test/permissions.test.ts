/**
 * What this file does
 *   Tests the role-to-permission rules: what OWNER, EDITOR, REVIEWER and VIEWER may and may not do.
 *
 * How it works
 *   - This is a plain unit test. It does not start the API; it calls can() and resolvePermissions() from
 *     the shared package directly.
 *   - It checks separation of duties, that viewers are read-only, that owner-only actions stay with owners,
 *     and which permissions remain in an archived project.
 *
 * Where it fits
 *   Run by vitest. Covers packages/shared/src/permissions.ts, which modules/rbac/middleware.ts relies on.
 *   Module: M06 Role-Based Access Control (owner: Vansh).
 */
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, READ_ONLY_PERMISSIONS, can, resolvePermissions } from '@docstruct/shared';

describe('Algorithm C - role permission resolution', () => {
  it('lets an editor submit for review but not a reviewer (SE-7 style separation)', () => {
    expect(can('EDITOR', 'review.submit')).toBe(true);
    expect(can('REVIEWER', 'review.submit')).toBe(false);
    expect(can('REVIEWER', 'review.decide')).toBe(true);
    expect(can('EDITOR', 'review.decide')).toBe(false);
  });

  it('keeps the viewer strictly read-only (SE-7)', () => {
    for (const p of ['document.create', 'version.create', 'review.submit', 'review.decide', 'document.delete', 'annotation.create'] as const) {
      expect(can('VIEWER', p), p).toBe(false);
    }
    expect(can('VIEWER', 'document.download')).toBe(true);
    expect(can('VIEWER', 'dashboard.read')).toBe(true);
  });

  it('reserves member management, deletion, sharing and archival for owners (SE-8)', () => {
    for (const p of ['member.add', 'member.remove', 'member.role.change', 'document.delete', 'project.archive', 'share.create'] as const) {
      expect(can('OWNER', p), p).toBe(true);
      expect(can('EDITOR', p), p).toBe(false);
      expect(can('REVIEWER', p), p).toBe(false);
    }
  });

  it('gives the owner every permission through inheritance (SRS 2.3: holds every permission)', () => {
    // OWNER inherits from EDITOR and REVIEWER (and through them VIEWER), so it should end up with all permissions.
    const owner = resolvePermissions('OWNER');
    for (const p of PERMISSIONS) expect(owner.has(p), p).toBe(true);
  });

  it('denies a user with no membership', () => {
    expect(can(null, 'project.read')).toBe(false);
  });

  it('treats only viewer permissions as available in an archived project', () => {
    expect(READ_ONLY_PERMISSIONS.has('document.read')).toBe(true);
    expect(READ_ONLY_PERMISSIONS.has('version.create')).toBe(false);
  });
});
