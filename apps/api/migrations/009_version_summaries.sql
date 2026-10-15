-- 009_version_summaries: stored summaries of document versions. Versions never change, so a summary is
-- computed once per version, on first request, and reused afterwards.

CREATE TABLE version_summaries (
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
