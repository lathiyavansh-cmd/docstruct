/**
 * What this file does
 *   Unit tests for the Markdown renderer in markdown.ts, run with Vitest.
 *
 * How it works
 *   - Feeds small Markdown strings to renderMarkdown() and checks the HTML string that comes back.
 *   - Covers normal formatting, HTML escaping (no <script> or <img> gets through), link rules
 *     (javascript: links are refused) and fenced code being kept as escaped text.
 *
 * Where it fits
 *   Run by the web app's test command; not part of the running app. Module: M03 documents (owner: Shrut).
 */
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings, paragraphs, emphasis, code and lists', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** and *italic* with `code`.\n\n- one\n- two\n\n1. first\n2. second');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
  });

  it('escapes HTML so an uploaded file cannot inject markup', () => {
    // Two common attack strings: a script tag and an image whose onerror runs code.
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('allows http, mailto and relative links but not javascript: URLs', () => {
    expect(renderMarkdown('[site](https://spit.ac.in)')).toContain('href="https://spit.ac.in"');
    expect(renderMarkdown('[doc](./notes.md)')).toContain('href="./notes.md"');
    const bad = renderMarkdown('[x](javascript:alert(1))');
    expect(bad).not.toContain('href="javascript');
  });

  it('keeps fenced code verbatim and escaped', () => {
    expect(renderMarkdown('```\n<b>raw</b>\n```')).toBe('<pre><code>&lt;b&gt;raw&lt;/b&gt;</code></pre>');
  });
});
