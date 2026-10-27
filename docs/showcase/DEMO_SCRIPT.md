# DocStruct: showcase script

A 15-minute walkthrough of every feature on the live site, using the demo accounts. Each step says who to
log in as, what to click, what the professor will see, and what to say. The files to upload are in this
folder.

## Before you start

- Site: https://docstruct.onrender.com. Open it **five minutes early**: the free server sleeps after
  15 idle minutes and the first visit takes about a minute to wake it.
- Every demo account uses the password `demo1234`. The login page lists them: click a name and press Log in.
- Keep this folder open; you will upload `Canteen_SRS_v5.md`, `Library_Booking_Proposal_v1.md` and
  `Library_Booking_Proposal_v2.md`.
- The password of the protected contract is `canteen123`.
- Use a private window (or log out) between accounts. Logged-in users skip the overview page.

| Account | Who | Use them for |
|---|---|---|
| vansh@docstruct.test | Vansh Lathiya, owner of DocStruct Mini Project | Overdue review, reminders, owner features |
| priya@docstruct.test | Priya Nair, owner of Campus Canteen App | Templates, protection, send to all |
| kabir@docstruct.test | Kabir Singh, editor in Campus Canteen App | Uploading v5, compare, Shared with me |
| isha@docstruct.test | Isha Patel, reviewer in Campus Canteen App | Review queue, pre-review, approve |
| reviewer@docstruct.test | Faculty Reviewer | Being nudged; the overdue review |
| arjun@docstruct.test | Arjun Rao, no projects | Brand-new user: create a project from nothing |
| rohan@docstruct.test | Rohan Mehta, viewer | Read-only role (optional) |

## 1. The overview page (1 min)

Open the site logged out. Scroll once through the page.

- **Say:** "DocStruct keeps every version of a project's documents, shows reviewers exactly what changed, and
  checks each revision before anyone reads it. Everything here is our own code: sign-in, storage, text
  extraction, the comparison engine, the summariser and search. Supabase only stores the data."
- Click **v1 to v4** on the hero card: each version highlights its changes and the finding the pre-review
  engine raised. Point at the "Try it" demos if there is time (the password demo opens with `canteen123`).

## 2. Log in and the workspace (1 min)

Log in as **priya@docstruct.test** (click her name in "Use a demo account").

- Projects page: she owns **Campus Canteen App**. Open it.
- **Overview tab:** status counts, documents under review with due dates, recent activity. Everything on this
  page comes from the immutable activity log.
- **Documents tab:** folders Requirements, Reports and Vendor. Open **Requirements > Canteen Pre-Order SRS**.

## 3. Versions, summary and the template check (2 min)

On the Canteen Pre-Order SRS page:

- **Say:** "This document has four versions. Nothing is ever overwritten; v4 is current and v1 to v3 are
  read-only." Show the Versions tab on the right; click v2 to view it, then back to v4.
- **Summary card:** switch Short / Medium / Detailed. **Say:** "The summariser ranks the document's own
  sentences (TextRank over TF-IDF); it never writes a sentence the document does not contain, and it is
  labelled machine-generated."
- **Template check card:** it reads "1 missing": the SRS checklist asks for a References section.
  **Say:** "An owner defines a template, a list of required sections. Every version is checked against it,
  ignoring numbering and wording differences. The faculty guide's required structure becomes a live checklist."
- Click **More > Protect with password** only if you want to show it on this document; otherwise the
  contract in step 7 already is.

## 4. Upload v5 and compare (2 min)

Still as Priya (or log in as **kabir@docstruct.test**, an editor):

- The SRS is under review, so first open the **Review** tab and press **Cancel review** (say: "a new version
  needs a fresh review").
- **Upload new version** > choose `Canteen_SRS_v5.md`, change note: "Added references, raised slot capacity".
- The page reloads at **v5**. The **Template check** now reads "All sections present".
- Open **Compare** (from the Versions tab, compare v4 with v5). **Say:** "Paragraphs are lined up first, then
  words. Three changes: 60 orders became 80, 'shall load within 2 seconds' became 'should load within 3
  seconds', and a References section was added." Switch between side-by-side and inline.

## 5. Send for review, pre-review and the reviewer's decision (3 min)

- As Priya or Kabir: **Send for review** > reviewer Isha Patel, due date tomorrow, note "Please check the
  capacity change." If the document had been missing sections, this dialog would warn you.
- Log in as **isha@docstruct.test**. The sidebar shows **Review queue 1** and **Reminders 1** (due tomorrow).
- Open the review from the queue. In the Review tab, show **What changed since the previous version**:
  the change summary and the findings, each naming its rule: *Value changed* (60 → 80), *Requirement
  weakened* (shall → should), *Section added* (References). **Say:** "Thirteen explainable rules. It is
  advisory; only the reviewer decides."
- Add a comment on the document (Comments tab), then **Request changes** with a note ("Keep 'shall' for the
  load time"), or **Approve**. The status badge changes everywhere at once.

## 6. Reminders and nudging (2 min)

Log in as **vansh@docstruct.test**.

- Open **Reminders**: "Faculty Reviewer has not reviewed this yet, Overdue by 2 days, Reminded 3 h ago".
  The **Remind reviewer** button rests because one reminder a day is allowed. **Say:** "Reviews stall in real
  teams. Due dates are tracked by the database, reminders are collected in one place, and the submitter can
  nudge the reviewer without email."
- Log in as **reviewer@docstruct.test**: the queue shows the same review with "Vansh Lathiya reminded you"
  and the overdue label. Approve it, then show that Vansh's Reminders page now lists the decision under
  "This week" (optional, if time allows).

## 7. Password protection and send to all (2 min)

Log in as **priya@docstruct.test**, open **Vendor > Vendor Contract Terms**.

- It is locked. **Say:** "Even the owner needs the password. Five wrong tries lock it for 15 minutes; a correct
  one keeps it open for 12 hours on that login; the owner can reset a forgotten password, and that is logged."
- Type `canteen123`. The contents appear.
- **More > Send to all members**: it was already sent with a note. Log in as **kabir@docstruct.test** and open
  **Shared with me**: the contract is there, marked new, and asks for the password when opened. **Say:** "One
  action reaches every member, whether the project has five people or five hundred."

## 8. A brand-new user (2 min)

Log in as **arjun@docstruct.test** (no projects).

- **New project** "Library Seat Booking". Create a folder "Proposal". **Upload** `Library_Booking_Proposal_v1.md`.
- **Upload new version** with `Library_Booking_Proposal_v2.md`, note "Tightened requirements". Open Compare:
  *should* became *shall* twice, 24 hours became 48, the dates moved, a "Risks" section was added and a
  **TBD** placeholder appears in 4.4. **Say:** "Every one of these is a finding the reviewer would get."
- **Members**: add isha@docstruct.test as Reviewer and send v2 for review. (Isha's queue now has it.)
- **Templates tab**: create "Proposal checklist" with Introduction, Objectives, Scope, Functional
  Requirements, Timeline, Risks, References; pick it on the document: "1 missing: References".

## 9. Search, roles and the activity log (1 min)

- **Search** (Ctrl+K or the sidebar): type "refund" or "payments". **Say:** "Typo-tolerant title search plus
  full-text search over the extracted text, in one SQL query. Protected documents are never searchable."
- **Members** page in Campus Canteen App: four roles; the interface hides what a role cannot do, and the
  API checks every request again. Log in as **rohan@docstruct.test** (viewer) if asked: no upload or review
  buttons anywhere.
- **Activity** tab: the immutable log of everything shown today, including the nudge and the template changes.

## Questions the professor may ask

- **Is any AI or external API used?** No. Comparison is a sequence matcher over paragraphs and words;
  pre-review is thirteen regular-expression rules; summaries are TextRank; search is PostgreSQL trigram and
  full-text; PDF and DOCX text is read by a Python standard-library parser; passwords are scrypt.
- **What happens to old versions?** Kept forever, read-only; any two can be compared; any can be restored
  as a new version.
- **Can two people review at once?** One open review per document, enforced by a database index.
- **How is it tested?** 171 server tests and 7 browser tests run on every change; the CI also checks commit
  messages.
- **Where is it hosted?** One Docker container on Render; PostgreSQL on Supabase; uploaded files are stored
  in the database so a restart loses nothing.

## If something goes wrong

- The site is slow to wake: say it is a free server and continue with the overview page.
- A review is already open on a document: cancel it from the Review tab (owner or submitter) and continue.
- You uploaded v5 in a rehearsal: upload `Canteen_SRS_v5.md` again as v6, the demo works the same.
- Demo passwords reset to `demo1234` on every server restart, so nothing a rehearsal changes is permanent
  except documents you added; delete those from their More menu afterwards.
