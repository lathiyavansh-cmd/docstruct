-- 002_auth: credentials, sessions and password-reset tokens for DocStruct's own authentication (M01).

-- SE-4: only a salted scrypt hash of the password is stored.
CREATE TABLE user_credentials (
  user_id        uuid PRIMARY KEY REFERENCES profiles (user_id) ON DELETE CASCADE,
  password_hash  text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
)
-- ;;
SELECT lock_down('user_credentials')
-- ;;

-- Account.Session / Account.Session.Expiry / SE-16. The bearer token itself is never stored, only its
-- SHA-256, so a database leak cannot be replayed as a login. Sessions live in the database (not in
-- server memory) so any number of API instances can serve the same user (Scalability-2).
CREATE TABLE sessions (
  session_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
)
-- ;;
CREATE INDEX sessions_user_idx ON sessions (user_id)
-- ;;
SELECT lock_down('sessions')
-- ;;

-- Account.PasswordReset: single-use, expiring, stored hashed.
CREATE TABLE password_reset_tokens (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
)
-- ;;
SELECT lock_down('password_reset_tokens')
-- ;;

-- Outgoing e-mail. Release 1.0 has no mail service (DE-3), so messages are queued here and printed to
-- the server log; a later release attaches a sender that drains this table.
CREATE TABLE mail_outbox (
  mail_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email    text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
)
-- ;;
SELECT lock_down('mail_outbox')
