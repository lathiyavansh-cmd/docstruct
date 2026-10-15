import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanSentence, keyTerms, sentenceUnits, summariseDocument, textRank } from '../src/modules/summary/summarise.js';
import { createDocument, createProject, createTestEnv, signUp, type TestEnv, type TestUser } from './helpers.js';

const REPORT = `# Document management platform

DocStruct keeps every document of a project in one folder tree. Each upload of a document creates a new version, and earlier versions are never overwritten.

## Versions

A version records who uploaded the file, when, and why. Any version can be downloaded, compared with another version, or restored as a new version. The current version is always the latest upload.

The office kettle was replaced on Tuesday.

## Reviews

A document is sent to one reviewer at a time. The reviewer approves the version or requests changes, and every decision is stored with the document. Reviews make sure every version that is approved has been read.

## Search

Members search document titles and the text inside every version. Results are ranked by title match, content match and how recently the document changed.`;

describe('summarisation engine', () => {
  it('splits sections, paragraphs, list items and sentences', () => {
    const { units, sectionCount } = sentenceUnits('# Plan\n\n- Unit tests for algorithms\n- API tests for modules\n\n## Later\n\nFirst point. Second point here.');
    expect(sectionCount).toBe(2);
    expect(units.map((u) => u.text)).toEqual(['Unit tests for algorithms', 'API tests for modules', 'First point.', 'Second point here.']);
    expect(units[0]).toMatchObject({ section: 'Plan', leadsSection: true });
    expect(units[2]).toMatchObject({ section: 'Later', leadsSection: true });
  });

  it('strips markdown from sentences', () => {
    expect(cleanSentence('1. Read the **current** version in [the viewer](http://x) with `pdf.js`')).toBe('Read the current version in the viewer with pdf.js');
  });

  it('ranks sentences that share vocabulary with the rest of the graph highest (TextRank)', () => {
    // Sentence 0 is linked to both others; 1 and 2 are linked only to 0; 3 is isolated.
    const scores = textRank([
      [0, 1, 1, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeCloseTo(scores[2]);
    expect(scores[3]).toBeLessThan(scores[1]);
  });

  it('keeps the central sentences, drops the off-topic one and preserves reading order', () => {
    const result = summariseDocument(REPORT)!;
    const detailed = result.levels.detailed.map((s) => s.text);
    expect(detailed.join(' ')).not.toContain('kettle');
    const positions = result.levels.detailed.map((s) => s.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(result.levels.short).toHaveLength(3);
  });

  it('nests the levels: a longer summary contains every sentence of a shorter one', () => {
    const { levels } = summariseDocument(REPORT)!;
    const has = (outer: typeof levels.short, inner: typeof levels.short) => inner.every((s) => outer.some((o) => o.position === s.position));
    expect(levels.medium.length).toBeGreaterThanOrEqual(levels.short.length);
    expect(levels.detailed.length).toBeGreaterThanOrEqual(levels.medium.length);
    expect(has(levels.medium, levels.short)).toBe(true);
    expect(has(levels.detailed, levels.medium)).toBe(true);
  });

  it('builds a section outline, key terms and reading statistics', () => {
    const result = summariseDocument(REPORT)!;
    expect(result.outline.map((o) => o.heading)).toEqual(['Document management platform', 'Versions', 'Reviews', 'Search']);
    expect(result.keyTerms).toContain('version');
    expect(result.stats).toMatchObject({ sections: 4, readingMinutes: 1 });
    expect(result.stats.words).toBeGreaterThan(100);
  });

  it('does not repeat near-identical sentences', () => {
    const text = 'Uploads create versions. Uploads create new versions. Uploads always create new versions. Reviewers approve documents. Search finds text.';
    const { levels } = summariseDocument(text)!;
    const uploads = levels.short.filter((s) => s.text.startsWith('Uploads'));
    expect(uploads).toHaveLength(1);
  });

  it('returns the whole text of a very short document and nothing for an empty one', () => {
    expect(summariseDocument('Only one sentence here.')!.levels.detailed.map((s) => s.text)).toEqual(['Only one sentence here.']);
    expect(summariseDocument('   \n\n  ')).toBeNull();
  });

  it('counts plural and singular forms together in key terms', () => {
    expect(keyTerms('The version is stored. Versions are immutable. Each version has a number.')[0]).toBe('version');
  });
});

describe('summary API', () => {
  let env: TestEnv;
  let owner: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let projectId: string;

  beforeAll(async () => {
    env = await createTestEnv();
    owner = await signUp(env, 'Owner');
    viewer = await signUp(env, 'Viewer');
    outsider = await signUp(env, 'Outsider');
    projectId = await createProject(env, owner, [[viewer, 'VIEWER']]);
  });
  afterAll(() => env.close());

  it('summarises the text of a version for any project member and stores the result', async () => {
    const doc = await createDocument(env, owner, projectId, 'platform.md', REPORT);
    await env.ctx.jobs.idle();
    const url = `/api/versions/${doc.currentVersion.versionId}/summary`;
    const first = await env.http.get(url).set(viewer.auth).expect(200);
    expect(first.body).toMatchObject({ status: 'READY', machineGenerated: true, versionNo: 1, documentId: doc.documentId });
    expect(first.body.levels.short).toHaveLength(3);
    expect(first.body.engine).toMatch(/^docstruct-summariser/);

    const second = await env.http.get(url).set(viewer.auth).expect(200);
    expect(second.body.generatedAt).toBe(first.body.generatedAt);
    const rows = await env.ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM version_summaries WHERE version_id = $1', [doc.currentVersion.versionId]);
    expect(rows.rows[0].n).toBe(1);
  });

  it('refuses people outside the project', async () => {
    const doc = await createDocument(env, owner, projectId, 'private.md', REPORT);
    await env.http.get(`/api/versions/${doc.currentVersion.versionId}/summary`).set(outsider.auth).expect(404);
  });

  it('reports images as unavailable', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    const doc = await createDocument(env, owner, projectId, 'scan.png', png);
    await env.ctx.jobs.idle();
    const res = await env.http.get(`/api/versions/${doc.currentVersion.versionId}/summary`).set(viewer.auth).expect(200);
    expect(res.body).toMatchObject({ status: 'UNAVAILABLE', levels: null });
    expect(res.body.reason).toContain('image');
  });
});
