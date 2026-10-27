/**
 * What this file does
 *   This is the in-app Help screen. It explains the main tasks step by step, the project roles, the document statuses, and how the automatic summaries work.
 *
 * How it works
 *   - It is a static page: no useQuery, no API calls.
 *   - Facts like accepted file formats, the upload size limit and role names come from the shared package (@docstruct/shared), so the help text always matches the real rules.
 *   - STEPS is a list of [title, text] pairs drawn as a numbered timeline.
 *   - motion is used only for entrance animations.
 *
 * Where it fits
 *   Route /help in App.tsx, inside AppLayout. Module: shared help page (owner: Vansh).
 */
import { FILE_FORMATS, MAX_UPLOAD_BYTES, PROJECT_ROLES, ROLE_DESCRIPTION, ROLE_LABEL, formatBytes } from '@docstruct/shared';
import { motion } from 'motion/react';
import { PageHeader, StatusBadge } from '../components/ui';

// The main workflow, in order. Each item is [step title, explanation].
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
        <ol className="relative space-y-2">
          <motion.span
            className="absolute left-[17px] top-5 bottom-5 w-px origin-top bg-gradient-to-b from-primary/50 to-rule"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            aria-hidden
          />
          {STEPS.map(([title, text], i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 + i * 0.06 }}
              className="group grid grid-cols-[2.25rem_1fr] gap-3 rounded-xl py-2 pr-3 transition-colors hover:bg-paper"
            >
              <span className="relative flex size-9 items-center justify-center rounded-full bg-surface font-serif text-base text-primary ring-1 ring-rule transition-[background-color,color,transform] duration-200 tabular group-hover:scale-110 group-hover:bg-primary group-hover:text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Roles</h2>
        <dl className="divide-y divide-rule border-y border-rule">
          {/* One row per role (Owner, Editor, and so on), with the label and description from the shared package. */}
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
          {/* Each document status with the same coloured badge used in the rest of the app. */}
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

      <section className="mt-10">
        <h2 className="mb-2 text-lg font-semibold">About the document summary</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Every document page opens with a summary of the version you are viewing: its most important sentences in reading order, its key
          terms and, for documents with headings, the gist of each section. Choose Short, Medium or Detailed. DocStruct's own summariser picks
          sentences that share the most vocabulary with the rest of the document (the TextRank method) and skips repeats. It copies sentences
          from the document and never writes new ones, so it cannot state anything the document does not say. Image files have no text to
          summarise.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-2 text-lg font-semibold">Password-protected documents</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Editors and owners can lock a document from its More menu with Protect with password. Everyone then needs the password to open
          it, project owners included; the title stays visible, but the preview, summary, comments, comparison and downloads stay hidden.
          After the right password the document stays open for that person for 12 hours on that login. Changing the password locks everyone
          out until they get the new one. If the password is forgotten, a project owner can set a new one, and this is recorded in the
          activity log. Share links to a protected document ask for the password too.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="mb-2 text-lg font-semibold">Sending a document to all members</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          A project owner can choose Send to all members from a document's More menu, with an optional note. The document then appears in
          every member's Shared with me list, marked as new until they open it, however many members the project has.
        </p>
      </section>

      <section className="mt-10 rounded-2xl border border-rule bg-paper/60 p-5">
        <h2 className="mb-2 text-lg font-semibold">Interface credits</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Some interface pieces (animated icons, the sidebar, card glow, counters, highlights and entrance effects) are open-source components
          published on 21st.dev by their authors: animate-ui, unlumen, Magic UI and motion-primitives, all under the MIT licence. They only
          change how the screens look and move. Every DocStruct feature, including sign-in, storage, text extraction, comparison and the
          change summary, is written by the team.
        </p>
      </section>
    </div>
  );
}
