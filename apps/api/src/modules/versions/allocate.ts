import type { Queryable } from '../../db/database.js';

/**
 * Algorithm A - sequential version-number allocation (Version.Number.Assign, Version.Number.Concurrent,
 * PE-8, Reliability-4).
 *
 * Two contributors may upload a new version of the same document at the same moment. Inside the upload
 * transaction we take a transaction-scoped advisory lock keyed on the document id, so allocations for one
 * document are serialised while different documents proceed in parallel. The lock is released at commit or
 * rollback. The number is always computed by the server - a client can never supply it - and the
 * UNIQUE (document_id, version_no) constraint is a second line of defence.
 */
export async function allocateVersionNumber(q: Queryable, documentId: string): Promise<number> {
  await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [documentId]);
  const { rows } = await q.query<{ next: number }>(
    'SELECT COALESCE(max(version_no), 0)::int + 1 AS next FROM document_versions WHERE document_id = $1',
    [documentId],
  );
  return rows[0].next;
}
