/**
 * What this file does
 *   This is the Overview tab of a project. It shows counts of documents by status, what is waiting on the logged-in user, documents under review with their due dates, and recent activity.
 *
 * How it works
 *   - Gets the project from ProjectLayout with useCurrentProject().
 *   - useQuery ['dashboard', projectId] loads everything in one call: GET /projects/:projectId/dashboard.
 *   - StatCard shows one number with a link; the status bar and status boxes link to the Documents tab filtered by ?status=.
 *   - PendingCard lists reviews assigned to the user and the user's documents that need changes.
 *   - ActivityFeed shows the latest log entries, with a link to the full Activity tab.
 *
 * Where it fits
 *   Index route of /p/:projectId in App.tsx, drawn inside ProjectLayout. Module: M09 Activity & Dashboard (owner: Vivan).
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { DOCUMENT_STATUSES, STATUS_LABEL, type DashboardDto, type DocumentStatus } from '@docstruct/shared';
import { ActivityFeed } from '../../components/ActivityFeed';
import {
  ActivityIcon,
  AnimateIcon,
  ArrowRightIcon,
  BellIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  ClockIcon,
  LayersIcon,
  MessageSquareIcon,
  RotateCcwIcon,
  UploadIcon,
} from '../../components/icons';
import { BlurFade } from '../../components/magicui/blur-fade';
import { BorderBeam } from '../../components/magicui/border-beam';
import { NumberTicker } from '../../components/magicui/number-ticker';
import { AnimatedBackground } from '../../components/motion-primitives/animated-background';
import { Avatar, EmptyState, ErrorNote, GlowCard, STATUS_DOT, Skeleton, StatusBadge, cx, type AnimatedIcon } from '../../components/ui';
import { errorMessage, get } from '../../lib/api';
import { formatDate, plural, timeAgo } from '../../lib/format';
import { useCurrentProject } from '../../lib/hooks';

/** One number tile at the top of the dashboard. The whole tile is a link. */
function StatCard({ icon: Icon, label, value, note, tone, to, delay, beam }: {
  icon: AnimatedIcon;
  label: string;
  value: number;
  note: string;
  tone: string;
  to: string;
  delay: number;
  beam?: boolean;
}) {
  return (
    <BlurFade delay={delay} className="h-full">
      <AnimateIcon animateOnHover asChild>
        <Link to={to} className="group block h-full rounded-xl">
          <GlowCard className="h-full">
            <div className="flex h-full flex-col p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-ink-soft">{label}</span>
                <span className={cx('flex size-8 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6', tone)}>
                  <Icon size={16} />
                </span>
              </div>
              <NumberTicker value={value} delay={delay} className="mt-2 text-3xl font-semibold tracking-tight text-ink" />
              <p className="mt-1 text-[12.5px] text-ink-faint">{note}</p>
            </div>
            {/* The card that needs attention carries a light travelling along its border. */}
            {beam && <BorderBeam size={70} duration={7} colorFrom="#3040c4" colorTo="#554dde" />}
          </GlowCard>
        </Link>
      </AnimateIcon>
    </BlurFade>
  );
}

function SectionTitle({ id, icon: Icon, children, action }: { id: string; icon: AnimatedIcon; children: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <AnimateIcon animateOnHover asChild>
        <h2 id={id} className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary-wash text-primary">
            <Icon size={15} />
          </span>
          {children}
        </h2>
      </AnimateIcon>
      {action}
    </div>
  );
}

/** M09 dashboard (UI-10): status of every document, what is waiting on you, review progress, recent activity. */
export function DashboardPage() {
  const project = useCurrentProject();
  // All dashboard numbers and lists come from one request (GET /projects/:projectId/dashboard).
  // Other pages invalidate ['dashboard', projectId] after a change, so this reloads with fresh numbers.
  const dash = useQuery({ queryKey: ['dashboard', project.projectId], queryFn: () => get<DashboardDto>(`/projects/${project.projectId}/dashboard`) });

  if (dash.isLoading)
    return (
      <div className="grid gap-4 px-5 py-6 sm:grid-cols-2 lg:px-8 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
        <Skeleton rows={3} className="sm:col-span-2 xl:col-span-3" />
      </div>
    );
  if (dash.error || !dash.data) return <div className="p-8"><ErrorNote>{errorMessage(dash.error)}</ErrorNote></div>;
  const d = dash.data;
  // Link to the Documents tab, optionally filtered to one status (for example ?status=APPROVED).
  const docsLink = (status?: DocumentStatus) => `/p/${project.projectId}/documents${status ? `?status=${status}` : ''}`;
  // "Waiting on you" = reviews you must do + your documents sent back with changes requested.
  const waiting = d.awaitingMyReview.length + d.myChangesRequested.length;
  const overdue = d.underReview.filter((u) => u.overdue).length;

  return (
    <div className="space-y-8 px-5 py-6 lg:px-8">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={LayersIcon} label="Documents" value={d.totalDocuments} note={`${d.statusCounts.APPROVED} approved`} tone="bg-primary-wash text-primary" to={docsLink()} delay={0} />
        <StatCard
          icon={BellIcon}
          label="Waiting on you"
          value={waiting}
          note={waiting ? 'Reviews and revisions to do' : 'You are all caught up'}
          tone="bg-st-review-wash text-st-review"
          to={docsLink()}
          delay={0.05}
          beam={waiting > 0}
        />
        <StatCard
          icon={ClipboardListIcon}
          label="Under review"
          value={d.underReview.length}
          note={overdue ? `${overdue} overdue` : 'None overdue'}
          tone="bg-primary-wash text-violet"
          to={docsLink('UNDER_REVIEW')}
          delay={0.1}
        />
        <StatCard
          icon={MessageSquareIcon}
          label="Open comments"
          value={d.openAnnotations}
          note="On current versions"
          tone="bg-st-approved-wash text-st-approved"
          to={docsLink()}
          delay={0.15}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          <BlurFade delay={0.15}>
            <section aria-labelledby="status-heading" className="rounded-2xl border border-rule bg-surface p-5 shadow-card">
              <SectionTitle
                id="status-heading"
                icon={LayersIcon}
                action={
                  <Link to={docsLink()} className="text-sm text-primary hover:underline">
                    All {plural(d.totalDocuments, 'document')}
                  </Link>
                }
              >
                Documents by status
              </SectionTitle>
              {d.totalDocuments === 0 ? (
                <EmptyState
                  icon={UploadIcon}
                  title="No documents yet"
                  action={
                    <Link to={docsLink()} className="text-sm font-medium text-primary hover:underline">
                      Upload the first one
                    </Link>
                  }
                />
              ) : (
                <>
                  {/* A stacked bar: each coloured part's width is that status's share of all documents. */}
                  <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-paper" role="img" aria-label="Share of documents in each status">
                    {DOCUMENT_STATUSES.filter((s) => d.statusCounts[s]).map((s, i) => (
                      <motion.div
                        key={s}
                        title={`${STATUS_LABEL[s]}: ${d.statusCounts[s]}`}
                        className={cx('h-full first:rounded-l-full last:rounded-r-full', STATUS_DOT[s])}
                        initial={{ width: 0 }}
                        animate={{ width: `${(d.statusCounts[s] / d.totalDocuments) * 100}%` }}
                        transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.25 + i * 0.08 }}
                      />
                    ))}
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    {DOCUMENT_STATUSES.map((s, i) => (
                      <motion.div key={s} whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                        <Link
                          to={docsLink(s)}
                          className="group block rounded-xl border border-rule px-3 py-2.5 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-card"
                        >
                          <dt className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                            <span className={cx('size-2 rounded-full transition-transform group-hover:scale-125', STATUS_DOT[s])} aria-hidden />
                            {STATUS_LABEL[s]}
                          </dt>
                          <dd className="mt-1 font-serif text-2xl">
                            <NumberTicker value={d.statusCounts[s]} delay={0.2 + i * 0.05} className="tracking-normal text-ink" />
                          </dd>
                        </Link>
                      </motion.div>
                    ))}
                  </dl>
                </>
              )}
            </section>
          </BlurFade>

          <BlurFade delay={0.2}>
            <section aria-labelledby="pending-heading">
              <SectionTitle id="pending-heading" icon={BellIcon}>
                Waiting on you
              </SectionTitle>
              {waiting === 0 ? (
                <p className="rounded-xl border border-dashed border-rule-strong px-4 py-5 text-center text-sm text-ink-soft">Nothing needs your action in this project.</p>
              ) : (
                <ul className="space-y-2.5">
                  {d.awaitingMyReview.map((r) => (
                    <PendingCard
                      key={r.reviewId}
                      to={`/d/${r.documentId}?review=${r.reviewId}`}
                      icon={ClipboardCheckIcon}
                      tone="bg-st-review-wash text-st-review"
                      title={r.documentTitle}
                      detail={
                        <>
                          Review version {r.versionNo} for {r.submittedBy.displayName}
                          {r.dueDate && <>, due {formatDate(r.dueDate)}</>}
                        </>
                      }
                      status="UNDER_REVIEW"
                    />
                  ))}
                  {d.myChangesRequested.map((doc) => (
                    <PendingCard
                      key={doc.documentId}
                      to={`/d/${doc.documentId}`}
                      icon={RotateCcwIcon}
                      tone="bg-st-changes-wash text-st-changes"
                      title={doc.title}
                      detail="Upload a revised version and send it for review again"
                      status="CHANGES_REQUESTED"
                    />
                  ))}
                </ul>
              )}
            </section>
          </BlurFade>

          <BlurFade delay={0.25}>
            <section aria-labelledby="progress-heading">
              <SectionTitle id="progress-heading" icon={ClockIcon}>
                Under review
              </SectionTitle>
              {d.underReview.length === 0 ? (
                <p className="rounded-xl border border-dashed border-rule-strong px-4 py-5 text-center text-sm text-ink-soft">No documents are under review.</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-card">
                  <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-rule bg-paper/70 px-4 py-2 text-[12.5px] font-medium text-ink-soft sm:grid-cols-[1fr_12rem_9rem]">
                    <span>Document</span>
                    <span className="hidden sm:block">Reviewer</span>
                    <span>Due</span>
                  </div>
                  <div className="flex flex-col p-1.5">
                    {/* A highlight glides between rows as the pointer moves (motion-primitives AnimatedBackground). */}
                    <AnimatedBackground enableHover className="rounded-lg bg-primary-wash/80" transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}>
                      {d.underReview.map((u) => (
                        <Link
                          key={u.document.documentId}
                          data-id={u.document.documentId}
                          to={`/d/${u.document.documentId}`}
                          className="w-full rounded-lg px-2.5 py-2.5 text-sm"
                        >
                          <span className="grid w-full grid-cols-[1fr_auto] items-center gap-4 sm:grid-cols-[1fr_12rem_9rem]">
                            <span className="min-w-0 truncate">
                              <span className="font-medium">{u.document.title}</span>
                              <span className="ml-2 text-[12.5px] text-ink-faint tabular">v{u.document.currentVersion.versionNo}</span>
                            </span>
                            <span className="hidden min-w-0 items-center gap-2 text-ink-soft sm:flex">
                              <Avatar name={u.reviewer.displayName} size="sm" />
                              <span className="truncate">{u.reviewer.displayName}</span>
                            </span>
                            <span className={cx(u.overdue ? 'font-medium text-st-changes' : 'text-ink-soft')}>
                              {u.dueDate ? `${formatDate(u.dueDate)}${u.overdue ? ' (overdue)' : ''}` : 'No due date'}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </AnimatedBackground>
                  </div>
                </div>
              )}
            </section>
          </BlurFade>
        </div>

        <BlurFade delay={0.2} className="min-w-0">
          <aside className="rounded-2xl border border-rule bg-paper/60 p-4">
            <SectionTitle
              id="activity-heading"
              icon={ActivityIcon}
              action={
                <Link to={`/p/${project.projectId}/activity`} className="text-sm text-primary hover:underline">
                  Full log
                </Link>
              }
            >
              Recent activity
            </SectionTitle>
            {d.recentActivity.length ? <ActivityFeed entries={d.recentActivity} /> : <EmptyState icon={ActivityIcon} title="No activity yet" />}
            <p className="mt-3 text-[12.5px] text-ink-faint">Updated {timeAgo(new Date(dash.dataUpdatedAt).toISOString())}</p>
          </aside>
        </BlurFade>
      </div>
    </div>
  );
}

/** One row in "Waiting on you": a review to do or a document to revise. */
function PendingCard({ to, icon: Icon, tone, title, detail, status }: {
  to: string;
  icon: AnimatedIcon;
  tone: string;
  title: string;
  detail: React.ReactNode;
  status: 'UNDER_REVIEW' | 'CHANGES_REQUESTED';
}) {
  return (
    <li>
      <AnimateIcon animateOnHover asChild>
        <Link
          to={to}
          className="group flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lift"
        >
          <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg', tone)}>
            <Icon size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium transition-colors group-hover:text-primary">{title}</p>
            <p className="text-[13px] text-ink-soft">{detail}</p>
          </div>
          <StatusBadge status={status} />
          <span className="text-primary transition-transform duration-200 group-hover:translate-x-1">
            <ArrowRightIcon size={16} />
          </span>
        </Link>
      </AnimateIcon>
    </li>
  );
}
