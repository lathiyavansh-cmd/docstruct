import { NavLink, Outlet, useParams } from 'react-router-dom';
import { ROLE_LABEL } from '@docstruct/shared';
import { ErrorNote, Notice, Spinner, cx } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useProject } from '../../lib/hooks';

const TABS = [
  ['', 'Overview'],
  ['documents', 'Documents'],
  ['members', 'Members'],
  ['activity', 'Activity'],
] as const;

/** Project workspace frame: name, the caller's role (UI-11) and the project's sections. */
export function ProjectLayout() {
  const { projectId } = useParams();
  const project = useProject(projectId);

  if (project.isLoading) return <Spinner />;
  if (project.error || !project.data) return <div className="p-8"><ErrorNote>{errorMessage(project.error)}</ErrorNote></div>;
  const p = project.data;

  return (
    <div>
      <div className="border-b border-rule px-5 pt-6 lg:px-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <span className="text-sm text-ink-soft">
            You are {p.myRole === 'OWNER' ? 'an' : 'a'} <strong className="font-medium text-ink">{ROLE_LABEL[p.myRole].toLowerCase()}</strong>
          </span>
        </div>
        {p.description && <p className="mt-1 max-w-3xl text-sm text-ink-soft">{p.description}</p>}
        <nav className="-mb-px mt-4 flex gap-5 overflow-x-auto" aria-label="Project sections">
          {TABS.map(([path, label]) => (
            <NavLink
              key={path}
              to={path ? `/p/${p.projectId}/${path}` : `/p/${p.projectId}`}
              end={!path}
              className={({ isActive }) =>
                cx('whitespace-nowrap border-b-2 pb-2.5 text-sm', isActive ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-soft hover:text-ink')
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      {p.archivedAt && (
        <div className="px-5 pt-4 lg:px-8">
          <Notice>This project is archived. Its documents can be opened, searched and downloaded, but nothing can be changed.</Notice>
        </div>
      )}
      <Outlet context={p} />
    </div>
  );
}
