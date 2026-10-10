import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SearchResultDto } from '@docstruct/shared';
import { EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { errorMessage, get } from '../lib/api';
import { timeAgo } from '../lib/format';

/** Search across all of the user's projects - and only those (Search.Scope). */
export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const results = useQuery({ queryKey: ['search', q], queryFn: () => get<SearchResultDto[]>('/search', { q }), enabled: !!q });

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader title={q ? `Results for “${q}”` : 'Search'}>Titles and document text in every project you belong to, best matches first.</PageHeader>
      {results.isLoading && <Spinner label="Searching" />}
      {results.error && <ErrorNote>{errorMessage(results.error)}</ErrorNote>}
      {results.data?.length === 0 && <EmptyState title="No matches">Check the spelling, or try fewer or different words.</EmptyState>}
      <ul className="divide-y divide-rule">
        {results.data?.map((r) => (
          <li key={r.document.documentId} className="py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`/d/${r.document.documentId}`} className="font-medium text-ink hover:text-primary">{r.document.title}</Link>
              <StatusBadge status={r.document.status} />
            </div>
            <p className="text-[13px] text-ink-soft">
              {r.projectName}, version {r.document.currentVersion.versionNo}, updated {timeAgo(r.document.updatedAt)}, matched in {r.matchedIn.join(' and ')}
            </p>
            {r.snippet && (
              <p className="mt-1.5 font-serif text-[14px] text-ink-soft">
                {r.snippet.split(/(\[\[.*?\]\])/g).map((part, i) =>
                  part.startsWith('[[') ? <mark key={i} className="rounded-sm bg-mark-insert px-0.5 text-ink">{part.slice(2, -2)}</mark> : <span key={i}>{part}</span>,
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
