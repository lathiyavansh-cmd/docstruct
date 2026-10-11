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
  const queue = useQuery({ queryKey: ['review-queue'], queryFn: () => get<ReviewDto[]>('/reviews/queue') });
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
            const overdue = !!r.dueDate && r.dueDate < today;
            return (
              <BlurFade key={r.reviewId} delay={0.05 + i * 0.05}>
                <li>
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
