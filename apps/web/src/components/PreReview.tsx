import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import type { DiffDto, PreReviewDto, PreReviewFinding } from '@docstruct/shared';
import { get } from '../lib/api';
import { MachineLabel, Notice, Spinner, cx } from './ui';

const SEVERITY = {
  high: { icon: OctagonAlert, style: 'text-st-changes', label: 'Needs attention' },
  medium: { icon: AlertTriangle, style: 'text-st-review', label: 'Check' },
  info: { icon: Info, style: 'text-ink-faint', label: 'Note' },
} as const;

export function FindingList({ findings }: { findings: PreReviewFinding[] }) {
  if (!findings.length) return <p className="text-sm text-ink-soft">No findings.</p>;
  return (
    <ul className="space-y-3">
      {findings.map((f) => {
        const s = SEVERITY[f.severity];
        return (
          <li key={f.id} className="flex gap-2.5 text-sm">
            <s.icon className={cx('mt-0.5 size-4 shrink-0', s.style)} aria-label={s.label} />
            <div className="min-w-0">
              <p className="font-medium">
                {f.title}
                {f.section && <span className="font-normal text-ink-faint"> in {f.section}</span>}
              </p>
              <p className="text-ink-soft">{f.message}</p>
              {f.excerpt && <p className="mt-1 line-clamp-2 border-l-2 border-rule pl-2 font-serif text-[13.5px] text-ink-soft">{f.excerpt}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The change summary as written by the engine: an overview paragraph, then one bullet per key change. */
export function SummaryText({ summary }: { summary: string }) {
  const [overview, ...rest] = summary.split('\n\n');
  const bullets = rest.join('\n').split('\n').filter(Boolean);
  return (
    <div className="space-y-2 font-serif text-[14.5px] leading-relaxed">
      <p>{overview}</p>
      {bullets.length > 0 && (
        <ul className="space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ink-faint" aria-hidden>–</span>
              <span>{b.replace(/^•\s*/, '')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiffSummaryBlock({ diff, compareLink }: { diff: DiffDto; compareLink?: string }) {
  if (diff.status === 'PENDING') return <Spinner label="Comparing with the previous version" />;
  if (diff.status === 'UNAVAILABLE') return <Notice>{diff.reason}</Notice>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MachineLabel />
        {compareLink && (
          <Link to={compareLink} className="text-sm text-primary hover:underline">
            Open the side-by-side comparison
          </Link>
        )}
      </div>
      {diff.summary && <SummaryText summary={diff.summary} />}
      <div>
        <h4 className="mb-2 text-sm font-semibold">Pre-review findings</h4>
        <FindingList findings={diff.findings} />
      </div>
    </div>
  );
}

/**
 * Diff.PreReview.Run as the reviewer sees it. Polls while the comparison is still being prepared (PE-7:
 * progress feedback), and never blocks the decision: if no summary exists, the reviewer reads the document.
 */
export function PreReviewPanel({ reviewId, documentId }: { reviewId: string; documentId: string }) {
  const pre = useQuery({
    queryKey: ['pre-review', reviewId],
    queryFn: () => get<PreReviewDto>(`/reviews/${reviewId}/pre-review`),
    refetchInterval: (q) => (q.state.data?.diff?.status === 'PENDING' ? 1500 : false),
  });
  if (pre.isLoading) return <Spinner label="Preparing the change summary" />;
  if (pre.error) return <Notice>The change summary is unavailable right now. You can still review the document and record a decision.</Notice>;
  if (!pre.data || pre.data.firstVersion || !pre.data.diff) {
    return <Notice>This is the first version of the document, so there is no earlier version to compare with.</Notice>;
  }
  const { diff } = pre.data;
  return <DiffSummaryBlock diff={diff} compareLink={`/d/${documentId}/compare?from=${diff.from.versionId}&to=${diff.to.versionId}`} />;
}
