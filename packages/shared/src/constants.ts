/**
 * What this file does
 *   Keeps the fixed limits and the list of accepted file formats in one place,
 *   so the server and the website always agree on them.
 *
 * How it works
 *   - MAX_UPLOAD_BYTES and MAX_FOLDER_DEPTH are plain number limits.
 *   - FILE_FORMATS lists each allowed type with its MIME type, extensions, and whether it can be previewed or text-extracted.
 *   - formatForFileName() and formatForMime() look up a format; formatBytes() turns a byte count into "1.2 MB".
 *
 * Where it fits
 *   Used by the upload checks in apps/api (documents/uploads.ts, folders) and by the upload dialog and
 *   file views in apps/web. Module: shared core (owner: Vansh).
 */
// Limits and formats fixed by the SRS (CO-8, Doc.Upload.Format, Doc.Preview).

/** CO-8 / Doc.Upload.Size: 50 MB per uploaded file. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 x 1024 x 1024 = 52,428,800 bytes

/** Appendix C TBD resolved: maximum folder nesting depth. */
export const MAX_FOLDER_DEPTH = 32;

export interface FileFormat {
  label: string;
  mime: string;
  extensions: string[];
  /** Doc.Preview: rendered in the browser without download. */
  previewable: boolean;
  /** Version.Text.Extract: machine-readable text can be extracted. */
  extractable: boolean;
}

/** Doc.Upload.Format: PDF, DOCX, TXT, MD, PNG and JPEG. */
export const FILE_FORMATS: FileFormat[] = [
  { label: 'PDF', mime: 'application/pdf', extensions: ['.pdf'], previewable: true, extractable: true },
  {
    label: 'Word (DOCX)',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx'],
    previewable: false,
    extractable: true,
  },
  { label: 'Plain text', mime: 'text/plain', extensions: ['.txt'], previewable: true, extractable: true },
  { label: 'Markdown', mime: 'text/markdown', extensions: ['.md', '.markdown'], previewable: true, extractable: true },
  { label: 'PNG image', mime: 'image/png', extensions: ['.png'], previewable: true, extractable: false },
  { label: 'JPEG image', mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'], previewable: true, extractable: false },
];

// Builds the value for an HTML <input type="file" accept="..."> as one comma-separated list,
// e.g. "application/pdf,.pdf,text/plain,.txt,...", so the file picker only offers allowed files.
export const ACCEPT_ATTRIBUTE = FILE_FORMATS.flatMap((f) => [f.mime, ...f.extensions]).join(',');

/**
 * Resolves the canonical format of an uploaded file from its name. The extension decides, because
 * browsers report inconsistent MIME types for Markdown and DOCX; an unknown extension is rejected.
 */
export function formatForFileName(fileName: string): FileFormat | undefined {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return undefined; // no dot means no extension
  const ext = lower.slice(dot); // the part from the last dot, e.g. ".pdf"
  return FILE_FORMATS.find((f) => f.extensions.includes(ext));
}

export function formatForMime(mime: string): FileFormat | undefined {
  return FILE_FORMATS.find((f) => f.mime === mime);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
