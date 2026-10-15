/**
 * What this file does
 *   Shared React hooks for project data and for checking what the current user is allowed to do.
 *
 * How it works
 *   - useProject() loads one project: query key ['project', id], GET /projects/:id.
 *   - useMembers() loads the member list: query key ['members', id], GET /projects/:id/members.
 *   - useCurrentProject() reads the project that ProjectLayout passes to its child pages through the router outlet.
 *   - useCan() returns a function can(permission) built on the shared can() role table.
 *
 * Where it fits
 *   Used by ReviewPanel, DocumentPage, ProjectLayout and the project pages (Dashboard, Workspace, Members, Activity).
 *   Module: app shell / shared UI, M04 (owner: Vansh).
 */
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { READ_ONLY_PERMISSIONS, can, type MemberDto, type Permission, type ProjectDto } from '@docstruct/shared';
import { get } from './api';

export function useProject(projectId: string | undefined) {
  // enabled: the request waits until we actually have a project id from the URL.
  return useQuery({ queryKey: ['project', projectId], queryFn: () => get<ProjectDto>(`/projects/${projectId}`), enabled: !!projectId });
}

/** The project of the surrounding ProjectLayout. */
export function useCurrentProject(): ProjectDto {
  return useOutletContext<ProjectDto>();
}

export function useMembers(projectId: string | undefined) {
  return useQuery({ queryKey: ['members', projectId], queryFn: () => get<MemberDto[]>(`/projects/${projectId}/members`), enabled: !!projectId });
}

/**
 * UI-11: what the current user's role allows in a project, used only to hide controls. The API enforces
 * every permission itself (SE-10); an archived project allows read-only actions only.
 */
export function useCan(project: ProjectDto | undefined) {
  return (permission: Permission) => {
    if (!project) return false;
    if (project.archivedAt && !READ_ONLY_PERMISSIONS.has(permission)) return false;
    // Look up the user's role (OWNER, EDITOR, REVIEWER or VIEWER) in the shared permission table.
    return can(project.myRole, permission);
  };
}
