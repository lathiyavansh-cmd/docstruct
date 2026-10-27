/**
 * What this file does
 *   The interactive document card in the landing page hero. It steps through four versions of a sample
 *   requirements document, marks what changed since the previous version and shows the pre-review finding.
 *
 * How it works
 *   - VERSIONS holds the sample text; each line is a list of pieces that are unchanged, inserted (+) or deleted (-).
 *   - It moves to the next version every few seconds until the visitor clicks a version or hovers the card;
 *     people who ask their system for less motion get no automatic stepping.
 *   - The card tilts slightly towards the pointer (two springs on rotateX / rotateY).
 *   - Everything is local sample data: no API calls, nothing is saved.
 *
 * Where it fits
 *   Rendered by pages/landing/LandingPage.tsx. The findings use the names of real rules from
 *   apps/api/src/modules/diff/prereview.ts. Module: app shell / landing page (owner: Vansh).
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion, useSpring } from 'motion/react';
import { AlertTriangle, FileText, Info, OctagonAlert } from 'lucide-react';
import type { DocumentStatus } from '@docstruct/shared';
import { AnimatedBackground } from '../../components/motion-primitives/animated-background';
import { BorderBeam } from '../../components/magicui/border-beam';
import { Avatar, StatusBadge, cx } from '../../components/ui';

type Piece = string | ['+' | '-', string];
type Severity = 'high' | 'medium' | 'info';

interface Version {
  no: number;
  author: string;
  note: string;
  status: DocumentStatus;
  lines: Array<{ added?: boolean; pieces: Piece[] }>;
  findings: Array<{ severity: Severity; rule: string; text: string }>;
}

const L31 = '3.1 Students shall be able to pre-order lunch before 11:30.';
const L32 = '3.2 Orders can be collected within 15 minutes of the chosen slot.';

export const VERSIONS: Version[] = [
  {
    no: 1,
    author: 'Kabir Singh',
    note: 'First draft',
    status: 'DRAFT',
    lines: [
      { pieces: ['3.1 Students should be able to pre-order lunch before 11:30.'] },
      { pieces: ['3.2 Orders can be collected within 10 minutes of the chosen slot.'] },
      { pieces: ['3.3 Payment is made at the counter.'] },
    ],
    findings: [{ severity: 'info', rule: 'First version', text: 'Nothing to compare yet. Every later upload is checked against this one.' }],
  },
  {
    no: 2,
    author: 'Priya Nair',
    note: 'Tightened the ordering rule',
    status: 'DRAFT',
    lines: [
      { pieces: ['3.1 Students ', ['-', 'should'], ['+', 'shall'], ' be able to pre-order lunch before 11:30.'] },
      { pieces: ['3.2 Orders can be collected within 10 minutes of the chosen slot.'] },
      { pieces: ['3.3 Payment is made at the counter.'] },
    ],
    findings: [{ severity: 'medium', rule: 'Requirement strengthened', text: '"should" became "shall" in 3.1, so it is now mandatory.' }],
  },
  {
    no: 3,
    author: 'Kabir Singh',
    note: 'Collection window and refunds',
    status: 'CHANGES_REQUESTED',
    lines: [
      { pieces: [L31] },
      { pieces: ['3.2 Orders can be collected within ', ['-', '10'], ['+', '15'], ' minutes of the chosen slot.'] },
      { pieces: ['3.3 Payment is made at the counter.'] },
      { added: true, pieces: [['+', '3.4 The canteen manager shall approve every refund.']] },
    ],
    findings: [
      { severity: 'medium', rule: 'Value changed', text: '10 minutes became 15 minutes in 3.2.' },
      { severity: 'info', rule: 'Requirement added', text: '3.4 adds a new "shall" rule about refunds.' },
    ],
  },
  {
    no: 4,
    author: 'Priya Nair',
    note: 'UPI payments',
    status: 'UNDER_REVIEW',
    lines: [
      { pieces: [L31] },
      { pieces: [L32] },
      { pieces: ['3.3 Payment is made ', ['+', 'by UPI or '], 'at the counter.', ['+', ' Refund window: TBD.']] },
      { pieces: ['3.4 The canteen manager shall approve every refund.'] },
    ],
    findings: [{ severity: 'high', rule: 'Placeholder', text: '"TBD" is still in 3.3. Fill it in before approval.' }],
  },
];

export const SEVERITY = {
  high: { icon: OctagonAlert, className: 'text-st-changes', label: 'High' },
  medium: { icon: AlertTriangle, className: 'text-st-review', label: 'Medium' },
  info: { icon: Info, className: 'text-primary', label: 'Info' },
} as const;

const STEP_MS = 3800;

/** Draws one line of document text with insertions highlighted and deletions struck through. */
export function DiffLine({ pieces, added }: { pieces: Piece[]; added?: boolean }) {
  return (
    <p className={cx('rounded px-1.5 py-1 leading-relaxed', added && 'bg-mark-insert/40')}>
      {pieces.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : p[0] === '+' ? (
          <ins key={i} className="rounded-sm bg-mark-insert px-0.5 no-underline decoration-mark-insert-rule [box-shadow:inset_0_-2px_0_var(--color-mark-insert-rule)]">
            {p[1]}
          </ins>
        ) : (
          <del key={i} className="rounded-sm bg-mark-delete px-0.5 text-ink-soft decoration-mark-delete-rule decoration-2">
            {p[1]}
          </del>
        ),
      )}
    </p>
  );
}

export function VersionStack() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  // Once the visitor picks a version themselves, the card stops stepping on its own.
  const [manual, setManual] = useState(false);
  const playing = !reduceMotion && !manual && !hovered;
  const version = VERSIONS[index];

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % VERSIONS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, index]);

  // A gentle 3D tilt towards the pointer.
  const card = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(0, { stiffness: 150, damping: 18 });
  const rotateY = useSpring(0, { stiffness: 150, damping: 18 });
  function tilt(e: PointerEvent) {
    if (reduceMotion || !card.current) return;
    const r = card.current.getBoundingClientRect();
    rotateY.set(((e.clientX - r.left) / r.width - 0.5) * 8);
    rotateX.set(-((e.clientY - r.top) / r.height - 0.5) * 8);
  }
  function leave() {
    setHovered(false);
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div className="relative mx-auto w-full max-w-[540px] [perspective:1400px]">
      {/* Two faded sheets behind the card make it read as a stack of versions. */}
      <div className="absolute inset-x-8 -bottom-4 top-6 rotate-[-4deg] rounded-2xl bg-white/[0.06] ring-1 ring-white/10" aria-hidden />
      <div className="absolute inset-x-4 -bottom-2 top-3 rotate-[2.5deg] rounded-2xl bg-white/[0.09] ring-1 ring-white/10" aria-hidden />

      <motion.div
        ref={card}
        onPointerMove={tilt}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={leave}
        style={{ rotateX, rotateY }}
        className="relative overflow-hidden rounded-2xl bg-surface text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/20"
      >
        <BorderBeam size={120} duration={9} colorFrom="#a9b4ff" colorTo="#554dde" />

        <div className="flex items-center gap-3 border-b border-rule px-5 py-3.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary-wash text-primary">
            <FileText className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Canteen Pre-Order SRS</p>
            <p className="text-xs text-ink-faint">Campus Canteen App / Requirements</p>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={version.status} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
              <StatusBadge status={version.status} />
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3 border-b border-rule bg-paper/70 px-5 py-2.5">
          <div role="tablist" aria-label="Versions" className="flex gap-1">
            <AnimatedBackground
              defaultValue={String(version.no)}
              onValueChange={(id) => {
                if (!id) return;
                setManual(true);
                setIndex(Number(id) - 1);
              }}
              className="rounded-md bg-surface shadow-card ring-1 ring-rule"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            >
              {VERSIONS.map((v) => (
                <button
                  key={v.no}
                  data-id={String(v.no)}
                  type="button"
                  role="tab"
                  aria-selected={v.no === version.no}
                  className="rounded-md px-2.5 py-1 font-serif text-sm text-ink-soft transition-colors data-[checked=true]:text-primary"
                >
                  v{v.no}
                </button>
              ))}
            </AnimatedBackground>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2 text-xs text-ink-soft">
            <Avatar name={version.author} size="sm" />
            <span className="hidden truncate sm:inline">{version.note}</span>
          </div>
        </div>

        {/* A thin bar fills while the card waits to show the next version. */}
        <div className="h-0.5 bg-rule/60">
          {playing && (
            <motion.div
              key={`${index}-${playing}`}
              className="h-full bg-gradient-to-r from-primary to-violet"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: STEP_MS / 1000, ease: 'linear' }}
            />
          )}
        </div>

        <div className="min-h-[188px] px-4 py-4 font-serif text-[14.5px] text-ink">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={version.no}
              initial={{ opacity: 0, filter: 'blur(4px)', y: 6 }}
              animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
              exit={{ opacity: 0, filter: 'blur(4px)', y: -6 }}
              transition={{ duration: 0.35 }}
            >
              {version.lines.map((line, i) => (
                <DiffLine key={i} {...line} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="border-t border-rule bg-paper/60 px-5 py-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">Pre-review</span>
            <span className="rounded border border-dashed border-ink-faint px-1.5 text-[10.5px] text-ink-soft">advisory</span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul key={version.no} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
              {version.findings.map((f, i) => {
                const s = SEVERITY[f.severity];
                return (
                  <motion.li
                    key={f.rule}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className="flex items-start gap-2 text-[13px]"
                  >
                    <s.icon className={cx('mt-0.5 size-3.5 shrink-0', s.className)} aria-label={s.label} />
                    <span>
                      <span className="font-medium">{f.rule}.</span> <span className="text-ink-soft">{f.text}</span>
                    </span>
                  </motion.li>
                );
              })}
            </motion.ul>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
