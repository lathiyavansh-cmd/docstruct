/**
 * What this file does
 *   This is the page a person sees when they open a share link (/s/:token). It shows one document version, read-only, with a Download button. No login is needed.
 *
 * How it works
 *   - Reads the token from the URL and loads the shared document with useQuery ['shared', token] from GET /public/shares/:token.
 *   - If the document is password protected, the server sends only its title. The page asks for the password and posts it to
 *     POST /public/shares/:token/unlock, which returns the file links when the password is right. Nothing is remembered: reloading asks again.
 *   - For text files (Markdown or plain text) a second useQuery ['shared-text', url] fetches the file's text so it can be shown on the page.
 *   - Shows the file by type: PDFs in PdfViewer (with no annotations), images as <img>, Markdown rendered to HTML, plain text in <pre>.
 *   - If the server answers 410 (link expired or revoked), it shows that message. Any other error means the link is wrong.
 *
 * Where it fits
 *   Route /s/:token in App.tsx. It is outside RequireAuth and AppLayout, so it has its own small header. Module: M07 Sharing & Annotation (owner: Shrut).
 */
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { SharedDocumentDto } from '@docstruct/shared';
import { PdfViewer } from '../components/PdfViewer';
import { Button, ErrorNote, Field, Input, Notice, Spinner } from '../components/ui';
import { ApiError, errorMessage, get, post } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { renderMarkdown } from '../lib/markdown';
import { DownloadIcon, LockIcon } from '../components/icons';

/** What an unregistered recipient of a share link sees: one document, read-only (Share.Create.ViewOnly, Share.Scope). */
export function SharedDocumentPage() {
  const { token } = useParams();
  // Load the shared document's details from the public endpoint. retry: false because a bad link will not start working on a retry.
  const shared = useQuery({ queryKey: ['shared', token], queryFn: () => get<SharedDocumentDto>(`/public/shares/${token}`), retry: false, staleTime: 4 * 60_000 });
  // For a protected document: the password typed by the visitor and the full answer once it was right.
  const [password, setPassword] = useState('');
  const unlock = useMutation({ mutationFn: () => post<SharedDocumentDto>(`/public/shares/${token}/unlock`, { password }) });
  const doc = unlock.data ?? shared.data;
  const file = doc?.file ?? null;
  // Only for text files: download the file content as text so it can be shown on the page.
  const text = useQuery({
    queryKey: ['shared-text', file?.url],
    queryFn: () => fetch(file!.url).then((r) => r.text()),
    enabled: !!file && file.mimeType.startsWith('text/'),
  });

  // Decides what goes in the main area: a spinner, an error, the password form, or the document.
  const body = () => {
    if (shared.isLoading) return <Spinner label="Opening the shared document" />;
    if (shared.error) {
      // 410 Gone means the link existed but has expired or was revoked.
      const gone = shared.error instanceof ApiError && shared.error.status === 410;
      return <ErrorNote>{gone ? shared.error.message + '. Ask the person who shared it for a new link.' : 'This link is not valid. Check that you copied the whole address.'}</ErrorNote>;
    }
    const s = doc!;
    const header = (
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Version {s.versionNo}, updated {formatDateTime(s.updatedAt)}
            {s.expiresAt && <>. This link expires on {formatDate(s.expiresAt)}</>}
          </p>
          {s.description && <p className="mt-2 max-w-2xl text-sm">{s.description}</p>}
        </div>
        {s.download && (
          <Button icon={DownloadIcon} onClick={() => window.location.assign(s.download!.url)}>
            Download
          </Button>
        )}
      </header>
    );
    // Password protected and not unlocked yet: ask for the password before anything else is shown.
    if (!file) {
      const submit = (e: FormEvent) => {
        e.preventDefault();
        if (password) unlock.mutate();
      };
      return (
        <>
          {header}
          <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 rounded-2xl border border-rule bg-paper/60 p-5">
            <p className="flex items-center gap-2 font-medium">
              <LockIcon size={16} className="text-primary" /> This document is password protected
            </p>
            <p className="text-sm text-ink-soft">Enter the password the sender gave you.</p>
            {unlock.error && <ErrorNote>{errorMessage(unlock.error)}</ErrorNote>}
            <Field label="Password">{(id) => <Input id={id} type="password" autoComplete="off" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
            <Button type="submit" variant="primary" icon={LockIcon} busy={unlock.isPending} disabled={!password} className="w-full">
              Open document
            </Button>
          </form>
        </>
      );
    }
    const { mimeType, url, previewable, fileName } = file;
    return (
      <>
        {header}
        {/* Pick the right viewer for the file type. Files that cannot be previewed only offer Download. */}
        {!previewable && <Notice>{fileName} cannot be previewed in the browser. Download it to open it.</Notice>}
        {previewable && mimeType === 'application/pdf' && <PdfViewer url={url} annotations={[]} placing={false} onPlace={() => {}} activeId={null} onSelect={() => {}} />}
        {previewable && mimeType.startsWith('image/') && <img src={url} alt={fileName} className="mx-auto max-w-full rounded border border-rule" />}
        {previewable && mimeType === 'text/markdown' && text.data !== undefined && <article className="doc-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(text.data) }} />}
        {previewable && mimeType === 'text/plain' && text.data !== undefined && <pre className="whitespace-pre-wrap font-serif leading-relaxed">{text.data}</pre>}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="border-b border-rule bg-paper px-5 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <img src="/favicon.svg" alt="" className="size-5" /> DocStruct
          <span className="font-normal text-ink-soft">shared document, view only</span>
        </span>
      </div>
      <main className="mx-auto max-w-4xl px-5 py-8">{body()}</main>
    </div>
  );
}
