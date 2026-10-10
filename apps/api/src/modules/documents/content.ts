import type { FileFormat } from '@docstruct/shared';

/**
 * Robustness-4: checks that an uploaded file really is the format its name claims, from its leading
 * bytes, so a renamed or corrupted file is rejected before it becomes a version.
 */
export function contentMatchesFormat(head: Buffer, format: FileFormat): boolean {
  switch (format.mime) {
    case 'application/pdf':
      return head.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    case 'image/png':
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
      return false;
  }
}

function isText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  try {
    // A multi-byte character may be cut at the end of the sample; ignore up to 3 trailing bytes.
    new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, Math.max(0, buffer.length - 3)));
    return true;
  } catch {
    return false;
  }
}
