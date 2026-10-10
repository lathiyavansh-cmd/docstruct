# Git Workflow — Branching Strategy and Commit Conventions

This document is the team's agreed process for source control (SRS constraint **CO-9**: *all source code
under Git and GitHub, with changes integrated through reviewed pull requests*, and
**Maintainability-3**).

---

## 1. Repository setup

| Item | Setting |
|---|---|
| Hosting | GitHub, private repository `docstruct` |
| Default branch | `main` |
| Integration branch | `develop` |
| Layout | npm workspaces monorepo — `apps/api`, `apps/web`, `packages/shared`, `services/extractor` |
| Line endings | LF everywhere, enforced by `.gitattributes` and `.editorconfig` |
| Ignored | `node_modules/`, build output, `.env*` (except `.env.example`), local runtime data in `.data/` |
| Local hooks | `.githooks/commit-msg` (checks every message), `.githooks/pre-push` (blocks direct pushes to `main`/`develop`) |
| One-time hook setup | `git config core.hooksPath .githooks` (run automatically by `npm run setup`) |
| CI | `.github/workflows/ci.yml` — typecheck, unit and API tests, Python extractor tests, build, and commit-message lint on every pull request |
| Code owners | `.github/CODEOWNERS` routes each module's review to its owner |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md` — links the SRS requirement IDs a change implements |

### Branch protection (configured on GitHub)

`main` and `develop` are protected:

- changes only through a pull request — no direct pushes, no force pushes, no deletion;
- at least **one approving review** from a team member other than the author;
- the **CI** status check must pass, and the branch must be up to date before merging;
- review from the code owner of a touched module is required;
- conversations must be resolved before merging.

---

## 2. Branching strategy — Git Flow (adapted)

We use a simplified **Git Flow** because the project is delivered in fixed phases with a graded release at
the end of each, and three people work on separate modules in parallel.

```
main      ●───────────────────────────────●──────────────●        tags: v0.1.0, v1.0.0, v1.0.1
           \                             / \            /
release     \                 ●──●──●───●   \          /         release/1.0.0
             \               /           \   \        /
develop       ●──●─────●────●─────●───────●───●──────●──         integration branch
                  \   /    / \   /                  /
feature            ●─●    /   ●─●                  /             feature/m01-auth, feature/m05-review, ...
                         /                        /
hotfix                  ...               ●──────●               hotfix/1.0.1-share-expiry
```

| Branch | Created from | Merged into | Lifetime | Purpose |
|---|---|---|---|---|
| `main` | — | — | permanent | Production-ready code. Every commit on `main` is a tagged release. |
| `develop` | `main` | — | permanent | Integration of finished features; always builds and passes tests. |
| `feature/<module>-<topic>` | `develop` | `develop` | days | One module or one coherent piece of a module. |
| `release/<x.y.z>` | `develop` | `main` **and** `develop` | hours–days | Freeze for a phase submission: version bump, docs, last fixes only. |
| `hotfix/<x.y.z>-<topic>` | `main` | `main` **and** `develop` | hours | Urgent fix to a released version. |

### Naming

- Feature branches carry the **module number** from the SRS module list so the owner is obvious:
  `feature/m01-auth`, `feature/m03-documents-folders`, `feature/m06-rbac`, `feature/f36-diff-prereview`.
- Lower-case, words separated by hyphens, no spaces, no personal names.
- Release and hotfix branches carry the semantic version they will produce.

### Rules

1. **Never commit directly to `main` or `develop`.** Start every change on a branch.
2. Keep a feature branch focused on one module; split large work into several branches.
3. Rebase your feature branch on `develop` (or merge `develop` into it) before opening the PR so CI runs
   against current code.
4. Merge feature branches with **`--no-ff` merge commits** so the history shows where each module entered
   `develop`. Delete the branch after merging.
5. A `release/*` branch accepts only fixes, docs and the version bump. After it merges to `main`, tag the
   merge commit (`git tag -a v1.0.0`) and merge `main` back into `develop`.
6. Versions follow **Semantic Versioning**: `MAJOR.MINOR.PATCH`. Phase submissions are minor releases
   during development (`0.x`) and `1.0.0` for the Release 1.0 scope in the SRS.

### Typical feature cycle

```bash
git switch develop && git pull
git switch -c feature/m05-review
# ... work, committing in small steps ...
git commit -m "feat(review): submit current version to one reviewer"
git push -u origin feature/m05-review
gh pr create --base develop --fill          # CI + code-owner review
# after approval: "Create a merge commit" on GitHub, then delete the branch
```

### Release cycle

```bash
git switch -c release/1.0.0 develop
npm version 1.0.0 --no-git-tag-version --workspaces --include-workspace-root
git commit -am "chore(release): 1.0.0"
# PR release/1.0.0 -> main, then:
git switch main && git merge --no-ff release/1.0.0 && git tag -a v1.0.0 -m "DocStruct 1.0.0"
git switch develop && git merge --no-ff main
```

---

## 3. Commit message convention

We follow **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/)** with a fixed list of
types and scopes. The `commit-msg` hook and the CI job reject messages that do not conform
(`scripts/verify-commit-msg.mjs`).

```
<type>(<scope>)<!>: <subject>

<body — what and why, wrapped at 72 columns>

<footer — Refs: SRS requirement IDs, BREAKING CHANGE: ..., Co-authored-by: ...>
```

### Header rules

- `type` and `scope` from the tables below; scope is optional for repository-wide changes.
- `subject` in the **imperative mood** ("add", not "added"/"adds"), lower-case first letter, no full stop.
- Whole header at most **72 characters**.
- `!` after the scope marks a breaking API change; explain it in a `BREAKING CHANGE:` footer.

### Types

| Type | Use for |
|---|---|
| `feat` | A new user-visible capability (maps to one or more SRS requirements) |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting with no behaviour change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `build` | Build system, dependencies, workspace configuration |
| `ci` | CI configuration |
| `chore` | Maintenance that fits nowhere else (release bumps, tooling) |
| `revert` | Reverts an earlier commit |

### Scopes

| Scope | Module | Scope | Module |
|---|---|---|---|
| `auth` | M01 Authentication & user management | `annotation` | M07 Annotation & feedback |
| `project` | M02 Project & membership | `share` | M07 Share links |
| `document` | M03 Documents | `search` | M08 Search & filtering |
| `folder` | M03 Folders | `activity` | M09 Activity & audit log |
| `version` | M04 Version control | `dashboard` | M09 Project dashboard |
| `review` | M05 Review & approval | `diff` | F3.6 Version comparison & AI pre-review |
| `rbac` | M06 Role-based access control | `extractor` | Python text extraction service |

Cross-cutting scopes: `api`, `web`, `shared`, `db`, `storage`, `ci`, `docs`, `repo`, `deps`, `release`.

### Footers

- `Refs: Version.Number.Concurrent, PE-8` — the SRS requirement IDs the commit implements or fixes.
- `BREAKING CHANGE: <description>` — required with `!`.
- `Co-authored-by: Name <email>` — for pair-programmed commits.

### Examples

```
feat(version): allocate version numbers under an advisory lock

Two contributors uploading at the same moment must receive distinct,
consecutive numbers. The allocation now takes pg_advisory_xact_lock on
the document id inside the upload transaction; a UNIQUE constraint on
(document_id, version_no) is the second line of defence.

Refs: Version.Number.Assign, Version.Number.Concurrent, PE-8
```

```
fix(share): reject expired links before comparing the token hash

Refs: Share.Create.Expiry
```

```
feat(review)!: return 409 when a review is already open

BREAKING CHANGE: POST /documents/:id/reviews responded 400 before.
```

---

## 4. Pull requests

- Base branch `develop` (or `main` for `release/*` and `hotfix/*`).
- Title in the same format as a commit header — it becomes the merge commit's summary.
- Fill in the template: summary, SRS requirement IDs, how it was tested, screenshots for UI changes.
- At least one approval from another member; the module's code owner must approve changes in their module.
- CI must be green. The author merges after approval and deletes the branch.
