import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Image as ImageIcon, Search, Upload, X } from 'lucide-react';
import { DOCUMENT_STATUSES, REVIEWER_ROLES, STATUS_LABEL, type DocumentDto, type FolderNodeDto, type SearchResultDto } from '@docstruct/shared';
import { FolderTree } from '../../components/FolderTree';
import { useToast } from '../../components/toast';
import { UploadDialog } from '../../components/UploadDialog';
import { Button, EmptyState, ErrorNote, Input, Select, Spinner, StatusBadge } from '../../components/ui';
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
    <p className="mt-1 line-clamp-2 font-serif text-[13.5px] text-ink-soft">
      {text.split(/(\[\[.*?\]\])/g).map((part, i) =>
        part.startsWith('[[') ? (
          <mark key={i} className="rounded-sm bg-mark-insert px-0.5 text-ink">{part.slice(2, -2)}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
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
            <Button variant="primary" onClick={() => setUploading(true)}>
              <Upload className="size-4" /> Upload
            </Button>
          )}
        </div>

        <div className="mb-5 space-y-3 rounded-lg bg-paper p-3">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setParam('q', term.trim());
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-faint" aria-hidden />
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
                onClick={() => {
                  const next = new URLSearchParams();
                  if (folderId) next.set('folder', folderId);
                  setParams(next, { replace: true });
                }}
              >
                <X className="size-3.5" /> Clear filters
              </Button>
            )}
          </div>
        </div>

        {docs.isLoading && <Spinner />}
        {docs.error && <ErrorNote>{errorMessage(docs.error)}</ErrorNote>}
        {docs.data?.length === 0 &&
          (filtering ? (
            <EmptyState title="No documents match">Try a different search term or remove a filter.</EmptyState>
          ) : (
            <EmptyState
              title={folder ? `${folder.name} is empty` : 'No documents yet'}
              action={allowed('document.create') && <Button variant="primary" onClick={() => setUploading(true)}>Upload a document</Button>}
            >
              Uploaded documents start as drafts at version 1.
            </EmptyState>
          ))}
        {!!docs.data?.length && (
          <div className="overflow-x-auto rounded-lg border border-rule">
            <table className="w-full text-sm">
              <thead className="bg-paper text-left text-[13px] text-ink-soft">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Document</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Version</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {docs.data.map(({ document: d, snippet }) => (
                  <tr key={d.documentId} className="cursor-pointer hover:bg-paper/60" onClick={() => navigate(`/d/${d.documentId}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        {d.currentVersion.mimeType.startsWith('image/') ? (
                          <ImageIcon className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
                        ) : (
                          <FileText className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
                        )}
                        <div className="min-w-0">
                          <Link to={`/d/${d.documentId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">
                            {d.title}
                          </Link>
                          {d.openReview && (
                            <p className="text-[13px] text-ink-soft">
                              With {d.openReview.reviewer.displayName}
                              {d.openReview.dueDate && `, due ${formatDate(d.openReview.dueDate)}`}
                            </p>
                          )}
                          {snippet && <Snippet text={snippet} />}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="hidden px-4 py-3 text-ink-soft md:table-cell tabular">v{d.currentVersion.versionNo}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right text-ink-faint sm:table-cell">{timeAgo(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
