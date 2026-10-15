/**
 * What this file does
 *   Unit tests for the comparison algorithms: SequenceMatcher, paragraph comparison and classification,
 *   word-level diff, the pre-review rules and the change summary.
 *
 * How it works
 *   - It does not start the API; it calls the functions in modules/diff directly with small text samples.
 *   - SequenceMatcher results are checked against values produced by Python's difflib on the same input.
 *   - analyse() runs the full pipeline (compare, classify, annotate, stats, findings, summary) like DiffService does.
 *
 * Where it fits
 *   Run by vitest. Covers compare.ts, prereview.ts and sequence-matcher.ts.
 *   Module: F3.6 Version Comparison & Pre-Review (owner: Vansh).
 */
import { describe, expect, it } from 'vitest';
import { annotateChanges, changeStatistics, classifySubstantive, compareVersions, isHeading, normalise, segmentParagraphs, wordDiff } from '../src/modules/diff/compare.js';
import { findIssues, summarise } from '../src/modules/diff/prereview.js';
import { SequenceMatcher } from '../src/modules/diff/sequence-matcher.js';

/** Expected values produced by Python's difflib.SequenceMatcher on the same inputs. */
describe('SequenceMatcher matches the reference implementation', () => {
  it('computes ratios and opcodes on strings', () => {
    const m = new SequenceMatcher<string>('abcd', 'bcde');
    expect(m.ratio()).toBe(0.75);
    expect(m.getOpcodes()).toEqual([
      ['delete', 0, 1, 0, 0],
      ['equal', 1, 4, 0, 3],
      ['insert', 4, 4, 3, 4],
    ]);
    const s = new SequenceMatcher<string>('search covers titles only.', 'search covers titles and extracted document content.');
    expect(s.ratio()).toBeCloseTo(0.615385, 6);
    expect(s.getOpcodes()).toEqual([
      ['equal', 0, 21, 0, 21],
      ['insert', 21, 21, 21, 45],
      ['equal', 21, 23, 45, 47],
      ['replace', 23, 25, 47, 51],
      ['equal', 25, 26, 51, 52],
    ]);
    expect(new SequenceMatcher<string>('private Thread currentThread;', 'private volatile Thread currentThread;').ratio()).toBeCloseTo(0.865672, 6);
  });

  it('applies the autojunk heuristic on long sequences', () => {
    // Deterministic pseudo-random words; with 200+ items, popular words cannot seed matches.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const words = ['alpha', 'beta', 'gamma', 'delta', 'eps'];
    const a = Array.from({ length: 300 }, () => words[Math.floor(rand() * 5)]);
    const b = [...a];
    b.splice(10, 10, 'zeta', 'zeta', 'zeta');
    const m = new SequenceMatcher<string>(a, b);
    expect(m.getOpcodes()[0]).toEqual(['equal', 0, 10, 0, 10]);
    expect(m.ratio()).toBeLessThan(0.2);
    expect(new SequenceMatcher<string>(a, b, false).ratio()).toBeGreaterThan(0.9);
  });
});

describe('Algorithms F and G - the worked example from the design document', () => {
  const v1 = 'The system shall store every uploaded version.\n\nReviewers approve or request modifications.\n\nSearch covers titles only.';
  const v2 =
    'The   system shall store every uploaded version .\n\nReviewers approve or request modifications.\n\nSearch covers titles and extracted document content.\n\nEvery decision is written to the activity log.';

  it('produces the same changes and statistics as the Python reference', () => {
    const changes = classifySubstantive(compareVersions(v1, v2));
    // The first paragraph only gained extra spaces, so it is a cosmetic (not substantive) modification.
    expect(changes.map((c) => [c.kind, c.isSubstantive])).toEqual([
      ['MODIFIED', false],
      ['MODIFIED', true],
      ['ADDED', true],
    ]);
    const stats = changeStatistics(changes, 3, 4);
    expect(stats).toMatchObject({ total: 3, added: 1, deleted: 0, modified: 2, substantive: 2, cosmetic: 1 });
  });

  it('normalises whitespace and spacing around punctuation', () => {
    expect(normalise('The   system  ( shall ) store .')).toBe('the system (shall) store.');
    expect(segmentParagraphs('a\n\n\n  b \n \nc')).toEqual(['a', 'b', 'c']);
  });

  it('splits an unrelated replacement into a deletion and an addition', () => {
    const changes = compareVersions('Alpha beta gamma.', 'Completely different sentence here.');
    expect(changes.map((c) => c.kind).sort()).toEqual(['ADDED', 'DELETED']);
  });

  it('produces word-level highlights for modifications', () => {
    expect(wordDiff('Search covers titles only.', 'Search covers titles and content.')).toEqual([
      { op: 'equal', text: 'Search covers titles ' },
      { op: 'delete', text: 'only' },
      { op: 'insert', text: 'and content' },
      { op: 'equal', text: '.' },
    ]);
  });
});

function analyse(before: string, after: string) {
  const changes = annotateChanges(classifySubstantive(compareVersions(before, after)), before, after);
  const stats = changeStatistics(changes, segmentParagraphs(before).length, segmentParagraphs(after).length);
  const findings = findIssues(changes, after);
  return { changes, stats, findings, summary: summarise(changes, stats, findings, before, after, { from: 1, to: 2 }) };
}

describe('pre-review engine (Algorithm H, in-house)', () => {
  const before = [
    '3.4 Version Management',
    'The system shall reject an uploaded file larger than 50 MB.',
    'Users must log in before uploading.',
    'The review is due on 2026-10-01.',
    '3.8 Search',
    'Search covers titles only.',
  ].join('\n\n');

  it('flags weakened requirements, changed figures and dates, negation and placeholders', () => {
    const after = [
      '3.4 Version Management',
      'The system should reject an uploaded file larger than 100 MB.',
      'Users must not log in before uploading.',
      'The review is due on 2026-11-15.',
      '3.8 Search',
      'Search covers titles and content. TODO confirm ranking weights.',
    ].join('\n\n');
    const { findings } = analyse(before, after);
    const rules = findings.map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(['requirement-weakened', 'value-changed', 'negation-changed', 'date-changed', 'placeholder']));
    expect(findings[0].severity).toBe('high'); // sorted by severity
    const value = findings.find((f) => f.rule === 'value-changed')!;
    expect(value.message).toContain('50 mb → 100 mb');
    expect(value.section).toBe('3.4 Version Management');
    expect(findings.every((f) => f.id.startsWith('F'))).toBe(true);
  });

  it('flags removed requirements, removed sections and broken references', () => {
    const after = ['3.4 Version Management', 'Users must log in before uploading. See Section 9.9 for details.', 'The review is due on 2026-10-01.'].join('\n\n');
    const { findings } = analyse(before, after);
    const rules = findings.map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(['requirement-removed', 'section-removed', 'broken-reference']));
  });

  it('writes an extractive summary that names sections and quotes the edit', () => {
    const after = before.replace('Search covers titles only.', 'Search covers titles and extracted document content.');
    const { summary } = analyse(before, after);
    expect(summary).toContain('Compared with version 1, version 2 changes 1 paragraph(s): 1 modified.');
    expect(summary).toContain('In "3.8 Search"');
    expect(summary).toContain('became');
    // Both sides of the replacement carry the same leading words.
    expect(summary).toContain('"covers titles only" became "covers titles and extracted document content"');
  });

  it('reports formatting-only revisions as such', () => {
    const { summary, findings } = analyse('One sentence here.', 'One   sentence here .');
    expect(summary).toMatch(/No substantive changes/);
    expect(findings).toEqual([]);
  });

  it('recognises headings', () => {
    expect(isHeading('3.4 Version Management')).toBe(true);
    expect(isHeading('## Overview')).toBe(true);
    expect(isHeading('The system shall store every uploaded version.')).toBe(false);
  });
});
