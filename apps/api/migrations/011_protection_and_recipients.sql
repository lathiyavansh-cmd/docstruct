-- What this file does
--   Adds password protection for documents and the "shared with me" list for documents sent to members.
--
-- How it works
--   - documents gains password_hash (scrypt, never the password itself), protected_at, protected_by and
--     password_version. Changing or resetting the password increases password_version, which makes every
--     earlier unlock invalid at once.
--   - document_unlocks records who typed the right password, for which login session, until when (12 hours).
--     Logging out ends the session, so its unlocks stop counting too.
--   - document_recipients holds one row per member a document was sent to, with an optional note and
--     whether they have opened it yet. Sending again refreshes the row instead of adding a duplicate.
--
-- Where it fits
--   Run by src/db/migrate.ts after 010_stored_objects. Used by modules/protection (owner: Vansh) and
--   modules/recipients (owner: Shrut).

ALTER TABLE documents
  ADD COLUMN password_hash     text,
  ADD COLUMN protected_at      timestamptz,
  ADD COLUMN protected_by      uuid REFERENCES profiles (user_id),
  ADD COLUMN password_version  integer NOT NULL DEFAULT 0
-- ;;
-- A document is protected exactly when it has a password hash.
ALTER TABLE documents
  ADD CONSTRAINT documents_protection_consistent CHECK ((password_hash IS NULL) = (protected_at IS NULL))
-- ;;
CREATE TABLE document_unlocks (
  document_id       uuid NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
  session_id        uuid NOT NULL REFERENCES sessions (session_id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  password_version  integer NOT NULL,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, session_id)
)
-- ;;
SELECT lock_down('document_unlocks')
-- ;;
CREATE TABLE document_recipients (
  document_id  uuid NOT NULL REFERENCES documents (document_id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  shared_by    uuid NOT NULL REFERENCES profiles (user_id),
  note         text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  shared_at    timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz,
  PRIMARY KEY (document_id, user_id)
)
-- ;;
-- The "Shared with me" page lists one user's rows, newest first.
CREATE INDEX document_recipients_user_idx ON document_recipients (user_id, shared_at DESC)
-- ;;
SELECT lock_down('document_recipients')
