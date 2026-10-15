/**
 * What this file does
 *   Tests background text extraction from uploaded files: Markdown text is extracted, images are
 *   marked unsupported, a failed extraction keeps the version, and PDFs work through the Python service.
 *
 * How it works
 *   - beforeAll calls createTestEnv() from helpers.ts, which boots the whole API on an in-memory PGlite
 *     database, and creates one project.
 *   - Each test uploads a file with real HTTP requests (supertest), then extraction() waits for the
 *     background jobs and reads extraction_status and extracted_text from the database.
 *   - tinyPdf() builds a small valid PDF by hand. The Python test is skipped if Python is not installed.
 *
 * Where it fits
 *   Run by Vitest. Covers the text extractor (src/extraction/extractor.ts) as used by document upload.
 *   Module: Text extractor (owner: Shrut).
 */
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDocument, createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

let env: TestEnv;
let owner: TestUser;
let projectId: string;

beforeAll(async () => {
  env = await createTestEnv();
  owner = await signUp(env, 'Owner');
  projectId = await createProject(env, owner);
});
afterAll(() => env.close());

async function extraction(versionId: string) {
  await env.ctx.jobs.idle();
  const { rows } = await env.ctx.db.query<{ extraction_status: string; extracted_text: string | null }>(
    'SELECT extraction_status, extracted_text FROM document_versions WHERE version_id = $1',
    [versionId],
  );
  return rows[0];
}

/** A one-page PDF with a Helvetica text layer, assembled by hand. */
function tinyPdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  objects.forEach((o, i) => (body += `${i + 1} 0 obj\n${o}\nendobj\n`));
  body += 'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
  return Buffer.from(body, 'latin1');
}

// Tries each Python command name and checks it really runs, so the PDF test can be skipped otherwise.
const pythonAvailable = ['py', 'python3', 'python'].some((cmd) => {
  const args = cmd === 'py' ? ['-3', '-c', 'print(1)'] : ['-c', 'print(1)'];
  return spawnSync(cmd, args, { encoding: 'utf8' }).stdout?.trim() === '1';
});

describe('text extraction (Version.Text.Extract)', () => {
  it('extracts text from a Markdown upload in the background', async () => {
    const doc = await createDocument(env, owner, projectId, 'notes.md', '# Notes\r\n\r\nSearch covers titles.');
    expect(doc.currentVersion.extractionStatus).toBe('PENDING');
    const row = await extraction(doc.currentVersion.versionId);
    // Windows line endings (\r\n) in the upload come back as plain \n.
    expect(row).toEqual({ extraction_status: 'DONE', extracted_text: '# Notes\n\nSearch covers titles.' });
  });

  it('marks images as unsupported without attempting extraction', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    const doc = await createDocument(env, owner, projectId, 'pic.png', png);
    expect((await extraction(doc.currentVersion.versionId)).extraction_status).toBe('UNSUPPORTED');
  });

  it('records a failure but keeps the version when extraction is impossible (Version.Text.Failure)', async () => {
    const doc = await createDocument(env, owner, projectId, 'scan.pdf', tinyPdf('x'));
    // The builtin driver cannot read PDFs, which stands in for any extraction failure.
    const row = await extraction(doc.currentVersion.versionId);
    expect(row.extraction_status).toBe('FAILED');
    await env.http.get(`/api/documents/${doc.documentId}/download`).set(owner.auth).expect(200);
  });

  it.skipIf(!pythonAvailable)('extracts PDF text through the Python service', async () => {
    env.ctx.config.extractor.driver = 'python';
    env.ctx.config.extractor.pythonBin = spawnSync('py', ['-3', '-c', '1']).status === 0 ? 'py' : 'python3';
    try {
      const doc = await createDocument(env, owner, projectId, 'spec.pdf', tinyPdf('Version history is immutable'));
      const row = await extraction(doc.currentVersion.versionId);
      expect(row).toEqual({ extraction_status: 'DONE', extracted_text: 'Version history is immutable' });
    } finally {
      env.ctx.config.extractor.driver = 'builtin';
    }
  });
});
