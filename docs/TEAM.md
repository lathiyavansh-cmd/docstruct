# Team and Module Ownership

**Project:** DocStruct — A Project-Centric Document Management and Review Platform
**Course:** Mini Project (PR1), Semester V, B.Tech Computer Engineering, Sardar Patel Institute of Technology
**Guide:** Dr. Sudhir Dhage
**Academic year:** 2026-27

| Member | UCID | Modules owned (code + tests + screens) |
|---|---|---|
| Vansh Lathiya | 2024300124 | M01 Authentication & User Management · M04 Version Control · M06 Role-Based Access Control · F3.6 Version Comparison & AI Pre-Review · document summarisation · repository, CI and shared core |
| Vivan Dhoka | 2024300048 | M02 Project Management · M05 Review & Approval Management · M09 Activity & Audit Logs and Project Dashboard |
| Shrut Diwakar | 2024300051 | M03 Document & Folder Management · M07 Sharing & Annotation · M08 Search & Filtering · Python text-extraction service |

## Module map

| # | Module (Phase 1 / SRS §3) | Backend (`apps/api/src/modules/…`) | Frontend (`apps/web/src/…`) | Owner |
|---|---|---|---|---|
| M01 | Authentication & User Management (§3.1) | `auth/` | `pages/auth/`, `pages/ProfilePage.tsx` | Vansh |
| M02 | Project Management (§3.2) | `projects/` | `pages/ProjectsPage.tsx`, `pages/project/MembersPage.tsx` | Vivan |
| M03 | Document & Folder Management (§3.3) | `folders/`, `documents/` | `pages/project/WorkspacePage.tsx`, `components/FolderTree.tsx`, `components/DocumentPreview.tsx` | Shrut |
| M04 | Version Control (§3.4) | `versions/` | `components/VersionHistory.tsx` | Vansh |
| M05 | Review & Approval Management (§3.5) | `reviews/` | `pages/ReviewQueuePage.tsx`, `components/ReviewPanel.tsx` | Vivan |
| M06 | Role-Based Access Control (§5.3) | `rbac/`, `packages/shared/src/permissions.ts` | `hooks/useProjectRole.ts`, role-aware controls | Vansh |
| M07 | Sharing & Annotation (§3.7) | `annotations/`, `shares/` | `components/AnnotationsPanel.tsx`, `pages/SharedDocumentPage.tsx` | Shrut |
| M08 | Search & Filtering (§3.8) | `search/` | `components/SearchBar.tsx`, filters in workspace | Shrut |
| M09 | Activity & Audit Logs, Dashboard (§3.9) | `activity/`, `dashboard/` | `pages/project/DashboardPage.tsx`, `pages/project/ActivityPage.tsx` | Vivan |
| F3.6 | Version Comparison & AI Pre-Review (§3.6) | `diff/` | `pages/ComparePage.tsx` | Vansh |
| F3.6+ | Document summarisation (extends §3.6) | `summary/` | `components/SummaryCard.tsx` | Vansh |
| M06+ | Password-protected documents | `protection/` | `components/DocumentProtection.tsx` | Vansh |
| M07+ | Send a document to all members, Shared with me | `recipients/` | `pages/SharedWithMePage.tsx`, `components/ShareWithMembersDialog.tsx` | Shrut |
| — | Text extraction utility (SI-5) | `services/extractor/` (Python) + `apps/api/src/extraction/` | — | Shrut |
