# REST API reference

Base path `/api`. JSON in and out. Protected endpoints need `Authorization: Bearer <session token>` from
sign-up or login. Request and response types are defined once in `packages/shared/src/api.ts`.

Every error has the shape `{ "error": { "code", "message", "details?" } }`. The permission column names the
permission from `packages/shared/src/permissions.ts` that the route checks. Non-members of a project always
get `404`; members without the permission get `403`; writes to an archived project get `409 PROJECT_ARCHIVED`.

## M01 Authentication

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | /auth/signup | public | Creates account and profile, returns a session (Account.SignUp) |
| POST | /auth/login | public | Generic failure message; throttled after 5 failures (Account.Login.Failure) |
| POST | /auth/logout | session | Revokes the session |
| GET / PATCH | /auth/me | session | Own profile; only the display name can change |
| POST | /auth/password/change | session | Ends the user's other sessions |
| POST | /auth/password/forgot | public | Always 202; e-mails a single-use link when the address exists |
| POST | /auth/password/reset | public | Consumes the link, ends all sessions |

## M02 Projects and members

| Method | Path | Permission |
|---|---|---|
| GET / POST | /projects | session (list only own memberships) |
| GET | /projects/:projectId | project.read |
| PATCH | /projects/:projectId | project.update |
| POST | /projects/:projectId/archive | project.archive |
| GET | /projects/:projectId/members | member.list |
| POST | /projects/:projectId/members | member.add |
| PATCH | /projects/:projectId/members/:userId | member.role.change (last owner protected) |
| DELETE | /projects/:projectId/members/:userId | member.remove (last owner and pending reviewers protected) |

## M03 Folders and documents

| Method | Path | Permission |
|---|---|---|
| GET / POST | /projects/:projectId/folders | document.read / folder.create |
| PATCH | /folders/:folderId | folder.update |
| POST | /folders/:folderId/move | folder.update (409 FOLDER_CYCLE) |
| DELETE | /folders/:folderId?confirm=true | folder.delete (409 FOLDER_NOT_EMPTY without confirm) |
| POST | /projects/:projectId/uploads | document.create or version.create: returns a signed PUT URL |
| GET / POST | /projects/:projectId/documents | document.read / document.create (finalise upload) |
| GET / PATCH / DELETE | /documents/:documentId | document.read / document.update / document.delete |
| POST | /documents/:documentId/move | document.move |
| GET | /documents/:documentId/preview, /download | document.read / document.download: signed GET URL |

Upload is two steps: `POST /projects/:id/uploads {fileName, byteSize}` → `PUT` the bytes to `uploadUrl` →
`POST /projects/:id/documents {uploadKey, ...}` (or `/documents/:id/versions` for a new version).

## M04 Versions

| Method | Path | Permission |
|---|---|---|
| GET / POST | /documents/:documentId/versions | document.read / version.create |
| POST | /documents/:documentId/versions/:versionId/restore | version.restore |
| GET | /versions/:versionId/download, /preview | document.download / document.read |

## M05 Reviews

| Method | Path | Permission |
|---|---|---|
| GET | /reviews/queue | session: pending reviews assigned to the caller |
| GET / POST | /documents/:documentId/reviews | document.read / review.submit |
| GET | /reviews/:reviewId | document.read |
| POST | /reviews/:reviewId/approve | review.decide + designated reviewer |
| POST | /reviews/:reviewId/request-changes | review.decide + designated reviewer (note required) |
| POST | /reviews/:reviewId/cancel | submitter or review.cancel.any |
| POST | /documents/:documentId/archive | document.archive |
| GET | /me/reminders | session: overdue and soon-due reviews, nudges received, overdue reviews sent, decisions this week |
| POST | /reviews/:reviewId/nudge | review.submit, and submitter or review.cancel.any; once per review per 24 hours |

Every review carries `overdue` and `daysUntilDue`, worked out by the database from `dueDate`.

## Document templates

| Method | Path | Permission |
|---|---|---|
| GET | /projects/:projectId/templates | project.read |
| POST | /projects/:projectId/templates | template.manage (owner): `{ name, description?, headings: string[] }` |
| PATCH / DELETE | /projects/:projectId/templates/:templateId | template.manage |
| GET | /projects/:projectId/templates/:templateId/compliance | project.read: every document using it, incomplete first |
| PUT | /documents/:documentId/template | document.update: `{ templateId }` or `{ templateId: null }`; returns the check |
| GET | /documents/:documentId/template-check | document.read: the current version's check, or `null` |

The check compares the headings of the current version's extracted text with the template's list, ignoring
numbering, case, punctuation and plurals; each document heading satisfies at most one required heading.

## F3.6 Comparison and pre-review

| Method | Path | Permission |
|---|---|---|
| GET | /documents/:documentId/compare?from=&to= | diff.read: PENDING / READY / UNAVAILABLE, stored after first computation |
| GET | /reviews/:reviewId/pre-review | diff.read: the reviewed version against its predecessor |

## M07 Annotations and share links

| Method | Path | Permission |
|---|---|---|
| GET | /versions/:versionId/annotations | annotation.read |
| POST | /documents/:documentId/annotations | annotation.create (attached to the current version) |
| POST | /annotations/:annotationId/replies | annotation.reply |
| POST | /annotations/:annotationId/resolve | annotation.resolve |
| GET / POST | /documents/:documentId/shares | share.list / share.create (token returned once) |
| POST | /shares/:shareId/revoke | share.revoke |
| GET | /public/shares/:token | public: 404 unknown, 410 revoked or expired |

## M08 Search

| Method | Path | Permission |
|---|---|---|
| GET | /projects/:projectId/search?q=&status=&folderId=&reviewerId=&updatedFrom=&updatedTo= | document.search |
| GET | /search?q= | session: across the caller's projects only |

## M09 Dashboard and activity

| Method | Path | Permission |
|---|---|---|
| GET | /projects/:projectId/dashboard | dashboard.read |
| GET | /projects/:projectId/activity?before=&limit=&documentId= | activity.read |

## Object store

`GET|PUT /storage/object?op=&key=&exp=&sig=...` serves signed URLs issued by the routes above. The HMAC
signature is the authorisation; links expire after `SIGNED_URL_TTL_SECONDS` (default 300).
