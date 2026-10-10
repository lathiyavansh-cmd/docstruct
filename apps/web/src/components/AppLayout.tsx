import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleHelp, FolderKanban, Inbox, LogOut, Menu, Search, UserRound, X } from 'lucide-react';
import type { ProjectDto, ReviewDto } from '@docstruct/shared';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Avatar, cx } from './ui';

function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight text-ink">
      <img src="/favicon.svg" alt="" className="size-6" />
      DocStruct
    </span>
  );
}

const navItem = ({ isActive }: { isActive: boolean }) =>
  cx('flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm', isActive ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink/5 hover:text-ink');

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => get<ProjectDto[]>('/projects') });
  const queue = useQuery({ queryKey: ['review-queue'], queryFn: () => get<ReviewDto[]>('/reviews/queue') });

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 px-3 py-4" aria-label="Main">
      <div className="px-2.5">
        <Logo />
      </div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
          setOpen(false);
        }}
        className="relative px-0.5"
      >
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-faint" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all projects"
          aria-label="Search all projects"
          className="h-9 w-full rounded-md border border-rule bg-surface pl-8 pr-2 text-sm placeholder:text-ink-faint focus:border-primary focus:outline-none"
        />
      </form>
      <div className="space-y-0.5">
        <NavLink to="/" end className={navItem} onClick={() => setOpen(false)}>
          <FolderKanban className="size-4" /> Projects
        </NavLink>
        <NavLink to="/reviews" className={navItem} onClick={() => setOpen(false)}>
          <Inbox className="size-4" /> Review queue
          {!!queue.data?.length && <span className="ml-auto rounded bg-st-review-wash px-1.5 text-xs font-semibold text-st-review tabular">{queue.data.length}</span>}
        </NavLink>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="px-2.5 pb-1.5 text-[13px] font-medium text-ink-faint">Your projects</p>
        <div className="space-y-0.5">
          {projects.data?.map((p) => (
            <NavLink key={p.projectId} to={`/p/${p.projectId}`} className={navItem} onClick={() => setOpen(false)}>
              <span className={cx('truncate', p.archivedAt && 'italic')}>{p.name}</span>
            </NavLink>
          ))}
          {projects.data?.length === 0 && <p className="px-2.5 text-[13px] text-ink-faint">None yet</p>}
        </div>
      </div>
      <div className="space-y-0.5 border-t border-rule pt-3">
        <NavLink to="/help" className={navItem} onClick={() => setOpen(false)}>
          <CircleHelp className="size-4" /> Help
        </NavLink>
        <NavLink to="/profile" className={navItem} onClick={() => setOpen(false)}>
          <UserRound className="size-4" /> Profile
        </NavLink>
        <button type="button" onClick={() => signOut().then(() => navigate('/login'))} className={navItem({ isActive: false }) + ' w-full'}>
          <LogOut className="size-4" /> Log out
        </button>
        {user && (
          <div className="flex items-center gap-2 px-2.5 pt-2 text-sm">
            <Avatar name={user.displayName} size="sm" />
            <span className="truncate text-ink-soft">{user.displayName}</span>
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-rule bg-paper lg:block">{sidebar}</aside>
      <header className="flex items-center justify-between border-b border-rule bg-paper px-4 py-2.5 lg:hidden">
        <Logo />
        <button type="button" onClick={() => setOpen(true)} className="rounded p-1.5 hover:bg-ink/5" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-paper shadow-xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded p-1 hover:bg-ink/5" aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <main className="min-w-0 bg-surface lg:min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
