/**
 * What this file does
 *   This is the page a person sees when they open a share link (/s/:token). It shows one document version, read-only, with a Download button. No login is needed.
 *
 * How it works
 *   - Reads the token from the URL and loads the shared document with useQuery ['shared', token] from GET /public/shares/:token.
 *   - For text files (Markdown or plain text) a second useQuery ['shared-text', url] fetches the file's text so it can be shown on the page.
 *   - Shows the file by type: PDFs in PdfViewer (with no annotations), images as <img>, Markdown rendered to HTML, plain text in <pre>.
 *   - If the server answers 410 (link expired or revoked), it shows that message. Any other error means the link is wrong.
 *
 * Where it fits
 *   Route /s/:token in App.tsx. It is outside RequireAuth and AppLayout, so it has its own small header. Module: M07 Sharing & Annotation (owner: Shrut).
 */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SharedDocumentDto } from '@docstruct/shared';
import { PdfViewer } from '../components/PdfViewer';
import { Button, ErrorNote, Notice, Spinner } from '../components/ui';
import { ApiError, get } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/format';
import { renderMarkdown } from '../lib/markdown';
import { DownloadIcon } from '../components/icons';

/** What an unregistered recipient of a share link sees: one document, read-only (Share.Create.ViewOnly, Share.Scope). */
export function SharedDocumentPage() {
  const { token } = useParams();
  // Load the shared document's details from the public endpoint. retry: false because a bad link will not start working on a retry.
  const shared = useQuery({ queryKey: ['shared', token], queryFn: () => get<SharedDocumentDto>(`/public/shares/${token}`), retry: false, staleTime: 4 * 60_000 });
  // Only for text files: download the file content as text so it can be shown on the page.
  const text = useQuery({
    queryKey: ['shared-text', shared.data?.file.url],
    queryFn: () => fetch(shared.data!.file.url).then((r) => r.text()),
    enabled: !!shared.data && shared.data.file.mimeType.startsWith('text/'),
  });

  // Decides what goes in the main area: a spinner, an error, or the document.
  const body = () => {
    if (shared.isLoading) return <Spinner label="Opening the shared document" />;
    if (shared.error) {
      // 410 Gone means the link existed but has expired or was revoked.
      const gone = shared.error instanceof ApiError && shared.error.status === 410;
      return <ErrorNote>{gone ? shared.error.message + '. Ask the person who shared it for a new link.' : 'This link is not valid. Check that you copied the whole address.'}</ErrorNote>;
    }
    const s = shared.data!;
    const { mimeType, url, previewable, fileName } = s.file;
    return (
      <>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Version {s.versionNo}, updated {formatDateTime(s.updatedAt)}
              {s.expiresAt && <>. This link expires on {formatDate(s.expiresAt)}</>}
            </p>
            {s.description && <p className="mt-2 max-w-2xl text-sm">{s.description}</p>}
          </div>
          <Button icon={DownloadIcon} onClick={() => window.location.assign(s.download.url)}>
            Download
          </Button>
        </header>
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
