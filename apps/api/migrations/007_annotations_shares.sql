-- 007_annotations_shares: feedback attached to the document version it concerns, and view-only share links (M07).

CREATE TABLE annotations (
  annotation_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Annot.Version.Scope: every annotation belongs to the version current when it was written.
  version_id     uuid NOT NULL REFERENCES document_versions (version_id),
  parent_id      uuid REFERENCES annotations (annotation_id),
  review_id      uuid REFERENCES reviews (review_id),
  author_id      uuid NOT NULL REFERENCES profiles (user_id),
  body           text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- Annot.Create.Anchor: optional page and region (fractions of the page, 0..1) of a PDF.
  page_number    integer CHECK (page_number >= 1),
  region         jsonb,
  resolved_at    timestamptz,
  resolved_by    uuid REFERENCES profiles (user_id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR (page_number IS NULL AND region IS NULL AND resolved_at IS NULL)),
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
)
-- ;;
CREATE INDEX annotations_version_idx ON annotations (version_id, created_at)
-- ;;
CREATE INDEX annotations_parent_idx ON annotations (parent_id)
-- ;;
SELECT lock_down('annotations')
-- ;;

-- Annot.Reply.Scope: a reply belongs to the same version as the annotation it answers, and threads are one
-- level deep.
CREATE OR REPLACE FUNCTION guard_annotation_reply() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent annotations%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO parent FROM annotations WHERE annotation_id = NEW.parent_id;
    IF parent.version_id <> NEW.version_id THEN
      RAISE EXCEPTION 'a reply must belong to the same version as its annotation' USING ERRCODE = 'check_violation';
    END IF;
    IF parent.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'replies cannot be nested' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$
-- ;;
CREATE TRIGGER annotations_reply_scope BEFORE INSERT ON annotations
  FOR EACH ROW EXECUTE FUNCTION guard_annotation_reply()
-- ;;

-- Share.Create / SE-15: only the SHA-256 of the token is stored, so the table cannot rebuild a working link.
CREATE TABLE share_links (
  share_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       uuid NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
  token_hash        text NOT NULL UNIQUE,
  label             text NOT NULL DEFAULT '' CHECK (char_length(label) <= 120),
  created_by        uuid NOT NULL REFERENCES profiles (user_id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  revoked_at        timestamptz,
  revoked_by        uuid REFERENCES profiles (user_id),
  last_accessed_at  timestamptz,
  access_count      integer NOT NULL DEFAULT 0
)
-- ;;
CREATE INDEX share_links_document_idx ON share_links (document_id)
-- ;;
SELECT lock_down('share_links')
