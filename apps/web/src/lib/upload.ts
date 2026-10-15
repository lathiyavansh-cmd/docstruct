/**
 * What this file does
 *   Helpers for uploading a file: checking it in the browser first, then sending it to storage
 *   while reporting how far the upload has got.
 *
 * How it works
 *   - validateFile() checks the file type from its name, the 50 MB limit and that it is not empty.
 *     It returns an error message, or null when the file is fine.
 *   - transferFile() asks the API for an upload ticket (POST /projects/:id/uploads), which holds a signed URL.
 *   - It then PUTs the file to that URL with XMLHttpRequest, because fetch() cannot report upload progress.
 *   - It returns the upload key; the caller sends that key to the API to create the document or version.
 *
 * Where it fits
 *   Used by UploadDialog; validateFile is tested in upload.test.ts. Module: M03 documents (owner: Shrut).
 */
import { MAX_UPLOAD_BYTES, formatBytes, formatForFileName, type UploadTicketDto } from '@docstruct/shared';
import { ApiError, post } from './api';

/** Checks format and size before anything is sent (Doc.Upload.Format, Doc.Upload.Size). */
export function validateFile(file: File): string | null {
  if (!formatForFileName(file.name)) return `"${file.name}" is not a supported format. Upload a PDF, DOCX, TXT, MD, PNG or JPEG file.`;
  if (file.size > MAX_UPLOAD_BYTES) return `"${file.name}" is ${formatBytes(file.size)}. Files can be at most ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  if (file.size === 0) return `"${file.name}" is empty.`;
  return null;
}

/**
 * Upload step 1 and the transfer itself: gets a signed URL from the API, then PUTs the file straight to the
 * object store with progress reporting (UI-13, CI-4). Returns the key to finalise with.
 */
export async function transferFile(projectId: string, file: File, onProgress: (fraction: number) => void): Promise<string> {
  const ticket = await post<UploadTicketDto>(`/projects/${projectId}/uploads`, { fileName: file.name, byteSize: file.size });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    // Called many times while bytes go out; loaded / total is a fraction from 0 to 1 for the progress bar.
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // On failure, try to read the server's error message from the JSON body.
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).error.message;
      } catch {
        /* keep the generic message */
      }
      reject(new ApiError(xhr.status, 'UPLOAD_FAILED', message));
    };
    // onerror fires when the network drops, not for HTTP error codes.
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'The connection was interrupted during the upload. Nothing was saved; try again.'));
    xhr.send(file);
  });
  onProgress(1);
  return ticket.uploadKey;
}
