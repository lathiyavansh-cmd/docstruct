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
