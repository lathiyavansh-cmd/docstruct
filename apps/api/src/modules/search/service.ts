/**
 * What this file does
 *   Searches and filters documents, then ranks the results by how well they match. All work is done
 *   in one SQL query on PostgreSQL.
 *
 * How it works
 *   - search() builds a WHERE list step by step: project scope first, then each filter that was given.
 *   - With a search term, the title is matched with trigram similarity and the extracted text with
 *     full-text search; the score adds the weighted title, content and recency parts.
 *   - Without a term, results are just filtered and sorted by last update.
 *   - memberProjects() lists the projects a user belongs to, for the global search.
 *
 * Where it fits
 *   Called by search/routes.ts. Builds on documentSelect() from documents/queries.ts and reads text
 *   saved by the extractor. Module: M08 Search & Filtering (owner: Shrut).
 */
import type { SearchQuery, SearchResultDto } from '@docstruct/shared';
import type { AppContext } from '../../context.js';
import { documentSelect, toDocumentDto, type DocumentRow } from '../documents/queries.js';

/** Algorithm I weights: a title hit counts three times a content hit; recency breaks near-ties. */
export const TITLE_WEIGHT = 3.0;
export const CONTENT_WEIGHT = 1.0;
export const RECENCY_WEIGHT = 0.5;
export const HALF_LIFE_DAYS = 30;
/** Minimum trigram word similarity for a fuzzy title match (Search.Title: tolerate minor misspellings). */
export const TITLE_SIMILARITY = 0.35;
const LIMIT = 50;

interface SearchRow extends DocumentRow {
  project_name: string;
  score: number;
  title_hit: boolean;
  content_hit: boolean;
  snippet: string | null;
}

/**
 * M08 - Search and Filtering (SRS 3.8).
 *
 *   score = 3·title + 1·content + 0.5·recency
 *   title   = trigram word similarity of the query to the title (1 for an exact substring)
 *   content = full-text rank of the current version's extracted text (stemmed, English)
 *   recency = 0.5 ^ (age in days / 30)
 *
 * Every filter combines with the search term and with each other (Filter.Combine); results are always
 * confined to the given projects, which the caller restricts to the user's memberships (Search.Scope).
 */
export class SearchService {
  constructor(private readonly ctx: AppContext) {}

  async search(projectIds: string[], query: SearchQuery): Promise<SearchResultDto[]> {
    // User values always go into params and are referenced as $1, $2, ... so they are never pasted into
    // the SQL text (this prevents SQL injection). $1 is the list of allowed projects.
    const params: unknown[] = [projectIds];
    const where = ['d.project_id = ANY($1::uuid[])', 'd.deleted_at IS NULL'];
    const q = query.q?.trim() ?? '';

    if (query.status) {
      params.push(query.status);
      where.push(`d.status = $${params.length}`);
    }
    if (query.folderId) {
      params.push(query.folderId);
      where.push(`d.folder_id IN (
        WITH RECURSIVE sub AS (
          SELECT folder_id FROM folders WHERE folder_id = $${params.length}
          UNION ALL SELECT f.folder_id FROM folders f JOIN sub ON f.parent_id = sub.folder_id)
        SELECT folder_id FROM sub)`);
    }
    if (query.reviewerId) {
      params.push(query.reviewerId);
      where.push(`cr.reviewer_id = $${params.length}`);
    }
    if (query.updatedFrom) {
      params.push(query.updatedFrom);
      where.push(`d.updated_at >= $${params.length}::date`);
    }
    if (query.updatedTo) {
      params.push(query.updatedTo);
      // "< date + 1" includes the whole of the "to" day, up to midnight.
      where.push(`d.updated_at < ($${params.length}::date + 1)`);
    }

    let scoreColumns = `
      (SELECT name FROM projects WHERE project_id = d.project_id) AS project_name,
      ${RECENCY_WEIGHT} * power(0.5, EXTRACT(EPOCH FROM (now() - d.updated_at)) / 86400.0 / ${HALF_LIFE_DAYS}) AS score,
      false AS title_hit, false AS content_hit, NULL::text AS snippet`;
    let order = 'd.updated_at DESC';

    if (q) {
      params.push(q);
      const p = `$${params.length}`;
      // title: 1.0 if the term appears inside the title, else the trigram word similarity (handles typos).
      // content: full-text match on the extracted text; its rank is scaled by 10 and capped at 3 below.
      const title = `GREATEST(CASE WHEN lower(d.title) LIKE '%' || lower(${p}) || '%' THEN 1.0 ELSE 0 END, word_similarity(lower(${p}), lower(d.title)))`;
      const tsv = `to_tsvector('english', COALESCE(v.extracted_text, ''))`;
      const tsq = `websearch_to_tsquery('english', ${p})`;
      const content = `CASE WHEN ${tsv} @@ ${tsq} THEN ts_rank_cd(${tsv}, ${tsq}, 1) * 10 ELSE 0 END`;
      scoreColumns = `
        (SELECT name FROM projects WHERE project_id = d.project_id) AS project_name,
        (${TITLE_WEIGHT} * (CASE WHEN ${title} >= ${TITLE_SIMILARITY} THEN ${title} ELSE 0 END)
          + ${CONTENT_WEIGHT} * LEAST(${content}, 3)
          + ${RECENCY_WEIGHT} * power(0.5, EXTRACT(EPOCH FROM (now() - d.updated_at)) / 86400.0 / ${HALF_LIFE_DAYS}))::float8 AS score,
        (${title} >= ${TITLE_SIMILARITY}) AS title_hit,
        (${tsv} @@ ${tsq}) AS content_hit,
        CASE WHEN ${tsv} @@ ${tsq}
             THEN ts_headline('english', v.extracted_text, ${tsq}, 'StartSel=[[, StopSel=]], MaxWords=30, MinWords=12, MaxFragments=1')
        END AS snippet`;
      // A document is only returned if the title is similar enough or the text matches.
      where.push(`(${title} >= ${TITLE_SIMILARITY} OR ${tsv} @@ ${tsq})`);
      order = 'score DESC, d.updated_at DESC';
    }

    // The inner query computes the score; the outer query can then sort by it. The outer query does not
    // know the "d." alias, so it is removed from the ORDER BY text.
    const { rows } = await this.ctx.db.query<SearchRow>(
      `SELECT * FROM (${documentSelect(scoreColumns)} WHERE ${where.join(' AND ')}) results ORDER BY ${order.replace(/d\./g, '')} LIMIT ${LIMIT}`,
      params,
    );
    return rows.map((r) => ({
      document: toDocumentDto(r),
      projectName: r.project_name,
      score: Math.round(Number(r.score) * 1000) / 1000,
      matchedIn: [...(r.title_hit ? (['title'] as const) : []), ...(r.content_hit ? (['content'] as const) : [])],
      snippet: r.snippet ? r.snippet.replace(/\s+/g, ' ').trim() : null,
    }));
  }

  /** Projects the user belongs to, optionally narrowed to one. */
  async memberProjects(userId: string, projectId?: string): Promise<string[]> {
    const { rows } = await this.ctx.db.query<{ project_id: string }>(
      'SELECT project_id FROM project_members WHERE user_id = $1 AND ($2::uuid IS NULL OR project_id = $2)',
      [userId, projectId ?? null],
    );
    return rows.map((r) => r.project_id);
  }
}
