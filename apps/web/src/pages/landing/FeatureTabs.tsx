/**
 * What this file does
 *   The "What DocStruct does" section of the landing page: six tabs, each with a short explanation and a
 *   small working demo of the feature (versions, compare, pre-review, review, summary, protect and share).
 *
 * How it works
 *   - FEATURES lists the tabs; the active one is kept in state and the sliding highlight is AnimatedBackground.
 *   - Each demo is a small component with its own local state (for example the review buttons change the
 *     status badge, and the password box unlocks with the sample password). Nothing calls the API.
 *   - The panel cross-fades between tabs; arrow keys move between tabs as well.
 *
 * Where it fits
 *   Rendered by pages/landing/LandingPage.tsx. Reuses DiffLine and SEVERITY from VersionStack.tsx and the
 *   shared UI pieces from components/ui.tsx. Module: app shell / landing page (owner: Vansh).
 */
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpenText, Check, Columns2, GitBranch, History, KeyRound, ListChecks, Lock, MousePointerClick, Rows3, ScanSearch, Send, Unlock } from 'lucide-react';
import type { DocumentStatus } from '@docstruct/shared';
import { AnimatedBackground } from '../../components/motion-primitives/animated-background';
import { Avatar, StatusBadge, cx } from '../../components/ui';
import { DiffLine, SEVERITY, VERSIONS } from './VersionStack';

/* ── Demos ─────────────────────────────────────────────────────────────────────── */

function VersionsDemo() {
  const [open, setOpen] = useState(4);
  return (
    <div>
      {/* The thin line behind the version dots runs from v4 down to v1. */}
      <ol className="relative space-y-2 before:absolute before:bottom-6 before:left-[21px] before:top-6 before:w-px before:bg-rule">
        {[...VERSIONS].reverse().map((v) => (
          <li key={v.no}>
            <button
              type="button"
              onClick={() => setOpen(v.no)}
              className={cx(
                'relative flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors',
                open === v.no ? 'bg-primary-wash/70 ring-1 ring-primary/15' : 'hover:bg-paper',
              )}
            >
              <span
                className={cx(
                  'relative z-10 flex size-[26px] shrink-0 items-center justify-center rounded-full font-serif text-xs ring-4 ring-surface',
                  open === v.no ? 'bg-gradient-to-br from-primary to-violet text-white' : 'bg-paper text-ink-soft',
                )}
              >
                v{v.no}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{v.note}</span>
                <span className="block text-xs text-ink-faint">
                  {v.author} · {v.no === 4 ? 'current version' : 'kept forever'}
                </span>
              </span>
              <Avatar name={v.author} size="sm" />
            </button>
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait">
        <motion.p
          key={open}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="ml-11 pt-3 text-[13px] text-ink-soft"
        >
          {open === 4 ? 'This is what everyone sees by default.' : `Version ${open} is read-only and can be compared with any other version.`}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function CompareDemo() {
  const [mode, setMode] = useState<'side' | 'inline'>('side');
  // v4 against v3: the left column drops the insertions (giving v3), the right column drops the deletions.
  const after = VERSIONS[3].lines;
  const without = (sign: '+' | '-') => after.map((l) => l.pieces.filter((p) => typeof p === 'string' || p[0] !== sign));
  const columns = [
    ['v3', without('+')],
    ['v4', without('-')],
  ] as const;
  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg bg-paper p-0.5 ring-1 ring-rule">
        {(
          [
            ['side', 'Side by side', Columns2],
            ['inline', 'Inline', Rows3],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cx('relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium', mode === id ? 'text-primary' : 'text-ink-soft')}
          >
            {mode === id && <motion.span layoutId="compare-mode" className="absolute inset-0 rounded-md bg-surface shadow-card" transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }} />}
            <Icon className="relative size-3.5" aria-hidden />
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'side' ? (
          <motion.div key="side" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-3 font-serif text-[13.5px] sm:grid-cols-2">
            {columns.map(([tag, lines]) => (
              <div key={tag} className="rounded-xl bg-paper/70 p-2 ring-1 ring-rule">
                <p className="mb-1 px-1.5 font-sans text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{tag}</p>
                {lines.map((pieces, i) => (
                  <DiffLine key={i} pieces={pieces} />
                ))}
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div key="inline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl bg-paper/70 p-2 font-serif text-[13.5px] ring-1 ring-rule">
            {after.map((l, i) => (
              <DiffLine key={i} {...l} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <p className="mt-3 text-xs text-ink-faint">Two insertions in 3.3; everything else is unchanged.</p>
    </div>
  );
}

const ALL_FINDINGS = [
  ...VERSIONS[3].findings,
  { severity: 'medium' as const, rule: 'Requirement strengthened', text: '"should" became "shall" in 3.1.' },
  { severity: 'medium' as const, rule: 'Value changed', text: '10 minutes became 15 minutes in 3.2.' },
  { severity: 'info' as const, rule: 'Requirement added', text: '3.4 is a new "shall" rule.' },
];

function PreReviewDemo() {
  const [checked, setChecked] = useState<number[]>([]);
  const toggle = (i: number) => setChecked((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-ink-soft">
          v1 → v4 · <span className="tabular font-medium text-ink">{ALL_FINDINGS.length - checked.length}</span> left to check
        </span>
        <span className="rounded border border-dashed border-ink-faint px-1.5 py-px text-[11px] text-ink-soft">Machine-generated, advisory only</span>
      </div>
      <ul className="space-y-1.5">
        {ALL_FINDINGS.map((f, i) => {
          const s = SEVERITY[f.severity];
          const done = checked.includes(i);
          return (
            <motion.li key={f.rule} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={done}
                className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-rule transition-colors hover:bg-paper"
              >
                <s.icon className={cx('mt-0.5 size-4 shrink-0', s.className, done && 'opacity-30')} aria-label={s.label} />
                <span className={cx('flex-1 text-[13.5px] transition-opacity', done && 'line-through opacity-40')}>
                  <span className="font-medium">{f.rule}.</span> <span className="text-ink-soft">{f.text}</span>
                </span>
                <span className={cx('flex size-4 shrink-0 items-center justify-center rounded border', done ? 'border-primary bg-primary text-white' : 'border-rule-strong')}>
                  {done && <Check className="size-3" aria-hidden />}
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

const FLOW: DocumentStatus[] = ['DRAFT', 'UNDER_REVIEW', 'APPROVED'];

function ReviewDemo() {
  const [status, setStatus] = useState<DocumentStatus>('UNDER_REVIEW');
  const step = status === 'CHANGES_REQUESTED' ? 1 : FLOW.indexOf(status);
  return (
    <div>
      <div className="mb-5 flex items-center">
        {FLOW.map((s, i) => (
          <div key={s} className="flex flex-1 items-center last:flex-none">
            <motion.span
              animate={{ scale: i === step ? 1.12 : 1 }}
              className={cx(
                'flex size-8 items-center justify-center rounded-full text-xs font-semibold',
                i < step || (i === step && status === 'APPROVED') ? 'bg-st-approved text-white' : i === step ? (status === 'CHANGES_REQUESTED' ? 'bg-st-changes text-white' : 'bg-st-review text-white') : 'bg-paper text-ink-faint ring-1 ring-rule',
              )}
            >
              {i < step || (i === step && status === 'APPROVED') ? <Check className="size-4" aria-hidden /> : i + 1}
            </motion.span>
            {i < FLOW.length - 1 && (
              <span className="mx-2 h-0.5 flex-1 overflow-hidden rounded bg-rule">
                <motion.span className="block h-full bg-st-approved" animate={{ width: i < step ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="rounded-xl p-4 ring-1 ring-rule">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Canteen Pre-Order SRS · v4</p>
            <p className="text-xs text-ink-faint">Sent to Isha Patel · due in 5 days</p>
          </div>
          <AnimatePresence mode="wait">
            <motion.span key={status} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <StatusBadge status={status} />
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {status === 'UNDER_REVIEW' ? (
            <>
              <button type="button" onClick={() => setStatus('APPROVED')} className="rounded-lg bg-st-approved px-3 py-1.5 text-[13px] font-medium text-white transition active:scale-95">
                Approve
              </button>
              <button type="button" onClick={() => setStatus('CHANGES_REQUESTED')} className="rounded-lg bg-st-changes-wash px-3 py-1.5 text-[13px] font-medium text-st-changes transition active:scale-95">
                Request changes
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setStatus('UNDER_REVIEW')} className="rounded-lg bg-paper px-3 py-1.5 text-[13px] font-medium text-ink-soft ring-1 ring-rule transition active:scale-95">
              Send for review again
            </button>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-faint">Only the assigned reviewer can decide, and every decision is written to the activity log.</p>
    </div>
  );
}

const SUMMARY = [
  'Students pre-order lunch before 11:30 and collect it within 15 minutes of their slot.',
  'Payment is by UPI or at the counter; the refund window is not decided yet.',
  'The canteen manager approves every refund.',
  'Orders that are not collected are released to the counter after the window closes.',
];
const LENGTHS = [
  ['Short', 1],
  ['Medium', 2],
  ['Detailed', 4],
] as const;

function SummaryDemo() {
  const [n, setN] = useState<number>(2);
  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg bg-paper p-0.5 ring-1 ring-rule">
        {LENGTHS.map(([label, count]) => (
          <button key={label} type="button" onClick={() => setN(count)} className={cx('relative rounded-md px-2.5 py-1 text-xs font-medium', n === count ? 'text-primary' : 'text-ink-soft')}>
            {n === count && <motion.span layoutId="summary-length" className="absolute inset-0 rounded-md bg-surface shadow-card" transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
      <motion.ul layout className="space-y-2 rounded-xl bg-paper/70 p-4 font-serif text-[14px] ring-1 ring-rule">
        <AnimatePresence initial={false}>
          {SUMMARY.slice(0, n).map((s) => (
            <motion.li key={s} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex gap-2 overflow-hidden">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet" aria-hidden />
              {s}
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {['pre-order', 'refund', 'collection window', 'UPI', 'canteen manager'].map((t) => (
          <span key={t} className="rounded-full bg-primary-wash px-2.5 py-0.5 text-xs text-primary">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

const MEMBERS = ['Priya Nair', 'Kabir Singh', 'Isha Patel', 'Vansh Lathiya', 'Rohan Mehta'];

function ProtectDemo() {
  const [value, setValue] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [sent, setSent] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (value === 'canteen123') setUnlocked(true);
    else setWrong((w) => w + 1);
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-xl p-4 ring-1 ring-rule">
        <div className="mb-3 flex items-center gap-2">
          <motion.span
            animate={{ rotate: unlocked ? [0, -12, 0] : 0 }}
            className={cx('flex size-8 items-center justify-center rounded-lg', unlocked ? 'bg-st-approved-wash text-st-approved' : 'bg-primary-wash text-primary')}
          >
            {unlocked ? <Unlock className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
          </motion.span>
          <div>
            <p className="text-sm font-medium">Vendor Contract Terms</p>
            <p className="text-xs text-ink-faint">{unlocked ? 'Unlocked for 12 hours on this device' : 'Password protected'}</p>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {unlocked ? (
            <motion.p key="open" initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} className="font-serif text-[13.5px] leading-relaxed text-ink">
              The vendor supplies lunch on all teaching days at the agreed menu price, reviewed every term…
            </motion.p>
          ) : (
            <motion.form key={`lock-${wrong}`} onSubmit={submit} animate={wrong ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.4 }} className="flex gap-2">
              <input
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Try canteen123"
                aria-label="Document password"
                className="h-9 min-w-0 flex-1 rounded-lg border border-rule bg-surface px-3 text-sm outline-none focus:border-primary"
              />
              <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-white transition hover:bg-primary-hover active:scale-95">
                Unlock
              </button>
            </motion.form>
          )}
        </AnimatePresence>
        {!unlocked && wrong > 0 && <p className="mt-2 text-xs text-st-changes">Wrong password. After 5 tries the document locks for 15 minutes.</p>}
      </div>
      <div className="flex items-center gap-3 rounded-xl p-4 ring-1 ring-rule">
        <div className="flex -space-x-2">
          {MEMBERS.map((m, i) => (
            <motion.span key={m} animate={sent ? { y: [0, -6, 0] } : {}} transition={{ delay: i * 0.06 }} className="rounded-full ring-2 ring-surface">
              <Avatar name={m} size="sm" />
            </motion.span>
          ))}
        </div>
        <p className="min-w-0 flex-1 text-xs text-ink-soft">{sent ? 'Sent to all 5 members. It appears under Shared with me.' : 'Send it to every member at once.'}</p>
        <button
          type="button"
          onClick={() => setSent(true)}
          disabled={sent}
          className="flex items-center gap-1.5 rounded-lg bg-paper px-3 py-1.5 text-[13px] font-medium ring-1 ring-rule transition active:scale-95 disabled:text-st-approved"
        >
          {sent ? <Check className="size-3.5" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
          {sent ? 'Sent' : 'Send to all'}
        </button>
      </div>
    </div>
  );
}

/* ── Tabs ──────────────────────────────────────────────────────────────────────── */

const FEATURES: Array<{ id: string; tab: string; icon: typeof History; title: string; body: string; points: string[]; hint: string; demo: () => ReactNode }> = [
  {
    id: 'versions',
    tab: 'Versions',
    icon: History,
    title: 'Every upload is a new version. Nothing is overwritten.',
    body: 'A document keeps its whole history. Everyone sees the current version, and any earlier one is a click away.',
    points: ['Numbered v1, v2, v3 with who uploaded it and why', 'Old versions are read-only and kept forever'],
    hint: 'Click any version',
    demo: VersionsDemo,
  },
  {
    id: 'compare',
    tab: 'Compare',
    icon: GitBranch,
    title: 'See exactly what changed, word by word.',
    body: 'Pick any two versions. DocStruct lines up the paragraphs and marks every insertion and deletion.',
    points: ['Side-by-side or inline view', 'Works on PDF, Word, Markdown and plain text'],
    hint: 'Switch between the two views',
    demo: CompareDemo,
  },
  {
    id: 'prereview',
    tab: 'Pre-review',
    icon: ScanSearch,
    title: 'A checklist for the reviewer before they start reading.',
    body: 'Thirteen explainable rules flag the changes that matter: a "should" that became "shall", a changed number, a TBD left behind.',
    points: ['Every finding says which rule raised it', 'Advisory only: it never changes a status'],
    hint: 'Tick the findings off',
    demo: PreReviewDemo,
  },
  {
    id: 'review',
    tab: 'Review',
    icon: ListChecks,
    title: 'A clear path from draft to approved.',
    body: 'Send a version to a reviewer with a due date. They approve it or ask for changes, with comments pinned to the text.',
    points: ['Review queue for every reviewer', 'Each decision lands in the activity log'],
    hint: 'Approve it or ask for changes',
    demo: ReviewDemo,
  },
  {
    id: 'summary',
    tab: 'Summary',
    icon: BookOpenText,
    title: 'The gist of a long document in three lengths.',
    body: 'DocStruct picks the most central sentences from the document itself, so a summary never says anything the document does not.',
    points: ['Short, medium and detailed', 'Key terms and a section outline'],
    hint: 'Pick a length',
    demo: SummaryDemo,
  },
  {
    id: 'protect',
    tab: 'Protect & share',
    icon: KeyRound,
    title: 'Lock sensitive documents and send them to everyone.',
    body: 'Put a password on a document; even project members need it. Then send it to all members in one step.',
    points: ['An unlock lasts 12 hours on that device', 'Share links can expire or be revoked'],
    hint: 'Type canteen123, then send it',
    demo: ProtectDemo,
  },
];

export function FeatureTabs() {
  const [active, setActive] = useState(FEATURES[0].id);
  const feature = FEATURES.find((f) => f.id === active)!;
  const Demo = feature.demo;

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = FEATURES.findIndex((f) => f.id === active);
    const next = FEATURES[(i + (e.key === 'ArrowRight' ? 1 : FEATURES.length - 1)) % FEATURES.length];
    setActive(next.id);
    document.getElementById(`feature-tab-${next.id}`)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Features" onKeyDown={onKey} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
        <AnimatedBackground
          defaultValue={active}
          onValueChange={(id) => id && setActive(id)}
          className="rounded-full bg-ink shadow-lift"
          transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
        >
          {FEATURES.map((f) => (
            <button
              key={f.id}
              id={`feature-tab-${f.id}`}
              data-id={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === active}
              aria-controls="feature-panel"
              tabIndex={f.id === active ? 0 : -1}
              className="shrink-0 rounded-full px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink data-[checked=true]:text-white"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <f.icon className="size-4" aria-hidden />
                {f.tab}
              </span>
            </button>
          ))}
        </AnimatedBackground>
      </div>

      <div id="feature-panel" role="tabpanel" aria-labelledby={`feature-tab-${active}`} className="mt-8 overflow-hidden rounded-3xl bg-surface shadow-card ring-1 ring-rule">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={feature.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:p-10"
          >
            <div className="flex flex-col justify-center">
              <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet text-white shadow-lift">
                <feature.icon className="size-5" aria-hidden />
              </span>
              <h3 className="font-serif text-2xl leading-snug text-ink sm:text-[28px]">{feature.title}</h3>
              <p className="mt-3 text-ink-soft">{feature.body}</p>
              <ul className="mt-5 space-y-2">
                {feature.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-ink-soft">
                    <Check className="mt-0.5 size-4 shrink-0 text-violet" aria-hidden />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-surface p-1 sm:p-2">
              {/* A small nudge so visitors know the panel is live. */}
              <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-wash px-2.5 py-1 text-xs font-medium text-primary">
                <MousePointerClick className="size-3.5" aria-hidden />
                Try it: {feature.hint}
              </p>
              <Demo />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
