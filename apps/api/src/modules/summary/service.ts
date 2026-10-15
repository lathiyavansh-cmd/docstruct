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
    if (v.extraction_status === 'PENDING') return this.dto(v, null, 'Text extraction is still running for this version.');

    const result = v.extraction_status === 'DONE' && v.extracted_text ? summariseDocument(v.extracted_text) : null;
    const reason = result ? null : (UNAVAILABLE[v.extraction_status] ?? UNAVAILABLE.EMPTY);
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
