import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DOCUMENT_STATUSES, STATUS_LABEL, type DashboardDto, type DocumentStatus } from '@docstruct/shared';
import { ActivityFeed } from '../../components/ActivityFeed';
import { EmptyState, ErrorNote, Spinner, StatusBadge, cx } from '../../components/ui';
import { errorMessage, get } from '../../lib/api';
import { formatDate, plural, timeAgo } from '../../lib/format';
import { useCurrentProject } from '../../lib/hooks';

const BAR: Record<DocumentStatus, string> = {
  DRAFT: 'bg-st-draft',
  UNDER_REVIEW: 'bg-st-review',
  CHANGES_REQUESTED: 'bg-st-changes',
  APPROVED: 'bg-st-approved',
  ARCHIVED: 'bg-st-archived/50',
};

/** M09 dashboard (UI-10): status of every document, what is waiting on you, review progress, recent activity. */
export function DashboardPage() {
  const project = useCurrentProject();
  const dash = useQuery({ queryKey: ['dashboard', project.projectId], queryFn: () => get<DashboardDto>(`/projects/${project.projectId}/dashboard`) });

  if (dash.isLoading) return <div className="px-5 lg:px-8"><Spinner /></div>;
  if (dash.error || !dash.data) return <div className="p-8"><ErrorNote>{errorMessage(dash.error)}</ErrorNote></div>;
  const d = dash.data;
  const docsLink = (status?: DocumentStatus) => `/p/${project.projectId}/documents${status ? `?status=${status}` : ''}`;

  return (
    <div className="grid gap-10 px-5 py-6 lg:grid-cols-[1fr_22rem] lg:px-8">
      <div className="min-w-0 space-y-10">
        <section aria-labelledby="status-heading">
          <div className="flex items-baseline justify-between">
            <h2 id="status-heading" className="font-semibold">Documents by status</h2>
            <Link to={docsLink()} className="text-sm text-primary hover:underline">
              All {plural(d.totalDocuments, 'document')}
            </Link>
          </div>
          {d.totalDocuments === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              No documents yet. <Link to={docsLink()} className="text-primary hover:underline">Upload the first one</Link>.
            </p>
          ) : (
            <>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-paper" role="img" aria-label="Share of documents in each status">
                {DOCUMENT_STATUSES.filter((s) => d.statusCounts[s]).map((s) => (
                  <div key={s} className={BAR[s]} style={{ width: `${(d.statusCounts[s] / d.totalDocuments) * 100}%` }} />
                ))}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {DOCUMENT_STATUSES.map((s) => (
                  <Link key={s} to={docsLink(s)} className="rounded-md border border-rule px-3 py-2.5 hover:border-rule-strong">
                    <dt className="flex items-center gap-1.5 text-[13px] text-ink-soft">
                      <span className={cx('size-2 rounded-full', BAR[s])} aria-hidden />
                      {STATUS_LABEL[s]}
                    </dt>
                    <dd className="mt-1 font-serif text-2xl tabular">{d.statusCounts[s]}</dd>
                  </Link>
                ))}
              </dl>
            </>
          )}
        </section>

        <section aria-labelledby="pending-heading">
          <h2 id="pending-heading" className="mb-3 font-semibold">Waiting on you</h2>
          {d.awaitingMyReview.length === 0 && d.myChangesRequested.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing needs your action in this project.</p>
          ) : (
            <ul className="divide-y divide-rule rounded-lg border border-rule">
              {d.awaitingMyReview.map((r) => (
                <li key={r.reviewId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Link to={`/d/${r.documentId}`} className="font-medium hover:text-primary">{r.documentTitle}</Link>
                    <p className="text-[13px] text-ink-soft">
                      Review version {r.versionNo} for {r.submittedBy.displayName}
                      {r.dueDate && <>, due {formatDate(r.dueDate)}</>}
                    </p>
                  </div>
                  <StatusBadge status="UNDER_REVIEW" />
                </li>
              ))}
              {d.myChangesRequested.map((doc) => (
                <li key={doc.documentId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <Link to={`/d/${doc.documentId}`} className="font-medium hover:text-primary">{doc.title}</Link>
                    <p className="text-[13px] text-ink-soft">Upload a revised version and send it for review again</p>
                  </div>
                  <StatusBadge status="CHANGES_REQUESTED" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="progress-heading">
          <h2 id="progress-heading" className="mb-3 font-semibold">Under review</h2>
          {d.underReview.length === 0 ? (
            <p className="text-sm text-ink-soft">No documents are under review.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-rule">
              <table className="w-full text-sm">
                <thead className="bg-paper text-left text-[13px] text-ink-soft">
                  <tr>
                    <th className="px-4 py-2 font-medium">Document</th>
                    <th className="px-4 py-2 font-medium">Reviewer</th>
                    <th className="px-4 py-2 font-medium">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {d.underReview.map((u) => (
                    <tr key={u.document.documentId}>
                      <td className="px-4 py-2.5">
                        <Link to={`/d/${u.document.documentId}`} className="font-medium hover:text-primary">{u.document.title}</Link>
                        <span className="ml-2 text-[13px] text-ink-faint tabular">v{u.document.currentVersion.versionNo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft">{u.reviewer.displayName}</td>
                      <td className={cx('px-4 py-2.5', u.overdue ? 'font-medium text-st-changes' : 'text-ink-soft')}>
                        {u.dueDate ? `${formatDate(u.dueDate)}${u.overdue ? ' (overdue)' : ''}` : 'No due date'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="min-w-0 lg:border-l lg:border-rule lg:pl-8">
        <div className="mb-6 rounded-md bg-paper px-4 py-3 text-sm">
          <span className="font-serif text-xl tabular">{d.openAnnotations}</span>{' '}
          <span className="text-ink-soft">open {d.openAnnotations === 1 ? 'comment' : 'comments'} on current versions</span>
        </div>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Recent activity</h2>
          <Link to={`/p/${project.projectId}/activity`} className="text-sm text-primary hover:underline">Full log</Link>
        </div>
        {d.recentActivity.length ? (
          <ActivityFeed entries={d.recentActivity} />
        ) : (
          <EmptyState title="No activity yet" />
        )}
        <p className="mt-2 text-[12.5px] text-ink-faint">Updated {timeAgo(new Date(dash.dataUpdatedAt).toISOString())}</p>
      </aside>
    </div>
  );
}
