import type { DiffDto, ExtractionStatus, PreReviewDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { annotateChanges, changeStatistics, classifySubstantive, compareVersions, segmentParagraphs } from './compare.js';
import { ENGINE, findIssues, summarise } from './prereview.js';

interface VersionText {
  version_id: string;
  document_id: string;
  version_no: number;
  extraction_status: ExtractionStatus;
  extracted_text: string | null;
}

interface DiffRow {
  status: 'READY' | 'UNAVAILABLE';
  reason: string | null;
  stats: DiffDto['stats'];
  changes: DiffDto['changes'];
  summary: string | null;
  findings: DiffDto['findings'];
  engine: string;
  created_at: Date;
}

const UNAVAILABLE: Record<string, string> = {
  FAILED: 'Text could not be extracted from version {n}, so a textual comparison is unavailable. Download the versions to compare them manually.',
  UNSUPPORTED: 'Version {n} is an image format without text, so a textual comparison is unavailable. Download the versions to compare them manually.',
};

/** F3.6 - Intelligent Version Comparison and AI Pre-Review (SRS 3.6). */
export class DiffService {
  constructor(private readonly ctx: AppContext) {}

  private async versions(documentId: string, fromId: string, toId: string): Promise<[VersionText, VersionText]> {
    const { rows } = await this.ctx.db.query<VersionText>(
      `SELECT version_id, document_id, version_no, extraction_status, extracted_text
         FROM document_versions WHERE version_id = ANY($1::uuid[])`,
      [[fromId, toId]],
    );
    const from = rows.find((r) => r.version_id === fromId);
    const to = rows.find((r) => r.version_id === toId);
    // Diff.Compare: both versions must belong to the same document.
    if (!from || !to || from.document_id !== documentId || to.document_id !== documentId) throw notFound('Version');
    return [from, to];
  }

  private dto(documentId: string, from: VersionText, to: VersionText, row: DiffRow | null, pendingReason?: string): DiffDto {
    return {
      status: row ? row.status : 'PENDING',
      reason: row ? row.reason : (pendingReason ?? null),
      documentId,
      from: { versionId: from.version_id, versionNo: from.version_no },
      to: { versionId: to.version_id, versionNo: to.version_no },
      stats: row?.stats ?? null,
      changes: row?.changes ?? [],
      summary: row?.summary ?? null,
      findings: row?.findings ?? [],
      machineGenerated: true,
      engine: row?.engine ?? ENGINE,
      generatedAt: row?.created_at.toISOString() ?? null,
    };
  }

  /**
   * Diff.Compare and Diff.Summary.Store: returns the stored comparison of two versions, computing and storing
   * it on first request. While either version's text is still being extracted the result is PENDING and
   * nothing is stored; if extraction failed the result is UNAVAILABLE (Diff.Unavailable).
   */
  async compare(documentId: string, fromId: string, toId: string): Promise<DiffDto> {
    if (fromId === toId) throw badRequest('Choose two different versions to compare');
    const [from, to] = await this.versions(documentId, fromId, toId);

    const stored = await this.ctx.db.query<DiffRow>(
      `SELECT status, reason, stats, changes, summary, findings, engine, created_at
         FROM version_diffs WHERE from_version_id = $1 AND to_version_id = $2`,
      [fromId, toId],
    );
    if (stored.rows[0]) return this.dto(documentId, from, to, stored.rows[0]);

    if (from.extraction_status === 'PENDING' || to.extraction_status === 'PENDING') {
      return this.dto(documentId, from, to, null, 'Text extraction is still running for one of the versions.');
    }

    let row: Omit<DiffRow, 'created_at'>;
    const blocked = [from, to].find((v) => v.extraction_status !== 'DONE' || !v.extracted_text);
    if (blocked) {
      row = {
        status: 'UNAVAILABLE',
        reason: (UNAVAILABLE[blocked.extraction_status] ?? UNAVAILABLE.FAILED).replace('{n}', String(blocked.version_no)),
        stats: null,
        changes: [],
        summary: null,
        findings: [],
        engine: ENGINE,
      };
    } else {
      const textA = from.extracted_text!;
      const textB = to.extracted_text!;
      const changes = annotateChanges(classifySubstantive(compareVersions(textA, textB)), textA, textB);
      const stats = changeStatistics(changes, segmentParagraphs(textA).length, segmentParagraphs(textB).length);
      const findings = findIssues(changes, textB);
      const summary = summarise(changes, stats, findings, textA, textB, { from: from.version_no, to: to.version_no });
      row = { status: 'READY', reason: null, stats, changes, summary, findings, engine: ENGINE };
    }

    const inserted = await this.ctx.db.query<DiffRow>(
      `INSERT INTO version_diffs (document_id, from_version_id, to_version_id, status, reason, stats, changes, summary, findings, engine)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (from_version_id, to_version_id) DO UPDATE SET engine = version_diffs.engine
       RETURNING status, reason, stats, changes, summary, findings, engine, created_at`,
      [
        documentId,
        fromId,
        toId,
        row.status,
        row.reason,
        row.stats ? JSON.stringify(row.stats) : null,
        JSON.stringify(row.changes),
        row.summary,
        JSON.stringify(row.findings),
        row.engine,
      ],
    );
    return this.dto(documentId, from, to, inserted.rows[0]);
  }

  /** Diff.PreReview.Run / Diff.FirstVersion: the reviewed version against its immediate predecessor. */
  async preReview(reviewId: string): Promise<PreReviewDto> {
    const { rows } = await this.ctx.db.query<{ document_id: string; version_id: string; prev_id: string | null }>(
      `SELECT r.document_id, r.version_id,
              (SELECT p.version_id FROM document_versions p
                WHERE p.document_id = v.document_id AND p.version_no = v.version_no - 1) AS prev_id
         FROM reviews r JOIN document_versions v ON v.version_id = r.version_id
        WHERE r.review_id = $1`,
      [reviewId],
    );
    const review = rows[0];
    if (!review) throw notFound('Review');
    if (!review.prev_id) return { reviewId, firstVersion: true, diff: null };
    return { reviewId, firstVersion: false, diff: await this.compare(review.document_id, review.prev_id, review.version_id) };
  }

  /**
   * Runs the pre-review in the background once a review is submitted. Waits (bounded) for text extraction
   * of the submitted version to finish. Never affects the review itself: if anything fails, the reviewer
   * simply sees that the summary is unavailable (Robustness-2, Availability-3).
   */
  schedulePreReview(reviewId: string): void {
    this.ctx.jobs.run(`pre-review ${reviewId}`, async () => {
      const deadline = Date.now() + this.ctx.config.extractor.timeoutMs + 5000;
      for (;;) {
        const result = await this.preReview(reviewId);
        if (!result.diff || result.diff.status !== 'PENDING' || Date.now() > deadline) return;
        await new Promise((r) => setTimeout(r, 250));
      }
    });
  }
}
