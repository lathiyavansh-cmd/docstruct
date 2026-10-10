import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatBytes, type DocumentDto, type VersionDto } from '@docstruct/shared';
import { errorMessage, post } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { downloadVersion } from './DocumentPreview';
import { useToast } from './toast';
import { ConfirmDialog, ErrorNote, cx } from './ui';

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
  const [restoring, setRestoring] = useState<VersionDto | null>(null);
  const restore = useMutation({
    mutationFn: (v: VersionDto) => post<DocumentDto>(`/documents/${documentId}/versions/${v.versionId}/restore`),
    onSuccess: (doc) => {
      for (const key of [['document', documentId], ['versions', documentId], ['documents', projectId], ['dashboard', projectId]]) queryClient.invalidateQueries({ queryKey: key });
      toast(`Restored as version ${doc.currentVersion.versionNo}`);
      setRestoring(null);
      onView(null);
    },
  });

  const action = 'text-[13px] text-primary hover:underline';

  return (
    <section aria-labelledby="versions-heading">
      <h2 id="versions-heading" className="mb-1 font-semibold">Version history</h2>
      <p className="mb-4 text-[13px] text-ink-soft">Versions are never overwritten. Restoring copies an old version into a new one.</p>
      {restore.error && <ErrorNote className="mb-3">{errorMessage(restore.error)}</ErrorNote>}
      <ol className="relative">
        {versions.map((v, i) => {
          const previous = versions[i + 1];
          const viewing = viewingId ? viewingId === v.versionId : v.isCurrent;
          return (
            <li key={v.versionId} className="relative grid grid-cols-[3.25rem_1fr] gap-3 pb-5 last:pb-0">
              {/* The spine: a rule linking the version numbers. */}
              {i < versions.length - 1 && <span className="absolute left-[1.6rem] top-9 bottom-0 w-px bg-rule-strong" aria-hidden />}
              <span
                className={cx(
                  'relative z-10 flex h-9 items-center justify-center rounded-md font-serif text-lg tabular',
                  v.isCurrent ? 'bg-ink text-white' : 'border border-rule-strong bg-surface text-ink-soft',
                )}
                aria-label={`Version ${v.versionNo}`}
              >
                v{v.versionNo}
              </span>
              <div className={cx('min-w-0 rounded-md px-2.5 py-1.5', viewing && 'bg-primary-wash/60')}>
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
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {!viewing && (
                    <button type="button" className={action} onClick={() => onView(v.versionId)}>View</button>
                  )}
                  <button type="button" className={action} onClick={() => downloadVersion(v.versionId)}>Download</button>
                  {previous && (
                    <Link className={action} to={`/d/${documentId}/compare?from=${previous.versionId}&to=${v.versionId}`}>
                      Compare with v{previous.versionNo}
                    </Link>
                  )}
                  {!v.isCurrent && canRestore && (
                    <button type="button" className={action} onClick={() => setRestoring(v)}>Restore</button>
                  )}
                </div>
              </div>
            </li>
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
