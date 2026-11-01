-- What this file does
--   Creates the stored_objects table, which keeps uploaded file bytes inside the database.
--
-- How it works
--   - Used only when STORAGE_DRIVER=database (for example on Render, whose disk is wiped on restart).
--   - key is the same opaque object key the file system store uses; data holds the file bytes.
--   - Objects are write-once: the server inserts with ON CONFLICT DO NOTHING and never updates a row.
--
-- Where it fits
--   Run by src/db/migrate.ts after 009_version_summaries. Used by storage/object-store.ts.
--   Module: storage, shared core (owner: Vansh).

CREATE TABLE stored_objects (
  key         text PRIMARY KEY,
  data        bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
)
-- ;;
SELECT lock_down('stored_objects')
