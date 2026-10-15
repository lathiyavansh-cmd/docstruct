-- What this file does
--   Creates the version_diffs table, a cache of comparisons between two versions of a document.
--
-- How it works
--   - Each row stores the change list, stats, summary and pre-review findings as JSON or text.
--   - status is READY, or UNAVAILABLE with a reason (for example when text could not be extracted).
--   - engine records which comparison engine produced the row.
--
-- Where it fits
--   Run by src/db/migrate.ts after 005_reviews. Used by the diff module.
--   Module: diff (owner: Vansh).
--
-- 006_version_diffs: stored comparisons between two versions (F3.6). Diff.Summary.Store: a comparison is
-- computed once per ordered pair of versions and reused on every later request.

CREATE TABLE version_diffs (
  diff_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
  from_version_id  uuid NOT NULL REFERENCES document_versions (version_id),
  to_version_id    uuid NOT NULL REFERENCES document_versions (version_id),
  status           text NOT NULL CHECK (status IN ('READY', 'UNAVAILABLE')),
  reason           text,
  stats            jsonb,
  changes          jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary          text,
  findings         jsonb NOT NULL DEFAULT '[]'::jsonb,
  engine           text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One stored result per ordered pair, and a version is never compared with itself.
  UNIQUE (from_version_id, to_version_id),
  CHECK (from_version_id <> to_version_id)
)
-- ;;
SELECT lock_down('version_diffs')
