import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SearchResultDto } from '@docstruct/shared';
import { AnimateIcon, ArrowRightIcon, SearchIcon } from '../components/icons';
import { BlurFade } from '../components/magicui/blur-fade';
import { AnimatedBackground } from '../components/motion-primitives/animated-background';
import { EmptyState, ErrorNote, Input, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { errorMessage, get } from '../lib/api';
import { timeAgo } from '../lib/format';

/** Search across all of the user's projects - and only those (Search.Scope). */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [term, setTerm] = useState(q);
  useEffect(() => setTerm(q), [q]);
  const results = useQuery({ queryKey: ['search', q], queryFn: () => get<SearchResultDto[]>('/search', { q }), enabled: !!q });

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader title={q ? `Results for “${q}”` : 'Search'}>Titles and document text in every project you belong to, best matches first.</PageHeader>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (term.trim()) setParams({ q: term.trim() });
        }}
        className="relative mb-6"
      >
        <SearchIcon size={18} animate={term.length > 0} className="pointer-events-none absolute left-3.5 top-3 text-primary" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search titles and document text"
          aria-label="Search all projects"
          autoFocus={!q}
          className="h-11 rounded-xl pl-10 text-[15px]"
        />
      </form>
      {results.isLoading && <Skeleton rows={4} />}
      {results.error && <ErrorNote>{errorMessage(results.error)}</ErrorNote>}
      {!q && <EmptyState icon={SearchIcon} title="Search every project you belong to">Type a word or phrase from a title or from the text inside a document.</EmptyState>}
      {results.data?.length === 0 && <EmptyState icon={SearchIcon} title="No matches">Check the spelling, or try fewer or different words.</EmptyState>}
      {!!results.data?.length && (
        <BlurFade>
          <div className="flex flex-col">
            {/* The highlight follows the pointer from result to result. */}
            <AnimatedBackground enableHover className="rounded-xl bg-primary-wash/70" transition={{ type: 'spring', bounce: 0.12, duration: 0.3 }}>
              {results.data.map((r) => (
                <Link key={r.document.documentId} data-id={r.document.documentId} to={`/d/${r.document.documentId}`} className="group w-full rounded-xl px-4 py-3.5">
                  <AnimateIcon animateOnHover asChild>
                    <span className="block w-full">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink transition-colors group-hover:text-primary">{r.document.title}</span>
                        <StatusBadge status={r.document.status} />
                        <span className="ml-auto text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          <ArrowRightIcon size={15} />
                        </span>
                      </span>
                      <span className="block text-[13px] text-ink-soft">
                        {r.projectName}, version {r.document.currentVersion.versionNo}, updated {timeAgo(r.document.updatedAt)}, matched in {r.matchedIn.join(' and ')}
                      </span>
                      {r.snippet && (
                        <span className="mt-1.5 block font-serif text-[14px] text-ink-soft">
                          {r.snippet.split(/(\[\[.*?\]\])/g).map((part, i) =>
                            part.startsWith('[[') ? <mark key={i} className="rounded-sm bg-mark-insert px-0.5 text-ink">{part.slice(2, -2)}</mark> : <span key={i}>{part}</span>,
                          )}
                        </span>
                      )}
                    </span>
                  </AnimateIcon>
                </Link>
              ))}
            </AnimatedBackground>
          </div>
        </BlurFade>
      )}
    </div>
  );
}
