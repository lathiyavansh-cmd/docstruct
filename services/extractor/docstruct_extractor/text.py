"""Plain text and Markdown: decode, normalise line endings, keep the author's paragraph breaks.

How it works
    - Tries UTF-8 first (with or without a byte-order mark), then UTF-16 if the file starts with a UTF-16 mark.
    - If neither works, falls back to Windows-1252 and replaces bad bytes, so it never fails.
    - Converts Windows (\\r\\n) and old Mac (\\r) line endings to plain \\n.

Where it fits
    Registered in docstruct_extractor/__init__.py for text/plain and text/markdown.
    Module: text extractor (owner: Shrut).
"""
from __future__ import annotations


def extract_plain_text(data: bytes) -> str:
    # "utf-8-sig" is UTF-8 that also strips a leading byte-order mark if one is present.
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            # Only try UTF-16 when the file starts with its byte-order mark (FF FE or FE FF).
            if encoding == "utf-16" and not data.startswith((b"\xff\xfe", b"\xfe\xff")):
                continue
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:  # for-else: runs only when the loop ended without "break", i.e. no encoding worked
        text = data.decode("cp1252", errors="replace")
    return text.replace("\r\n", "\n").replace("\r", "\n")
