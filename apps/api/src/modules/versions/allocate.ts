/**
 * What this file does
 *   Picks the next version number (1, 2, 3, ...) for a document, safely even when two uploads happen at once.
 *
 * How it works
 *   - Takes a PostgreSQL advisory lock for this document id, inside the caller's transaction.
 *   - Reads the highest existing version_no and adds 1.
 *
 * Where it fits
 *   Called by VersionService.upload() and VersionService.restore() in service.ts, always inside ctx.db.tx().
 *   Module: M04 Version Control (owner: Vansh).
 */
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
  // hashtextextended turns the document id text into the number the lock function needs. A second upload for the
  // same document waits on this line until the first transaction ends.
  await q.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [documentId]);
  // COALESCE gives 0 when the document has no versions yet, so the first number is 1.
  const { rows } = await q.query<{ next: number }>(
    'SELECT COALESCE(max(version_no), 0)::int + 1 AS next FROM document_versions WHERE document_id = $1',
    [documentId],
  );
  return rows[0].next;
}
