/**
 * What this file does
 *   Compares the text of two document versions paragraph by paragraph and lists what was added, deleted or
 *   modified. It also marks each change as substantive or only cosmetic, and finds the section it is in.
 *
 * How it works
 *   - segmentParagraphs() splits text on blank lines; normalise() makes a case and spacing free form.
 *   - compareVersions() runs SequenceMatcher over the paragraph lists and pairs replaced paragraphs by similarity.
 *   - classifySubstantive() and changeStatistics() label and count the changes.
 *   - annotateChanges() adds the section heading and a word-level diff for display.
 *
 * Where it fits
 *   Used by DiffService (service.ts) and prereview.ts; summary/summarise.ts reuses the paragraph and heading
 *   helpers. Relies on sequence-matcher.ts. Module: F3.6 Version Comparison & Pre-Review (owner: Vansh).
 */
import type { ChangeKind } from '@docstruct/shared';
import { SequenceMatcher } from './sequence-matcher.js';

/** Algorithm F - paragraph-level version comparison; Algorithm G - substantive vs cosmetic classification. */

// Two paragraphs at least 55% similar count as one "modified" paragraph. Below that they are reported as a
// deletion plus a separate addition.
export const MODIFY_SIMILARITY_THRESHOLD = 0.55;

export interface WordSegment {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface Change {
  kind: ChangeKind;
  /** Paragraph index: in the new version for additions/modifications, in the old one for deletions. */
  position: number;
  oldText: string;
  newText: string;
  similarity: number;
  isSubstantive: boolean;
  /** Heading of the section the change belongs to (Diff.PreReview.Findings: "indicate the section"). */
  section: string | null;
  /** Word-level edit script of a modification, for highlighting (Diff.Compare.Display). */
  words?: WordSegment[];
}

export interface ChangeStats {
  total: number;
  added: number;
  deleted: number;
  modified: number;
  substantive: number;
  cosmetic: number;
  paragraphsBefore: number;
  paragraphsAfter: number;
}

/**
 * Splits extracted text into paragraphs (Diff.Compare.Segment): blocks separated by blank lines. Comparing
 * paragraphs rather than bytes or lines means a reflowed paragraph does not read as a change to every line.
 */
export function segmentParagraphs(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * The comparison form of a paragraph: lower-cased, whitespace runs collapsed, spacing around punctuation
 * removed. Two paragraphs with the same normalised form differ only cosmetically.
 */
export function normalise(paragraph: string): string {
  return paragraph
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*([,.;:!?)\]])/g, '$1')
    .replace(/([(\[])\s*/g, '$1')
    .trim();
}

export function similarity(a: string, b: string): number {
  return new SequenceMatcher<string>(a, b).ratio();
}

/**
 * Computes the paragraph-level differences. The matcher yields blocks of equal, inserted, deleted and
 * replaced paragraphs; replaced blocks are then paired greedily by similarity of their normalised forms: a
 * pair similar enough is one modification, otherwise a deletion plus an unrelated addition - which is what
 * actually happened. Matching runs on the raw paragraphs so a whitespace-only edit is still detected (and
 * later classified as cosmetic).
 */
export function compareVersions(textA: string, textB: string): Change[] {
  const oldParas = segmentParagraphs(textA);
  const newParas = segmentParagraphs(textB);
  const oldKeys = oldParas.map(normalise);
  const newKeys = newParas.map(normalise);
  const changes: Change[] = [];
  const base = { similarity: 0, isSubstantive: true, section: null, oldText: '', newText: '' };

  for (const [tag, i1, i2, j1, j2] of new SequenceMatcher<string>(oldParas, newParas).getOpcodes()) {
    if (tag === 'equal') continue;
    if (tag === 'insert') {
      for (let j = j1; j < j2; j++) changes.push({ ...base, kind: 'ADDED', position: j, newText: newParas[j] });
    } else if (tag === 'delete') {
      for (let i = i1; i < i2; i++) changes.push({ ...base, kind: 'DELETED', position: i, oldText: oldParas[i] });
    } else {
      // "replace" block: for each old paragraph, find the most similar new paragraph not yet paired with another.
      const paired = new Set<number>();
      for (let i = i1; i < i2; i++) {
        let bestJ = -1;
        let bestScore = 0;
        for (let j = j1; j < j2; j++) {
          if (paired.has(j)) continue;
          const score = similarity(oldKeys[i], newKeys[j]);
          if (score > bestScore) {
            bestScore = score;
            bestJ = j;
          }
        }
        if (bestJ >= 0 && bestScore >= MODIFY_SIMILARITY_THRESHOLD) {
          paired.add(bestJ);
          changes.push({
            ...base,
            kind: 'MODIFIED',
            position: bestJ,
            oldText: oldParas[i],
            newText: newParas[bestJ],
            similarity: Math.round(bestScore * 1000) / 1000,
          });
        } else {
          changes.push({ ...base, kind: 'DELETED', position: i, oldText: oldParas[i] });
        }
      }
      // New paragraphs that nothing was paired with are genuine additions.
      for (let j = j1; j < j2; j++) {
        if (!paired.has(j)) changes.push({ ...base, kind: 'ADDED', position: j, newText: newParas[j] });
      }
    }
  }
  return changes.sort((x, y) => x.position - y.position);
}

/**
 * Algorithm G. A modification whose two paragraphs normalise to the same form changed only in whitespace,
 * case or spacing around punctuation: it stays in the diff (the bytes did change) but is withheld from the
 * reviewer's findings and the summary. Additions and deletions are always substantive.
 */
export function classifySubstantive(changes: Change[]): Change[] {
  for (const c of changes) c.isSubstantive = c.kind !== 'MODIFIED' || normalise(c.oldText) !== normalise(c.newText);
  return changes;
}

export function changeStatistics(changes: Change[], before: number, after: number): ChangeStats {
  const substantive = changes.filter((c) => c.isSubstantive).length;
  return {
    total: changes.length,
    added: changes.filter((c) => c.kind === 'ADDED').length,
    deleted: changes.filter((c) => c.kind === 'DELETED').length,
    modified: changes.filter((c) => c.kind === 'MODIFIED').length,
    substantive,
    cosmetic: changes.length - substantive,
    paragraphsBefore: before,
    paragraphsAfter: after,
  };
}

// ---- display helpers --------------------------------------------------------------------------------------

// Splits text into whitespace runs, words (letters, digits, _, apostrophes, hyphens) and single punctuation marks.
// Keeping the spaces as tokens means joining the pieces gives back the exact original text.
export function tokenizeWords(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** Word-level diff of a modified paragraph: equal runs and the inserted/deleted words between them. */
export function wordDiff(oldText: string, newText: string): WordSegment[] {
  const a = tokenizeWords(oldText);
  const b = tokenizeWords(newText);
  const out: WordSegment[] = [];
  const push = (op: WordSegment['op'], text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  // autojunk is off here: in a long paragraph, common words like "the" must still be matched.
  for (const [tag, i1, i2, j1, j2] of new SequenceMatcher<string>(a, b, false).getOpcodes()) {
    if (tag === 'equal') push('equal', a.slice(i1, i2).join(''));
    if (tag === 'delete' || tag === 'replace') push('delete', a.slice(i1, i2).join(''));
    if (tag === 'insert' || tag === 'replace') push('insert', b.slice(j1, j2).join(''));
  }
  return out;
}

/**
 * Heading heuristic for plain extracted text: Markdown headings, numbered headings ("3.4 Version
 * Management"), "Appendix"/"Chapter" lines, or a short line without closing punctuation.
 */
export function isHeading(paragraph: string): boolean {
  const p = paragraph.trim();
  if (!p || p.includes('\n') || p.includes(' | ') || p.length > 90) return false;
  if (/^#{1,6}\s+\S/.test(p)) return true;
  if (/^(\d+(\.\d+)*\.?|[A-Z]\.|Appendix [A-Z]|Chapter \d+|Section \d+)\s+\S/.test(p) && !/[.;:]$/.test(p) && p.split(/\s+/).length <= 10) return true;
  const words = p.split(/\s+/).length;
  return words <= 7 && !/[.,;:!?]$/.test(p) && /^[\p{Lu}\d]/u.test(p);
}

export function headingText(paragraph: string): string {
  return paragraph.replace(/^#{1,6}\s+/, '').trim();
}

/** Section heading in force at each paragraph index (the nearest heading at or before it). */
export function sectionIndex(paragraphs: string[]): Array<string | null> {
  let current: string | null = null;
  return paragraphs.map((p) => {
    if (isHeading(p)) current = headingText(p);
    return current;
  });
}

/** Fills in each change's section (new version for additions/modifications, old for deletions) and word diff. */
export function annotateChanges(changes: Change[], textA: string, textB: string): Change[] {
  const oldSections = sectionIndex(segmentParagraphs(textA));
  const newSections = sectionIndex(segmentParagraphs(textB));
  for (const c of changes) {
    c.section = (c.kind === 'DELETED' ? oldSections[c.position] : newSections[c.position]) ?? null;
    if (c.kind === 'MODIFIED') c.words = wordDiff(c.oldText, c.newText);
  }
  return changes;
}
