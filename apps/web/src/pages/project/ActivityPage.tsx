import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActivityEntryDto } from '@docstruct/shared';
import { ActivityItem } from '../../components/ActivityFeed';
import { Button, EmptyState, ErrorNote, Spinner } from '../../components/ui';
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
      {log.isLoading && <Spinner />}
      {log.error && <ErrorNote>{errorMessage(log.error)}</ErrorNote>}
      {!log.isLoading && entries.length === 0 && <EmptyState title="No activity yet" />}
      {[...days].map(([day, items]) => (
        <section key={day} className="mb-6">
          <h2 className="sticky top-0 bg-surface py-1.5 text-[13px] font-medium text-ink-faint">{day}</h2>
          <ul className="divide-y divide-rule">
            {items.map((e) => (
              <ActivityItem key={e.logId} entry={e} />
            ))}
          </ul>
        </section>
      ))}
      {log.hasNextPage && (
        <Button onClick={() => log.fetchNextPage()} busy={log.isFetchingNextPage}>
          Show older activity
        </Button>
      )}
    </div>
  );
}
