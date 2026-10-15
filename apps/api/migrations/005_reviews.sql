-- What this file does
--   Creates the reviews table for the submit, approve and request-changes workflow.
--
-- How it works
--   - Each review row points to the exact version that was submitted and to the reviewer.
--   - CHECK rules keep status and its timestamps consistent.
--   - A partial unique index allows only one PENDING review per document.
--   - The guard_review() trigger makes finished reviews read-only and blocks deletes.
--
-- Where it fits
--   Run by src/db/migrate.ts after 004_documents. Used by the reviews module.
--   Module: reviews (owner: Vivan).
--
-- 005_reviews: the structured review workflow (M05). A review refers to the specific DOCUMENT_VERSION that
-- was submitted, so a later version never alters the record of what was reviewed (Review.Submit.Version).

CREATE TABLE reviews (
  review_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
  version_id       uuid NOT NULL REFERENCES document_versions (version_id),
  reviewer_id      uuid NOT NULL REFERENCES profiles (user_id),
  submitted_by     uuid NOT NULL REFERENCES profiles (user_id),
  submission_note  text NOT NULL DEFAULT '' CHECK (char_length(submission_note) <= 1000),
  due_date         date,
  status           text NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'CANCELLED')),
  -- Review.Cancel: the document returns to the status it had before submission.
  previous_status  text NOT NULL CHECK (previous_status IN ('DRAFT', 'CHANGES_REQUESTED')),
  decision_note    text NOT NULL DEFAULT '' CHECK (char_length(decision_note) <= 2000),
  decided_at       timestamptz,
  cancelled_at     timestamptz,
  cancelled_by     uuid REFERENCES profiles (user_id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Review.Decision.Time: a decision time exists exactly when a decision was made.
  CHECK ((status IN ('APPROVED', 'CHANGES_REQUESTED')) = (decided_at IS NOT NULL)),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL))
)
-- ;;
-- Review.Submit.Single: at most one open review per document, enforced by the database.
CREATE UNIQUE INDEX reviews_one_open_per_document ON reviews (document_id) WHERE status = 'PENDING'
-- ;;
-- Speeds up a reviewer's queue: "my reviews with status PENDING".
CREATE INDEX reviews_reviewer_idx ON reviews (reviewer_id, status)
-- ;;
CREATE INDEX reviews_document_idx ON reviews (document_id, created_at DESC)
-- ;;
SELECT lock_down('reviews')
-- ;;

-- Review.History.Retain: a completed review can never be changed or deleted.
CREATE OR REPLACE FUNCTION guard_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reviews cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  -- Only a PENDING review may be updated (to record a decision or a cancellation).
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'completed reviews are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version_id <> OLD.version_id OR NEW.document_id <> OLD.document_id OR NEW.reviewer_id <> OLD.reviewer_id THEN
    RAISE EXCEPTION 'the reviewed version and reviewer of a review cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$
-- ;;
CREATE TRIGGER reviews_guard BEFORE UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION guard_review()
