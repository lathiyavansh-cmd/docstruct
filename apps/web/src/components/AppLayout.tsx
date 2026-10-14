import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Menu } from 'lucide-react';
import type { ProjectDto, ReviewDto } from '@docstruct/shared';
import { get } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './animate-ui/components/animate/tooltip';
import { CommandPalette } from './CommandPalette';
import { ClipboardCheckIcon, KanbanIcon, LayersIcon, LogOutIcon, MessageCircleQuestionIcon, SearchIcon, UserIcon, XIcon } from './icons';
import { NumberTicker } from './magicui/number-ticker';
import { Avatar, IconButton, cx, type AnimatedIcon } from './ui';
import { Sidebar001, Sidebar001Content, Sidebar001Footer, Sidebar001Header, Sidebar001Item, Sidebar001Section } from './unlumen-ui/sidebar-001';

function Logo() {
  return (
    <Link to="/" className="group flex items-center gap-2 font-semibold tracking-tight text-ink">
      <motion.img src="/favicon.svg" alt="" className="size-7" whileHover={{ rotate: -8, scale: 1.08 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }} />
      <span>
        Doc<span className="text-primary">Struct</span>
      </span>
    </Link>
  );
}

function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group mt-4 flex h-9 w-full items-center gap-2 rounded-lg border border-rule bg-surface px-2.5 text-sm text-ink-faint shadow-[0_1px_2px_rgb(21_23_43/0.04)] transition-colors hover:border-primary/40 hover:text-ink-soft"
    >
      <SearchIcon size={15} animateOnHover className="shrink-0 transition-colors group-hover:text-primary" />
      <span className="flex-1 truncate text-left">Search or jump to…</span>
      <kbd className="rounded border border-rule bg-paper px-1.5 text-[10.5px] font-medium text-ink-faint max-sm:hidden">Ctrl K</kbd>
    </button>
  );
}

function FooterButton({ icon, label, onClick, to }: { icon: AnimatedIcon; label: string; onClick?: () => void; to?: string }) {
  const navigate = useNavigate();
  return (
    <Tooltip side="top">
      <TooltipTrigger asChild>
        <IconButton icon={icon} label={label} onClick={onClick ?? (() => to && navigate(to))} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => get<ProjectDto[]>('/projects') });
  const queue = useQuery({ queryKey: ['review-queue'], queryFn: () => get<ReviewDto[]>('/reviews/queue') });

  // Ctrl+K / Cmd+K opens the palette from anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  const queueCount = queue.data?.length ?? 0;
  const at = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const logOut = () => signOut().then(() => navigate('/login'));

  const sidebar = (width: number) => (
    <Sidebar001 className="bg-paper" defaultWidth={width} minWidth={216} maxWidth={340}>
      <Sidebar001Header className="px-4 pt-5">
        <Logo />
        <SearchTrigger onOpen={() => setPalette(true)} />
      </Sidebar001Header>
      <Sidebar001Content className="px-2">
        <nav aria-label="Main">
          <Sidebar001Section>
            <Sidebar001Item to="/" id="nav-projects" label="Projects" icon={KanbanIcon} isActive={pathname === '/'} />
            <Sidebar001Item
              to="/reviews"
              label="Review queue"
              icon={ClipboardCheckIcon}
              isActive={at('/reviews')}
              badge={
                queueCount > 0 && (
                  <span className="inline-flex min-w-5 justify-center rounded-full bg-st-review-wash px-1.5 text-xs font-semibold text-st-review">
                    <NumberTicker value={queueCount} className="tracking-normal text-st-review" />
                  </span>
                )
              }
            />
            <Sidebar001Item to="/search" label="Search" icon={SearchIcon} isActive={at('/search')} />
          </Sidebar001Section>
          <Sidebar001Section label="Your projects">
            {projects.data?.map((p) => (
              <Sidebar001Item
                key={p.projectId}
                to={`/p/${p.projectId}`}
                label={<span className={cx(p.archivedAt && 'italic')}>{p.name}</span>}
                icon={LayersIcon}
                isActive={at(`/p/${p.projectId}`)}
              />
            ))}
            {projects.isLoading && <div className="skeleton ml-6 mr-3 h-6" />}
            {projects.data?.length === 0 && <p className="pl-6 text-[13px] text-ink-faint">None yet</p>}
          </Sidebar001Section>
        </nav>
      </Sidebar001Content>
      <Sidebar001Footer className="border-rule">
        {user && (
          <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-2">
            <Avatar name={user.displayName} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-ink-faint">{user.email}</p>
            </div>
          </div>
        )}
        <TooltipProvider openDelay={150}>
          <div className="mt-1 flex items-center justify-between rounded-xl bg-surface p-1 ring-1 ring-rule">
            <FooterButton icon={MessageCircleQuestionIcon} label="Help" to="/help" />
            <FooterButton icon={UserIcon} label="Profile" to="/profile" />
            <FooterButton icon={LogOutIcon} label="Log out" onClick={logOut} />
          </div>
        </TooltipProvider>
      </Sidebar001Footer>
    </Sidebar001>
  );

  // Keep the project frame mounted while switching its tabs, so the tab indicator can slide.
  const pageKey = pathname.startsWith('/p/') ? pathname.split('/').slice(0, 3).join('/') : pathname;

  return (
    <div className="min-h-screen lg:flex">
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">{sidebar(256)}</div>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-rule bg-paper/85 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <IconButton icon={SearchIcon} label="Search or jump to" onClick={() => setPalette(true)} />
          <button type="button" onClick={() => setDrawer(true)} className="rounded-lg p-1.5 hover:bg-primary-wash" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
        </div>
      </header>
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setDrawer(false)} />
            <motion.div
              className="absolute inset-y-0 left-0 shadow-xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <IconButton icon={XIcon} label="Close menu" onClick={() => setDrawer(false)} className="absolute right-3 top-4 z-30" />
              {sidebar(288)}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <main className="min-w-0 flex-1 bg-surface lg:min-h-screen">
        <motion.div key={pageKey} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
          <Outlet />
        </motion.div>
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} projects={projects.data ?? []} />
    </div>
  );
}
