/**
 * What this file does
 *   The sample requirements document used by the feature demos on the overview page: four versions with
 *   their changes marked, and the pre-review finding for each.
 *
 * Why it exists
 *   The overview demos must work with no account and no API, so they need realistic data of their own. One
 *   shared file keeps the versions, change marks and findings consistent across all the demo tabs.
 *
 * How it works
 *   - VERSIONS holds the sample text; each line is a list of pieces that are unchanged, inserted (+) or deleted (-).
 *   - DiffLine draws one line with insertions highlighted and deletions struck through.
 *   - Everything is local sample data: no API calls, nothing is saved.
 *
 * Where it fits
 *   Used by pages/landing/FeatureTabs.tsx. The findings are modelled on real rules in
 *   apps/api/src/modules/diff/prereview.ts. Module: app shell / landing page (owner: Vansh).
 */
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import type { DocumentStatus } from '@docstruct/shared';
import { cx } from '../../components/ui';

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
