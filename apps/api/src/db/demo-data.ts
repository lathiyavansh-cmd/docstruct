/**
 * What this file does
 *   Creates the demo accounts, project, folders and documents used for presentations and manual testing.
 *
 * How it works
 *   - seedDemoData() runs two parts, each skipped when its first account already exists, so it is safe to call
 *     twice and it tops up a database seeded by an older version. It then resets every demo password.
 *   - It uses the real service classes, so the same rules and activity logging apply as in the app.
 *   - store() uploads a file the way the web client does; pdf() writes a small text-layer PDF by hand.
 *
 * Where it fits
 *   Called by seed.ts (`npm run db:seed`) and by server.ts on start-up when SEED_DEMO=true (used for the
 *   first deployment). Module: scripts / server core (owner: Vansh).
 */
/**
 * Demo data for presentations and manual testing:  npm run db:seed
 *
 * Creates ten accounts (password: demo1234) and two projects with folders and documents in every review
 * state - including requirements documents under review, so the change summary and pre-review findings can be
 * shown immediately, and a password-protected contract sent to all members. Safe to run twice.
 */
import type { AppContext } from '../context.js';
import { AuthService } from '../modules/auth/service.js';
import { DocumentService } from '../modules/documents/service.js';
import { FolderService } from '../modules/folders/service.js';
import { ProjectService } from '../modules/projects/service.js';
import { ReviewService } from '../modules/reviews/service.js';
import { AnnotationService } from '../modules/annotations/service.js';
import { VersionService } from '../modules/versions/service.js';
import { UploadService } from '../modules/documents/uploads.js';
import type { FolderNodeDto } from '@docstruct/shared';
import { recordActivity } from '../lib/activity.js';
import { hashPassword } from '../modules/auth/password.js';
import { RecipientService } from '../modules/recipients/service.js';
import { TemplateService } from '../modules/templates/service.js';
import { CANTEEN_CHANGE_NOTES, CANTEEN_SRS, VENDOR_CONTRACT, WATER_REPORT } from './demo-content.js';

/** One simple password for every demo account. */
export const DEMO_PASSWORD = 'demo1234';
const PASSWORD = DEMO_PASSWORD;

/** Part 1: the team's project. Skipped when the first demo user already exists. */
async function seedCore(ctx: AppContext): Promise<boolean> {
  // Running the seed twice would fail on duplicate emails, so stop if the first demo user exists.
  const existing = await ctx.db.query(`SELECT 1 FROM profiles WHERE email = 'vansh@docstruct.test'`);
  if (existing.rows.length) return false;

  const auth = new AuthService(ctx);
  const projects = new ProjectService(ctx);
  const folders = new FolderService(ctx);
  const documents = new DocumentService(ctx);
  const versions = new VersionService(ctx);
  const reviews = new ReviewService(ctx);
  const annotations = new AnnotationService(ctx);
  const uploads = new UploadService(ctx);

  const vansh = (await auth.signUp('vansh@docstruct.test', PASSWORD, 'Vansh Lathiya')).user;
  const vivan = (await auth.signUp('vivan@docstruct.test', PASSWORD, 'Vivan Dhoka')).user;
  const shrut = (await auth.signUp('shrut@docstruct.test', PASSWORD, 'Shrut Diwakar')).user;
  const reviewer = (await auth.signUp('reviewer@docstruct.test', PASSWORD, 'Faculty Reviewer')).user;

  const project = await projects.create(vansh.userId, 'DocStruct Mini Project', 'Phase deliverables for the B.Tech mini project: requirements, design and weekly reports.');
  const pid = project.projectId;
  await projects.addMember(pid, vansh.userId, 'vivan@docstruct.test', 'EDITOR');
  await projects.addMember(pid, vansh.userId, 'shrut@docstruct.test', 'EDITOR');
  await projects.addMember(pid, vansh.userId, 'reviewer@docstruct.test', 'REVIEWER');

  // Searches the nested folder tree with a stack (depth-first) and returns the folder id by name.
  const find = (tree: FolderNodeDto[], name: string): string => {
    const stack = [...tree];
    while (stack.length) {
      const f = stack.pop()!;
      if (f.name === name) return f.folderId;
      stack.push(...f.children);
    }
    throw new Error(`folder ${name} not found`);
  };
  let tree = await folders.create(pid, vansh.userId, 'Requirements', null);
  tree = await folders.create(pid, vansh.userId, 'Design', null);
  tree = await folders.create(pid, vivan.userId, 'Reports', null);
  tree = await folders.create(pid, vivan.userId, 'Weekly', find(tree, 'Reports'));

  // Uploads a file the same way the web client does: get an upload ticket, then write the bytes
  // under that key. The key is later passed to documents.create() or versions.upload().
  async function store(userId: string, fileName: string, content: Buffer | string): Promise<string> {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    const ticket = await uploads.issue(pid, userId, fileName, data.length);
    await ctx.storage.writeBuffer(ticket.uploadKey, data);
    return ticket.uploadKey;
  }

  /** A small text-layer PDF written by hand (Helvetica, one paragraph per block). */
  function pdf(paragraphs: string[][]): Buffer {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const ops = ['BT', '/F1 12 Tf', '72 740 Td'];
    paragraphs.forEach((para, p) =>
      para.forEach((line, l) => {
        if (p || l) ops.push(l === 0 ? '0 -30 Td' : '0 -16 Td');
        ops.push(`(${esc(line)}) Tj`);
      }),
    );
    ops.push('ET');
    const content = ops.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ];
    let body = '%PDF-1.4\n';
    const offsets: number[] = [];
    // A PDF ends with a cross-reference table giving the byte offset of each object,
    // so we record each offset while writing the objects.
    objects.forEach((o, i) => {
      offsets.push(Buffer.byteLength(body, 'latin1'));
      body += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = Buffer.byteLength(body, 'latin1');
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(body, 'latin1');
  }

  // 1. Requirements document with two versions, under review: shows the pre-review on the reviewer's queue.
  const srsV1 = `# 3.8 Search and Filtering

  The system shall allow a project member to search for documents within a project by title.

  Search covers titles only.

  The system shall restrict search results to projects in which the searching user holds a membership.

  # 3.9 Project Dashboard

  The system shall display, for the selected project, the number of documents currently in each status.

  The system shall display the most recent activity within the project on the dashboard.

  # 5.1 Performance

  Uploaded files are limited to 50 MB. Search results are returned within 3 seconds.`;
  const srsV2 = `# 3.8 Search and Filtering

  The system shall allow a project member to search for documents within a project by title, tolerating minor spelling differences.

  Search covers titles and extracted document content.

  The system shall restrict search results to projects in which the searching user holds a membership.

  # 3.9 Project Dashboard

  The system should display, for the selected project, the number of documents currently in each status.

  The system shall display the most recent activity within the project on the dashboard.

  TODO: confirm with the guide whether overdue reviews appear on the dashboard (see Section 3.12).

  # 5.1 Performance

  Uploaded files are limited to 50 MB. Search results are returned within 2 seconds.`;
  const srs = await documents.create(pid, vansh.userId, {
    uploadKey: await store(vansh.userId, 'SRS_Sections_3_and_5.md', srsV1),
    title: 'SRS Sections 3 and 5',
    description: 'Functional and performance requirements, IEEE 830 format.',
    folderId: find(tree, 'Requirements'),
    changeNote: 'First complete draft',
  });
  // Wait for background text extraction of version 1 before uploading version 2,
  // so the change summary can compare the two texts.
  await ctx.jobs.idle();
  await versions.upload(srs.documentId, vansh.userId, await store(vansh.userId, 'SRS_Sections_3_and_5.md', srsV2), 'Fuzzy title search, content search, tighter search time');
  await ctx.jobs.idle();
  const srsReview = await reviews.submit(srs.documentId, vansh.userId, { reviewerId: reviewer.userId, note: 'Please check the search and dashboard changes.' });

  // 2. Algorithm design notes: reviewed and approved.
  const algo = await documents.create(pid, shrut.userId, {
    uploadKey: await store(
      shrut.userId,
      'Core_Algorithms.md',
      `# Core algorithms\n\nVersion numbers are allocated under a per-document advisory lock, so concurrent uploads never clash.\n\nA folder can never be moved inside one of its own subfolders.\n\nThe pre-review compares paragraphs and ignores formatting-only edits.`,
    ),
    title: 'Core Algorithms',
    folderId: find(tree, 'Design'),
  });
  const algoReview = await reviews.submit(algo.documentId, shrut.userId, { reviewerId: reviewer.userId });
  await reviews.decide(algoReview.reviewId, reviewer.userId, true, 'Clear and complete.');

  // 3. Weekly report: changes requested.
  const weekly = await documents.create(pid, vivan.userId, {
    uploadKey: await store(vivan.userId, 'Weekly_Report_Week_7.txt', 'Week 7\n\nCompleted the review workflow API.\n\nNext week: dashboard screens.'),
    title: 'Weekly Report Week 7',
    folderId: find(tree, 'Weekly'),
  });
  const weeklyReview = await reviews.submit(weekly.documentId, vivan.userId, { reviewerId: vansh.userId });
  await reviews.decide(weeklyReview.reviewId, vansh.userId, false, 'Add the test results and the hours spent.');

  // 4. A PDF with a comment pinned to a region, for the annotation demo.
  const phase = await documents.create(pid, vansh.userId, {
    uploadKey: await store(
      vansh.userId,
      'Phase_2_Summary.pdf',
      pdf([
        ['DocStruct - Phase 2 summary'],
        ['The SRS specifies nine features with 110 functional requirements.', 'Each requirement is named in Feature.Action.Detail form.'],
        ['The database has eleven tables; document versions are immutable.', 'Every upload creates a new version rather than overwriting one.'],
        ['Twelve core algorithms are documented with a worked example.'],
      ]),
    ),
    title: 'Phase 2 Summary',
    folderId: find(tree, 'Design'),
  });
  await annotations.create(phase.documentId, vivan.userId, {
    body: 'Should we list the eleven tables here?',
    pageNumber: 1,
    region: { x: 0.11, y: 0.17, width: 0.62, height: 0.06 },
  });

  // 5. A plain draft.
  await documents.create(pid, shrut.userId, {
    uploadKey: await store(shrut.userId, 'Test_Plan.md', '# Test plan\n\n- Unit tests for every algorithm\n- API tests for every module\n- Manual usability walkthrough'),
    title: 'Test Plan',
  });

  await ctx.jobs.idle();
  console.log(`Seeded project "${project.name}" with 5 documents (one under review: ${srsReview.documentTitle}).`);
  return true;
}

/** The ten demo accounts, in the order the login page lists them. */
export const DEMO_ACCOUNTS: Array<{ email: string; name: string; role: string; tryThis: string }> = [
  { email: 'vansh@docstruct.test', name: 'Vansh Lathiya', role: 'Owner', tryThis: 'Manage members, send a document to all, protect a document' },
  { email: 'vivan@docstruct.test', name: 'Vivan Dhoka', role: 'Editor', tryThis: 'Upload a revised version of the weekly report' },
  { email: 'shrut@docstruct.test', name: 'Shrut Diwakar', role: 'Editor', tryThis: 'Create folders, upload documents, comment' },
  { email: 'reviewer@docstruct.test', name: 'Faculty Reviewer', role: 'Reviewer', tryThis: 'Review the SRS waiting in the review queue' },
  { email: 'ananya@docstruct.test', name: 'Ananya Sharma', role: 'Reviewer', tryThis: 'Read documents and add comments' },
  { email: 'rohan@docstruct.test', name: 'Rohan Mehta', role: 'Viewer', tryThis: 'Read-only access in both projects' },
  { email: 'priya@docstruct.test', name: 'Priya Nair', role: 'Owner, second project', tryThis: 'Campus Canteen App: versions, sharing, passwords' },
  { email: 'kabir@docstruct.test', name: 'Kabir Singh', role: 'Editor, second project', tryThis: 'Compare the four versions of the canteen SRS' },
  { email: 'isha@docstruct.test', name: 'Isha Patel', role: 'Reviewer, second project', tryThis: 'Review the canteen SRS with its pre-review findings' },
  { email: 'arjun@docstruct.test', name: 'Arjun Rao', role: 'New user', tryThis: 'Start from an empty account and create a project' },
];

/** The password of the protected contract in the second demo project. */
export const DEMO_DOCUMENT_PASSWORD = 'canteen123';

/**
 * Part 2: six more accounts and a second project (Campus Canteen App) with a four-version requirements
 * document under review, a report for the summary, and a password-protected contract sent to all members.
 * Skipped when the account it creates first (priya@) already exists, so it also tops up older demo databases.
 */
async function seedExtras(ctx: AppContext): Promise<boolean> {
  const exists = await ctx.db.query(`SELECT 1 FROM profiles WHERE email = 'priya@docstruct.test'`);
  if (exists.rows.length) return false;
  const auth = new AuthService(ctx);
  const projects = new ProjectService(ctx);
  const folders = new FolderService(ctx);
  const documents = new DocumentService(ctx);
  const versions = new VersionService(ctx);
  const reviews = new ReviewService(ctx);
  const annotations = new AnnotationService(ctx);
  const uploads = new UploadService(ctx);
  const recipients = new RecipientService(ctx);

  const make = async (email: string, name: string) => (await auth.signUp(email, PASSWORD, name)).user;
  const ananya = await make('ananya@docstruct.test', 'Ananya Sharma');
  const rohan = await make('rohan@docstruct.test', 'Rohan Mehta');
  const priya = await make('priya@docstruct.test', 'Priya Nair');
  const kabir = await make('kabir@docstruct.test', 'Kabir Singh');
  const isha = await make('isha@docstruct.test', 'Isha Patel');
  // Arjun is deliberately in no project, to show a brand-new account.
  await make('arjun@docstruct.test', 'Arjun Rao');

  // The new people join the team's project as a second reviewer and a read-only viewer.
  const team = await ctx.db.query<{ project_id: string; owner: string }>(
    `SELECT p.project_id, m.user_id AS owner FROM projects p
       JOIN project_members m ON m.project_id = p.project_id AND m.role = 'OWNER'
       JOIN profiles u ON u.user_id = m.user_id
      WHERE p.name = 'DocStruct Mini Project' AND u.email = 'vansh@docstruct.test' LIMIT 1`,
  );
  if (team.rows[0]) {
    await projects.addMember(team.rows[0].project_id, team.rows[0].owner, ananya.email, 'REVIEWER');
    await projects.addMember(team.rows[0].project_id, team.rows[0].owner, rohan.email, 'VIEWER');
  }

  // Second project, owned by Priya.
  const project = await projects.create(priya.userId, 'Campus Canteen App', 'Requirements, reports and vendor documents for the canteen pre-order system.');
  const pid = project.projectId;
  await projects.addMember(pid, priya.userId, kabir.email, 'EDITOR');
  await projects.addMember(pid, priya.userId, isha.email, 'REVIEWER');
  await projects.addMember(pid, priya.userId, 'vansh@docstruct.test', 'EDITOR');
  await projects.addMember(pid, priya.userId, rohan.email, 'VIEWER');
  let tree = await folders.create(pid, priya.userId, 'Requirements', null);
  tree = await folders.create(pid, priya.userId, 'Reports', null);
  tree = await folders.create(pid, priya.userId, 'Vendor', null);
  const folder = (name: string) => tree.find((f) => f.name === name)!.folderId;

  const store = async (userId: string, fileName: string, content: string) => {
    const data = Buffer.from(content, 'utf8');
    const ticket = await uploads.issue(pid, userId, fileName, data.length);
    await ctx.storage.writeBuffer(ticket.uploadKey, data);
    return ticket.uploadKey;
  };

  // 1. Requirements in four versions (Kabir and Priya take turns), the last one sent to Isha for review.
  const srs = await documents.create(pid, kabir.userId, {
    uploadKey: await store(kabir.userId, 'Canteen_SRS.md', CANTEEN_SRS[0]),
    title: 'Canteen Pre-Order SRS',
    description: 'Software requirements for ordering canteen food ahead of the lunch break.',
    folderId: folder('Requirements'),
    changeNote: 'First draft',
  });
  for (let v = 1; v < CANTEEN_SRS.length; v++) {
    const by = v % 2 ? priya : kabir;
    await versions.upload(srs.documentId, by.userId, await store(by.userId, 'Canteen_SRS.md', CANTEEN_SRS[v]), CANTEEN_CHANGE_NOTES[v]);
  }
  await ctx.jobs.idle();
  const due = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
  await reviews.submit(srs.documentId, kabir.userId, { reviewerId: isha.userId, dueDate: due, note: 'Please check the new acceptance criteria and the payments section.' });
  await annotations.create(srs.documentId, isha.userId, { body: 'Who approves refunds when the manager is away?' });

  // 2. A report that summarises well, reviewed and approved.
  const report = await documents.create(pid, kabir.userId, {
    uploadKey: await store(kabir.userId, 'Campus_Water_Report.md', WATER_REPORT),
    title: 'Campus Water Report',
    description: 'Where water is wasted on campus and what three low-cost fixes saved.',
    folderId: folder('Reports'),
  });
  await ctx.jobs.idle();
  const reportReview = await reviews.submit(report.documentId, kabir.userId, { reviewerId: isha.userId });
  await reviews.decide(reportReview.reviewId, isha.userId, true, 'Clear findings and good recommendations.');

  // 3. A password-protected contract, sent to every member of the project.
  const contract = await documents.create(pid, priya.userId, {
    uploadKey: await store(priya.userId, 'Vendor_Contract_Terms.md', VENDOR_CONTRACT),
    title: 'Vendor Contract Terms',
    description: 'Commercial terms with the canteen vendor. Ask Priya for the password.',
    folderId: folder('Vendor'),
  });
  await ctx.db.tx(async (q) => {
    await q.query(
      `UPDATE documents SET password_hash = $2, protected_at = now(), protected_by = $3, password_version = 1 WHERE document_id = $1`,
      [contract.documentId, await hashPassword(DEMO_DOCUMENT_PASSWORD), priya.userId],
    );
    await recordActivity(q, { projectId: pid, actorId: priya.userId, action: 'document.protected', entityType: 'document', entityId: contract.documentId, entityLabel: contract.title });
  });
  await recipients.shareWithMembers(contract.documentId, priya.userId, `Please read before Friday. The password is ${DEMO_DOCUMENT_PASSWORD}.`);

  await ctx.jobs.idle();
  console.log(`Seeded project "${project.name}" with 3 documents and 6 more demo accounts.`);
  return true;
}

/**
 * Part 3: two document templates in Campus Canteen App (one document complete, one missing a section) and
 * an overdue, nudged review in the team's project, so the Reminders page has something to show.
 * Skipped when the project already has a template, so it also tops up older demo databases.
 */
async function seedTemplatesAndReminders(ctx: AppContext): Promise<boolean> {
  const canteen = await ctx.db.query<{ project_id: string; owner: string }>(
    `SELECT p.project_id, m.user_id AS owner FROM projects p
       JOIN project_members m ON m.project_id = p.project_id AND m.role = 'OWNER'
      WHERE p.name = 'Campus Canteen App' LIMIT 1`,
  );
  const project = canteen.rows[0];
  if (!project) return false;
  const existing = await ctx.db.query('SELECT 1 FROM project_templates WHERE project_id = $1', [project.project_id]);
  if (existing.rows.length) return false;

  const templates = new TemplateService(ctx);
  const docId = async (title: string) => (await ctx.db.query<{ document_id: string }>('SELECT document_id FROM documents WHERE project_id = $1 AND title = $2', [project.project_id, title])).rows[0]?.document_id;

  // The SRS checklist asks for a References section the canteen SRS does not have yet, so its check shows one gap.
  const srsTemplate = await templates.create(project.project_id, project.owner, {
    name: 'SRS checklist',
    description: 'What every requirements document in this project must contain before review.',
    headings: ['Introduction', 'Users', 'Functional Requirements', 'Non-functional Requirements', 'Acceptance Criteria', 'References'],
  });
  const reportTemplate = await templates.create(project.project_id, project.owner, {
    name: 'Project report',
    description: 'Structure for reports submitted to the faculty.',
    headings: ['Background', 'Objectives', 'Method', 'Findings', 'Results', 'Recommendations'],
  });
  const srs = await docId('Canteen Pre-Order SRS');
  const report = await docId('Campus Water Report');
  if (srs) await templates.setDocumentTemplate(srs, project.owner, srsTemplate.templateId);
  if (report) await templates.setDocumentTemplate(report, project.owner, reportTemplate.templateId);

  // The team project's SRS review was due two days ago and Vansh has already reminded the reviewer once.
  await ctx.db.query(
    `UPDATE reviews r SET due_date = current_date - 2, nudged_at = now() - interval '3 hours', nudged_by = r.submitted_by, nudge_count = 1
      FROM documents d WHERE d.document_id = r.document_id AND d.title = 'SRS Sections 3 and 5' AND r.status = 'PENDING'`,
  );
  console.log('Seeded two document templates and an overdue review.');
  return true;
}

/**
 * Sets every demo account's password back to DEMO_PASSWORD, so the demo always works even after a visitor
 * changed one. Only the listed demo emails are touched.
 */
async function resetDemoPasswords(ctx: AppContext): Promise<void> {
  await ctx.db.query(
    `UPDATE user_credentials SET password_hash = $1
      WHERE user_id IN (SELECT user_id FROM profiles WHERE email = ANY($2::text[]))`,
    [await hashPassword(PASSWORD), DEMO_ACCOUNTS.map((a) => a.email)],
  );
}

/**
 * Loads the demo data: the team's project, then the second project and the extra accounts, then makes sure
 * every demo password is DEMO_PASSWORD. Each part is skipped if it already exists, so running it again is
 * safe. Returns true when anything new was created.
 */
export async function seedDemoData(ctx: AppContext): Promise<boolean> {
  const core = await seedCore(ctx);
  const extras = await seedExtras(ctx);
  const more = await seedTemplatesAndReminders(ctx);
  await resetDemoPasswords(ctx);
  console.log(`Demo accounts (password ${PASSWORD}):`);
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.email.padEnd(26)} ${a.name}, ${a.role}`);
  return core || extras || more;
}
