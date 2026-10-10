-- 004_documents: folders, documents and their immutable versions (M03, M04).
-- DOCUMENT carries the stable identity and status; each DOCUMENT_VERSION is an immutable record of content,
-- so a revision never overwrites its predecessor (SRS Appendix A).

CREATE TABLE folders (
  folder_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES folders (folder_id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_by  uuid NOT NULL REFERENCES profiles (user_id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS DISTINCT FROM folder_id)
)
-- ;;
-- Folder.Create.Name: sibling names are unique ignoring letter case (root folders share a null parent).
CREATE UNIQUE INDEX folders_sibling_name_key
  ON folders (project_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
-- ;;
CREATE INDEX folders_project_idx ON folders (project_id)
-- ;;
SELECT lock_down('folders')
-- ;;

CREATE TABLE documents (
  document_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  folder_id           uuid REFERENCES folders (folder_id) ON DELETE SET NULL,
  title               text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description         text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  status              text NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'ARCHIVED')),
  current_version_id  uuid,
  created_by          uuid NOT NULL REFERENCES profiles (user_id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Doc.Delete / SA-2: deletion hides the document; its versions and history remain.
  deleted_at          timestamptz,
  deleted_by          uuid REFERENCES profiles (user_id)
)
-- ;;
CREATE INDEX documents_project_idx ON documents (project_id, updated_at DESC) WHERE deleted_at IS NULL
-- ;;
CREATE INDEX documents_folder_idx ON documents (folder_id) WHERE deleted_at IS NULL
-- ;;
SELECT lock_down('documents')
-- ;;

CREATE TABLE document_versions (
  version_id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id               uuid NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
  version_no                integer NOT NULL CHECK (version_no >= 1),
  storage_key               text NOT NULL,
  file_name                 text NOT NULL,
  mime_type                 text NOT NULL,
  byte_size                 integer NOT NULL CHECK (byte_size >= 0 AND byte_size <= 52428800),
  checksum                  text NOT NULL,
  change_note               text NOT NULL DEFAULT '' CHECK (char_length(change_note) <= 500),
  restored_from_version_id  uuid REFERENCES document_versions (version_id),
  uploaded_by               uuid NOT NULL REFERENCES profiles (user_id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  -- Version.Text.Extract: derived data, filled in once after upload.
  extraction_status         text NOT NULL DEFAULT 'PENDING'
                            CHECK (extraction_status IN ('PENDING', 'DONE', 'FAILED', 'UNSUPPORTED')),
  extracted_text            text,
  -- Version.Number.Assign / .Concurrent: numbers are unique per document.
  UNIQUE (document_id, version_no)
)
-- ;;
CREATE INDEX document_versions_document_idx ON document_versions (document_id, version_no DESC)
-- ;;
SELECT lock_down('document_versions')
-- ;;

-- Version.Immutable / CO-7 / SA-4: a version can never be deleted, and its content, number and timestamp
-- never change. Only the extraction result may be written, and only while it is still pending.
CREATE OR REPLACE FUNCTION guard_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document versions cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version_no <> OLD.version_no OR NEW.storage_key <> OLD.storage_key OR NEW.checksum <> OLD.checksum
     OR NEW.byte_size <> OLD.byte_size OR NEW.created_at <> OLD.created_at OR NEW.document_id <> OLD.document_id
     OR NEW.file_name <> OLD.file_name OR NEW.mime_type <> OLD.mime_type OR NEW.change_note <> OLD.change_note
     OR NEW.uploaded_by <> OLD.uploaded_by
     OR NEW.restored_from_version_id IS DISTINCT FROM OLD.restored_from_version_id THEN
    RAISE EXCEPTION 'document versions are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.extraction_status <> 'PENDING'
     AND (NEW.extraction_status <> OLD.extraction_status OR NEW.extracted_text IS DISTINCT FROM OLD.extracted_text) THEN
    RAISE EXCEPTION 'extraction result is already recorded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$
-- ;;
CREATE TRIGGER document_versions_guard BEFORE UPDATE OR DELETE ON document_versions
  FOR EACH ROW EXECUTE FUNCTION guard_version()
-- ;;

ALTER TABLE documents
  ADD CONSTRAINT documents_current_version_fk FOREIGN KEY (current_version_id) REFERENCES document_versions (version_id)
-- ;;

-- Upload tickets: the backend issues a signed upload URL for one storage key and remembers who may turn
-- the uploaded object into a version, so a client can never attach an arbitrary key.
CREATE TABLE upload_tickets (
  storage_key   text PRIMARY KEY,
  project_id    uuid NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  declared_size integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz
)
-- ;;
SELECT lock_down('upload_tickets')
