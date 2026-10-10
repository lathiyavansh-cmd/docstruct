import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { READ_ONLY_PERMISSIONS, can, type MemberDto, type Permission, type ProjectDto } from '@docstruct/shared';
import { get } from './api';

export function useProject(projectId: string | undefined) {
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
    return can(project.myRole, permission);
  };
}
