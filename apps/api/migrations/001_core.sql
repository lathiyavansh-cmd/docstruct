-- 001_core: user profiles, the immutable activity log and helpers shared by later migrations.
-- Statements are separated by "-- ;;" lines (see src/db/migrate.ts).

CREATE EXTENSION IF NOT EXISTS pg_trgm
-- ;;

-- Raises when a row of an append-only table is updated or deleted (Log.Immutable, CO-7).
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rows of % are immutable', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END
$$
-- ;;

-- CO-6 / SE-11: row-level security on every table. No policies are created, so any role other than the
-- table owner (the backend's connection) is refused. On Supabase this closes the tables to the anon and
-- authenticated roles even if a client obtains a valid token.
CREATE OR REPLACE FUNCTION lock_down(tbl regclass) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE ALL ON %s FROM anon', tbl);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE format('REVOKE ALL ON %s FROM authenticated', tbl);
  END IF;
END
$$
-- ;;

-- Account.SignUp.Profile
CREATE TABLE profiles (
  user_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)
-- ;;
CREATE UNIQUE INDEX profiles_email_key ON profiles (lower(email))
-- ;;
SELECT lock_down('profiles')
-- ;;

-- Log.Record / Log.Record.Detail: actor, action, affected entity and time. project_id gains its foreign
-- key in 003_projects. entity_label keeps a readable name after the entity is deleted (Log.Retention).
CREATE TABLE activity_log (
  log_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id    uuid NOT NULL,
  actor_id      uuid REFERENCES profiles (user_id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  entity_label  text,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
)
-- ;;
CREATE INDEX activity_log_project_idx ON activity_log (project_id, created_at DESC)
-- ;;
CREATE INDEX activity_log_entity_idx ON activity_log (entity_id)
-- ;;
CREATE TRIGGER activity_log_immutable BEFORE UPDATE OR DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation()
-- ;;
SELECT lock_down('activity_log')
