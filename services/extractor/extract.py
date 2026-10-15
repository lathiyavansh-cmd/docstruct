"""
Command-line entry point used by the DocStruct API after a version is uploaded.

    python -I extract.py <file-path> <mime-type>

Prints one JSON object to stdout:
    {"ok": true,  "text": "...", "chars": 1234}
    {"ok": false, "error": "reason"}
and always exits with status 0 unless the arguments are wrong, so the API can tell a failed extraction
(which it records as FAILED) from a broken invocation.

How it works
    - Reads the whole file as bytes and passes it, with the MIME type, to docstruct_extractor.extract().
    - Any error becomes {"ok": false, ...} instead of a crash, so the API always gets valid JSON.
    - Forces UTF-8 output, because on Windows the default output encoding is not UTF-8 and
      non-English characters would otherwise break.

Where it fits
    Started as a child process by apps/api/src/extraction/extractor.ts with `python -I extract.py <file> <mime>`.
    -I runs Python in isolated mode (ignores environment variables and the user's site-packages).
    Module: text extractor (owner: Shrut).
"""
from __future__ import annotations

import json
import os
import sys

# Isolated mode (-I) does not add the script's folder to the import path,
# so add it by hand to make the docstruct_extractor package importable.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from docstruct_extractor import ExtractionError, extract  # noqa: E402


def main(argv: list[str]) -> int:
    # argv[0] is the script name, so exactly two real arguments are expected.
    if len(argv) != 3:
        print("usage: extract.py <file-path> <mime-type>", file=sys.stderr)
        return 2
    path, mime = argv[1], argv[2]
    try:
        with open(path, "rb") as fh:
            data = fh.read()
        text = extract(data, mime)
        result = {"ok": True, "text": text, "chars": len(text)}
    except ExtractionError as exc:
        result = {"ok": False, "error": str(exc)}
    except Exception as exc:  # malformed input must never crash the caller
        result = {"ok": False, "error": f"could not read the file: {exc.__class__.__name__}"}
    sys.stdout.reconfigure(encoding="utf-8")
    # ensure_ascii=False writes accented and non-English letters as-is instead of \uXXXX escapes.
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
