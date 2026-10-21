/**
 * What this file does
 *   Creates the demo accounts, project, folders and documents used for presentations and manual testing.
 *
 * How it works
 *   - seedDemoData() returns false straight away if the demo user already exists, so it is safe to call twice.
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
 * Creates four local accounts (password: docstruct-demo), one project with folders, and documents in every
 * review state - including a two-version requirements document under review, so the change summary and
 * pre-review findings can be shown immediately. Safe to run twice: it stops if the demo users exist.
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

export const DEMO_PASSWORD = 'docstruct-demo';
const PASSWORD = DEMO_PASSWORD;

/** Loads the demo data into an empty database. Returns false (and changes nothing) if it is already there. */
export async function seedDemoData(ctx: AppContext): Promise<boolean> {
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
  console.log('Accounts (password docstruct-demo):');
  for (const u of [vansh, vivan, shrut, reviewer]) console.log(`  ${u.email.padEnd(26)} ${u.displayName}`);
  return true;
}
