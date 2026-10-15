/**
 * What this file does
 *   The Versions tab of a document. It lists every version, newest first, and lets the user view,
 *   download, compare or restore an older version.
 *
 * How it works
 *   - The versions come in as a prop; DocumentPage loads them (query key ['versions', documentId],
 *     GET /documents/:id/versions). canRestore comes from the user's role and the document status.
 *   - View calls onView(versionId); DocumentPage puts ?v=<id> in the URL and shows that version.
 *   - Download uses downloadVersion() from DocumentPreview. Compare links to /d/:id/compare?from=..&to=.. with the version before it.
 *   - Restore asks for confirmation, then useMutation POST /documents/:id/versions/:versionId/restore makes a new version
 *     with the old content. Old versions are never changed.
 *
 * Where it fits
 *   Used by DocumentPage. Module: M04 version control (owner: Vansh).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { formatBytes, type DocumentDto, type VersionDto } from '@docstruct/shared';
import { errorMessage, post } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { downloadVersion } from './DocumentPreview';
import { AnimateIcon, DownloadIcon, ExternalLinkIcon, LayersIcon, RotateCcwIcon } from './icons';
import { useToast } from './toast';
import { ConfirmDialog, ErrorNote, cx, type AnimatedIcon } from './ui';

/** A small action pill whose icon plays when hovered. */
function VersionAction({ icon: Icon, children, onClick, to }: { icon: AnimatedIcon; children: string; onClick?: () => void; to?: string }) {
  const cls =
    'inline-flex items-center gap-1 rounded-full border border-rule bg-surface px-2 py-0.5 text-[12.5px] text-ink-soft transition-colors hover:border-primary/40 hover:bg-primary-wash hover:text-primary';
  return (
    <AnimateIcon animateOnHover asChild>
      {to ? (
        <Link to={to} className={cls}>
          <Icon size={12} />
          {children}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          <Icon size={12} />
          {children}
        </button>
      )}
    </AnimateIcon>
  );
}

/**
 * M04 version history (Version.History.View): every version newest first on a spine, the current one
 * unmistakable (Usability-2). Any version can be viewed, downloaded (Version.Download.Previous), compared
 * or restored as a new version (Version.Restore.NewVersion).
 */
export function VersionHistory({
  documentId,
  projectId,
  versions,
  viewingId,
  onView,
  canRestore,
}: {
  documentId: string;
  projectId: string;
  versions: VersionDto[];
  viewingId: string | null;
  onView: (versionId: string | null) => void;
  canRestore: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  // The version waiting for "Restore?" confirmation; null means the dialog is closed.
  const [restoring, setRestoring] = useState<VersionDto | null>(null);
  const restore = useMutation({
    mutationFn: (v: VersionDto) => post<DocumentDto>(`/documents/${documentId}/versions/${v.versionId}/restore`),
    onSuccess: (doc) => {
      // A restore adds a new current version, so the document, its version list, the project list and the dashboard all reload.
      for (const key of [['document', documentId], ['versions', documentId], ['documents', projectId], ['dashboard', projectId]]) queryClient.invalidateQueries({ queryKey: key });
      toast(`Restored as version ${doc.currentVersion.versionNo}`);
      setRestoring(null);
      // null means "show the current version", which is now the restored copy.
      onView(null);
    },
  });

  return (
    <section aria-labelledby="versions-heading">
      <h2 id="versions-heading" className="mb-1 font-semibold">Version history</h2>
      <p className="mb-4 text-[13px] text-ink-soft">Versions are never overwritten. Restoring copies an old version into a new one.</p>
      {restore.error && <ErrorNote className="mb-3">{errorMessage(restore.error)}</ErrorNote>}
      <ol className="relative">
        {versions.map((v, i) => {
          // The list is newest first, so the next item is the older version this one is compared with.
          const previous = versions[i + 1];
          // The highlighted row: the version picked with View, or the current version if none was picked.
          const viewing = viewingId ? viewingId === v.versionId : v.isCurrent;
          return (
            <motion.li
              key={v.versionId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 400, damping: 30 }}
              className="relative grid grid-cols-[3.25rem_1fr] gap-3 pb-5 last:pb-0"
            >
              {/* The spine: a rule linking the version numbers, drawn downwards as the list appears. */}
              {i < versions.length - 1 && (
                <motion.span
                  className="absolute left-[1.6rem] top-9 bottom-0 w-px origin-top bg-gradient-to-b from-primary/50 to-rule-strong"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.1 + i * 0.06, duration: 0.35, ease: 'easeOut' }}
                  aria-hidden
                />
              )}
              <span
                className={cx(
                  'relative z-10 flex h-9 items-center justify-center rounded-lg font-serif text-lg tabular',
                  v.isCurrent ? 'bg-gradient-to-br from-primary to-violet text-white shadow-lift' : 'border border-rule-strong bg-surface text-ink-soft',
                )}
                aria-label={`Version ${v.versionNo}`}
              >
                {v.isCurrent && <span className="absolute inset-0 animate-ping rounded-lg bg-primary/20 [animation-iteration-count:2]" aria-hidden />}
                v{v.versionNo}
              </span>
              <div className={cx('min-w-0 rounded-xl px-3 py-2 transition-colors', viewing ? 'bg-primary-wash/70 ring-1 ring-primary/15' : 'hover:bg-paper')}>
                <p className="text-sm">
                  {v.isCurrent && <span className="mr-1.5 font-medium text-ink">Current.</span>}
                  <span className="text-ink-soft">
                    {v.uploadedBy.displayName}, {formatDateTime(v.createdAt)}
                  </span>
                </p>
                <p className="text-[13px] text-ink-faint">
                  {v.fileName}, {formatBytes(v.byteSize)}
                </p>
                {v.restoredFromVersionNo ? (
                  <p className="mt-1 text-[13px] text-ink-soft">Restored from version {v.restoredFromVersionNo}</p>
                ) : (
                  v.changeNote && <p className="mt-1 font-serif text-[14px] leading-snug">{v.changeNote}</p>
                )}
                {v.extractionStatus === 'FAILED' && <p className="mt-1 text-[12.5px] text-st-review">Text could not be extracted: comparison and content search are unavailable for this version.</p>}
                {v.extractionStatus === 'PENDING' && <p className="mt-1 text-[12.5px] text-ink-faint">Reading the text of this version…</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!viewing && (
                    <VersionAction icon={ExternalLinkIcon} onClick={() => onView(v.versionId)}>
                      View
                    </VersionAction>
                  )}
                  <VersionAction icon={DownloadIcon} onClick={() => downloadVersion(v.versionId)}>
                    Download
                  </VersionAction>
                  {previous && (
                    <VersionAction icon={LayersIcon} to={`/d/${documentId}/compare?from=${previous.versionId}&to=${v.versionId}`}>
                      {`Compare with v${previous.versionNo}`}
                    </VersionAction>
                  )}
                  {!v.isCurrent && canRestore && (
                    <VersionAction icon={RotateCcwIcon} onClick={() => setRestoring(v)}>
                      Restore
                    </VersionAction>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
      {restoring && (
        <ConfirmDialog
          title={`Restore version ${restoring.versionNo}?`}
          confirmLabel="Restore as new version"
          busy={restore.isPending}
          onConfirm={() => restore.mutate(restoring)}
          onClose={() => setRestoring(null)}
        >
          A new version {versions[0].versionNo + 1} will be created with the content of version {restoring.versionNo}. All existing versions stay as they are.
        </ConfirmDialog>
      )}
    </section>
  );
}
