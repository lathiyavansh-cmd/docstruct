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
  UNIQUE (from_version_id, to_version_id),
  CHECK (from_version_id <> to_version_id)
)
-- ;;
SELECT lock_down('version_diffs')
