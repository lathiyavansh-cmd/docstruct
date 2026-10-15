/**
 * What this file does
 *   This is the "Review queue" screen. It lists every document version that someone sent to the logged-in user for review, from all projects.
 *
 * How it works
 *   - useQuery ['review-queue'] loads the list from GET /reviews/queue (the server sorts it, soonest due first).
 *   - Each row shows the document title, version number, project, who sent it, the note and the due date.
 *   - A review whose due date is before today is marked "Overdue" in a warning colour.
 *   - Clicking a row opens the document page (/d/:documentId), where the Review tab lets the user approve or request changes.
 *
 * Where it fits
 *   Route /reviews in App.tsx, inside AppLayout. Module: M05 Review & Approval (owner: Vivan).
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReviewDto } from '@docstruct/shared';
import { AnimateIcon, ArrowRightIcon, ClipboardCheckIcon, ClockIcon } from '../components/icons';
import { BlurFade } from '../components/magicui/blur-fade';
import { Avatar, EmptyState, ErrorNote, GlowCard, PageHeader, Skeleton, cx } from '../components/ui';
import { errorMessage, get } from '../lib/api';
import { formatDate, timeAgo } from '../lib/format';

/** Review.Queue.View: versions waiting for your decision, across all your projects. */
export function ReviewQueuePage() {
  // Pending reviews assigned to me (GET /reviews/queue). Same key as the counter on ProjectsPage, so they share the cache.
  const queue = useQuery({ queryKey: ['review-queue'], queryFn: () => get<ReviewDto[]>('/reviews/queue') });
  // Today's date as "YYYY-MM-DD", so it can be compared as text with each dueDate.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader title="Review queue">Documents sent to you for review, soonest due first.</PageHeader>
      {queue.isLoading && <Skeleton rows={3} />}
      {queue.error && <ErrorNote>{errorMessage(queue.error)}</ErrorNote>}
      {queue.data?.length === 0 && (
        <EmptyState icon={ClipboardCheckIcon} title="Nothing to review">
          When someone sends you a document for review, it appears here.
        </EmptyState>
      )}
      {!!queue.data?.length && (
        <ul className="space-y-3">
          {queue.data.map((r, i) => {
            // Overdue means it has a due date and that date is already past.
            const overdue = !!r.dueDate && r.dueDate < today;
            return (
              <BlurFade key={r.reviewId} delay={0.05 + i * 0.05}>
                <li>
                  {/* Opens the document page. Its Review tab is open by default, so the reviewer can decide there. */}
                  <AnimateIcon animateOnHover asChild>
                    <Link to={`/d/${r.documentId}?review=${r.reviewId}`} className="group block rounded-xl">
                      <GlowCard>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-st-review-wash text-st-review transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
                            <ClipboardCheckIcon size={19} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium transition-colors group-hover:text-primary">
                              {r.documentTitle} <span className="text-[13px] font-normal text-ink-faint tabular">version {r.versionNo}</span>
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-soft">
                              <Avatar name={r.submittedBy.displayName} size="sm" />
                              {r.projectName}, sent by {r.submittedBy.displayName} {timeAgo(r.createdAt)}
                            </p>
                            {r.submissionNote && <p className="mt-1.5 line-clamp-1 font-serif text-sm text-ink-soft">“{r.submissionNote}”</p>}
                          </div>
                          <span
                            className={cx(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px]',
                              overdue ? 'bg-st-changes-wash font-medium text-st-changes' : 'bg-paper text-ink-soft ring-1 ring-rule',
                            )}
                          >
                            <ClockIcon size={13} />
                            {r.dueDate ? `${overdue ? 'Overdue since' : 'Due'} ${formatDate(r.dueDate)}` : 'No due date'}
                          </span>
                          <span className="text-primary transition-transform duration-200 group-hover:translate-x-1">
                            <ArrowRightIcon size={16} />
                          </span>
                        </div>
                      </GlowCard>
                    </Link>
                  </AnimateIcon>
                </li>
              </BlurFade>
            );
          })}
        </ul>
      )}
    </div>
  );
}
