/**
 * What this file does
 *   The "Reminders" screen: everything the logged-in user should look at across all their projects.
 *   Overdue and soon-due reviews assigned to them, nudges they received, reviews they sent that are
 *   overdue (with a "Remind reviewer" button), and decisions made on their documents this week.
 *
 * How it works
 *   - useQuery ['reminders'] loads GET /me/reminders (the server sorts it, most urgent first).
 *   - Each row explains why it is there and links to the document. The due-date pill turns red when overdue.
 *   - "Remind reviewer" calls POST /reviews/:id/nudge; the server allows one nudge per review per day.
 *
 * Where it fits
 *   Route /reminders in App.tsx, inside AppLayout, which also shows the attention count as a badge.
 *   Module: M05 Review & Approval (owner: Vivan).
 */
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReminderDto, ReminderKind, RemindersDto, ReviewDto } from '@docstruct/shared';
import { AnimateIcon, ArrowRightIcon, BadgeCheckIcon, BellIcon, ClipboardCheckIcon, ClockIcon, RotateCcwIcon, SendIcon } from '../components/icons';
import { BlurFade } from '../components/magicui/blur-fade';
import { useToast } from '../components/toast';
import { Avatar, Button, EmptyState, ErrorNote, GlowCard, PageHeader, Skeleton, cx, type AnimatedIcon } from '../components/ui';
import { errorMessage, get, post } from '../lib/api';
import { dueLabel, timeAgo } from '../lib/format';

const KIND: Record<ReminderKind, { icon: AnimatedIcon; tone: string; title: (r: ReviewDto) => string }> = {
  review_overdue: { icon: ClockIcon, tone: 'bg-st-changes-wash text-st-changes', title: () => 'Your review is overdue' },
  nudged: { icon: BellIcon, tone: 'bg-st-review-wash text-st-review', title: (r) => `${r.submittedBy.displayName} reminded you about this review` },
  review_due_soon: { icon: ClipboardCheckIcon, tone: 'bg-st-review-wash text-st-review', title: () => 'Your review is due soon' },
  sent_overdue: { icon: ClockIcon, tone: 'bg-st-changes-wash text-st-changes', title: (r) => `${r.reviewer.displayName} has not reviewed this yet` },
  decided: { icon: BadgeCheckIcon, tone: 'bg-st-approved-wash text-st-approved', title: (r) => `${r.reviewer.displayName} ${r.status === 'APPROVED' ? 'approved' : 'requested changes to'} your document` },
};

export function RemindersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reminders = useQuery({ queryKey: ['reminders'], queryFn: () => get<RemindersDto>('/me/reminders') });

  const nudge = useMutation({
    mutationFn: (reviewId: string) => post<ReviewDto>(`/reviews/${reviewId}/nudge`),
    onSuccess: (r) => {
      toast(`Reminded ${r.reviewer.displayName}`);
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reviews', r.documentId] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const items = reminders.data?.items ?? [];
  const attention = items.filter((i) => i.kind !== 'decided');
  const news = items.filter((i) => i.kind === 'decided');

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader title="Reminders">Reviews that need attention, and what happened to the documents you sent.</PageHeader>
      {reminders.isLoading && <Skeleton rows={3} />}
      {reminders.error && <ErrorNote>{errorMessage(reminders.error)}</ErrorNote>}
      {reminders.data && items.length === 0 && (
        <EmptyState icon={BellIcon} title="All clear">
          Nothing is overdue or due soon. Reviews you send and receive will appear here as their due dates approach.
        </EmptyState>
      )}
      {attention.length > 0 && <ReminderList items={attention} onNudge={(id) => nudge.mutate(id)} nudging={nudge.isPending ? nudge.variables : null} />}
      {news.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wider text-ink-faint">This week</h2>
          <ReminderList items={news} onNudge={() => {}} nudging={null} />
        </>
      )}
    </div>
  );
}

function ReminderList({ items, onNudge, nudging }: { items: ReminderDto[]; onNudge: (reviewId: string) => void; nudging: string | null }) {
  return (
    <ul className="space-y-3">
      {items.map(({ kind, review: r }, i) => {
        const k = KIND[kind];
        // A nudge is allowed once a day; the button rests until then.
        const nudgedToday = !!r.nudgedAt && Date.now() - new Date(r.nudgedAt).getTime() < 24 * 60 * 60 * 1000;
        return (
          <BlurFade key={`${kind}-${r.reviewId}`} delay={0.04 + i * 0.04}>
            <li>
              <GlowCard>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
                  <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', k.tone)}>
                    <k.icon size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink-soft">{k.title(r)}</p>
                    <AnimateIcon animateOnHover asChild>
                      <Link to={`/d/${r.documentId}?review=${r.reviewId}`} className="group inline-flex items-center gap-1.5 font-medium transition-colors hover:text-primary">
                        {r.documentTitle} <span className="text-[13px] font-normal text-ink-faint tabular">version {r.versionNo}</span>
                        <span className="text-primary transition-transform duration-300 group-hover:translate-x-1">
                          <ArrowRightIcon size={14} />
                        </span>
                      </Link>
                    </AnimateIcon>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-soft">
                      <Avatar name={kind === 'sent_overdue' || kind === 'decided' ? r.reviewer.displayName : r.submittedBy.displayName} size="sm" />
                      {r.projectName}
                      {kind === 'decided' && r.decidedAt && <> · decided {timeAgo(r.decidedAt)}</>}
                      {kind === 'nudged' && r.nudgedAt && <> · reminded {timeAgo(r.nudgedAt)}</>}
                      {kind === 'decided' && r.decisionNote && <span className="line-clamp-1 font-serif">“{r.decisionNote}”</span>}
                    </p>
                  </div>
                  {kind !== 'decided' && (
                    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px]', r.overdue ? 'bg-st-changes-wash font-medium text-st-changes' : 'bg-paper text-ink-soft ring-1 ring-rule')}>
                      <ClockIcon size={13} />
                      {dueLabel(r.dueDate, r.daysUntilDue)}
                    </span>
                  )}
                  {kind === 'decided' && (
                    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium', r.status === 'APPROVED' ? 'bg-st-approved-wash text-st-approved' : 'bg-st-changes-wash text-st-changes')}>
                      {r.status === 'APPROVED' ? <BadgeCheckIcon size={13} /> : <RotateCcwIcon size={13} />}
                      {r.status === 'APPROVED' ? 'Approved' : 'Changes requested'}
                    </span>
                  )}
                  {kind === 'sent_overdue' && (
                    <Button size="sm" icon={SendIcon} busy={nudging === r.reviewId} disabled={nudgedToday} title={nudgedToday ? 'Reminded in the last 24 hours' : undefined} onClick={() => onNudge(r.reviewId)}>
                      {nudgedToday ? `Reminded ${timeAgo(r.nudgedAt!)}` : 'Remind reviewer'}
                    </Button>
                  )}
                </div>
              </GlowCard>
            </li>
          </BlurFade>
        );
      })}
    </ul>
  );
}
