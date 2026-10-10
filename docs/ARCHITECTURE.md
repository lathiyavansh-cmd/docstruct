# Architecture

DocStruct follows the deployment and component diagrams of the Phase 2 design: a React web client, a
Node.js REST API that is the only database client, PostgreSQL, an object store, and a Python text
extractor. Every feature is implemented by the team; no external service API is called.

```
 Browser (React + TypeScript + Tailwind)                     apps/web
   │  REST/JSON over HTTPS            │ signed URL (PUT/GET file bytes)
   ▼                                  ▼
 DocStruct API (Node.js + TypeScript, Express)                apps/api
   ├─ modules/auth         M01  sessions, scrypt passwords, reset links
   ├─ modules/projects     M02  projects, members, last-owner rule
   ├─ modules/folders      M03  folder tree, cycle prevention (Algorithm B)
   ├─ modules/documents    M03  two-step signed upload, preview/download links
   ├─ modules/versions     M04  advisory-lock numbering (A), restore-as-new (J)
   ├─ modules/reviews      M05  state machine (D), queue, decisions
   ├─ modules/rbac         M06  permission resolution (C), project resolvers
   ├─ modules/annotations  M07  version-scoped threads, PDF anchors
   ├─ modules/shares       M07  hashed share tokens (K)
   ├─ modules/search       M08  trigram + full-text ranking (I)
   ├─ modules/activity     M09  immutable log, cursor paging
   ├─ modules/dashboard    M09  one-request project overview
   ├─ modules/diff         F3.6 sequence matcher, paragraph diff (F), cosmetic filter (G),
   │                            in-house pre-review engine and summary (H)
   ├─ storage/             object store with HMAC-signed, expiring, write-once URLs
   └─ extraction/ ──spawn──▶ services/extractor (Python, standard library only)
                                  PDF parser, DOCX reader, text decoder (Algorithm E)
   │
   ▼
 PostgreSQL 15+  (embedded PGlite for development, or Supabase / any PostgreSQL server)
   migrations/001..008   row-level security on every table, immutability triggers
```

## Design decisions

| Decision | Reason (SRS reference) |
|---|---|
| The API is the only database client; RLS is enabled with no policies | CO-5, CO-6, SE-11 |
| `DOCUMENT` and `DOCUMENT_VERSION` are separate; versions are guarded by a trigger | CO-7, SA-4, Appendix A |
| Reviews reference a version, not a document | Review.Submit.Version |
| Version numbers come from a per-document advisory lock plus a unique constraint | Version.Number.Concurrent, PE-8 |
| Files go browser ↔ object store through signed URLs; objects are write-once | CI-4, SE-13, CO-7 |
| Upload finalisation is one transaction; the object is removed if it fails | Doc.Upload.Done, Doc.Upload.Failure |
| Extraction and pre-review run after commit in a job queue | Robustness-2/3, Availability-3 |
| The change summary is computed in-house and labelled advisory | DE-2 removed, SA-5, Diff.PreReview.Advisory |
| Sessions are stored hashed in the database, not in server memory | SE-16, Scalability-2 |
| Share links store only SHA-256 of the token | SE-15 |
| The activity log is append-only (trigger) | Log.Immutable, SE-17 |
| Types and permission rules shared between API and client | Maintainability-2, UI-11 |

## Data model (eleven core tables)

`profiles`, `projects`, `project_members`, `folders`, `documents`, `document_versions`, `reviews`,
`version_diffs`, `annotations`, `share_links`, `activity_log`, plus authentication support tables
(`user_credentials`, `sessions`, `password_reset_tokens`, `mail_outbox`) and `upload_tickets`.

## Testing

| Suite | Command | What it covers |
|---|---|---|
| API (Vitest + Supertest, in-memory PostgreSQL) | `npm test -w @docstruct/api` | every module's endpoints, permissions, triggers, algorithms |
| Extractor (unittest) | `npm run test:extractor` | PDF fonts, encodings, object streams, DOCX, CLI contract |
| Types | `npm run typecheck` | API, web and shared package |
