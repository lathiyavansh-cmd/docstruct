/**
 * Small natural-language utilities used by the change summary and the pre-review: tokenisation, stop
 * words, TF-IDF term weights and sentence splitting. Written for DocStruct; no external NLP library.
 */

const STOP_WORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both
  but by can could did do does doing down during each few for from further had has have having he her here hers him his
  how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over
  own same she should so some such than that the their theirs them then there these they this those through to too
  under until up very was we were what when where which while who whom why will with would you your yours shall must
  may might per via etc`.split(/\s+/),
);

export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).filter((t) => !STOP_WORDS.has(t) && t.length > 1);
}

/** Inverse document frequency of every term over a set of paragraphs (smoothed: log((N+1)/(df+1)) + 1). */
export function idfTable(paragraphs: string[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const p of paragraphs) for (const t of new Set(terms(p))) df.set(t, (df.get(t) ?? 0) + 1);
  const n = paragraphs.length;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log((n + 1) / (d + 1)) + 1);
  return idf;
}

/** TF-IDF salience of a piece of text, normalised by length so long paragraphs do not always win. */
export function salience(text: string, idf: Map<string, number>): number {
  const ts = terms(text);
  if (!ts.length) return 0;
  const tf = new Map<string, number>();
  for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
  let score = 0;
  for (const [t, f] of tf) score += f * (idf.get(t) ?? Math.log(2) + 1);
  return score / Math.sqrt(ts.length);
}

export function sentences(paragraph: string): string[] {
  // A sentence ends at . ! or ? followed by whitespace and a capital, digit or opening quote, so "7.2",
  // "e.g. the" and identifiers such as Dash.Status.Summary are not split.
  return paragraph
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\d"“(])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Extractive summarisation of one paragraph: its most salient sentence. */
export function keySentence(paragraph: string, idf: Map<string, number>): string {
  const all = sentences(paragraph);
  if (all.length <= 1) return all[0] ?? paragraph;
  let best = all[0];
  let bestScore = -1;
  all.forEach((s, i) => {
    // Earlier sentences carry the topic of a paragraph more often; favour them slightly.
    const score = salience(s, idf) * (1 - Math.min(i, 5) * 0.04);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  });
  return best;
}

export function clip(text: string, max = 140): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : max).replace(/[,;:\s]+$/, '')}…`;
}
