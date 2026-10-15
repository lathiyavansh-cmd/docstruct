-- What this file does
--   Creates the version_summaries table, a cache of one generated summary per document version.
--
-- How it works
--   - version_id is the primary key, so each version has at most one stored summary.
--   - status is READY with a JSON result, or UNAVAILABLE with a reason.
--   - engine records which summariser produced the row.
--
-- Where it fits
--   Run by src/db/migrate.ts after 008_search. Used by the summary module.
--   Module: summary (owner: Vansh).
--
-- 009_version_summaries: stored summaries of document versions. Versions never change, so a summary is
-- computed once per version, on first request, and reused afterwards.

CREATE TABLE version_summaries (
  -- Primary key on version_id: a second insert for the same version would fail, which keeps one summary per version.
  version_id   uuid PRIMARY KEY REFERENCES document_versions (version_id) ON DELETE CASCADE,
  document_id  uuid NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('READY', 'UNAVAILABLE')),
  reason       text,
  result       jsonb,
  engine       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
)
-- ;;
SELECT lock_down('version_summaries')
