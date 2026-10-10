import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import type { AnnotationDto, FileLinkDto, RegionDto } from '@docstruct/shared';
import { get } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';
import { PdfViewer } from './PdfViewer';
import { Button, ErrorNote, Notice, Spinner } from './ui';

export async function downloadVersion(versionId: string) {
  const link = await get<FileLinkDto>(`/versions/${versionId}/download`);
  window.location.assign(link.url);
}

function TextPreview({ url, markdown }: { url: string; markdown: boolean }) {
  const text = useQuery({ queryKey: ['file-text', url], queryFn: () => fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error('unavailable')))) });
  if (text.isLoading) return <Spinner label="Opening the document" />;
  if (text.error) return <ErrorNote>The file could not be loaded for preview. Download it instead.</ErrorNote>;
  if (markdown) return <article className="doc-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(text.data ?? '') }} />;
  return <pre className="max-w-[80ch] whitespace-pre-wrap break-words font-serif text-[15px] leading-relaxed">{text.data}</pre>;
}

/**
 * Doc.Preview / Doc.Preview.Unavailable for one version: PDF, images, text and Markdown render in the page;
 * other formats (DOCX) are offered for download.
 */
export function DocumentPreview({
  versionId,
  annotations = [],
  placing = false,
  onPlace = () => {},
  activeId = null,
  onSelect = () => {},
}: {
  versionId: string;
  annotations?: AnnotationDto[];
  placing?: boolean;
  onPlace?: (page: number, region: RegionDto) => void;
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  // Signed URLs are short-lived (SE-13): fetch a fresh one when the preview opens, refresh before expiry.
  const link = useQuery({
    queryKey: ['preview-link', versionId],
    queryFn: () => get<FileLinkDto>(`/versions/${versionId}/preview`),
    staleTime: 4 * 60_000,
    refetchInterval: 4 * 60_000,
  });
  if (link.isLoading) return <Spinner label="Opening the document" />;
  if (link.error || !link.data) return <ErrorNote>The preview could not be opened.</ErrorNote>;
  const { url, mimeType, previewable, fileName } = link.data;

  if (!previewable) {
    return (
      <Notice className="flex flex-wrap items-center justify-between gap-3 py-4">
        <span>{fileName} cannot be previewed in the browser. Download it to open it on your computer.</span>
        <Button onClick={() => downloadVersion(versionId)}>
          <Download className="size-4" /> Download
        </Button>
      </Notice>
    );
  }
  if (mimeType === 'application/pdf') {
    return <PdfViewer url={url} annotations={annotations} placing={placing} onPlace={onPlace} activeId={activeId} onSelect={onSelect} />;
  }
  if (mimeType.startsWith('image/')) {
    return <img src={url} alt={fileName} className="mx-auto max-h-[80vh] max-w-full rounded border border-rule" />;
  }
  return <TextPreview url={url} markdown={mimeType === 'text/markdown'} />;
}
