# Changelog

All notable changes, following [Keep a Changelog](https://keepachangelog.com/) and Semantic Versioning.

## [1.0.1] - 2026-10-10

### Fixed
- Change summary: both sides of a short replacement now carry the same leading words.

## [1.0.0] - 2026-10-10

Release 1.0 scope of the SRS, delivered for Phase 3 (Implementation).

### Added
- M01 accounts: sign-up, login with throttling, session expiry, logout, password reset, profile.
- M02 projects: creation, four roles, member management with last-owner protection, archival.
- M03 documents and folders: folder tree with cycle prevention, transactional signed-URL upload,
  in-browser preview, move, rename, soft delete.
- M04 versions: advisory-lock version numbering, history, previous-version download, restore as new version.
- M05 reviews: state machine, single open review, designated reviewer decisions, cancel, resubmit, queue.
- M06 role-based access control shared by API and client.
- F3.6 comparison: sequence matcher, paragraph diff, cosmetic filter, word highlights, in-house pre-review
  findings and extractive change summary.
- M07 annotations with PDF anchors and threads; hashed, expiring, revocable share links.
- M08 search: trigram title search, full-text content search, ranking and combinable filters.
- M09 dashboard and immutable activity log.
- Python text extractor (PDF, DOCX, TXT, MD) using only the standard library.
- Demo seed data, one-command setup, CI workflow, commit-message hook.

## [0.0.1] - 2026-10-10

- Repository bootstrap: workspace, Git conventions, CI and templates.
