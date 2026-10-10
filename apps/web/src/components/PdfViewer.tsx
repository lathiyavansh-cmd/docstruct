import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { AnnotationDto, RegionDto } from '@docstruct/shared';
import { Notice, Spinner, cx } from './ui';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 200;

/**
 * In-browser PDF preview (Doc.Preview) rendered with pdf.js, with comment anchors drawn on their page and
 * region (Annot.Create.Anchor). In placing mode the user drags a box on a page to anchor a new comment.
 */
export function PdfViewer({
  url,
  annotations,
  placing,
  onPlace,
  activeId,
  onSelect,
}: {
  url: string;
  annotations: AnnotationDto[];
  placing: boolean;
  onPlace: (page: number, region: RegionDto) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setError(null);
    const task = pdfjs.getDocument({ url });
    task.promise.then(
      (doc) => !cancelled && setPdf(doc),
      () => !cancelled && setError('This PDF could not be displayed. Download it to open it on your computer.'),
    );
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url]);

  if (error) return <Notice>{error}</Notice>;
  if (!pdf) return <Spinner label="Opening the PDF" />;
  const pages = Math.min(pdf.numPages, MAX_PAGES);
  return (
    <div className="space-y-4">
      {Array.from({ length: pages }, (_, i) => (
        <PdfPage
          key={i}
          pdf={pdf}
          pageNumber={i + 1}
          annotations={annotations.filter((a) => a.pageNumber === i + 1)}
          placing={placing}
          onPlace={onPlace}
          activeId={activeId}
          onSelect={onSelect}
        />
      ))}
      {pdf.numPages > MAX_PAGES && <Notice>Showing the first {MAX_PAGES} of {pdf.numPages} pages. Download the file to read the rest.</Notice>}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  annotations,
  placing,
  onPlace,
  activeId,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  annotations: AnnotationDto[];
  placing: boolean;
  onPlace: (page: number, region: RegionDto) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(1.294);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Render pages only when they scroll near the viewport.
  useEffect(() => {
    if (visible || !holder.current) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: '600px' });
    io.observe(holder.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null;
    let cancelled = false;
    pdf.getPage(pageNumber).then((page) => {
      if (cancelled || !canvas.current || !holder.current) return;
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const scale = (holder.current.clientWidth / base.width) * (window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale });
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      task = page.render({ canvas: canvas.current, viewport });
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, visible]);

  const point = (e: ReactPointerEvent) => {
    const rect = holder.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) };
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div
        ref={holder}
        className={cx('relative w-full overflow-hidden rounded border border-rule bg-white shadow-sm', placing && 'cursor-crosshair')}
        style={{ aspectRatio: `1 / ${ratio}` }}
        onPointerDown={(e) => {
          if (!placing) return;
          const p = point(e);
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, x1: point(e).x, y1: point(e).y })}
        onPointerUp={() => {
          if (!drag) return;
          let region: RegionDto = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) };
          if (region.width < 0.01 || region.height < 0.01) {
            // A click rather than a drag: anchor a small box around the point.
            region = { x: Math.min(0.96, drag.x0), y: Math.min(0.97, drag.y0), width: 0.04, height: 0.03 };
          }
          setDrag(null);
          onPlace(pageNumber, region);
        }}
      >
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-label={`Page ${pageNumber}`} />
        {annotations.map((a, i) =>
          a.region ? (
            <button
              key={a.annotationId}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(a.annotationId);
              }}
              className={cx(
                'absolute rounded-sm border-2 transition-colors',
                a.resolvedAt ? 'border-st-approved/50 bg-st-approved/5' : 'border-st-review bg-st-review/10',
                activeId === a.annotationId && 'ring-2 ring-primary ring-offset-1',
              )}
              style={{ left: `${a.region.x * 100}%`, top: `${a.region.y * 100}%`, width: `${a.region.width * 100}%`, height: `${a.region.height * 100}%` }}
              aria-label={`Comment ${i + 1} by ${a.author.displayName}`}
            >
              <span className="absolute -left-2.5 -top-2.5 flex size-5 items-center justify-center rounded-full bg-st-review text-[10px] font-semibold text-white">
                {i + 1}
              </span>
            </button>
          ) : null,
        )}
        {drag && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
            style={{
              left: `${Math.min(drag.x0, drag.x1) * 100}%`,
              top: `${Math.min(drag.y0, drag.y1) * 100}%`,
              width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
              height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
            }}
          />
        )}
      </div>
      <p className="mt-1 text-center text-xs text-ink-faint tabular">Page {pageNumber}</p>
    </div>
  );
}
