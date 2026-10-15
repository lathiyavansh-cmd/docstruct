/**
 * What this file does
 *   The core matching algorithm behind version comparison. It finds which parts of two sequences are equal.
 *
 * How it works
 *   - The constructor indexes sequence b (b2j: element to positions) and drops "popular" elements.
 *   - findLongestMatch() finds the longest equal run in a given range.
 *   - getMatchingBlocks() repeats that on the left and right leftovers; getOpcodes() and ratio() are built on it.
 *
 * Where it fits
 *   Used by compare.ts for paragraphs, words and paragraph similarity. Module: F3.6 Version Comparison &
 *   Pre-Review (owner: Vansh).
 */
/**
 * A TypeScript implementation of the Ratcliff/Obershelp "gestalt pattern matching" algorithm, following the
 * behaviour of Python's difflib.SequenceMatcher that the team's algorithm design (Algorithm F) is written
 * against, including its "autojunk" heuristic. Works on any sequence of comparable primitives: an array of
 * paragraphs, an array of words, or a string (compared character by character).
 *
 * Idea: find the longest contiguous matching block, then recursively do the same to the pieces left and
 * right of it. The matching blocks yield an edit script (opcodes) and a similarity ratio.
 *
 * Complexity: find_longest_match is O(n·m) in the worst case, typically close to linear thanks to the b2j
 * index; the whole comparison is O(n·m) worst case and much faster on real documents.
 */

export type Opcode = ['equal' | 'replace' | 'delete' | 'insert', number, number, number, number];
type Match = [number, number, number];

export class SequenceMatcher<T extends string | number> {
  private readonly a: ArrayLike<T>;
  private readonly b: ArrayLike<T>;
  private readonly b2j = new Map<T, number[]>();
  private blocks?: Match[];

  constructor(a: ArrayLike<T>, b: ArrayLike<T>, autojunk = true) {
    this.a = a;
    this.b = b;
    // Index every element of b by the positions where it occurs.
    for (let j = 0; j < b.length; j++) {
      const list = this.b2j.get(b[j]);
      if (list) list.push(j);
      else this.b2j.set(b[j], [j]);
    }
    // Autojunk: in sequences of 200+ items, elements making up more than 1% of b are "popular" and are not
    // used to seed matches (they can still extend one). This keeps very common tokens from dominating.
    if (autojunk && b.length >= 200) {
      const limit = Math.floor(b.length / 100) + 1;
      for (const [elt, idxs] of [...this.b2j]) if (idxs.length > limit) this.b2j.delete(elt);
    }
  }

  /** Longest matching block in a[alo:ahi] and b[blo:bhi]; ties go to the earliest block in a, then b. */
  findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Match {
    const { a, b } = this;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      // j2len[j] = length of the equal run ending at a[i-1], b[j]. If a[i] also equals b[j], that run grows by 1.
      for (const j of this.b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = next;
    }
    // Extend the match over equal elements that were excluded from the index (popular elements).
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }
    return [besti, bestj, bestsize];
  }

  /** Non-overlapping matching blocks in order, adjacent blocks merged, ending with a [len(a), len(b), 0] sentinel. */
  getMatchingBlocks(): Match[] {
    if (this.blocks) return this.blocks;
    const la = this.a.length;
    const lb = this.b.length;
    // A stack of ranges still to search, used instead of recursion. It starts with the whole of a and b.
    const queue: Array<[number, number, number, number]> = [[0, la, 0, lb]];
    const found: Match[] = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop()!;
      const m = this.findLongestMatch(alo, ahi, blo, bhi);
      const [i, j, k] = m;
      if (k) {
        found.push(m);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    found.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

    const merged: Match[] = [];
    let [i1, j1, k1] = [0, 0, 0];
    // Join blocks that touch each other into one longer block.
    for (const [i2, j2, k2] of found) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2;
      } else {
        if (k1) merged.push([i1, j1, k1]);
        [i1, j1, k1] = [i2, j2, k2];
      }
    }
    if (k1) merged.push([i1, j1, k1]);
    merged.push([la, lb, 0]);
    this.blocks = merged;
    return merged;
  }

  /** The edit script turning a into b. */
  getOpcodes(): Opcode[] {
    let i = 0;
    let j = 0;
    const answer: Opcode[] = [];
    for (const [ai, bj, size] of this.getMatchingBlocks()) {
      // The gap before each matching block: items skipped in both = replace, only in a = delete, only in b = insert.
      const tag = i < ai && j < bj ? 'replace' : i < ai ? 'delete' : j < bj ? 'insert' : null;
      if (tag) answer.push([tag, i, ai, j, bj]);
      i = ai + size;
      j = bj + size;
      if (size) answer.push(['equal', ai, i, bj, j]);
    }
    return answer;
  }

  /** Similarity in [0, 1]: 2·M / T where M is the number of matched elements and T the total length. */
  ratio(): number {
    const matches = this.getMatchingBlocks().reduce((sum, [, , size]) => sum + size, 0);
    const total = this.a.length + this.b.length;
    return total ? (2 * matches) / total : 1;
  }
}
