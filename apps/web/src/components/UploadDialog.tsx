/**
 * What this file does
 *   The upload pop-up. It is used both to add a new document to a project and to add a new version
 *   to an existing document.
 *
 * How it works
 *   - "mode" prop: { kind: 'document' } for a new document, { kind: 'version', documentId, title } for a new version.
 *   - The file can be dropped on the box or picked with a hidden <input type="file">. validateFile() from lib/upload.ts
 *     checks type and size before anything is sent.
 *   - One useMutation does the upload in two steps: transferFile() sends the bytes to storage and updates
 *     "progress", then POST /projects/:id/documents (new document) or POST /documents/:id/versions (new version)
 *     saves it using the returned upload key.
 *   - On success it calls onDone(doc). The parent page then invalidates its own queries: WorkspacePage opens the
 *     new document, DocumentPage closes the dialog and shows the new current version.
 *
 * Where it fits
 *   Used by WorkspacePage (upload a document) and DocumentPage (upload a new version). Module: M03 documents (owner: Shrut).
 */
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, formatBytes, type DocumentDto, type FolderNodeDto } from '@docstruct/shared';
import { errorMessage, post } from '../lib/api';
import { transferFile, validateFile } from '../lib/upload';
import { AnimateIcon, CircleCheckIcon, CloudUploadIcon, UploadIcon } from './icons';
import { BorderTrail } from './motion-primitives/border-trail';
import { Button, ErrorNote, Field, Input, Modal, Select, TextArea, cx } from './ui';

function flatten(nodes: FolderNodeDto[], depth = 0): Array<FolderNodeDto & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

/**
 * Doc.Upload (new document) or Version.Create (existing document). The file is checked in the browser
 * first (Doc.Upload.Size: the limit is stated before uploading), sent straight to storage with a progress
 * bar (UI-13), then finalised; if finalising fails nothing is kept (Doc.Upload.Failure).
 */
export function UploadDialog({
  projectId,
  mode,
  folders = [],
  folderId = null,
  onClose,
  onDone,
}: {
  projectId: string;
  mode: { kind: 'document' } | { kind: 'version'; documentId: string; title: string };
  folders?: FolderNodeDto[];
  folderId?: string | null;
  onClose: () => void;
  onDone: (doc: DocumentDto) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(folderId ?? '');
  const [note, setNote] = useState('');
  // Upload progress from 0 to 1; null means no upload is running, so the progress bar is hidden.
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = validateFile(f);
    setFileError(problem);
    setFile(problem ? null : f);
    // For a new document, suggest a title from the file name: drop the extension and turn _ and - into spaces.
    if (!problem && mode.kind === 'document' && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const upload = useMutation({
    mutationFn: async () => {
      setProgress(0);
      // Step 1: send the file to storage. setProgress is called as bytes go out, which moves the bar.
      const uploadKey = await transferFile(projectId, file!, setProgress);
      // Step 2: tell the API to create the document or version from the uploaded file.
      if (mode.kind === 'document') {
        return post<DocumentDto>(`/projects/${projectId}/documents`, { uploadKey, title: title.trim() || undefined, folderId: target || null, changeNote: note });
      }
      return post<DocumentDto>(`/documents/${mode.documentId}/versions`, { uploadKey, changeNote: note });
    },
    onSuccess: onDone,
    onSettled: () => setProgress(null),
  });

  // While an upload is running, the Escape key and the X button do nothing, and the Cancel button is disabled.
  return (
    <Modal
      title={mode.kind === 'document' ? 'Upload a document' : `Upload a new version of ${mode.title}`}
      onClose={() => !upload.isPending && onClose()}
      footer={
        <>
          <Button onClick={onClose} disabled={upload.isPending}>Cancel</Button>
          <Button variant="primary" icon={UploadIcon} busy={upload.isPending} disabled={!file} onClick={() => upload.mutate()}>
            {mode.kind === 'document' ? 'Upload' : 'Upload version'}
          </Button>
        </>
      }
    >
      {upload.error && <ErrorNote>{errorMessage(upload.error)}</ErrorNote>}
      <AnimateIcon animateOnHover asChild>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cx(
            'group relative rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-200',
            dragging ? 'border-primary/60 bg-primary-wash' : file ? 'border-st-approved/40 bg-st-approved-wash/40' : 'border-rule-strong hover:border-primary/40 hover:bg-primary-wash/40',
          )}
        >
          {/* While a file is held over the drop area, a light runs around its edge. */}
          {dragging && <BorderTrail size={90} className="bg-gradient-to-r from-primary via-violet to-primary" transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }} />}
          <motion.span
            className={cx('mx-auto flex size-12 items-center justify-center rounded-2xl shadow-card ring-1', file ? 'bg-st-approved-wash text-st-approved ring-st-approved/20' : 'bg-surface text-primary ring-rule')}
            animate={dragging ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            {file ? <CircleCheckIcon size={22} animate /> : <CloudUploadIcon size={22} animate={dragging} loop={dragging} />}
          </motion.span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={file?.name ?? (dragging ? 'drop' : 'idle')} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
              {file ? (
                <p className="mt-2.5 text-sm">
                  <strong className="font-medium">{file.name}</strong> <span className="text-ink-soft">({formatBytes(file.size)})</span>
                </p>
              ) : (
                <p className="mt-2.5 text-sm text-ink-soft">{dragging ? 'Release to add the file' : 'Drop a file here or'}</p>
              )}
            </motion.div>
          </AnimatePresence>
          <Button size="sm" className="mt-2" onClick={() => input.current?.click()} disabled={upload.isPending}>
            {file ? 'Choose another file' : 'Choose a file'}
          </Button>
          <input ref={input} type="file" accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <p className="mt-2 text-[12.5px] text-ink-faint">PDF, DOCX, TXT, MD, PNG or JPEG, up to {formatBytes(MAX_UPLOAD_BYTES)}</p>
        </div>
      </AnimateIcon>
      {fileError && <ErrorNote>{fileError}</ErrorNote>}
      {progress !== null && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-paper ring-1 ring-rule" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <motion.div
              className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-primary to-violet"
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            >
              <span className="absolute inset-0 animate-pulse bg-white/20" />
            </motion.div>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-soft tabular">{progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : 'Saving the version'}</p>
        </div>
      )}
      {mode.kind === 'document' && (
        <>
          <Field label="Title">{(id) => <Input id={id} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Folder">
            {(id) => (
              <Select id={id} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Project root</option>
                {flatten(folders).map((f) => (
                  <option key={f.folderId} value={f.folderId}>
                    {' '.repeat(f.depth)}
                    {f.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </>
      )}
      <Field label="Change note" hint={mode.kind === 'version' ? 'What changed in this version? Shown in the version history.' : 'Optional.'}>
        {(id) => <TextArea id={id} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-14" />}
      </Field>
    </Modal>
  );
}
