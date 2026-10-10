import { FILE_FORMATS, MAX_UPLOAD_BYTES, PROJECT_ROLES, ROLE_DESCRIPTION, ROLE_LABEL, formatBytes } from '@docstruct/shared';
import { PageHeader, StatusBadge } from '../components/ui';

const STEPS = [
  ['Create a project', 'From Projects, choose "New project". You become its owner. Add members from the Members page and give each one a role.'],
  ['Organise folders', 'In the project, create folders and subfolders. A folder cannot be moved inside one of its own subfolders.'],
  ['Upload a document', `Choose "Upload" in a folder. Accepted: ${FILE_FORMATS.map((f) => f.label).join(', ')}, up to ${formatBytes(MAX_UPLOAD_BYTES)}. The document starts as a Draft at version 1.`],
  ['Upload new versions', 'On the document page choose "Upload new version". Earlier versions are never overwritten; you can download or restore any of them.'],
  ['Send for review', 'Choose "Send for review" and pick one reviewer. DocStruct compares the version with the previous one and prepares a summary and findings for the reviewer.'],
  ['Review', 'Reviewers open the Review queue, read the change summary, add comments on the document, then approve or request changes.'],
  ['Revise and resubmit', 'If changes were requested, upload a revised version and send it for review again. The earlier review stays in the history.'],
] as const;

/** UD-1: online help for the main tasks. */
export function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <PageHeader title="Help">How to organise documents and run reviews in DocStruct.</PageHeader>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">From first upload to approval</h2>
        <ol className="space-y-5">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="grid grid-cols-[2rem_1fr] gap-3">
              <span className="font-serif text-lg text-ink-faint tabular">{i + 1}</span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Roles</h2>
        <dl className="divide-y divide-rule border-y border-rule">
          {PROJECT_ROLES.map((role) => (
            <div key={role} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr]">
              <dt className="font-medium">{ROLE_LABEL[role]}</dt>
              <dd className="text-sm text-ink-soft">{ROLE_DESCRIPTION[role]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Document status</h2>
        <dl className="space-y-3 text-sm">
          {(
            [
              ['DRAFT', 'Being written. Uploading a new version of an approved document returns it to Draft, because the approval covered the version that was reviewed.'],
              ['UNDER_REVIEW', 'Waiting for the named reviewer. New versions cannot be uploaded until the review is completed or cancelled.'],
              ['CHANGES_REQUESTED', 'The reviewer asked for changes. Upload a revised version, then send it for review again.'],
              ['APPROVED', 'The current version was approved by its reviewer.'],
              ['ARCHIVED', 'Read-only. It can still be opened, searched and downloaded.'],
            ] as const
          ).map(([status, text]) => (
            <div key={status} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <dt>
                <StatusBadge status={status} />
              </dt>
              <dd className="text-ink-soft">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">About the change summary</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          The summary and pre-review findings are produced automatically by DocStruct's comparison engine. They point at what changed and at
          wording that often needs a second look, such as a requirement changing from "shall" to "should", changed figures or dates, or a
          leftover TODO. They are advice for the reviewer, never a decision: only the reviewer approves or requests changes.
        </p>
      </section>
    </div>
  );
}
