import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import type { ChangeDto, DiffDto, DocumentDetailDto, VersionDto } from '@docstruct/shared';
import { FindingList, SummaryText } from '../components/PreReview';
import { ErrorNote, MachineLabel, Notice, Select, Spinner, cx } from '../components/ui';
import { errorMessage, get } from '../lib/api';

const KIND_LABEL = { ADDED: 'Added', DELETED: 'Removed', MODIFIED: 'Edited' } as const;

/** Word-level rendering of an edited paragraph: insertions highlighted, deletions struck through. */
function Words({ change }: { change: ChangeDto }) {
  return (
    <p className="font-serif text-[15px] leading-[1.75]">
      {(change.words ?? []).map((w, i) =>
        w.op === 'equal' ? (
          <span key={i}>{w.text}</span>
        ) : w.op === 'insert' ? (
          <ins key={i} className="rounded-sm bg-mark-insert px-0.5 no-underline decoration-mark-insert-rule">{w.text}</ins>
        ) : (
          <del key={i} className="rounded-sm bg-mark-delete px-0.5 text-ink-soft decoration-mark-delete-rule">{w.text}</del>
        ),
      )}
    </p>
  );
}

function ChangeBlock({ change, index }: { change: ChangeDto; index: number }) {
  const rule = change.kind === 'ADDED' ? 'border-mark-insert-rule' : change.kind === 'DELETED' ? 'border-mark-delete-rule' : 'border-ink-faint';
  return (
    <article id={`change-${change.kind}-${change.position}`} className={cx('border-l-[3px] py-1 pl-4', rule, !change.isSubstantive && 'opacity-70')}>
      <p className="mb-1 text-[12.5px] text-ink-faint">
        <span className="tabular">{index + 1}.</span> {KIND_LABEL[change.kind]}
        {change.section && <> in {change.section}</>}
        {!change.isSubstantive && <>, formatting only</>}
        {change.kind === 'MODIFIED' && change.isSubstantive && <>, {Math.round(change.similarity * 100)}% unchanged</>}
      </p>
      {change.kind === 'MODIFIED' && <Words change={change} />}
      {change.kind === 'ADDED' && (
        <p className="font-serif text-[15px] leading-[1.75]">
          <ins className="rounded-sm bg-mark-insert px-0.5 no-underline">{change.newText}</ins>
        </p>
      )}
      {change.kind === 'DELETED' && (
        <p className="font-serif text-[15px] leading-[1.75]">
          <del className="rounded-sm bg-mark-delete px-0.5 text-ink-soft">{change.oldText}</del>
        </p>
      )}
    </article>
  );
}

/** UI-6 / Diff.Compare.*: two chosen versions, the differences between them and the change summary. */
export function ComparePage() {
  const { documentId } = useParams();
  const [params, setParams] = useSearchParams();
  const [showCosmetic, setShowCosmetic] = useState(false);
  const doc = useQuery({ queryKey: ['document', documentId], queryFn: () => get<DocumentDetailDto>(`/documents/${documentId}`) });
  const versions = useQuery({ queryKey: ['versions', documentId], queryFn: () => get<VersionDto[]>(`/documents/${documentId}/versions`) });

  const from = params.get('from') ?? versions.data?.[1]?.versionId ?? '';
  const to = params.get('to') ?? versions.data?.[0]?.versionId ?? '';
  const diff = useQuery({
    queryKey: ['diff', documentId, from, to],
    queryFn: () => get<DiffDto>(`/documents/${documentId}/compare`, { from, to }),
    enabled: !!from && !!to && from !== to,
    // PE-7: show progress while the versions' text is still being read, then the stored result.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 1500 : false),
  });

  const changes = useMemo(() => (diff.data?.changes ?? []).filter((c) => showCosmetic || c.isSubstantive), [diff.data, showCosmetic]);
  const pick = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params);
    next.set('from', from);
    next.set('to', to);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  if (doc.isLoading || versions.isLoading) return <Spinner />;
  if (doc.error || !doc.data) return <div className="p-8"><ErrorNote>{errorMessage(doc.error)}</ErrorNote></div>;
  const list = versions.data ?? [];
  const d = diff.data;

  return (
    <div className="px-5 py-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-sm text-ink-soft">
        <Link to={`/d/${documentId}`} className="hover:text-ink">{doc.data.title}</Link>
        <ChevronRight className="size-3.5" aria-hidden /> Compare versions
      </nav>

      <div className="mb-6 flex flex-wrap items-end gap-3 border-b border-rule pb-5">
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">Earlier version</span>
          <Select value={from} onChange={(e) => pick('from', e.target.value)} className="w-52">
            {list.map((v) => (
              <option key={v.versionId} value={v.versionId}>Version {v.versionNo}{v.changeNote ? `: ${v.changeNote.slice(0, 30)}` : ''}</option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">Later version</span>
          <Select value={to} onChange={(e) => pick('to', e.target.value)} className="w-52">
            {list.map((v) => (
              <option key={v.versionId} value={v.versionId}>Version {v.versionNo}{v.isCurrent ? ' (current)' : ''}</option>
            ))}
          </Select>
        </label>
        {d?.stats && (
          <p className="pb-2 text-sm text-ink-soft tabular">
            <span className="text-mark-insert-rule">+{d.stats.added}</span> added, {d.stats.modified - d.stats.cosmetic} edited,{' '}
            <span className="text-mark-delete-rule">−{d.stats.deleted}</span> removed, {d.stats.cosmetic} formatting only
          </p>
        )}
      </div>

      {list.length < 2 && <Notice>This document has a single version, so there is nothing to compare yet.</Notice>}
      {from === to && list.length >= 2 && <Notice>Choose two different versions.</Notice>}
      {diff.isLoading && <Spinner label="Comparing the versions" />}
      {diff.error && <ErrorNote>{errorMessage(diff.error)}</ErrorNote>}
      {d?.status === 'PENDING' && <Spinner label="Reading the text of both versions" />}
      {d?.status === 'UNAVAILABLE' && <Notice>{d.reason}</Notice>}

      {d?.status === 'READY' && (
        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section aria-label="Differences" className="min-w-0 max-w-[80ch]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                Changes from version {d.from.versionNo} to version {d.to.versionNo}
              </h2>
              {d.stats!.cosmetic > 0 && (
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" checked={showCosmetic} onChange={(e) => setShowCosmetic(e.target.checked)} className="accent-primary" />
                  Show formatting-only changes
                </label>
              )}
            </div>
            {changes.length === 0 ? (
              <Notice>{d.stats!.total === 0 ? 'The two versions have the same text.' : 'Only formatting changed between these versions.'}</Notice>
            ) : (
              <div className="space-y-5">
                {changes.map((c, i) => (
                  <ChangeBlock key={`${c.kind}-${c.position}-${i}`} change={c} index={i} />
                ))}
              </div>
            )}
          </section>
          <aside className="min-w-0 space-y-6 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
            <section className="rounded-lg border border-rule p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Summary</h2>
                <MachineLabel />
              </div>
              {d.summary && <SummaryText summary={d.summary} />}
            </section>
            <section className="rounded-lg border border-rule p-4">
              <h2 className="mb-3 font-semibold">Pre-review findings</h2>
              <FindingList findings={d.findings} />
              <p className="mt-4 text-[12.5px] text-ink-faint">
                Produced by DocStruct's comparison engine ({d.engine}). Findings point at changes worth a careful look; they do not approve or reject anything.
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
