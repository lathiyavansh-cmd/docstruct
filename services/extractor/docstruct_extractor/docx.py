"""
Text extraction from Word (.docx) files using only the standard library.

A .docx file is a ZIP package (Office Open XML, ECMA-376). The body text lives in word/document.xml as
paragraphs (w:p) made of runs (w:r) holding text (w:t), tabs (w:tab) and breaks (w:br). Tables (w:tbl)
contain rows and cells that themselves contain paragraphs. Each paragraph becomes one block of output,
separated by a blank line, which is the paragraph boundary the version comparison relies on.
"""
from __future__ import annotations

import io
import zipfile
from typing import Iterator, List
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
MAX_XML_BYTES = 200 * 1024 * 1024  # guard against decompression bombs


class DocxError(Exception):
    pass


def _paragraph_text(p: ET.Element) -> str:
    parts: List[str] = []
    for node in p.iter():
        tag = node.tag
        if tag == W + "t" and node.text:
            parts.append(node.text)
        elif tag == W + "tab":
            parts.append("\t")
        elif tag in (W + "br", W + "cr"):
            parts.append("\n")
        elif tag == W + "noBreakHyphen":
            parts.append("-")
    return "".join(parts).strip()


def _blocks(body: ET.Element) -> Iterator[str]:
    for child in body:
        if child.tag == W + "p":
            text = _paragraph_text(child)
            if text:
                yield text
        elif child.tag == W + "tbl":
            for row in child.iter(W + "tr"):
                cells = []
                for cell in row.findall(W + "tc"):
                    cell_text = " ".join(t for t in (_paragraph_text(p) for p in cell.iter(W + "p")) if t)
                    cells.append(cell_text)
                line = " | ".join(cells).strip(" |")
                if line:
                    yield line
        elif child.tag == W + "sdt":  # content controls wrap ordinary paragraphs
            content = child.find(W + "sdtContent")
            if content is not None:
                yield from _blocks(content)


def extract_docx_text(data: bytes) -> str:
    try:
        package = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise DocxError("not a valid .docx package") from exc
    with package:
        try:
            info = package.getinfo("word/document.xml")
        except KeyError as exc:
            raise DocxError("word/document.xml is missing") from exc
        if info.file_size > MAX_XML_BYTES:
            raise DocxError("document is too large to extract")
        root = ET.fromstring(package.read(info))
    body = root.find(W + "body")
    if body is None:
        return ""
    return "\n\n".join(_blocks(body))
