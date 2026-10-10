import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, Upload } from 'lucide-react';
import { formatBytes, type AnnotationDto, type DocumentDetailDto, type FolderNodeDto, type RegionDto, type VersionDto } from '@docstruct/shared';
import { AnnotationsPanel } from '../components/AnnotationsPanel';
import { DocumentPreview, downloadVersion } from '../components/DocumentPreview';
import { ReviewPanel } from '../components/ReviewPanel';
import { SharePanel } from '../components/SharePanel';
import { useToast } from '../components/toast';
import { UploadDialog } from '../components/UploadDialog';
import { Button, ConfirmDialog, ErrorNote, Field, Input, Modal, Notice, Select, Spinner, StatusBadge, TextArea, cx } from '../components/ui';
import { del, errorMessage, get, patch, post } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useCan, useProject } from '../lib/hooks';

type RailTab = 'review' | 'comments' | 'sharing';

function flatten(nodes: FolderNodeDto[], depth = 0): Array<FolderNodeDto & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

/** UI-5: preview, version history, review status and comments of one document in a single view. */
export function DocumentPage() {
  const { documentId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  const doc = useQuery({ queryKey: ['document', documentId], queryFn: () => get<DocumentDetailDto>(`/documents/${documentId}`) });
  const project = useProject(doc.data?.projectId);
  const allowed = useCan(project.data);
  const versions = useQuery({ queryKey: ['versions', documentId], queryFn: () => get<VersionDto[]>(`/documents/${documentId}/versions`), enabled: !!doc.data });

  const viewingId = params.get('v');
  const viewing = versions.data?.find((v) => v.versionId === viewingId) ?? null;
  const shownVersion = viewing ?? doc.data?.currentVersion ?? null;

  const annotations = useQuery({
    queryKey: ['annotations', shownVersion?.versionId],
    queryFn: () => get<AnnotationDto[]>(`/versions/${shownVersion!.versionId}/annotations`),
    enabled: !!shownVersion,
  });

  const [tab, setTab] = useState<RailTab>('review');
  const [placing, setPlacing] = useState(false);
  const [anchor, setAnchor] = useState<{ page: number; region: RegionDto } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'upload' | 'edit' | 'move' | 'delete' | 'archive' | null>(null);

  if (doc.isLoading || (doc.data && project.isLoading)) return <Spinner />;
  if (doc.error || !doc.data || !project.data) return <div className="p-8"><ErrorNote>{errorMessage(doc.error ?? project.error)}</ErrorNote></div>;
  const d = doc.data;
  const p = project.data;
  const current = d.currentVersion;
  const isPdf = shownVersion?.mimeType === 'application/pdf';

  const refresh = () => {
    for (const key of [['document', d.documentId], ['versions', d.documentId], ['documents', p.projectId], ['dashboard', p.projectId], ['folders', p.projectId]]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
  const onView = (versionId: string | null) => {
    const next = new URLSearchParams(params);
    if (versionId && versionId !== current.versionId) next.set('v', versionId);
    else next.delete('v');
    setParams(next);
  };

  const tabs: Array<{ id: RailTab; label: string }> = [
    { id: 'review', label: 'Review' },
    { id: 'comments', label: `Comments${annotations.data?.filter((a) => !a.resolvedAt).length ? ` (${annotations.data.filter((a) => !a.resolvedAt).length})` : ''}` },
    ...(allowed('share.list') ? [{ id: 'sharing' as const, label: 'Sharing' }] : []),
  ];
  const canUpload = allowed('version.create') && d.status !== 'UNDER_REVIEW' && d.status !== 'ARCHIVED';

  return (
    <div className="px-5 py-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-sm text-ink-soft">
        <Link to={`/p/${p.projectId}`} className="hover:text-ink">{p.name}</Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link to={`/p/${p.projectId}/documents`} className="hover:text-ink">Documents</Link>
        {d.folderPath.map((f) => (
          <span key={f.folderId} className="flex items-center gap-1">
            <ChevronRight className="size-3.5" aria-hidden />
            <Link to={`/p/${p.projectId}/documents?folder=${f.folderId}`} className="hover:text-ink">{f.name}</Link>
          </span>
        ))}
      </nav>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
            <StatusBadge status={d.status} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            <span className="font-medium text-ink tabular">Version {current.versionNo}</span> is current, uploaded by {current.uploadedBy.displayName} on{' '}
            {formatDateTime(current.createdAt)} ({current.fileName}, {formatBytes(current.byteSize)})
          </p>
          {d.description && <p className="mt-2 max-w-3xl text-sm">{d.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpload && (
            <Button variant="primary" onClick={() => setDialog('upload')}>
              <Upload className="size-4" /> Upload new version
            </Button>
          )}
          <Button onClick={() => downloadVersion(shownVersion!.versionId)}>
            <Download className="size-4" /> Download{viewing ? ` v${viewing.versionNo}` : ''}
          </Button>
          <DocumentMenu
            items={[
              allowed('document.update') && d.status !== 'ARCHIVED' && { label: 'Edit details', onClick: () => setDialog('edit') },
              allowed('document.move') && { label: 'Move to folder', onClick: () => setDialog('move') },
              allowed('document.archive') && d.status !== 'ARCHIVED' && d.status !== 'UNDER_REVIEW' && { label: 'Archive', onClick: () => setDialog('archive') },
              allowed('document.delete') && { label: 'Delete', onClick: () => setDialog('delete'), danger: true },
            ]}
          />
        </div>
      </header>

      {d.status === 'UNDER_REVIEW' && allowed('version.create') && (
        <Notice className="mb-4">This document is under review. New versions can be uploaded after the review is completed or cancelled.</Notice>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          {viewing && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-st-review/40 bg-st-review-wash px-3 py-2 text-sm">
              <span>
                You are viewing <strong className="font-medium">version {viewing.versionNo}</strong>. The current version is {current.versionNo}.
              </span>
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => onView(null)}>
                Show the current version
              </button>
            </div>
          )}
          {placing && (
            <Notice className="mb-3 flex items-center justify-between">
              <span>Drag a box on a page to pin your comment, or click a spot.</span>
              <button type="button" className="text-primary hover:underline" onClick={() => setPlacing(false)}>Cancel</button>
            </Notice>
          )}
          {shownVersion && (
            <DocumentPreview
              versionId={shownVersion.versionId}
              annotations={annotations.data ?? []}
              placing={placing}
              onPlace={(page, region) => {
                setAnchor({ page, region });
                setPlacing(false);
                setTab('comments');
              }}
              activeId={activeId}
              onSelect={(id) => {
                setActiveId(id);
                setTab('comments');
              }}
            />
          )}
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="mb-4 flex gap-4 border-b border-rule" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cx('-mb-px whitespace-nowrap border-b-2 pb-2 text-sm', tab === t.id ? 'border-ink font-medium' : 'border-transparent text-ink-soft hover:text-ink')}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'review' && <ReviewPanel document={d} project={p} />}
          {tab === 'comments' && shownVersion && (
            <AnnotationsPanel
              documentId={d.documentId}
              versionId={shownVersion.versionId}
              versionNo={shownVersion.versionNo}
              isCurrent={!viewing}
              isPdf={isPdf}
              threads={annotations.data ?? []}
              canCreate={allowed('annotation.create') && d.status !== 'ARCHIVED'}
              canReply={allowed('annotation.reply')}
              canResolve={allowed('annotation.resolve')}
              placing={placing}
              anchor={anchor}
              onStartPlacing={() => setPlacing(true)}
              onClearAnchor={() => setAnchor(null)}
              activeId={activeId}
              onSelect={setActiveId}
            />
          )}
          {tab === 'sharing' && <SharePanel documentId={d.documentId} />}
        </aside>
      </div>

      {dialog === 'upload' && (
        <UploadDialog
          projectId={p.projectId}
          mode={{ kind: 'version', documentId: d.documentId, title: d.title }}
          onClose={() => setDialog(null)}
          onDone={(updated) => {
            refresh();
            onView(null);
            setDialog(null);
            toast(`Uploaded version ${updated.currentVersion.versionNo}`);
          }}
        />
      )}
      {dialog === 'edit' && <EditDetails document={d} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'move' && <MoveDocument document={d} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === 'archive' && (
        <SimpleAction
          title={`Archive ${d.title}?`}
          label="Archive"
          text="The document stays readable, searchable and downloadable, but no one can upload versions, comment or send it for review again."
          run={() => post(`/documents/${d.documentId}/archive`)}
          done={() => {
            refresh();
            toast('Archived');
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <SimpleAction
          title={`Delete ${d.title}?`}
          label="Delete document"
          danger
          text="The document is removed from the project for everyone. Its activity history is kept for the audit log."
          run={() => del(`/documents/${d.documentId}`)}
          done={() => {
            refresh();
            toast(`Deleted ${d.title}`);
            navigate(`/p/${p.projectId}/documents`);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function DocumentMenu({ items }: { items: Array<false | { label: string; onClick: () => void; danger?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const visible = items.filter(Boolean) as Array<{ label: string; onClick: () => void; danger?: boolean }>;
  if (!visible.length) return null;
  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)} aria-haspopup="menu" aria-expanded={open}>
        More
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-rule bg-surface py-1 shadow-lg">
          {visible.map((it) => (
            <button key={it.label} role="menuitem" onMouseDown={it.onClick} className={cx('block w-full px-3 py-1.5 text-left text-sm hover:bg-paper', it.danger && 'text-st-changes')}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleAction({ title, label, text, danger, run, done, onClose }: { title: string; label: string; text: string; danger?: boolean; run: () => Promise<unknown>; done: () => void; onClose: () => void }) {
  const action = useMutation({ mutationFn: run, onSuccess: () => { done(); onClose(); } });
  return (
    <ConfirmDialog title={title} confirmLabel={label} danger={danger} busy={action.isPending} onConfirm={() => action.mutate()} onClose={onClose}>
      {action.error && <ErrorNote className="mb-3">{errorMessage(action.error)}</ErrorNote>}
      {text}
    </ConfirmDialog>
  );
}

function EditDetails({ document: d, onClose, onDone }: { document: DocumentDetailDto; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(d.title);
  const [description, setDescription] = useState(d.description);
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => patch(`/documents/${d.documentId}`, { title, description }),
    onSuccess: () => {
      onDone();
      toast('Details saved');
      onClose();
    },
  });
  return (
    <Modal title="Edit details" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={save.isPending} disabled={!title.trim()} onClick={() => save.mutate()}>Save details</Button></>}>
      {save.error && <ErrorNote>{errorMessage(save.error)}</ErrorNote>}
      <Field label="Title">{(id) => <Input id={id} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
      <Field label="Description">{(id) => <TextArea id={id} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
    </Modal>
  );
}

function MoveDocument({ document: d, onClose, onDone }: { document: DocumentDetailDto; onClose: () => void; onDone: () => void }) {
  const folders = useQuery({ queryKey: ['folders', d.projectId], queryFn: () => get<FolderNodeDto[]>(`/projects/${d.projectId}/folders`) });
  const [target, setTarget] = useState(d.folderId ?? '');
  const toast = useToast();
  const move = useMutation({
    mutationFn: () => post(`/documents/${d.documentId}/move`, { folderId: target || null }),
    onSuccess: () => {
      onDone();
      toast('Moved');
      onClose();
    },
  });
  return (
    <Modal title={`Move ${d.title}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={move.isPending} onClick={() => move.mutate()}>Move</Button></>}>
      {move.error && <ErrorNote>{errorMessage(move.error)}</ErrorNote>}
      <Field label="Folder">
        {(id) => (
          <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Project root</option>
            {flatten(folders.data ?? []).map((f) => (
              <option key={f.folderId} value={f.folderId}>{' '.repeat(f.depth)}{f.name}</option>
            ))}
          </Select>
        )}
      </Field>
    </Modal>
  );
}
