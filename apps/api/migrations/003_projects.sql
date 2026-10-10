-- 003_projects: projects and their members (M02). The project is the outermost container: every folder,
-- document, version, review and activity record belongs to exactly one project.

CREATE TABLE projects (
  project_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description  text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  created_by   uuid NOT NULL REFERENCES profiles (user_id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz
)
-- ;;
SELECT lock_down('projects')
-- ;;

CREATE TABLE project_members (
  member_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER')),
  added_by    uuid REFERENCES profiles (user_id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
)
-- ;;
CREATE INDEX project_members_user_idx ON project_members (user_id)
-- ;;
SELECT lock_down('project_members')
-- ;;

-- Project.Member.LastOwner / Reliability-5, enforced by the database as well as the service: removing or
-- demoting the last owner of a project fails whatever code path attempts it.
CREATE OR REPLACE FUNCTION keep_one_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'OWNER' AND (TG_OP = 'DELETE' OR NEW.role <> 'OWNER') THEN
    IF NOT EXISTS (
      SELECT 1 FROM project_members
       WHERE project_id = OLD.project_id AND role = 'OWNER' AND member_id <> OLD.member_id
    ) AND EXISTS (SELECT 1 FROM projects WHERE project_id = OLD.project_id) THEN
      RAISE EXCEPTION 'a project must retain at least one owner' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$
-- ;;
CREATE TRIGGER project_members_keep_owner BEFORE UPDATE OR DELETE ON project_members
  FOR EACH ROW EXECUTE FUNCTION keep_one_owner()
-- ;;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_project_fk FOREIGN KEY (project_id) REFERENCES projects (project_id)
