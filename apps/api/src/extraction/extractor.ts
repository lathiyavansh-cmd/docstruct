/**
 * What this file does
 *   Pulls the plain text out of an uploaded document version and saves it in the database,
 *   so versions can be compared and searched by content.
 *
 * How it works
 *   - builtin() decodes TXT and Markdown files directly in Node.
 *   - runPython() runs services/extractor/extract.py for other formats and reads its JSON output.
 *   - extractVersion() picks a driver, falls back to builtin() if Python is missing, and updates the row.
 *   - scheduleExtraction() queues extractVersion() as a background job.
 *
 * Where it fits
 *   scheduleExtraction() is called by the document and version services after an upload.
 *   Module: extractor (owner: Shrut).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppContext } from '../context.js';

/** services/extractor/extract.py, resolved from this file in both src/ (tsx) and dist/ (built). */
const EXTRACT_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../services/extractor/extract.py');
// Upper limit on stored text (2 million characters) so one huge file cannot bloat the database.
const MAX_TEXT = 2_000_000;

export type ExtractionResult = { ok: true; text: string } | { ok: false; error: string };

/** TXT and Markdown can be decoded without Python; used by the "builtin" driver and as a fallback. */
function builtin(data: Buffer, mime: string): ExtractionResult {
  if (mime !== 'text/plain' && mime !== 'text/markdown') return { ok: false, error: 'extractor unavailable for this format' };
  const text = data.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  return text ? { ok: true, text: text.slice(0, MAX_TEXT) } : { ok: false, error: 'no machine-readable text was found' };
}

/** Runs the Python extractor in an isolated interpreter (-I) with a hard timeout. */
function runPython(ctx: AppContext, filePath: string, mime: string): Promise<ExtractionResult> {
  const { pythonBin, timeoutMs } = ctx.config.extractor;
  return new Promise((resolve) => {
    // The Windows 'py' launcher needs '-3' to pick Python 3. The file path and type are passed
    // as separate arguments (no shell), so a file name cannot inject commands.
    const args = pythonBin === 'py' ? ['-3', '-I', EXTRACT_SCRIPT, filePath, mime] : ['-I', EXTRACT_SCRIPT, filePath, mime];
    const child = spawn(pythonBin, args, { timeout: timeoutMs, windowsHide: true });
    const out: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.on('error', (err) => resolve({ ok: false, error: `python not available: ${err.message}` }));
    child.on('close', (code, signal) => {
      // A signal means Node killed the process because it ran past the timeout.
      if (signal) return resolve({ ok: false, error: 'extraction timed out' });
      try {
        const parsed = JSON.parse(Buffer.concat(out).toString('utf8')) as { ok: boolean; text?: string; error?: string };
        resolve(parsed.ok ? { ok: true, text: (parsed.text ?? '').slice(0, MAX_TEXT) } : { ok: false, error: parsed.error ?? 'unknown error' });
      } catch {
        resolve({ ok: false, error: `extractor exited with code ${code}` });
      }
    });
  });
}

/**
 * Version.Text.Extract / Version.Text.Failure. Extracts the text of one stored version and records the
 * outcome. Runs as a background job after the upload transaction has committed, so a slow or failing
 * extraction never blocks or undoes an upload (Robustness-3); a failure only marks comparison and content
 * search as unavailable for that version.
 */
export async function extractVersion(ctx: AppContext, versionId: string): Promise<void> {
  // Only versions still PENDING are processed, so running the job twice does no extra work.
  const { rows } = await ctx.db.query<{ storage_key: string; mime_type: string }>(
    `SELECT storage_key, mime_type FROM document_versions WHERE version_id = $1 AND extraction_status = 'PENDING'`,
    [versionId],
  );
  const version = rows[0];
  if (!version) return;

  let result: ExtractionResult;
  if (ctx.config.extractor.driver === 'python') {
    result = await runPython(ctx, ctx.storage.localPath(version.storage_key), version.mime_type);
    if (!result.ok && result.error.startsWith('python not available')) {
      result = builtin(await ctx.storage.read(version.storage_key), version.mime_type);
    }
  } else {
    result = builtin(await ctx.storage.read(version.storage_key), version.mime_type);
  }

  // Postgres text cannot hold NUL characters.
  const text = result.ok ? result.text.replace(/\u0000/g, '') : null;
  // Save DONE with the text, or FAILED with no text. The PENDING check again avoids overwriting a finished result.
  await ctx.db.query(
    `UPDATE document_versions SET extraction_status = $2, extracted_text = $3
      WHERE version_id = $1 AND extraction_status = 'PENDING'`,
    [versionId, result.ok ? 'DONE' : 'FAILED', text],
  );
  if (!result.ok) ctx.log(`text extraction failed for version ${versionId}: ${result.error}`);
}

/** Queues extraction for a freshly created version. */
export function scheduleExtraction(ctx: AppContext, versionId: string): void {
  ctx.jobs.run(`extract ${versionId}`, () => extractVersion(ctx, versionId));
}
