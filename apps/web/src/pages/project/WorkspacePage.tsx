import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { DOCUMENT_STATUSES, REVIEWER_ROLES, STATUS_LABEL, type DocumentDto, type FolderNodeDto, type SearchResultDto } from '@docstruct/shared';
import { FolderTree } from '../../components/FolderTree';
import { useToast } from '../../components/toast';
import { UploadDialog } from '../../components/UploadDialog';
import { AnimateIcon, ArrowRightIcon, CloudUploadIcon, SearchIcon, UploadIcon, XIcon } from '../../components/icons';
import { AnimatedBackground } from '../../components/motion-primitives/animated-background';
import { Button, EmptyState, ErrorNote, Input, Select, Skeleton, StatusBadge } from '../../components/ui';
import { errorMessage, get } from '../../lib/api';
import { formatDate, timeAgo } from '../../lib/format';
import { useCan, useCurrentProject, useMembers } from '../../lib/hooks';

function findFolder(nodes: FolderNodeDto[], id: string | null): FolderNodeDto | null {
  for (const n of nodes) {
    if (n.folderId === id) return n;
    const hit = findFolder(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Snippet with [[matched]] words highlighted, built from text nodes only (no HTML injection). */
function Snippet({ text }: { text: string }) {
  return (
    <span className="mt-1 line-clamp-2 block font-serif text-[13.5px] text-ink-soft">
      {text.split(/(\[\[.*?\]\])/g).map((part, i) =>
        part.startsWith('[[') ? (
          <mark key={i} className="rounded-sm bg-mark-insert px-0.5 text-ink">{part.slice(2, -2)}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

/** M03 workspace (UI-4) with M08 search and filters (UI-9). */
export function WorkspacePage() {
  const project = useCurrentProject();
  const allowed = useCan(project);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const members = useMembers(project.projectId);
  const [uploading, setUploading] = useState(false);

  const folderId = params.get('folder');
  const filters = {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    reviewerId: params.get('reviewer') ?? '',
    updatedFrom: params.get('from') ?? '',
    updatedTo: params.get('to') ?? '',
  };
  const filtering = Object.values(filters).some(Boolean);
  const [term, setTerm] = useState(filters.q);
  useEffect(() => setTerm(filters.q), [filters.q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const folders = useQuery({ queryKey: ['folders', project.projectId], queryFn: () => get<FolderNodeDto[]>(`/projects/${project.projectId}/folders`) });
  const docs = useQuery({
    queryKey: ['documents', project.projectId, folderId, filters],
    queryFn: async (): Promise<Array<{ document: DocumentDto; snippet?: string | null }>> => {
      if (filtering) {
        const results = await get<SearchResultDto[]>(`/projects/${project.projectId}/search`, {
          q: filters.q,
          status: filters.status,
          reviewerId: filters.reviewerId,
          updatedFrom: filters.updatedFrom,
          updatedTo: filters.updatedTo,
          folderId: folderId ?? undefined,
        });
        return results.map((r) => ({ document: r.document, snippet: r.snippet }));
      }
      const list = await get<DocumentDto[]>(`/projects/${project.projectId}/documents`, folderId ? { folderId } : undefined);
      return list.map((document) => ({ document }));
    },
  });

  const folder = findFolder(folders.data ?? [], folderId);
  const reviewers = members.data?.filter((m) => REVIEWER_ROLES.includes(m.role)) ?? [];

  return (
    <div className="grid lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-rule px-4 py-5 lg:min-h-[calc(100vh-9rem)] lg:border-b-0 lg:border-r">
        {folders.data && (
          <FolderTree projectId={project.projectId} tree={folders.data} selected={folderId} canEdit={allowed('folder.create')} canDelete={allowed('folder.delete')} />
        )}
      </aside>

      <section className="min-w-0 px-5 py-5 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{folder ? folder.name : 'All documents'}</h2>
          {allowed('document.create') && (
            <Button variant="primary" icon={UploadIcon} onClick={() => setUploading(true)}>
              Upload
            </Button>
          )}
        </div>

        <div className="mb-5 space-y-3 rounded-2xl border border-rule bg-paper/70 p-3">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setParam('q', term.trim());
            }}
            className="relative"
          >
            <SearchIcon size={16} animate={term.length > 0} className="pointer-events-none absolute left-3 top-2.5 text-ink-faint" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={folder ? `Search titles and text in ${folder.name} and its subfolders` : 'Search titles and document text'}
              aria-label="Search documents"
              className="pl-9"
            />
          </form>
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Status" value={filters.status} onChange={(e) => setParam('status', e.target.value)} className="w-auto min-w-36">
              <option value="">Any status</option>
              {DOCUMENT_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
            <Select aria-label="Reviewer" value={filters.reviewerId} onChange={(e) => setParam('reviewer', e.target.value)} className="w-auto min-w-40">
              <option value="">Any reviewer</option>
              {reviewers.map((m) => (
                <option key={m.userId} value={m.userId}>Reviewed by {m.displayName}</option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              Updated from
              <Input type="date" value={filters.updatedFrom} onChange={(e) => setParam('from', e.target.value)} className="w-auto" />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-ink-soft">
              to
              <Input type="date" value={filters.updatedTo} onChange={(e) => setParam('to', e.target.value)} className="w-auto" />
            </label>
            {filtering && (
              <Button
                variant="quiet"
                size="sm"
                icon={XIcon}
                onClick={() => {
                  const next = new URLSearchParams();
                  if (folderId) next.set('folder', folderId);
                  setParams(next, { replace: true });
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {docs.isLoading && <Skeleton rows={4} />}
        {docs.error && <ErrorNote>{errorMessage(docs.error)}</ErrorNote>}
        {docs.data?.length === 0 &&
          (filtering ? (
            <EmptyState icon={SearchIcon} title="No documents match">Try a different search term or remove a filter.</EmptyState>
          ) : (
            <EmptyState
              icon={CloudUploadIcon}
              title={folder ? `${folder.name} is empty` : 'No documents yet'}
              action={allowed('document.create') && <Button variant="primary" icon={UploadIcon} onClick={() => setUploading(true)}>Upload a document</Button>}
            >
              Uploaded documents start as drafts at version 1.
            </EmptyState>
          ))}
        {!!docs.data?.length && (
          <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-card">
            <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-rule bg-paper/70 px-5 py-2 text-[12.5px] font-medium text-ink-soft sm:grid-cols-[1fr_9.5rem_4rem_6.5rem_1rem]">
              <span>Document</span>
              <span>Status</span>
              <span className="hidden sm:block">Version</span>
              <span className="hidden text-right sm:block">Updated</span>
            </div>
            <div className="flex flex-col p-1.5">
              {/* The hover highlight glides from row to row (motion-primitives AnimatedBackground). */}
              <AnimatedBackground enableHover className="rounded-xl bg-primary-wash/70" transition={{ type: 'spring', bounce: 0.12, duration: 0.3 }}>
                {docs.data.map(({ document: d, snippet }) => (
                  <Link key={d.documentId} data-id={d.documentId} to={`/d/${d.documentId}`} className="group w-full rounded-xl px-3.5 py-3 text-sm">
                    <AnimateIcon animateOnHover asChild>
                      <span className="grid w-full grid-cols-[1fr_auto] items-center gap-4 sm:grid-cols-[1fr_9.5rem_4rem_6.5rem_1rem]">
                        <span className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-faint ring-1 ring-rule transition-[color,transform] duration-200 group-hover:-rotate-6 group-hover:text-primary">
                            {d.currentVersion.mimeType.startsWith('image/') ? <ImageIcon className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium transition-colors group-hover:text-primary">{d.title}</span>
                            {d.openReview && (
                              <span className="block text-[13px] text-ink-soft">
                                With {d.openReview.reviewer.displayName}
                                {d.openReview.dueDate && `, due ${formatDate(d.openReview.dueDate)}`}
                              </span>
                            )}
                            {snippet && <Snippet text={snippet} />}
                          </span>
                        </span>
                        <span><StatusBadge status={d.status} /></span>
                        <span className="hidden text-ink-soft tabular sm:block">v{d.currentVersion.versionNo}</span>
                        <span className="hidden whitespace-nowrap text-right text-ink-faint sm:block">{timeAgo(d.updatedAt)}</span>
                        <span className="hidden text-primary opacity-0 transition-opacity group-hover:opacity-100 sm:block">
                          <ArrowRightIcon size={15} />
                        </span>
                      </span>
                    </AnimateIcon>
                  </Link>
                ))}
              </AnimatedBackground>
            </div>
          </div>
        )}
      </section>

      {uploading && (
        <UploadDialog
          projectId={project.projectId}
          mode={{ kind: 'document' }}
          folders={folders.data}
          folderId={folderId}
          onClose={() => setUploading(false)}
          onDone={(doc) => {
            for (const key of [['documents', project.projectId], ['folders', project.projectId], ['dashboard', project.projectId]]) queryClient.invalidateQueries({ queryKey: key });
            toast(`Uploaded ${doc.title}`);
            navigate(`/d/${doc.documentId}`);
          }}
        />
      )}
    </div>
  );
}
