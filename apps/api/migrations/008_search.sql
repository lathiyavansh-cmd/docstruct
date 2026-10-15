-- What this file does
--   Adds database indexes that make document search and status filters fast. No new tables.
--
-- How it works
--   - A trigram GIN index on lower(title) for title matching.
--   - A full-text GIN index on the extracted text of each version.
--   - A partial index on (project_id, status) for status filters and dashboard counts.
--
-- Where it fits
--   Run by src/db/migrate.ts after 007. Used by the search module (and dashboard counts).
--   Module: search (owner: Shrut).
--
-- 008_search: indexes for title and content search (M08). Scalability-3: search must not degrade linearly
-- with the number of documents, so titles get a trigram index and extracted text a full-text index.

CREATE INDEX documents_title_trgm_idx ON documents USING gin (lower(title) gin_trgm_ops)
-- ;;
-- COALESCE turns a missing text into '' so versions without extracted text still get an index entry.
-- The search query must use the same to_tsvector('english', ...) expression for this index to be used.
CREATE INDEX document_versions_text_fts_idx ON document_versions
  USING gin (to_tsvector('english', COALESCE(extracted_text, '')))
-- ;;
CREATE INDEX documents_status_idx ON documents (project_id, status) WHERE deleted_at IS NULL
