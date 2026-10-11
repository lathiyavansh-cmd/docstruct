import { useInfiniteQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import type { ActivityEntryDto } from '@docstruct/shared';
import { ActivityItem } from '../../components/ActivityFeed';
import { ActivityIcon, ClockIcon } from '../../components/icons';
import { Button, EmptyState, ErrorNote, Skeleton } from '../../components/ui';
import { errorMessage, get } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useCurrentProject } from '../../lib/hooks';

const PAGE = 50;

/** Log.View: the project's immutable activity log, newest first, grouped by day. */
export function ActivityPage() {
  const project = useCurrentProject();
  const log = useInfiniteQuery({
    queryKey: ['activity', project.projectId],
    queryFn: ({ pageParam }) => get<ActivityEntryDto[]>(`/projects/${project.projectId}/activity`, { limit: PAGE, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].logId : undefined),
  });

  const entries = log.data?.pages.flat() ?? [];
  const days = new Map<string, ActivityEntryDto[]>();
  for (const e of entries) {
    const day = formatDate(e.createdAt);
    days.set(day, [...(days.get(day) ?? []), e]);
  }

  return (
    <div className="max-w-3xl px-5 py-6 lg:px-8">
      <p className="mb-6 text-sm text-ink-soft">Every significant action in this project. Entries cannot be edited or deleted.</p>
      {log.isLoading && <Skeleton rows={5} />}
      {log.error && <ErrorNote>{errorMessage(log.error)}</ErrorNote>}
      {!log.isLoading && entries.length === 0 && <EmptyState icon={ActivityIcon} title="No activity yet" />}
      {[...days].map(([day, items], d) => (
        <section key={day} className="mb-6">
          <h2 className="sticky top-0 z-20 -mx-1 mb-1 bg-surface/90 px-1 py-1.5 text-[13px] font-medium text-ink-faint backdrop-blur">{day}</h2>
          <ul className="relative">
            {/* The timeline's connector draws itself down the day's entries. */}
            <motion.span
              className="absolute left-[13px] top-4 bottom-4 w-px origin-top bg-gradient-to-b from-primary/40 via-rule-strong to-rule"
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.6, delay: d * 0.1, ease: 'easeOut' }}
              aria-hidden
            />
            {items.map((e, i) => (
              <motion.li
                key={e.logId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.035 + d * 0.1 }}
              >
                <ActivityItem entry={e} as="div" showKind className="rounded-xl transition-colors hover:bg-paper/80" />
              </motion.li>
            ))}
          </ul>
        </section>
      ))}
      {log.hasNextPage && (
        <Button icon={ClockIcon} onClick={() => log.fetchNextPage()} busy={log.isFetchingNextPage}>
          Show older activity
        </Button>
      )}
    </div>
  );
}
