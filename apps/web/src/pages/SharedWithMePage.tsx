/**
 * What this file does
 *   The "Shared with me" page: every document a project owner sent to the logged-in user, newest first.
 *
 * How it works
 *   - useQuery ['shared-with-me'] loads GET /me/shared (the same key gives the unread count in the sidebar).
 *   - Unread entries are highlighted; opening the document marks it read (DocumentPage posts /shared/read).
 *   - Password-protected documents show a lock; they still ask for the password when opened.
 *
 * Where it fits
 *   Route /shared in App.tsx, linked from the sidebar. Module: M07 Sharing (owner: Shrut).
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SharedWithMeDto } from '@docstruct/shared';
import { AnimateIcon, ArrowRightIcon, LockIcon, SendIcon } from '../components/icons';
import { BlurFade } from '../components/magicui/blur-fade';
import { Avatar, EmptyState, ErrorNote, GlowCard, PageHeader, Skeleton, StatusBadge, cx } from '../components/ui';
import { errorMessage, get } from '../lib/api';
import { timeAgo } from '../lib/format';

export function SharedWithMePage() {
  const shared = useQuery({ queryKey: ['shared-with-me'], queryFn: () => get<SharedWithMeDto[]>('/me/shared') });
  const unread = shared.data?.filter((s) => !s.readAt).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader title="Shared with me">
        Documents project owners sent to you{unread > 0 && <>, {unread} not opened yet</>}.
      </PageHeader>
      {shared.isLoading && <Skeleton rows={3} />}
      {shared.error && <ErrorNote>{errorMessage(shared.error)}</ErrorNote>}
      {shared.data?.length === 0 && (
        <EmptyState icon={SendIcon} title="Nothing shared with you yet">
          When a project owner sends a document to all members, it appears here.
        </EmptyState>
      )}
      {!!shared.data?.length && (
        <ul className="space-y-3">
          {shared.data.map((s, i) => (
            <BlurFade key={s.document.documentId} delay={0.04 + i * 0.04}>
              <li>
                <AnimateIcon animateOnHover asChild>
                  <Link to={`/d/${s.document.documentId}`} className="group block rounded-xl">
                    <GlowCard className={cx(!s.readAt && 'ring-2 ring-primary/25')}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                        <Avatar name={s.sharedBy.displayName} />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 font-medium transition-colors group-hover:text-primary">
                            {!s.readAt && <span className="size-2 rounded-full bg-primary" aria-label="Not opened yet" />}
                            {s.document.title}
                            {s.document.isProtected && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary-wash px-2 py-0.5 text-[11.5px] font-medium text-primary">
                                <LockIcon size={11} /> Password
                              </span>
                            )}
                          </p>
                          <p className="text-[13px] text-ink-soft">
                            {s.projectName}, sent by {s.sharedBy.displayName} {timeAgo(s.sharedAt)}
                          </p>
                          {s.note && <p className="mt-1 line-clamp-2 font-serif text-sm text-ink-soft">“{s.note}”</p>}
                        </div>
                        <StatusBadge status={s.document.status} />
                        <span className="text-primary transition-transform duration-200 group-hover:translate-x-1">
                          <ArrowRightIcon size={16} />
                        </span>
                      </div>
                    </GlowCard>
                  </Link>
                </AnimateIcon>
              </li>
            </BlurFade>
          ))}
        </ul>
      )}
    </div>
  );
}
