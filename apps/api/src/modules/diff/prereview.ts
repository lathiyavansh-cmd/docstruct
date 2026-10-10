import type { PreReviewFinding } from '@docstruct/shared';
import { normalise, segmentParagraphs, isHeading, headingText, type Change, type ChangeStats } from './compare.js';
import { clip, idfTable, keySentence, salience } from './nlp.js';

/**
 * DocStruct's pre-review engine (replaces the external "AI summarisation service" of SRS SI-4 with an
 * in-house implementation, Algorithm H). It reads the substantive changes between two versions and
 *  1. raises findings with explicit, explainable rules (Diff.PreReview.Findings), and
 *  2. writes a short prose summary of what changed (Diff.Summary.Generate) by extractive summarisation.
 * Everything it produces is advisory and labelled machine-generated (Diff.PreReview.Advisory, SA-5); it
 * never changes a document's status.
 */

export const ENGINE = 'docstruct-prereview/1.0';
const MAX_FINDINGS = 60;
const MAX_SUMMARY_POINTS = 6;

const STRONG = /\b(shall|must|will|is required to|are required to|required)\b/i;
const WEAK = /\b(should|may|can|could|might|optional|optionally|where possible|if possible)\b/i;
const NEGATION = /\b(not|no|never|none|cannot|can't|won't|without|neither|nor)\b/gi;
const PLACEHOLDER = /\b(TODO|TBD|TBA|FIXME|XXX)\b|lorem ipsum|\?\?\?|\[insert[^\]]*\]/i;
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DATE = new RegExp(
  `\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})[a-z]*\\.?,?\\s+\\d{4}\\b|\\b(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`,
  'gi',
);
const NUMBER =
  /(?:₹|\$|rs\.?\s?|inr\s?)?\b\d+(?:[.,]\d+)*\s?(?:%|percent|kb|mb|gb|tb|ms|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|users?|pages?|times|x)?(?!\w)/gi;
const REFERENCE = /\b(Section|Sections|Figure|Fig\.|Table|Appendix)\s+([A-Z]|\d+(?:\.\d+)*)\b/g;

function values(text: string, pattern: RegExp): string[] {
  return (text.match(pattern) ?? []).map((v) => v.toLowerCase().replace(/\s+/g, ' ').trim());
}

function numbersOf(text: string): string[] {
  return values(text.replace(DATE, ' '), NUMBER);
}

/** Elements of `a` missing from `b`, counting duplicates. */
function minus(a: string[], b: string[]): string[] {
  const pool = [...b];
  return a.filter((x) => {
    const k = pool.indexOf(x);
    if (k >= 0) {
      pool.splice(k, 1);
      return false;
    }
    return true;
  });
}

function inserted(change: Change): string {
  if (change.kind === 'ADDED') return change.newText;
  return (change.words ?? []).filter((w) => w.op === 'insert').map((w) => w.text).join(' ');
}

interface Context {
  headingsAfter: string[];
  captionsAfter: string[];
  paragraphsAfter: string[];
}

function referenceExists(kind: string, label: string, ctx: Context): boolean {
  const k = kind.toLowerCase();
  if (k.startsWith('section')) return ctx.headingsAfter.some((h) => h.startsWith(`${label} `) || h === label || h.startsWith(`${label}.`));
  if (k === 'appendix') return ctx.headingsAfter.some((h) => h.toLowerCase().startsWith(`appendix ${label.toLowerCase()}`));
  const caption = k.startsWith('fig') ? 'figure' : 'table';
  return ctx.captionsAfter.some((c) => c.toLowerCase().startsWith(`${caption} ${label.toLowerCase()}`) || c.toLowerCase().startsWith(`fig. ${label}`));
}

/** Applies every rule to one substantive change. */
function rulesFor(change: Change, ctx: Context): Omit<PreReviewFinding, 'id'>[] {
  const out: Omit<PreReviewFinding, 'id'>[] = [];
  const base = { section: change.section, position: change.position, kind: change.kind };
  const excerpt = clip(change.kind === 'DELETED' ? change.oldText : change.newText, 180);
  const add = (severity: PreReviewFinding['severity'], rule: string, title: string, message: string) =>
    out.push({ ...base, severity, rule, title, message, excerpt });

  if (change.kind === 'MODIFIED') {
    const wasStrong = STRONG.test(change.oldText);
    const isStrong = STRONG.test(change.newText);
    if (wasStrong && !isStrong && WEAK.test(change.newText)) {
      add('high', 'requirement-weakened', 'Requirement weakened', 'A mandatory statement ("shall/must") now uses optional wording ("should/may"). Confirm the obligation was meant to be relaxed.');
    } else if (!wasStrong && isStrong) {
      add('medium', 'requirement-strengthened', 'Requirement strengthened', 'Optional or descriptive wording became a mandatory statement. Check that it can be met and verified.');
    }
    const negBefore = (change.oldText.match(NEGATION) ?? []).length;
    const negAfter = (change.newText.match(NEGATION) ?? []).length;
    if (negBefore !== negAfter) {
      add('high', 'negation-changed', 'Meaning may be reversed', `A negation (not / no / never / cannot) was ${negAfter > negBefore ? 'added' : 'removed'}. This can invert the meaning of the sentence.`);
    }
    const datesOld = values(change.oldText, DATE);
    const datesNew = values(change.newText, DATE);
    const removedDates = minus(datesOld, datesNew);
    const addedDates = minus(datesNew, datesOld);
    if (removedDates.length || addedDates.length) {
      add('medium', 'date-changed', 'Date changed', `${removedDates.join(', ') || '(none)'} → ${addedDates.join(', ') || '(none)'}. Check dependent deadlines.`);
    }
    const numOld = numbersOf(change.oldText);
    const numNew = numbersOf(change.newText);
    const removedNums = minus(numOld, numNew);
    const addedNums = minus(numNew, numOld);
    if (removedNums.length || addedNums.length) {
      add('medium', 'value-changed', 'Figures changed', `${removedNums.join(', ') || '(none)'} → ${addedNums.join(', ') || '(none)'}. Verify the new values and anything computed from them.`);
    }
    if (change.similarity < 0.7) {
      add('info', 'substantial-rewrite', 'Paragraph substantially rewritten', `Only about ${Math.round(change.similarity * 100)}% of the paragraph is unchanged. Read it in full rather than relying on the highlights.`);
    }
  }

  if (change.kind === 'DELETED') {
    if (isHeading(change.oldText)) {
      add('medium', 'section-removed', 'Section heading removed', `The heading "${clip(headingText(change.oldText), 80)}" no longer appears. Check that its content was moved or is no longer needed.`);
    } else if (STRONG.test(change.oldText)) {
      add('high', 'requirement-removed', 'Requirement removed', 'A paragraph containing a mandatory statement was deleted. Confirm the requirement was intentionally dropped.');
    }
  }

  if (change.kind === 'ADDED') {
    if (isHeading(change.newText)) {
      add('info', 'section-added', 'New section', `A new heading "${clip(headingText(change.newText), 80)}" was added.`);
    } else if (STRONG.test(change.newText)) {
      add('info', 'requirement-added', 'New requirement', 'A new mandatory statement was added. Check that it is clear, testable and does not conflict with existing requirements.');
    }
    const key = normalise(change.newText);
    if (key.length > 30 && ctx.paragraphsAfter.filter((p) => normalise(p) === key).length > 1) {
      add('info', 'duplicate-paragraph', 'Duplicated text', 'This added paragraph repeats another paragraph of the document word for word.');
    }
  }

  const newText = inserted(change);
  if (newText && PLACEHOLDER.test(newText)) {
    add('high', 'placeholder', 'Unfinished placeholder', 'The new text contains a placeholder such as TODO, TBD or "lorem ipsum". The document may not be ready for approval.');
  }
  const scan = change.kind === 'DELETED' ? '' : change.newText;
  for (const m of scan.matchAll(REFERENCE)) {
    if (change.kind === 'MODIFIED' && change.oldText.includes(m[0])) continue; // only references touched by this change
    if (!referenceExists(m[1], m[2], ctx)) {
      add('medium', 'broken-reference', 'Reference not found', `"${m[0]}" does not match any heading or caption in this version.`);
      break;
    }
  }
  return out;
}

const SEVERITY_RANK = { high: 0, medium: 1, info: 2 } as const;

export function findIssues(changes: Change[], textAfter: string): PreReviewFinding[] {
  const paragraphsAfter = segmentParagraphs(textAfter);
  const ctx: Context = {
    paragraphsAfter,
    headingsAfter: paragraphsAfter.filter(isHeading).map(headingText),
    captionsAfter: paragraphsAfter.filter((p) => /^(figure|fig\.|table)\s+\S/i.test(p)),
  };
  const findings: Omit<PreReviewFinding, 'id'>[] = [];
  for (const change of changes) {
    if (!change.isSubstantive) continue;
    const hits = rulesFor(change, ctx);
    if (hits.length) findings.push(...hits);
    else {
      findings.push({
        severity: 'info',
        rule: 'changed',
        title: change.kind === 'ADDED' ? 'Text added' : change.kind === 'DELETED' ? 'Text removed' : 'Text edited',
        message: 'Substantive change - review it in context.',
        section: change.section,
        position: change.position,
        kind: change.kind,
        excerpt: clip(change.kind === 'DELETED' ? change.oldText : change.newText, 180),
      });
    }
  }
  return findings
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.position - b.position)
    .slice(0, MAX_FINDINGS)
    .map((f, i) => ({ ...f, id: `F${i + 1}` }));
}

// ---- summary --------------------------------------------------------------------------------------------

function quote(text: string, max = 70): string {
  return `"${clip(text.trim(), max)}"`;
}

function where(change: Change): string {
  return change.section ? ` in "${clip(change.section, 60)}"` : '';
}

/** Describes a modification from its word-level edit script. */
function describeModification(change: Change, idf: Map<string, number>): string {
  const words = change.words ?? [];
  const spans: Array<{ del: string; ins: string; before: string }> = [];
  let before = '';
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w.op === 'equal') {
      before = w.text;
      continue;
    }
    const del = w.op === 'delete' ? w.text : '';
    let ins = w.op === 'insert' ? w.text : '';
    if (w.op === 'delete' && words[k + 1]?.op === 'insert') {
      ins = words[k + 1].text;
      k++;
    }
    // Quote the words themselves, without the punctuation that joins them to their neighbours.
    const tidy = (t: string) => t.trim().replace(/^[,;:.]+\s*/, '').replace(/\s*[,;:]+$/, '');
    if ((del + ins).replace(/[\s\p{P}]/gu, '')) spans.push({ del: tidy(del), ins: tidy(ins), before });
  }
  // A bare number or a single short word reads better with the words before it ("50 MB" -> "limited to
  // 50 MB"). Both sides of a replacement get the same lead so they stay comparable.
  const context = (s: { before: string; del: string; ins: string }, text: string) => {
    if (s.del.length > 12 && s.ins.length > 12) return text;
    const lead = s.before.trim().split(/\s+/).slice(-2).join(' ');
    return lead ? `${lead} ${text}` : text;
  };
  if (spans.length === 1) {
    const s = spans[0];
    if (s.del && s.ins) return `${where(change).trim() ? `In "${clip(change.section!, 60)}", ` : ''}${quote(context(s, s.del))} became ${quote(context(s, s.ins))}.`;
    if (s.ins) return `Added ${quote(s.ins)}${where(change)}.`;
    return `Removed ${quote(s.del)}${where(change)}.`;
  }
  if (spans.length && spans.length <= 3 && change.similarity >= 0.5) {
    const parts = spans.map((s) => (s.del && s.ins ? `${quote(s.del, 40)} → ${quote(s.ins, 40)}` : s.ins ? `+${quote(s.ins, 40)}` : `−${quote(s.del, 40)}`));
    return `Edited a paragraph${where(change)}: ${parts.join('; ')}.`;
  }
  return `Rewrote a paragraph${where(change)}; it now reads: ${quote(keySentence(change.newText, idf), 120)}`;
}

function describe(change: Change, idf: Map<string, number>): string {
  if (change.kind === 'MODIFIED') return describeModification(change, idf);
  const text = change.kind === 'ADDED' ? change.newText : change.oldText;
  if (isHeading(text)) return `${change.kind === 'ADDED' ? 'Added the section' : 'Removed the section'} "${clip(headingText(text), 70)}".`;
  return `${change.kind === 'ADDED' ? 'Added' : 'Removed'}${change.kind === 'ADDED' ? where(change) : where(change).replace(' in ', ' from ')}: ${quote(keySentence(text, idf), 120)}`;
}

/**
 * Extractive change summary. Ranks substantive changes by TF-IDF salience of the changed words (rare,
 * document-specific terms score higher than common ones) plus the severity of any finding they raised,
 * keeps the top few, and describes them in document order.
 */
export function summarise(changes: Change[], stats: ChangeStats, findings: PreReviewFinding[], textBefore: string, textAfter: string, labels: { from: number; to: number }): string {
  if (stats.substantive === 0) {
    return stats.total
      ? `No substantive changes between version ${labels.from} and version ${labels.to}. The ${stats.cosmetic} difference(s) are formatting only (spacing, letter case or punctuation spacing).`
      : `Version ${labels.to} has the same text as version ${labels.from}.`;
  }
  const idf = idfTable([...segmentParagraphs(textBefore), ...segmentParagraphs(textAfter)]);
  const parts: string[] = [];
  if (stats.added) parts.push(`${stats.added} added`);
  if (stats.modified - stats.cosmetic > 0) parts.push(`${stats.modified - stats.cosmetic} modified`);
  if (stats.deleted) parts.push(`${stats.deleted} removed`);
  let overview = `Compared with version ${labels.from}, version ${labels.to} changes ${stats.substantive} paragraph(s): ${parts.join(', ')}.`;
  if (stats.cosmetic) overview += ` ${stats.cosmetic} formatting-only change(s) were ignored.`;
  const high = findings.filter((f) => f.severity === 'high').length;
  if (high) overview += ` ${high} finding(s) need particular attention.`;

  const severityBonus = new Map<number, number>();
  for (const f of findings) {
    const bonus = f.severity === 'high' ? 3 : f.severity === 'medium' ? 1.5 : 0;
    severityBonus.set(f.position, Math.max(severityBonus.get(f.position) ?? 0, bonus));
  }
  const ranked = changes
    .filter((c) => c.isSubstantive)
    .map((c) => {
      const changedText = c.kind === 'MODIFIED' ? (c.words ?? []).filter((w) => w.op !== 'equal').map((w) => w.text).join(' ') : c.kind === 'ADDED' ? c.newText : c.oldText;
      return { c, score: salience(changedText, idf) + (severityBonus.get(c.position) ?? 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUMMARY_POINTS)
    .sort((a, b) => a.c.position - b.c.position);

  const lines = ranked.map(({ c }) => `• ${describe(c, idf)}`);
  const hidden = stats.substantive - ranked.length;
  if (hidden > 0) lines.push(`• …and ${hidden} more change(s) shown in the comparison.`);
  return `${overview}\n\n${lines.join('\n')}`;
}
