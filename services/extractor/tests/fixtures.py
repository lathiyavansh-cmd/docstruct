"""Builds small but structurally real PDF and DOCX files for the tests."""
from __future__ import annotations

import io
import zipfile
import zlib
from typing import List, Optional


def build_pdf(pages: List[bytes], *, compress: bool = False, fonts: Optional[bytes] = None,
              extra_objects: Optional[List[bytes]] = None) -> bytes:
    """
    Writes a PDF with one content stream per page. Object 3 is a Helvetica font unless `fonts` replaces the
    font resource dictionary. Extra objects are appended after the page objects with the next numbers.
    """
    objects: List[bytes] = []
    n_pages = len(pages)
    kids = " ".join(f"{4 + 2 * i} 0 R" for i in range(n_pages))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {n_pages} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    font_res = fonts or b"<< /F1 3 0 R >>"
    for i, content in enumerate(pages):
        page_num, content_num = 4 + 2 * i, 5 + 2 * i
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {content_num} 0 R ".encode()
            + b"/Resources << /Font " + font_res + b" >> >>"
        )
        data = zlib.compress(content) if compress else content
        filt = b" /Filter /FlateDecode" if compress else b""
        objects.append(b"<< /Length " + str(len(data)).encode() + filt + b" >>\nstream\n" + data + b"\nendstream")
    objects.extend(extra_objects or [])

    out = io.BytesIO()
    out.write(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for num, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{num} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def text_page(paragraphs: List[List[str]], size: int = 12) -> bytes:
    """Content stream laying out paragraphs: lines 14pt apart, paragraphs separated by a 28pt gap."""
    ops = [b"BT", f"/F1 {size} Tf".encode(), b"72 720 Td"]
    first = True
    for para in paragraphs:
        for j, line in enumerate(para):
            if not first:
                ops.append(b"0 -28 Td" if j == 0 else b"0 -14 Td")
            first = False
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            ops.append(f"({escaped}) Tj".encode("cp1252"))
    ops.append(b"ET")
    return b"\n".join(ops)


def build_docx(paragraphs: List[str], table: Optional[List[List[str]]] = None) -> bytes:
    w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    body = []
    for p in paragraphs:
        runs = "".join(f"<w:r><w:t xml:space=\"preserve\">{part}</w:t></w:r>" for part in p.split("|"))
        body.append(f"<w:p>{runs}</w:p>")
    if table:
        rows = "".join(
            "<w:tr>" + "".join(f"<w:tc><w:p><w:r><w:t>{c}</w:t></w:r></w:p></w:tc>" for c in row) + "</w:tr>"
            for row in table
        )
        body.append(f"<w:tbl>{rows}</w:tbl>")
    xml = f'<?xml version="1.0" encoding="UTF-8"?><w:document {w}><w:body>{"".join(body)}</w:body></w:document>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", xml)
    return buf.getvalue()
