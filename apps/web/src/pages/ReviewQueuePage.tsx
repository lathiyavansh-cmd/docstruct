import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ReviewDto } from '@docstruct/shared';
import { EmptyState, ErrorNote, PageHeader, Spinner, cx } from '../components/ui';
import { errorMessage, get } from '../lib/api';
import { formatDate, timeAgo } from '../lib/format';

/** Review.Queue.View: versions waiting for your decision, across all your projects. */
export function ReviewQueuePage() {
  const queue = useQuery({ queryKey: ['review-queue'], queryFn: () => get<ReviewDto[]>('/reviews/queue') });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader title="Review queue">Documents sent to you for review, soonest due first.</PageHeader>
      {queue.isLoading && <Spinner />}
      {queue.error && <ErrorNote>{errorMessage(queue.error)}</ErrorNote>}
      {queue.data?.length === 0 && <EmptyState title="Nothing to review">When someone sends you a document for review, it appears here.</EmptyState>}
      {!!queue.data?.length && (
        <ul className="divide-y divide-rule rounded-lg border border-rule">
          {queue.data.map((r) => {
            const overdue = !!r.dueDate && r.dueDate < today;
            return (
              <li key={r.reviewId}>
                <Link to={`/d/${r.documentId}?review=${r.reviewId}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3.5 hover:bg-paper/60">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.documentTitle} <span className="text-[13px] font-normal text-ink-faint tabular">version {r.versionNo}</span>
                    </p>
                    <p className="text-[13px] text-ink-soft">
                      {r.projectName}, sent by {r.submittedBy.displayName} {timeAgo(r.createdAt)}
                    </p>
                    {r.submissionNote && <p className="mt-1 line-clamp-1 font-serif text-sm text-ink-soft">“{r.submissionNote}”</p>}
                  </div>
                  <span className={cx('text-sm', overdue ? 'font-medium text-st-changes' : 'text-ink-soft')}>
                    {r.dueDate ? `${overdue ? 'Overdue since' : 'Due'} ${formatDate(r.dueDate)}` : 'No due date'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
