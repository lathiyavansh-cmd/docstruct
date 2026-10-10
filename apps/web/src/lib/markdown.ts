/**
 * A small Markdown renderer for document previews (Doc.Preview for .md files), written for DocStruct.
 * Supports headings, paragraphs, emphasis, inline code, fenced code, links, block quotes, ordered and
 * unordered lists and horizontal rules. All text is HTML-escaped first and links are limited to http(s),
 * mailto and relative URLs, so an uploaded file cannot inject script into the page.
 */

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed) || /^[/#.]/.test(trimmed) || !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return null;
}

function inline(raw: string): string {
  const codes: string[] = [];
  let text = raw.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(`<code>${escape(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = escape(text);
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    const safe = safeUrl(url.replace(/&amp;/g, '&'));
    return safe ? `<a href="${escape(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>` : match;
  });
  text = text.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a: string, b: string) => `<strong>${a ?? b}</strong>`);
  text = text.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)|(^|\W)_([^_\s][^_]*)_(?!\w)/g, (_, p1: string, a: string, p3: string, b: string) =>
    a !== undefined ? `${p1}<em>${a}</em>` : `${p3}<em>${b}</em>`,
  );
  return text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escape(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${body.map(inline).join('<br>')}</blockquote>`);
      continue;
    }
    const list = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[1]);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
