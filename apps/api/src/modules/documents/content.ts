/**
 * What this file does
 *   Checks the first bytes of an uploaded file to confirm it really is the type its name says.
 *
 * How it works
 *   - contentMatchesFormat() looks for each format's "magic bytes" (a fixed signature at the start).
 *   - isText() treats a file as text if it has no zero bytes and decodes as valid UTF-8.
 *
 * Where it fits
 *   Called by UploadService.consume() in uploads.ts before a stored file becomes a version.
 *   Module: M03 Document & Folder Management (owner: Shrut).
 */
import type { FileFormat } from '@docstruct/shared';

/**
 * Robustness-4: checks that an uploaded file really is the format its name claims, from its leading
 * bytes, so a renamed or corrupted file is rejected before it becomes a version.
 */
export function contentMatchesFormat(head: Buffer, format: FileFormat): boolean {
  switch (format.mime) {
    case 'application/pdf':
      // PDFs start with "%PDF-"; it is searched for in the first 1 KB.
      return head.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    case 'image/png':
      // The fixed 8-byte PNG signature.
      return head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      // A DOCX is a ZIP archive whose entries include word/document.xml.
      return head.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && head.includes(Buffer.from('word/'));
    case 'text/plain':
    case 'text/markdown':
      return isText(head);
    default:
      // Any other format is not accepted.
      return false;
  }
}

function isText(buffer: Buffer): boolean {
  // A zero byte almost never appears in real text files, so it marks the file as binary.
  if (buffer.includes(0)) return false;
  try {
    // A multi-byte character may be cut at the end of the sample; ignore up to 3 trailing bytes.
    new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, Math.max(0, buffer.length - 3)));
    return true;
  } catch {
    return false;
  }
}
