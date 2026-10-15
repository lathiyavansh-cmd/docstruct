/**
 * What this file does
 *   This is the frame around every page inside one project. It shows the project name, the user's role in it, and the tabs Overview, Documents, Members and Activity.
 *
 * How it works
 *   - Reads projectId from the URL and loads the project with useProject (query key ['project', id], GET /projects/:id).
 *   - Works out which tab is active from the current URL, and slides a small underline to it.
 *   - Shows a notice when the project is archived (read-only).
 *   - Renders the chosen tab page through <Outlet context={p} />, so child pages get the project with useCurrentProject() without loading it again.
 *
 * Where it fits
 *   Route /p/:projectId in App.tsx. Its child routes are DashboardPage (index), WorkspacePage (documents), MembersPage (members) and ActivityPage (activity). Module: M02 Project Management (owner: Vivan).
 */
import { Link, Outlet, useLocation, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ROLE_LABEL } from '@docstruct/shared';
import { ActivityIcon, AnimateIcon, LayersIcon, LayoutDashboardIcon, UsersIcon } from '../../components/icons';
import { ErrorNote, Notice, Spinner, cx, type AnimatedIcon } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useProject } from '../../lib/hooks';

// Each tab is [path after /p/:projectId, label, icon]. The empty path '' is the Overview (dashboard).
const TABS: ReadonlyArray<readonly [string, string, AnimatedIcon]> = [
  ['', 'Overview', LayoutDashboardIcon],
  ['documents', 'Documents', LayersIcon],
  ['members', 'Members', UsersIcon],
  ['activity', 'Activity', ActivityIcon],
];

/** Project workspace frame: name, the caller's role (UI-11) and the project's sections. */
export function ProjectLayout() {
  const { projectId } = useParams();
  const { pathname } = useLocation();
  // Load this project, including myRole (the logged-in user's role in it).
  const project = useProject(projectId);

  if (project.isLoading) return <div className="px-5 lg:px-8"><Spinner /></div>;
  if (project.error || !project.data) return <div className="p-8"><ErrorNote>{errorMessage(project.error)}</ErrorNote></div>;
  const p = project.data;
  const base = `/p/${p.projectId}`;
  // The first URL part after /p/:projectId, for example 'members'. Empty means the Overview tab.
  const current = pathname.slice(base.length + 1).split('/')[0] ?? '';

  return (
    <div>
      <div className="relative overflow-hidden border-b border-rule bg-gradient-to-b from-primary-wash/60 to-surface px-5 pt-7 lg:px-8">
        <div className="bg-dots pointer-events-none absolute inset-y-0 right-0 w-2/5 [mask-image:linear-gradient(to_left,black,transparent)]" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs text-ink-soft ring-1 ring-rule">
            You are {p.myRole === 'OWNER' ? 'an' : 'a'} <strong className="font-medium text-ink">{ROLE_LABEL[p.myRole].toLowerCase()}</strong>
          </span>
        </div>
        {p.description && <p className="relative mt-1 max-w-3xl text-sm text-ink-soft">{p.description}</p>}
        <nav className="relative -mb-px mt-5 flex gap-1 overflow-x-auto no-scrollbar" aria-label="Project sections">
          {TABS.map(([path, label, Icon]) => {
            const active = current === path;
            return (
              <AnimateIcon key={path} animateOnHover asChild>
                <Link
                  to={path ? `${base}/${path}` : base}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'group relative flex items-center gap-2 whitespace-nowrap px-3 pb-3 pt-1.5 text-sm transition-colors',
                    active ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  <span className="absolute inset-x-0.5 bottom-1.5 top-0 rounded-lg transition-colors group-hover:bg-primary-wash/80" aria-hidden />
                  <Icon size={15} className={cx('relative', active && 'text-primary')} />
                  <span className="relative">{label}</span>
                  {active && (
                    <motion.span
                      layoutId="project-tab-indicator"
                      className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-gradient-to-r from-primary to-violet"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                </Link>
              </AnimateIcon>
            );
          })}
        </nav>
      </div>
      {p.archivedAt && (
        <div className="px-5 pt-4 lg:px-8">
          <Notice>This project is archived. Its documents can be opened, searched and downloaded, but nothing can be changed.</Notice>
        </div>
      )}
      {/* The child page for the active tab is drawn here and receives the project as outlet context. */}
      <motion.div key={current} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Outlet context={p} />
      </motion.div>
    </div>
  );
}
