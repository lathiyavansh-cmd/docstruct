/**
 * What this file does
 *   The quick "jump to" box that opens with Ctrl+K. The user types to filter pages and projects,
 *   or picks "Search documents for ..." to run a full-text search.
 *
 * How it works
 *   - Props: open, onClose and the projects list (AppLayout passes the list it already loaded; nothing is fetched here).
 *   - "commands" is a fixed list of pages plus one entry per project. "items" filters it by the typed text.
 *   - When text is typed, a search entry is added at the top that goes to /search?q=<text>.
 *   - "index" is the highlighted row. Arrow keys move it, Enter runs it, Escape closes the palette.
 *   - Running a command closes the palette and navigates to its route with React Router.
 *
 * Where it fits
 *   Used only by AppLayout. Module: app shell (owner: Vansh).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { ProjectDto } from '@docstruct/shared';
import { AnimateIcon, ArrowRightIcon, ClipboardCheckIcon, KanbanIcon, LayersIcon, MessageCircleQuestionIcon, SearchIcon, UserIcon, SendIcon } from './icons';
import { cx, type AnimatedIcon } from './ui';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: AnimatedIcon;
  to: string;
}

/**
 * Ctrl+K / Cmd+K palette: jump to any page or project, or search document text. Arrow keys move, Enter
 * opens, Escape closes. The selected row's icon plays its animation.
 */
export function CommandPalette({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: ProjectDto[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    // Each time the palette opens, start empty and put the cursor in the input (after the first paint).
    setQuery('');
    setIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const commands = useMemo<Command[]>(
    () => [
      { id: 'projects', group: 'Go to', label: 'Projects', icon: KanbanIcon, to: '/' },
      { id: 'reviews', group: 'Go to', label: 'Review queue', icon: ClipboardCheckIcon, to: '/reviews' },
      { id: 'shared', group: 'Go to', label: 'Shared with me', icon: SendIcon, to: '/shared' },
      { id: 'help', group: 'Go to', label: 'Help', icon: MessageCircleQuestionIcon, to: '/help' },
      { id: 'profile', group: 'Go to', label: 'Profile', icon: UserIcon, to: '/profile' },
      ...projects.map((p) => ({
        id: p.projectId,
        group: 'Projects',
        label: p.name,
        hint: p.archivedAt ? 'Archived' : undefined,
        icon: LayersIcon,
        to: `/p/${p.projectId}`,
      })),
    ],
    [projects],
  );

  const q = query.trim();
  const items = useMemo<Command[]>(() => {
    // Case-insensitive "contains" match on the label. encodeURIComponent keeps the search text safe inside the URL.
    const needle = q.toLowerCase();
    const matches = commands.filter((c) => !needle || c.label.toLowerCase().includes(needle));
    return q
      ? [{ id: 'search', group: 'Search', label: `Search documents for “${q}”`, icon: SearchIcon, to: `/search?q=${encodeURIComponent(q)}` }, ...matches]
      : matches;
  }, [commands, q]);

  // New text means a new list, so the highlight goes back to the first row.
  useEffect(() => setIndex(0), [q]);
  // Keep the highlighted row visible when arrow keys move past the bottom of the list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    navigate(c.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Jump to"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-surface shadow-[0_32px_80px_-16px_rgb(21_23_43/0.45)] ring-1 ring-rule"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2.5 border-b border-rule px-4">
              <SearchIcon size={18} animate={q.length > 0} className="shrink-0 text-primary" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to a page or project, or search documents…"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-list"
                aria-activedescendant={items[index] ? `cmd-${items[index].id}` : undefined}
                className="h-13 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-ink-faint focus:outline-none"
              />
              <kbd className="rounded border border-rule bg-paper px-1.5 py-0.5 text-[11px] text-ink-faint">Esc</kbd>
            </div>
            <ul ref={listRef} id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
              {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-faint">Nothing matches “{q}”.</li>}
              {items.map((c, i) => {
                const selected = i === index;
                const Icon = c.icon;
                // A group heading ("Go to", "Projects", "Search") is shown above the first row of each group.
                return (
                  <li key={c.id} role="presentation">
                    {(i === 0 || items[i - 1].group !== c.group) && (
                      <p className="px-3 pb-1 pt-2.5 text-[11.5px] font-medium uppercase tracking-wider text-ink-faint">{c.group}</p>
                    )}
                    <AnimateIcon animate={selected} asChild>
                      <button
                        type="button"
                        id={`cmd-${c.id}`}
                        role="option"
                        aria-selected={selected}
                        data-index={i}
                        onMouseMove={() => setIndex(i)}
                        onClick={() => run(c)}
                        className={cx('relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm', selected ? 'text-ink' : 'text-ink-soft')}
                      >
                        {selected && (
                          <motion.span
                            layoutId="command-highlight"
                            className="absolute inset-0 rounded-lg bg-primary-wash"
                            transition={{ type: 'spring', stiffness: 600, damping: 40 }}
                          />
                        )}
                        <Icon size={16} className={cx('relative shrink-0', selected && 'text-primary')} />
                        <span className="relative flex-1 truncate">{c.label}</span>
                        {c.hint && <span className="relative text-xs text-ink-faint">{c.hint}</span>}
                        {selected && <ArrowRightIcon size={14} animate loop className="relative text-primary" />}
                      </button>
                    </AnimateIcon>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-4 border-t border-rule bg-paper/70 px-4 py-2 text-[11.5px] text-ink-faint">
              <span>
                <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move
              </span>
              <span>
                <kbd className="font-sans">Enter</kbd> to open
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
