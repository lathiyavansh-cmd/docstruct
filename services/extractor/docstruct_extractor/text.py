"""Plain text and Markdown: decode, normalise line endings, keep the author's paragraph breaks."""
from __future__ import annotations


def extract_plain_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            if encoding == "utf-16" and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
                continue
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = data.decode("cp1252", errors="replace")
    return text.replace("\r\n", "\n").replace("\r", "\n")
