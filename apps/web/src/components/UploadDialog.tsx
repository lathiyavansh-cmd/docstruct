import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES, formatBytes, type DocumentDto, type FolderNodeDto } from '@docstruct/shared';
import { errorMessage, post } from '../lib/api';
import { transferFile, validateFile } from '../lib/upload';
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
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const problem = validateFile(f);
    setFileError(problem);
    setFile(problem ? null : f);
    if (!problem && mode.kind === 'document' && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const upload = useMutation({
    mutationFn: async () => {
      setProgress(0);
      const uploadKey = await transferFile(projectId, file!, setProgress);
      if (mode.kind === 'document') {
        return post<DocumentDto>(`/projects/${projectId}/documents`, { uploadKey, title: title.trim() || undefined, folderId: target || null, changeNote: note });
      }
      return post<DocumentDto>(`/documents/${mode.documentId}/versions`, { uploadKey, changeNote: note });
    },
    onSuccess: onDone,
    onSettled: () => setProgress(null),
  });

  return (
    <Modal
      title={mode.kind === 'document' ? 'Upload a document' : `Upload a new version of ${mode.title}`}
      onClose={() => !upload.isPending && onClose()}
      footer={
        <>
          <Button onClick={onClose} disabled={upload.isPending}>Cancel</Button>
          <Button variant="primary" busy={upload.isPending} disabled={!file} onClick={() => upload.mutate()}>
            {mode.kind === 'document' ? 'Upload' : 'Upload version'}
          </Button>
        </>
      }
    >
      {upload.error && <ErrorNote>{errorMessage(upload.error)}</ErrorNote>}
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
        className={cx('rounded-lg border-2 border-dashed px-4 py-6 text-center', dragging ? 'border-primary bg-primary-wash' : 'border-rule-strong')}
      >
        <UploadCloud className="mx-auto size-6 text-ink-faint" aria-hidden />
        {file ? (
          <p className="mt-2 text-sm">
            <strong className="font-medium">{file.name}</strong> <span className="text-ink-soft">({formatBytes(file.size)})</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Drop a file here or</p>
        )}
        <Button size="sm" className="mt-2" onClick={() => input.current?.click()} disabled={upload.isPending}>
          {file ? 'Choose another file' : 'Choose a file'}
        </Button>
        <input ref={input} type="file" accept={ACCEPT_ATTRIBUTE} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <p className="mt-2 text-[12.5px] text-ink-faint">PDF, DOCX, TXT, MD, PNG or JPEG, up to {formatBytes(MAX_UPLOAD_BYTES)}</p>
      </div>
      {fileError && <ErrorNote>{fileError}</ErrorNote>}
      {progress !== null && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-1 text-[12.5px] text-ink-soft">{progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : 'Saving the version'}</p>
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
                    {' '.repeat(f.depth)}
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
