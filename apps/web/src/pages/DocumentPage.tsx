/**
 * What this file does
 *   This is the page for one document. It shows the file preview and summary on the left, and a side panel with tabs for Review, Comments, Versions and Sharing. From here the user can upload a new version, download, edit details, move, archive or delete the document.
 *
 * How it works
 *   - useQuery ['document', id] loads GET /documents/:id; useProject loads the project (GET /projects/:projectId) so useCan knows the user's role.
 *   - useQuery ['versions', id] loads GET /documents/:id/versions; useQuery ['annotations', versionId] loads GET /versions/:versionId/annotations (comments for the version on screen).
 *   - ?v=<versionId> in the URL shows an older version instead of the current one.
 *   - Child components do the detailed work: SummaryCard, DocumentPreview, ReviewPanel, AnnotationsPanel, VersionHistory, SharePanel, UploadDialog.
 *   - Actions: PATCH /documents/:id (edit), POST /documents/:id/move, POST /documents/:id/archive, DELETE /documents/:id. Each button only shows if useCan allows it; the server checks again.
 *
 * Where it fits
 *   Route /d/:documentId in App.tsx, inside AppLayout. Module: M03 Document & Folder Management, with M04/M05/M07 panels (owner: Shrut).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { formatBytes, type AnnotationDto, type DocumentDetailDto, type FolderNodeDto, type RegionDto, type VersionDto } from '@docstruct/shared';
import { AnnotationsPanel } from '../components/AnnotationsPanel';
import { DocumentPreview, downloadVersion } from '../components/DocumentPreview';
import { ProtectionDialog, UnlockPanel, type ProtectionMode } from '../components/DocumentProtection';
import {
  AnimateIcon,
  ChevronDownIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DownloadIcon,
  LayersIcon,
  LinkIcon,
  LockIcon,
  MessageSquareIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
} from '../components/icons';
import { ReviewPanel } from '../components/ReviewPanel';
import { SharePanel } from '../components/SharePanel';
import { ShareWithMembersDialog } from '../components/ShareWithMembersDialog';
import { SummaryCard } from '../components/SummaryCard';
import { useToast } from '../components/toast';
import { UploadDialog } from '../components/UploadDialog';
import { VersionHistory } from '../components/VersionHistory';
import { Button, ConfirmDialog, ErrorNote, Field, Input, Modal, Notice, Select, Spinner, StatusBadge, TextArea, cx, type AnimatedIcon } from '../components/ui';
import { del, errorMessage, get, patch, post } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useCan, useProject } from '../lib/hooks';

type RailTab = 'review' | 'comments' | 'versions' | 'sharing';

// Turns the nested folder tree into a flat list with a depth number, for the "Move to folder" dropdown.
function flatten(nodes: FolderNodeDto[], depth = 0): Array<FolderNodeDto & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

const crumb = 'rounded px-1 transition-colors hover:bg-primary-wash hover:text-primary';

/** UI-5: preview, version history, review status and comments of one document in a single view. */
export function DocumentPage() {
  const { documentId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  // The document itself (title, status, current version, folder path).
  const doc = useQuery({ queryKey: ['document', documentId], queryFn: () => get<DocumentDetailDto>(`/documents/${documentId}`) });
  // The project is loaded after the document, because we only learn the project id from the document.
  const project = useProject(doc.data?.projectId);
  // allowed('permission') says if the user's role in this project allows an action. Used to hide buttons.
  const allowed = useCan(project.data);
  const versions = useQuery({ queryKey: ['versions', documentId], queryFn: () => get<VersionDto[]>(`/documents/${documentId}/versions`), enabled: !!doc.data });

  // ?v=<versionId> means the user picked an older version. If there is none, show the current version.
  const viewingId = params.get('v');
  const viewing = versions.data?.find((v) => v.versionId === viewingId) ?? null;
  const shownVersion = viewing ?? doc.data?.currentVersion ?? null;

  const annotations = useQuery({
    queryKey: ['annotations', shownVersion?.versionId],
    queryFn: () => get<AnnotationDto[]>(`/versions/${shownVersion!.versionId}/annotations`),
    // Comments are part of the contents, so they are only loaded once the document is open for this user.
    enabled: !!shownVersion && !!doc.data?.unlocked,
  });

  // Which side panel tab is open. Review is the default.
  const [tab, setTab] = useState<RailTab>('review');
  // placing is true while the user is choosing a spot on the page to pin a new comment.
  const [placing, setPlacing] = useState(false);
  const [anchor, setAnchor] = useState<{ page: number; region: RegionDto } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'upload' | 'edit' | 'move' | 'delete' | 'archive' | 'share-members' | ProtectionMode | null>(null);

  // Opening a document that a project owner sent you marks it as read in "Shared with me".
  useEffect(() => {
    if (!doc.data) return;
    post(`/documents/${documentId}/shared/read`)
      .then(() => queryClient.invalidateQueries({ queryKey: ['shared-with-me'] }))
      .catch(() => {});
  }, [documentId, doc.data?.documentId, queryClient]);

  if (doc.isLoading || (doc.data && project.isLoading)) return <div className="px-5 lg:px-8"><Spinner label="Opening the document" /></div>;
  if (doc.error || !doc.data || !project.data) return <div className="p-8"><ErrorNote>{errorMessage(doc.error ?? project.error)}</ErrorNote></div>;
  const d = doc.data;
  const p = project.data;
  const current = d.currentVersion;
  const isPdf = shownVersion?.mimeType === 'application/pdf';

  // After any change, mark every list that shows this document as old so it reloads with fresh data.
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

  const openComments = annotations.data?.filter((a) => !a.resolvedAt).length ?? 0;
  const tabs: Array<{ id: RailTab; label: string; icon: AnimatedIcon; count?: number }> = [
    { id: 'review', label: 'Review', icon: ClipboardCheckIcon },
    { id: 'comments', label: 'Comments', icon: MessageSquareIcon, count: openComments || undefined },
    { id: 'versions', label: 'Versions', icon: LayersIcon, count: d.versionCount },
    ...(allowed('share.list') ? [{ id: 'sharing' as const, label: 'Sharing', icon: LinkIcon }] : []),
  ];
  // A protected document stays locked for this user until they enter the password (DocumentProtection.tsx).
  const locked = d.isProtected && !d.unlocked;
  // A new version needs permission, and the document must not be under review or archived.
  const canUpload = allowed('version.create') && d.status !== 'UNDER_REVIEW' && d.status !== 'ARCHIVED' && !locked;

  return (
    <div className="px-5 py-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="-ml-1 mb-3 flex flex-wrap items-center gap-0.5 text-sm text-ink-soft">
        <Link to={`/p/${p.projectId}`} className={crumb}>{p.name}</Link>
        <ChevronRight className="size-3.5 text-ink-faint" aria-hidden />
        <Link to={`/p/${p.projectId}/documents`} className={crumb}>Documents</Link>
        {d.folderPath.map((f) => (
          <span key={f.folderId} className="flex items-center gap-0.5">
            <ChevronRight className="size-3.5 text-ink-faint" aria-hidden />
            <Link to={`/p/${p.projectId}/documents?folder=${f.folderId}`} className={crumb}>{f.name}</Link>
          </span>
        ))}
      </nav>

      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
            <StatusBadge status={d.status} />
            {d.isProtected && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-wash px-2.5 py-0.5 text-[12.5px] font-medium text-primary" title={d.unlockedUntil ? `Open for you until ${formatDateTime(d.unlockedUntil)}` : undefined}>
                <LockIcon size={12} /> {locked ? 'Password protected' : 'Protected, unlocked for you'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            <span className="font-medium text-ink tabular">Version {current.versionNo}</span> is current, uploaded by {current.uploadedBy.displayName} on{' '}
            {formatDateTime(current.createdAt)} ({current.fileName}, {formatBytes(current.byteSize)})
          </p>
          {d.description && <p className="mt-2 max-w-3xl text-sm">{d.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpload && (
            <Button variant="primary" icon={UploadIcon} onClick={() => setDialog('upload')}>
              Upload new version
            </Button>
          )}
          {!locked && (
            <Button icon={DownloadIcon} onClick={() => downloadVersion(shownVersion!.versionId)}>
              Download{viewing ? ` v${viewing.versionNo}` : ''}
            </Button>
          )}
          <DocumentMenu
            items={[
              allowed('document.update') && d.status !== 'ARCHIVED' && { label: 'Edit details', icon: ClipboardListIcon, onClick: () => setDialog('edit') },
              allowed('document.move') && { label: 'Move to folder', icon: LayersIcon, onClick: () => setDialog('move') },
              allowed('document.archive') && d.status !== 'ARCHIVED' && d.status !== 'UNDER_REVIEW' && { label: 'Archive', icon: LockIcon, onClick: () => setDialog('archive') },
              allowed('document.share.members') && { label: 'Send to all members', icon: SendIcon, onClick: () => setDialog('share-members') },
              allowed('document.protect') && !d.isProtected && { label: 'Protect with password', icon: LockIcon, onClick: () => setDialog('protect') },
              allowed('document.protect') && d.isProtected && { label: 'Change password', icon: LockIcon, onClick: () => setDialog('change') },
              allowed('document.protect') && d.isProtected && { label: 'Remove password', icon: LockIcon, onClick: () => setDialog('remove') },
              allowed('document.protect.reset') && d.isProtected && { label: 'Reset forgotten password', icon: LockIcon, onClick: () => setDialog('reset') },
              allowed('document.delete') && { label: 'Delete', icon: Trash2Icon, onClick: () => setDialog('delete'), danger: true },
            ]}
          />
        </div>
      </motion.header>

      {d.status === 'UNDER_REVIEW' && allowed('version.create') && (
        <Notice className="mb-4">This document is under review. New versions can be uploaded after the review is completed or cancelled.</Notice>
      )}

      {locked ? (
        <UnlockPanel documentId={d.documentId} onUnlocked={refresh} />
      ) : (
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0">
          <AnimatePresence>
            {viewing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-st-review/40 bg-st-review-wash px-3 py-2 text-sm">
                  <span>
                    You are viewing <strong className="font-medium">version {viewing.versionNo}</strong>. The current version is {current.versionNo}.
                  </span>
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => onView(null)}>
                    Show the current version
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {placing && (
            <Notice className="mb-3 flex items-center justify-between">
              <span>Drag a box on a page to pin your comment, or click a spot.</span>
              <button type="button" className="text-primary hover:underline" onClick={() => setPlacing(false)}>Cancel</button>
            </Notice>
          )}
          {shownVersion && <SummaryCard versionId={shownVersion.versionId} versionNo={shownVersion.versionNo} />}
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
          <div className="no-scrollbar mb-4 flex gap-0.5 overflow-x-auto rounded-xl bg-paper p-1 ring-1 ring-rule" role="tablist">
            {tabs.map((t) => {
              const Icon = t.icon;
              const selected = tab === t.id;
              return (
                <AnimateIcon key={t.id} animateOnHover asChild>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTab(t.id)}
                    className={cx(
                      'relative flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[12.5px] transition-colors',
                      selected ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    {/* The selected tab's pill slides over to the tab that was clicked. */}
                    {selected && (
                      <motion.span
                        layoutId="rail-tab"
                        className="absolute inset-0 rounded-lg bg-surface shadow-card ring-1 ring-rule"
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                      />
                    )}
                    <Icon size={14} className={cx('relative', selected && 'text-primary')} />
                    <span className="relative">{t.label}</span>
                    {t.count !== undefined && (
                      <span className={cx('relative rounded-full px-1.5 text-[11px] tabular', selected ? 'bg-primary-wash text-primary' : 'bg-surface text-ink-faint')}>
                        {t.count}
                      </span>
                    )}
                  </button>
                </AnimateIcon>
              );
            })}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.16 }}>
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
              {tab === 'versions' && versions.data && (
                <VersionHistory
                  documentId={d.documentId}
                  projectId={p.projectId}
                  versions={versions.data}
                  viewingId={viewing?.versionId ?? null}
                  onView={onView}
                  canRestore={allowed('version.restore') && d.status !== 'UNDER_REVIEW' && d.status !== 'ARCHIVED'}
                />
              )}
              {tab === 'sharing' && <SharePanel documentId={d.documentId} />}
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>
      )}

      {/* Only one dialog is open at a time; the dialog state says which one. */}
      {dialog === 'share-members' && (
        <ShareWithMembersDialog
          documentId={d.documentId}
          title={d.title}
          otherMembers={Math.max(0, p.memberCount - 1)}
          isProtected={d.isProtected}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog === 'protect' || dialog === 'change' || dialog === 'remove' || dialog === 'reset') && (
        <ProtectionDialog documentId={d.documentId} mode={dialog} onClose={() => setDialog(null)} onDone={refresh} />
      )}
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

type MenuItem = { label: string; icon: AnimatedIcon; onClick: () => void; danger?: boolean };

/** The "More" dropdown. Items the user may not use are passed as false and filtered out. */
function DocumentMenu({ items }: { items: Array<false | MenuItem> }) {
  const [open, setOpen] = useState(false);
  const visible = items.filter(Boolean) as MenuItem[];
  if (!visible.length) return null;
  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)} aria-haspopup="menu" aria-expanded={open}>
        More
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="inline-flex">
          <ChevronDownIcon size={14} />
        </motion.span>
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-xl border border-rule bg-surface p-1 shadow-lift"
          >
            {visible.map((it) => {
              const Icon = it.icon;
              return (
                <AnimateIcon key={it.label} animateOnHover asChild>
                  <button
                    type="button"
                    role="menuitem"
                    onMouseDown={it.onClick}
                    className={cx(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                      it.danger ? 'text-st-changes hover:bg-st-changes-wash' : 'hover:bg-primary-wash hover:text-primary',
                    )}
                  >
                    <Icon size={15} />
                    {it.label}
                  </button>
                </AnimateIcon>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A yes/no confirm box that runs one API call (used for Archive and Delete). */
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
  // Saves the new title and description with PATCH /documents/:id.
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
  // The project's folder tree (GET /projects/:projectId/folders) for the dropdown.
  const folders = useQuery({ queryKey: ['folders', d.projectId], queryFn: () => get<FolderNodeDto[]>(`/projects/${d.projectId}/folders`) });
  // '' means the project root (no folder).
  const [target, setTarget] = useState(d.folderId ?? '');
  const toast = useToast();
  // Moves the document with POST /documents/:id/move.
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
              <option key={f.folderId} value={f.folderId}>{' '.repeat(f.depth)}{f.name}</option>
            ))}
          </Select>
        )}
      </Field>
    </Modal>
  );
}
