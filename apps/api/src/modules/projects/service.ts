import type { MemberDto, ProjectDto, ProjectRole } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { recordActivity } from '../../lib/activity.js';
import { HttpError, conflict, notFound } from '../../lib/errors.js';
import { assertNotPendingReviewer } from '../reviews/service.js';

interface ProjectRow {
  project_id: string;
  name: string;
  description: string;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
  my_role: ProjectRole;
  member_count: number;
}

const PROJECT_COLUMNS = `
  p.project_id, p.name, p.description, p.created_at, p.updated_at, p.archived_at, m.role AS my_role,
  (SELECT count(*)::int FROM project_members x WHERE x.project_id = p.project_id) AS member_count`;

function toProjectDto(row: ProjectRow): ProjectDto {
  return {
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString() ?? null,
    myRole: row.my_role,
    memberCount: row.member_count,
  };
}

const LAST_OWNER = 'A project must retain at least one owner. Make another member an owner first.';

/** M02 - Project and Membership Management (SRS 3.2). */
export class ProjectService {
  constructor(private readonly ctx: AppContext) {}

  /** Project.List: only projects the user is a member of. */
  async list(userId: string): Promise<ProjectDto[]> {
    const { rows } = await this.ctx.db.query<ProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
         FROM projects p JOIN project_members m ON m.project_id = p.project_id AND m.user_id = $1
        ORDER BY p.archived_at IS NOT NULL, p.updated_at DESC`,
      [userId],
    );
    return rows.map(toProjectDto);
  }

  async get(projectId: string, userId: string): Promise<ProjectDto> {
    const { rows } = await this.ctx.db.query<ProjectRow>(
      `SELECT ${PROJECT_COLUMNS}
         FROM projects p JOIN project_members m ON m.project_id = p.project_id AND m.user_id = $2
        WHERE p.project_id = $1`,
      [projectId, userId],
    );
    if (!rows[0]) throw notFound('Project');
    return toProjectDto(rows[0]);
  }

  /** Project.Create, Project.Create.Owner */
  async create(userId: string, name: string, description: string): Promise<ProjectDto> {
    const projectId = await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ project_id: string }>(
        'INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING project_id',
        [name, description, userId],
      );
      const id = rows[0].project_id;
      await q.query(`INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ($1, $2, 'OWNER', $2)`, [id, userId]);
      await recordActivity(q, { projectId: id, actorId: userId, action: 'project.created', entityType: 'project', entityId: id, entityLabel: name });
      return id;
    });
    return this.get(projectId, userId);
  }

  /** Project.Rename */
  async update(projectId: string, userId: string, changes: { name?: string; description?: string }): Promise<ProjectDto> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ name: string }>(
        `UPDATE projects SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now()
          WHERE project_id = $1 RETURNING name`,
        [projectId, changes.name ?? null, changes.description ?? null],
      );
      await recordActivity(q, {
        projectId,
        actorId: userId,
        action: 'project.updated',
        entityType: 'project',
        entityId: projectId,
        entityLabel: rows[0].name,
        detail: changes,
      });
    });
    return this.get(projectId, userId);
  }

  /** Project.Archive: the project and its documents become read-only for every member. */
  async archive(projectId: string, userId: string): Promise<ProjectDto> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ name: string }>(
        'UPDATE projects SET archived_at = now(), updated_at = now() WHERE project_id = $1 AND archived_at IS NULL RETURNING name',
        [projectId],
      );
      if (!rows[0]) throw conflict('This project is already archived', 'PROJECT_ARCHIVED');
      await recordActivity(q, { projectId, actorId: userId, action: 'project.archived', entityType: 'project', entityId: projectId, entityLabel: rows[0].name });
    });
    return this.get(projectId, userId);
  }

  /** Project.Member.List: display names and roles only (Account.Profile.Scope). */
  async members(projectId: string, viewerId: string): Promise<MemberDto[]> {
    const { rows } = await this.ctx.db.query<{ user_id: string; display_name: string; role: ProjectRole; created_at: Date }>(
      `SELECT m.user_id, p.display_name, m.role, m.created_at
         FROM project_members m JOIN profiles p ON p.user_id = m.user_id
        WHERE m.project_id = $1
        ORDER BY array_position(ARRAY['OWNER','EDITOR','REVIEWER','VIEWER'], m.role), p.display_name`,
      [projectId],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      role: r.role,
      addedAt: r.created_at.toISOString(),
      isYou: r.user_id === viewerId,
    }));
  }

  /** Project.Member.Add: an existing registered user, with one of the four roles. */
  async addMember(projectId: string, actorId: string, email: string, role: ProjectRole): Promise<MemberDto[]> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ user_id: string; display_name: string }>(
        'SELECT user_id, display_name FROM profiles WHERE lower(email) = lower($1)',
        [email],
      );
      const user = rows[0];
      if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'No registered user has that email address. Ask them to sign up first.');
      const existing = await q.query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, user.user_id]);
      if (existing.rows.length) throw conflict(`${user.display_name} is already a member of this project`, 'ALREADY_MEMBER');
      await q.query('INSERT INTO project_members (project_id, user_id, role, added_by) VALUES ($1, $2, $3, $4)', [
        projectId,
        user.user_id,
        role,
        actorId,
      ]);
      await recordActivity(q, {
        projectId,
        actorId,
        action: 'member.added',
        entityType: 'member',
        entityId: user.user_id,
        entityLabel: user.display_name,
        detail: { role },
      });
    });
    return this.members(projectId, actorId);
  }

  /** Serialises membership changes per project so two owners cannot demote each other at once. */
  private async lockProject(q: Queryable, projectId: string) {
    await q.query('SELECT 1 FROM projects WHERE project_id = $1 FOR UPDATE', [projectId]);
  }

  private async memberRow(q: Queryable, projectId: string, userId: string) {
    const { rows } = await q.query<{ role: ProjectRole; display_name: string }>(
      `SELECT m.role, p.display_name FROM project_members m JOIN profiles p ON p.user_id = m.user_id
        WHERE m.project_id = $1 AND m.user_id = $2`,
      [projectId, userId],
    );
    if (!rows[0]) throw notFound('Member');
    return rows[0];
  }

  private async ownerCount(q: Queryable, projectId: string): Promise<number> {
    const { rows } = await q.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM project_members WHERE project_id = $1 AND role = 'OWNER'`,
      [projectId],
    );
    return rows[0].n;
  }

  /** Project.Member.Role.Change with Project.Member.LastOwner. */
  async changeRole(projectId: string, actorId: string, userId: string, role: ProjectRole): Promise<MemberDto[]> {
    await this.ctx.db.tx(async (q) => {
      await this.lockProject(q, projectId);
      const member = await this.memberRow(q, projectId, userId);
      if (member.role === role) return;
      if (member.role === 'OWNER' && (await this.ownerCount(q, projectId)) === 1) throw conflict(LAST_OWNER, 'LAST_OWNER');
      await assertNotPendingReviewer(q, projectId, userId, role);
      await q.query('UPDATE project_members SET role = $3 WHERE project_id = $1 AND user_id = $2', [projectId, userId, role]);
      await recordActivity(q, {
        projectId,
        actorId,
        action: 'member.role_changed',
        entityType: 'member',
        entityId: userId,
        entityLabel: member.display_name,
        detail: { from: member.role, to: role },
      });
    });
    return this.members(projectId, actorId);
  }

  /** Project.Member.Remove with Project.Member.LastOwner. */
  async removeMember(projectId: string, actorId: string, userId: string): Promise<MemberDto[]> {
    await this.ctx.db.tx(async (q) => {
      await this.lockProject(q, projectId);
      const member = await this.memberRow(q, projectId, userId);
      if (member.role === 'OWNER' && (await this.ownerCount(q, projectId)) === 1) throw conflict(LAST_OWNER, 'LAST_OWNER');
      await assertNotPendingReviewer(q, projectId, userId, null);
      await q.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
      await recordActivity(q, {
        projectId,
        actorId,
        action: 'member.removed',
        entityType: 'member',
        entityId: userId,
        entityLabel: member.display_name,
        detail: { role: member.role },
      });
    });
    return this.members(projectId, actorId);
  }
}
