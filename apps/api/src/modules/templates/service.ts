/**
 * What this file does
 *   Manages a project's document templates (checklists of required headings), attaches a template to a
 *   document and checks the document against it.
 *
 * How it works
 *   - list(), create(), update() and remove() keep the project_templates rows; each change is logged.
 *   - setDocumentTemplate() stores the choice on the document (or clears it) and returns a fresh check.
 *   - check() loads the current version's extracted text and runs checkHeadings() from check.ts. While the
 *     text is still being extracted the result is PENDING; if extraction failed it is UNAVAILABLE.
 *   - compliance() runs the check for every document that uses a template, so an owner can see at a glance
 *     which submissions are still incomplete.
 *
 * Where it fits
 *   Used by templates/routes.ts. Reads document_versions written by the extractor. Module: templates
 *   (owner: Vansh).
 */
import type { TemplateCheckDto, TemplateComplianceDto, TemplateDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import type { Queryable } from '../../db/database.js';
import { recordActivity } from '../../lib/activity.js';
import { conflict, isUniqueViolation, notFound } from '../../lib/errors.js';
import { documentSelect, toDocumentDto, type DocumentRow } from '../documents/queries.js';
import { checkHeadings, documentHeadings } from './check.js';

interface TemplateRow {
  template_id: string;
  project_id: string;
  name: string;
  description: string;
  headings: string[];
  created_by: string;
  created_by_name: string;
  created_at: Date;
  updated_at: Date;
  document_count: number;
}

const TEMPLATE_SELECT = `
  SELECT t.template_id, t.project_id, t.name, t.description, t.headings, t.created_by, u.display_name AS created_by_name,
         t.created_at, t.updated_at,
         (SELECT count(*)::int FROM documents d WHERE d.template_id = t.template_id AND d.deleted_at IS NULL) AS document_count
    FROM project_templates t JOIN profiles u ON u.user_id = t.created_by`;

function toTemplateDto(r: TemplateRow): TemplateDto {
  return {
    templateId: r.template_id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    headings: r.headings,
    createdBy: { userId: r.created_by, displayName: r.created_by_name },
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    documentCount: r.document_count,
  };
}

/** Trims each heading and drops blanks and duplicates, keeping the first spelling and the order. */
export function cleanHeadings(headings: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of headings) {
    const t = h.trim().replace(/\s+/g, ' ');
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export class TemplateService {
  constructor(private readonly ctx: AppContext) {}

  private async find(q: Queryable, projectId: string, templateId: string): Promise<TemplateDto> {
    const { rows } = await q.query<TemplateRow>(`${TEMPLATE_SELECT} WHERE t.template_id = $1 AND t.project_id = $2`, [templateId, projectId]);
    if (!rows[0]) throw notFound('Template');
    return toTemplateDto(rows[0]);
  }

  async list(projectId: string): Promise<TemplateDto[]> {
    const { rows } = await this.ctx.db.query<TemplateRow>(`${TEMPLATE_SELECT} WHERE t.project_id = $1 ORDER BY t.name`, [projectId]);
    return rows.map(toTemplateDto);
  }

  async get(projectId: string, templateId: string): Promise<TemplateDto> {
    return this.find(this.ctx.db, projectId, templateId);
  }

  async create(projectId: string, userId: string, input: { name: string; description?: string; headings: string[] }): Promise<TemplateDto> {
    const headings = cleanHeadings(input.headings);
    if (!headings.length) throw conflict('A template needs at least one heading', 'EMPTY_TEMPLATE');
    try {
      return await this.ctx.db.tx(async (q) => {
        const { rows } = await q.query<{ template_id: string }>(
          `INSERT INTO project_templates (project_id, name, description, headings, created_by)
           VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING template_id`,
          [projectId, input.name, input.description ?? '', JSON.stringify(headings), userId],
        );
        const id = rows[0].template_id;
        await recordActivity(q, { projectId, actorId: userId, action: 'template.created', entityType: 'template', entityId: id, entityLabel: input.name, detail: { headings: headings.length } });
        return this.find(q, projectId, id);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('A template with this name already exists in the project', 'DUPLICATE_TEMPLATE');
      throw err;
    }
  }

  async update(projectId: string, templateId: string, userId: string, input: { name?: string; description?: string; headings?: string[] }): Promise<TemplateDto> {
    const headings = input.headings ? cleanHeadings(input.headings) : null;
    if (headings && !headings.length) throw conflict('A template needs at least one heading', 'EMPTY_TEMPLATE');
    try {
      return await this.ctx.db.tx(async (q) => {
        const { rows } = await q.query<{ name: string }>(
          `UPDATE project_templates
              SET name = COALESCE($3, name), description = COALESCE($4, description),
                  headings = COALESCE($5::jsonb, headings), updated_at = now()
            WHERE template_id = $1 AND project_id = $2 RETURNING name`,
          [templateId, projectId, input.name ?? null, input.description ?? null, headings ? JSON.stringify(headings) : null],
        );
        if (!rows[0]) throw notFound('Template');
        await recordActivity(q, { projectId, actorId: userId, action: 'template.updated', entityType: 'template', entityId: templateId, entityLabel: rows[0].name });
        return this.find(q, projectId, templateId);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('A template with this name already exists in the project', 'DUPLICATE_TEMPLATE');
      throw err;
    }
  }

  /** Deleting a template detaches its documents (the database sets their template_id to NULL). */
  async remove(projectId: string, templateId: string, userId: string): Promise<void> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ name: string }>('DELETE FROM project_templates WHERE template_id = $1 AND project_id = $2 RETURNING name', [templateId, projectId]);
      if (!rows[0]) throw notFound('Template');
      await recordActivity(q, { projectId, actorId: userId, action: 'template.deleted', entityType: 'template', entityId: templateId, entityLabel: rows[0].name });
    });
  }

  /** Chooses the template a document is checked against (null clears it). The template must belong to the same project. */
  async setDocumentTemplate(documentId: string, userId: string, templateId: string | null): Promise<TemplateCheckDto | null> {
    await this.ctx.db.tx(async (q) => {
      const { rows } = await q.query<{ project_id: string; title: string }>('SELECT project_id, title FROM documents WHERE document_id = $1 AND deleted_at IS NULL', [documentId]);
      const doc = rows[0];
      if (!doc) throw notFound('Document');
      const template = templateId ? await this.find(q, doc.project_id, templateId) : null;
      await q.query('UPDATE documents SET template_id = $2, updated_at = now() WHERE document_id = $1', [documentId, templateId]);
      await recordActivity(q, {
        projectId: doc.project_id,
        actorId: userId,
        action: 'document.template_set',
        entityType: 'document',
        entityId: documentId,
        entityLabel: doc.title,
        detail: { templateId, templateName: template?.name ?? null },
      });
    });
    return this.check(documentId);
  }

  /** The check for one document's current version, or null when it has no template. */
  async check(documentId: string): Promise<TemplateCheckDto | null> {
    const { rows } = await this.ctx.db.query<CheckRow>(
      `SELECT d.template_id, t.name AS template_name, t.headings, v.version_no, v.extraction_status, v.extracted_text
         FROM documents d
         JOIN document_versions v ON v.version_id = d.current_version_id
         LEFT JOIN project_templates t ON t.template_id = d.template_id
        WHERE d.document_id = $1 AND d.deleted_at IS NULL`,
      [documentId],
    );
    const row = rows[0];
    if (!row) throw notFound('Document');
    if (!row.template_id) return null;
    return runCheck(row);
  }

  /** Every document using the template, with its check; incomplete ones first. */
  async compliance(projectId: string, templateId: string): Promise<TemplateComplianceDto[]> {
    await this.find(this.ctx.db, projectId, templateId);
    // documentSelect() already joins the current version (alias v) and selects d.template_id and v.extraction_status.
    const { rows } = await this.ctx.db.query<DocumentRow & CheckRow>(
      `${documentSelect('t.name AS template_name, t.headings, v.extracted_text')}
         JOIN project_templates t ON t.template_id = d.template_id
        WHERE d.template_id = $1 AND d.deleted_at IS NULL
        ORDER BY d.title`,
      [templateId],
    );
    return rows
      .map((r) => ({ document: toDocumentDto(r), check: runCheck(r) }))
      .sort((a, b) => b.check.missing - a.check.missing || a.document.title.localeCompare(b.document.title));
  }
}

interface CheckRow {
  template_id: string;
  template_name: string;
  headings: string[];
  version_no: number;
  extraction_status: 'PENDING' | 'DONE' | 'FAILED' | 'UNSUPPORTED';
  extracted_text: string | null;
}

function runCheck(row: CheckRow): TemplateCheckDto {
  const template = { templateId: row.template_id, name: row.template_name };
  if (row.extraction_status === 'PENDING') {
    return { template, versionNo: row.version_no, status: 'PENDING', items: row.headings.map((heading) => ({ heading, found: false, matchedHeading: null })), missing: row.headings.length, complete: false, extraHeadings: [] };
  }
  if (row.extraction_status !== 'DONE' || !row.extracted_text) {
    return { template, versionNo: row.version_no, status: 'UNAVAILABLE', items: row.headings.map((heading) => ({ heading, found: false, matchedHeading: null })), missing: row.headings.length, complete: false, extraHeadings: [] };
  }
  const { items, extraHeadings } = checkHeadings(row.headings, documentHeadings(row.extracted_text));
  const missing = items.filter((i) => !i.found).length;
  return { template, versionNo: row.version_no, status: 'DONE', items, missing, complete: missing === 0, extraHeadings };
}
