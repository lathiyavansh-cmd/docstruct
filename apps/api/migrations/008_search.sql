-- 008_search: indexes for title and content search (M08). Scalability-3: search must not degrade linearly
-- with the number of documents, so titles get a trigram index and extracted text a full-text index.

CREATE INDEX documents_title_trgm_idx ON documents USING gin (lower(title) gin_trgm_ops)
-- ;;
CREATE INDEX document_versions_text_fts_idx ON document_versions
  USING gin (to_tsvector('english', COALESCE(extracted_text, '')))
-- ;;
CREATE INDEX documents_status_idx ON documents (project_id, status) WHERE deleted_at IS NULL
