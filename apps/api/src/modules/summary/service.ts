/**
 * What this file does
 *   Returns the summary of one document version, computing it the first time and reading it from the database after that.
 *
 * How it works
 *   - forVersion() loads the version's extracted text from document_versions.
 *   - If version_summaries already has a row, that saved result is returned.
 *   - Otherwise it calls summariseDocument() from summarise.ts and saves the result (or the reason it is unavailable).
 *   - dto() shapes the row into the response the frontend expects.
 *
 * Where it fits
 *   Called by routes.ts. Uses summarise.ts. Module: Document summarisation, extends F3.6 (owner: Vansh).
 */
import type { DocumentSummaryDto, ExtractionStatus } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { notFound } from '../../lib/errors.js';
import { SUMMARY_ENGINE, summariseDocument, type SummaryResult } from './summarise.js';

interface VersionText {
  version_id: string;
  document_id: string;
  version_no: number;
  extraction_status: ExtractionStatus;
  extracted_text: string | null;
}

interface SummaryRow {
  status: 'READY' | 'UNAVAILABLE';
  reason: string | null;
  result: SummaryResult | null;
  engine: string;
  created_at: Date;
}

const UNAVAILABLE: Record<string, string> = {
  FAILED: 'Text could not be extracted from this version, so it cannot be summarised.',
  UNSUPPORTED: 'This version is an image without text, so it cannot be summarised.',
  EMPTY: 'This version has no readable sentences to summarise.',
};

/** Document summarisation: an extractive summary, key terms and a section outline of any version. */
export class SummaryService {
  constructor(private readonly ctx: AppContext) {}

  private dto(v: VersionText, row: SummaryRow | null, pendingReason?: string): DocumentSummaryDto {
    const result = row?.status === 'READY' ? row.result : null;
    return {
      status: row ? row.status : 'PENDING',
      reason: row ? row.reason : (pendingReason ?? null),
      documentId: v.document_id,
      versionId: v.version_id,
      versionNo: v.version_no,
      levels: result?.levels ?? null,
      keyTerms: result?.keyTerms ?? [],
      outline: result?.outline ?? [],
      stats: result?.stats ?? null,
      machineGenerated: true,
      engine: row?.engine ?? SUMMARY_ENGINE,
      generatedAt: row?.created_at.toISOString() ?? null,
    };
  }

  /**
   * Returns the stored summary of a version, computing and storing it on first request. While the version's
   * text is still being extracted the result is PENDING and nothing is stored.
   */
  async forVersion(versionId: string): Promise<DocumentSummaryDto> {
    const { rows } = await this.ctx.db.query<VersionText>(
      `SELECT version_id, document_id, version_no, extraction_status, extracted_text
         FROM document_versions WHERE version_id = $1`,
      [versionId],
    );
    const v = rows[0];
    if (!v) throw notFound('Version');

    const stored = await this.ctx.db.query<SummaryRow>(
      'SELECT status, reason, result, engine, created_at FROM version_summaries WHERE version_id = $1',
      [versionId],
    );
    if (stored.rows[0]) return this.dto(v, stored.rows[0]);
    // Nothing is saved while extraction is still running, so the next request tries again.
    if (v.extraction_status === 'PENDING') return this.dto(v, null, 'Text extraction is still running for this version.');

    const result = v.extraction_status === 'DONE' && v.extracted_text ? summariseDocument(v.extracted_text) : null;
    // DONE but no result means the text had no usable sentences, so the EMPTY message is used.
    const reason = result ? null : (UNAVAILABLE[v.extraction_status] ?? UNAVAILABLE.EMPTY);
    // ON CONFLICT handles two requests saving at the same time: the first row is kept and returned to both.
    const inserted = await this.ctx.db.query<SummaryRow>(
      `INSERT INTO version_summaries (version_id, document_id, status, reason, result, engine)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (version_id) DO UPDATE SET engine = version_summaries.engine
       RETURNING status, reason, result, engine, created_at`,
      [versionId, v.document_id, result ? 'READY' : 'UNAVAILABLE', reason, result ? JSON.stringify(result) : null, SUMMARY_ENGINE],
    );
    return this.dto(v, inserted.rows[0]);
  }
}
