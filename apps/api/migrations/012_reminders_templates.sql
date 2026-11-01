-- What this file does
--   Adds review nudges (a reminder sent to a reviewer) and document templates (a checklist of required
--   section headings that a document can be checked against).
--
-- How it works
--   - reviews gains nudged_at, nudged_by and nudge_count. Only a PENDING review can be nudged, which is
--     also the only state the guard_review() trigger lets through, so finished reviews stay read-only.
--   - project_templates holds one named checklist per row: the headings a document must contain, in order,
--     stored as a JSON array of strings. A template belongs to one project.
--   - documents gains template_id. Deleting a template detaches its documents (ON DELETE SET NULL) rather
--     than deleting them.
--
-- Where it fits
--   Run by src/db/migrate.ts after 011_protection_and_recipients. Used by modules/reviews (nudges) and
--   modules/templates (checklists). Module: reviews (owner: Vivan) and templates (owner: Vansh).

ALTER TABLE reviews
  ADD COLUMN nudged_at    timestamptz,
  ADD COLUMN nudged_by    uuid REFERENCES profiles (user_id),
  ADD COLUMN nudge_count  integer NOT NULL DEFAULT 0 CHECK (nudge_count >= 0)
-- ;;
CREATE TABLE project_templates (
  template_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description  text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  -- The required headings, in the order they should appear: ["Introduction", "Functional Requirements", ...]
  headings     jsonb NOT NULL CHECK (jsonb_typeof(headings) = 'array' AND jsonb_array_length(headings) BETWEEN 1 AND 60),
  created_by   uuid NOT NULL REFERENCES profiles (user_id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
)
-- ;;
CREATE INDEX project_templates_project_idx ON project_templates (project_id, name)
-- ;;
SELECT lock_down('project_templates')
-- ;;
ALTER TABLE documents
  ADD COLUMN template_id uuid REFERENCES project_templates (template_id) ON DELETE SET NULL
-- ;;
CREATE INDEX documents_template_idx ON documents (template_id) WHERE template_id IS NOT NULL
