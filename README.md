# DocStruct

**A Project-Centric Document Management and Review Platform**

Mini Project (PR1), Semester V, B.Tech Computer Engineering, Sardar Patel Institute of Technology, 2026-27
Team: Vansh Lathiya (2024300124), Vivan Dhoka (2024300048), Shrut Diwakar (2024300051). Guide: Dr. Sudhir Dhage.

DocStruct keeps every document inside a project. Members hold explicit roles, documents live in a folder
hierarchy, every upload is a new immutable version, and a document is formally submitted to one named
reviewer who approves it or requests changes. Before the reviewer looks, DocStruct compares the version with
its predecessor and prepares a change summary and pre-review findings.

## What it does

| SRS feature | Implemented |
|---|---|
| 3.1 Accounts and authentication | Sign-up, login with throttling, idle and absolute session expiry, logout, password reset by single-use link, profile |
| 3.2 Projects and membership | Projects, four roles (Owner, Editor, Reviewer, Viewer), last-owner protection, archive to read-only |
| 3.3 Documents and folders | Nested folders with cycle prevention, signed-URL upload in one transaction, previews for PDF, images, text and Markdown |
| 3.4 Version management | Concurrency-safe numbering, history, download of any version, restore as a new version, immutable versions |
| 3.5 Review workflow | One open review per document, designated reviewer, approve or request changes, cancel, resubmit, queue, full history |
| 3.6 Comparison and pre-review | Paragraph-level diff, cosmetic-change filter, word highlights, in-house change summary and findings, stored results |
| 3.7 Sharing and annotation | Comments on a version, pinned to a PDF region, replies, resolve; view-only expiring and revocable share links |
| 3.8 Search and filtering | Typo-tolerant title search, full-text content search, ranking, filters by status, folder, reviewer and date |
| 3.9 Dashboard and activity | Status counts, pending actions, review progress, immutable activity log |

Everything is written by the team: authentication, file storage, text extraction (a PDF parser and DOCX
reader in pure Python) and the comparison and summary engine. No external service API is used.

## Stack

React 19, TypeScript and Tailwind CSS (web) · Node.js and Express in TypeScript (API) · PostgreSQL, embedded
through PGlite in development or any PostgreSQL 15+ server such as Supabase · Python 3.9+ standard library
(text extraction) · Vitest, Supertest and unittest (tests).

## Run it

Requirements: Node.js 20.19 or newer, npm, and optionally Python 3.9+ (for PDF and DOCX text).

```bash
npm install
npm run setup -- --seed
npm run dev
```

Open http://localhost:5173 and log in with a demo account. Every account uses the password `demo1234`, and
the login page lists them all, so one click fills in the form.

| Account | Name | What to try |
|---|---|---|
| vansh@docstruct.test | Vansh Lathiya | Owner of DocStruct Mini Project, editor in Campus Canteen App: members, send to all, passwords |
| vivan@docstruct.test | Vivan Dhoka | Editor: upload a new version of the weekly report |
| shrut@docstruct.test | Shrut Diwakar | Editor: folders, uploads, comments |
| reviewer@docstruct.test | Faculty Reviewer | Reviewer, with "SRS Sections 3 and 5" waiting in the review queue |
| ananya@docstruct.test | Ananya Sharma | Second reviewer in DocStruct Mini Project |
| rohan@docstruct.test | Rohan Mehta | Viewer (read-only) in both projects |
| priya@docstruct.test | Priya Nair | Owner of Campus Canteen App |
| kabir@docstruct.test | Kabir Singh | Editor in Campus Canteen App: compare the four SRS versions |
| isha@docstruct.test | Isha Patel | Reviewer in Campus Canteen App, with the canteen SRS waiting for review |
| arjun@docstruct.test | Arjun Rao | Brand-new account with no projects |

"Vendor Contract Terms" in Campus Canteen App is password-protected (password `canteen123`) and has been sent
to every member of that project, so it appears under **Shared with me**.

No database server is needed: data lives in `apps/api/.data`. To use PostgreSQL or Supabase instead, set
`DATABASE_URL` in `apps/api/.env` (see `.env.example`) and run `npm run db:migrate`.

## Test

```bash
npm test
npm run test:extractor
npm run typecheck
```

## Deploy (Supabase + Render)

DocStruct runs as one Docker container that serves both the API and the website. Supabase provides only the
PostgreSQL database; sign-in, file storage and every feature stay DocStruct's own code.

1. **Supabase:** create a project, then copy the **Session pooler** connection string
   (Connect > Session pooler) with your database password filled in.
2. **Render:** New > Blueprint, pick this repository and branch. Render reads `render.yaml` and asks for
   `DATABASE_URL`: paste the Supabase string.
3. The first start applies the migrations, loads the demo accounts (`SEED_DEMO=true`; every start also resets their passwords to `demo1234`) and serves the site
   at `https://<service>.onrender.com`.

Uploaded files are stored in the database (`STORAGE_DRIVER=database`) because Render's free disk is wiped
on every restart. The free service sleeps after 15 idle minutes, so the first visit afterwards takes about a minute.

## Repository layout

```
apps/api            REST API: one folder per module under src/modules, SQL migrations in migrations/
apps/web            React client: pages/, components/, lib/
packages/shared     types, enums, permission matrix and review state machine used by both sides
services/extractor  Python text extraction service and its tests
docs/               architecture, API reference, Git workflow, team and module ownership
scripts/            setup, dev runner, commit-message checker
```

## Documentation

- [Architecture and design decisions](docs/ARCHITECTURE.md)
- [REST API reference](docs/API.md)
- [Git workflow: branching strategy and commit conventions](docs/GIT_WORKFLOW.md)
- [Team and module ownership](docs/TEAM.md)
