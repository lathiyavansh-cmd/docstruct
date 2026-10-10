"""
DocStruct text extraction utility (SRS SI-5, Version.Text.Extract).

Turns an uploaded PDF, DOCX, TXT or Markdown file into plain text with paragraphs separated by blank lines.
The text feeds content search (Search.Content) and paragraph-level version comparison (Diff.Compare).
Everything here is implemented with the Python standard library only.
"""
from __future__ import annotations

from .docx import DocxError, extract_docx_text
from .pdf import PdfError, extract_pdf_text
from .text import extract_plain_text

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

EXTRACTORS = {
    "application/pdf": extract_pdf_text,
    DOCX_MIME: extract_docx_text,
    "text/plain": extract_plain_text,
    "text/markdown": extract_plain_text,
}

MAX_TEXT_CHARS = 2_000_000


class ExtractionError(Exception):
    pass


def extract(data: bytes, mime_type: str) -> str:
    """Returns the extracted text, or raises ExtractionError explaining why there is none."""
    fn = EXTRACTORS.get(mime_type)
    if fn is None:
        raise ExtractionError(f"{mime_type} carries no extractable text")
    try:
        text = fn(data)
    except (PdfError, DocxError) as exc:
        raise ExtractionError(str(exc)) from exc
    text = text.strip()
    if not text:
        raise ExtractionError("no machine-readable text was found (the file may be scanned images)")
    return text[:MAX_TEXT_CHARS]


__all__ = ["extract", "ExtractionError", "EXTRACTORS"]
