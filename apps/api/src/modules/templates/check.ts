/**
 * What this file does
 *   Checks a document's text against a template: a list of section headings the document must contain.
 *
 * How it works
 *   - documentHeadings() cuts the extracted text into paragraphs and keeps the ones that look like headings
 *     (the same heuristic the comparison engine and the summariser use).
 *   - canonical() strips numbering ("3.2", "Section 4", "#"), punctuation and case, so "## 3. Functional
 *     Requirements" and "functional requirements" compare equal.
 *   - A required heading is satisfied by the first document heading that is the same, that contains it, or
 *     whose words overlap enough (Dice coefficient >= 0.75 after trimming plurals), so "Non-Functional
 *     Requirements" still matches "Non functional requirement".
 *   - Every document heading is used at most once, in order, so a template with two similar headings is
 *     not satisfied by one line twice.
 *
 * Where it fits
 *   Called by templates/service.ts. Pure functions with no database access, so they are easy to test.
 *   Module: templates (owner: Vansh).
 */
import type { TemplateCheckItemDto } from '@docstruct/shared';
import { headingText, isHeading, segmentParagraphs } from '../diff/compare.js';

const MIN_OVERLAP = 0.75;

/** The headings of a document, in reading order. A Markdown title ("# ...") on the first line is not a section. */
export function documentHeadings(text: string): string[] {
  const paragraphs = segmentParagraphs(text);
  if (/^#\s+\S/.test(paragraphs[0] ?? '')) paragraphs.shift();
  return paragraphs.filter(isHeading).map(headingText);
}

/** "requirements" and "requirement" count as the same word. */
function stem(word: string): string {
  return word.length > 3 ? word.replace(/(ies|es|s)$/, '') : word;
}

/** Lower-case words only: numbering, "Section"/"Chapter" prefixes and punctuation are dropped. */
export function canonical(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(section|chapter|part|appendix)\s+[a-z0-9]+[.:)]?\s*/i, '')
    .replace(/^[0-9]+(\.[0-9]+)*[.:)]?\s*/, '')
    .replace(/^[a-z][.:)]\s+/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dice coefficient of two word sets: 1 when identical, 0 when nothing in common. */
function overlap(a: string, b: string): number {
  const wa = new Set(a.split(' ').filter(Boolean).map(stem));
  const wb = new Set(b.split(' ').filter(Boolean).map(stem));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return (2 * shared) / (wa.size + wb.size);
}

function matches(required: string, found: string): boolean {
  if (!required || !found) return false;
  if (required === found) return true;
  // "functional requirements" is satisfied by "functional requirements and use cases", but not by
  // "requirements" alone (the shorter one must be the required heading).
  if (required.length >= 4 && found.includes(required)) return true;
  return overlap(required, found) >= MIN_OVERLAP;
}

/** Marks each required heading found or missing, and lists the document's headings the template did not ask for. */
export function checkHeadings(required: string[], present: string[]): { items: TemplateCheckItemDto[]; extraHeadings: string[] } {
  const canon = present.map(canonical);
  const used = new Set<number>();
  const items = required.map((heading) => {
    const want = canonical(heading);
    const index = canon.findIndex((have, i) => !used.has(i) && matches(want, have));
    if (index >= 0) used.add(index);
    return { heading, found: index >= 0, matchedHeading: index >= 0 ? present[index] : null };
  });
  const extraHeadings = present.filter((_, i) => !used.has(i));
  return { items, extraHeadings };
}
