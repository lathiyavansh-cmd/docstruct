import { headingText, isHeading, segmentParagraphs } from '../diff/compare.js';
import { sentences as splitSentences, terms } from '../diff/nlp.js';

/**
 * Extractive document summarisation, written for DocStruct (no external NLP or AI service).
 *
 * 1. The extracted text is cut into sections (at headings), paragraphs, list items and sentences.
 * 2. Every sentence becomes a TF-IDF vector; sentences are linked by cosine similarity.
 * 3. TextRank (PageRank over that graph) scores each sentence by how strongly the rest of the document
 *    "agrees" with it. Position and length adjust the score slightly.
 * 4. Sentences are picked greedily by score, skipping any that repeat one already picked, and shown in
 *    document order. Short, medium and detailed summaries are prefixes of the same pick order, so a longer
 *    summary always contains the shorter one.
 */

export const SUMMARY_ENGINE = 'docstruct-summariser/1.0';

export interface SummarySentence {
  text: string;
  section: string | null;
  position: number;
}

export interface SummaryResult {
  levels: { short: SummarySentence[]; medium: SummarySentence[]; detailed: SummarySentence[] };
  keyTerms: string[];
  outline: Array<{ heading: string; sentence: string }>;
  stats: { words: number; sentences: number; sections: number; readingMinutes: number };
}

const DAMPING = 0.85;
const MAX_ITERATIONS = 60;
const TOLERANCE = 1e-6;
/** Two sentences this similar say the same thing; the summary keeps only the higher-scoring one. */
const REDUNDANCY = 0.55;
/** Upper bound on sentences ranked, so very long documents stay fast (similarity is quadratic). */
const MAX_SENTENCES = 1500;

interface Unit {
  text: string;
  section: string | null;
  /** First sentence of its section, which usually states the section's topic. */
  leadsSection: boolean;
}

const LIST_ITEM = /^\s*(?:[-*•–]|\d+[.)]|[a-z][.)])\s+/;

/** Plain sentence text for display: markdown emphasis, code marks, links and list markers removed. */
export function cleanSentence(text: string): string {
  return text
    .replace(LIST_ITEM, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]{1,3}([^*_`]+)[*_`]{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sections, paragraphs, list items and sentences of a document, in reading order. */
export function sentenceUnits(text: string): { units: Unit[]; sectionCount: number } {
  const units: Unit[] = [];
  let section: string | null = null;
  let sectionCount = 0;
  let leads = true;
  for (const paragraph of segmentParagraphs(text)) {
    if (isHeading(paragraph)) {
      section = headingText(paragraph).replace(/^\d+(\.\d+)*\.?\s+/, '') || headingText(paragraph);
      sectionCount++;
      leads = true;
      continue;
    }
    // A list keeps one item per line; each item is its own unit rather than one run-on sentence.
    const lines = paragraph.split('\n');
    const blocks = lines.some((l) => LIST_ITEM.test(l)) ? lines : [paragraph];
    for (const block of blocks) {
      for (const raw of splitSentences(block)) {
        const sentence = cleanSentence(raw);
        if (!sentence) continue;
        units.push({ text: sentence, section, leadsSection: leads });
        leads = false;
      }
    }
  }
  return { units, sectionCount };
}

type Vector = Map<string, number>;

function vectors(texts: string[]): { vecs: Vector[]; norms: number[] } {
  const df = new Map<string, number>();
  const tokens = texts.map((t) => terms(t));
  for (const ts of tokens) for (const t of new Set(ts)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = texts.length;
  const vecs = tokens.map((ts) => {
    const v: Vector = new Map();
    for (const t of ts) v.set(t, (v.get(t) ?? 0) + 1);
    for (const [t, f] of v) v.set(t, f * (Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1));
    return v;
  });
  const norms = vecs.map((v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)));
  return { vecs, norms };
}

function cosine(a: Vector, b: Vector, na: number, nb: number): number {
  if (!na || !nb) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, x] of small) {
    const y = large.get(t);
    if (y) dot += x * y;
  }
  return dot / (na * nb);
}

/** TextRank: PageRank over the weighted sentence-similarity graph. Returns one score per sentence. */
export function textRank(weights: number[][]): number[] {
  const n = weights.length;
  if (!n) return [];
  const outSum = weights.map((row) => row.reduce((s, w) => s + w, 0));
  let scores = new Array<number>(n).fill(1 / n);
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const next = new Array<number>(n).fill((1 - DAMPING) / n);
    for (let j = 0; j < n; j++) {
      if (!outSum[j]) continue;
      const share = (DAMPING * scores[j]) / outSum[j];
      const row = weights[j];
      for (let i = 0; i < n; i++) if (row[i]) next[i] += share * row[i];
    }
    const delta = next.reduce((s, x, i) => s + Math.abs(x - scores[i]), 0);
    scores = next;
    if (delta < TOLERANCE) break;
  }
  return scores;
}

/** Words too general to describe what a document is about. */
const GENERIC = new Set(
  `within without also using used use uses new one two three every each many much well like make made get able
  still need needs include includes including however therefore thus whether either neither another other others`.split(/\s+/),
);

/**
 * Most frequent content words and two-word phrases; plural and singular forms are counted together.
 * Phrases are counted inside one sentence at a time, never across a sentence boundary.
 */
export function keyTerms(text: string | string[], limit = 8): string[] {
  const keep = (t: string) => !/^\d+([.,]\d+)?%?$/.test(t) && t.length > 2 && !GENERIC.has(t);
  const perSentence = (Array.isArray(text) ? text : splitSentences(text)).map((s) => terms(s).filter(keep));
  const words = perSentence.flat();
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  // Fold "versions" into "version" when both appear.
  const fold = (w: string) => (w.endsWith('s') && !w.endsWith('ss') && counts.has(w.slice(0, -1)) ? w.slice(0, -1) : w);
  const merged = new Map<string, number>();
  for (const [w, c] of counts) merged.set(fold(w), (merged.get(fold(w)) ?? 0) + c);

  const phrases = new Map<string, number>();
  for (const ws of perSentence) {
    for (let i = 0; i + 1 < ws.length; i++) {
      const p = `${fold(ws[i])} ${fold(ws[i + 1])}`;
      phrases.set(p, (phrases.get(p) ?? 0) + 1);
    }
  }
  // A term must occur at least twice to describe the document; a one-off word says little.
  const min = 2;
  const candidates: Array<[string, number]> = [];
  for (const [p, c] of phrases) if (c >= 2) candidates.push([p, c * 2.2]);
  const inPhrase = new Set(candidates.flatMap(([p]) => p.split(' ')));
  for (const [w, c] of merged) if (c >= min) candidates.push([w, inPhrase.has(w) ? c * 0.6 : c]);
  const joined = (Array.isArray(text) ? text.join(' ') : text).toLowerCase();
  const firstSeen = (term: string) => joined.indexOf(term.split(' ')[0]);
  return candidates
    .sort((a, b) => b[1] - a[1] || firstSeen(a[0]) - firstSeen(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
}

function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** Summarises extracted document text. Returns null when there is no readable sentence. */
export function summariseDocument(text: string): SummaryResult | null {
  const { units: all, sectionCount } = sentenceUnits(text);
  const units = all.slice(0, MAX_SENTENCES);
  if (!units.length) return null;
  const n = units.length;

  const { vecs, norms } = vectors(units.map((u) => u.text));
  const weights = units.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = cosine(vecs[i], vecs[j], norms[i], norms[j]);
      if (w > 0.05) weights[i][j] = weights[j][i] = w;
    }
  }
  const rank = textRank(weights);
  const top = Math.max(...rank) || 1;
  const scores = units.map((u, i) => {
    const words = countWords(u.text);
    let s = rank[i] / top;
    if (u.leadsSection) s *= 1.2;
    if (i < 3) s *= 1.1;
    if (words < 5) s *= 0.35;
    else if (words > 45) s *= 0.85;
    if (terms(u.text).length < 2) s *= 0.2;
    return s;
  });

  // Greedy pick, most important first, skipping repeats of a sentence already picked.
  const order = units.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
  const picked: number[] = [];
  const longest = Math.min(n, Math.max(6, Math.min(12, Math.round(n * 0.3))));
  for (const i of order) {
    if (picked.length >= longest) break;
    if (picked.some((j) => cosine(vecs[i], vecs[j], norms[i], norms[j]) > REDUNDANCY)) continue;
    picked.push(i);
  }
  // Very repetitive text can leave too few distinct sentences; fill up with the next best ones.
  for (const i of order) if (picked.length < Math.min(longest, n) && !picked.includes(i)) picked.push(i);

  const level = (k: number) =>
    picked
      .slice(0, Math.min(k, picked.length))
      .sort((a, b) => a - b)
      .map((i) => ({ text: units[i].text, section: units[i].section, position: i }));
  const short = Math.min(3, n);
  const medium = Math.max(short, Math.min(n, Math.max(4, Math.min(7, Math.round(n * 0.15)))));

  // Outline: the best sentence of each section, when the document has at least two sections.
  const outline: SummaryResult['outline'] = [];
  if (sectionCount >= 2) {
    const best = new Map<string, number>();
    units.forEach((u, i) => {
      if (u.section === null) return;
      const current = best.get(u.section);
      if (current === undefined || scores[i] > scores[current]) best.set(u.section, i);
    });
    for (const [heading, i] of [...best].sort((a, b) => a[1] - b[1]).slice(0, 12)) outline.push({ heading, sentence: units[i].text });
  }

  const words = countWords(text);
  return {
    levels: { short: level(short), medium: level(medium), detailed: level(longest) },
    keyTerms: keyTerms(units.map((u) => u.text)),
    outline,
    stats: { words, sentences: all.length, sections: sectionCount, readingMinutes: Math.max(1, Math.round(words / 200)) },
  };
}
