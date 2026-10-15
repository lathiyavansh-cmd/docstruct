"""
Text extraction from PDF files, written against the PDF 1.7 specification (ISO 32000-1) using only the
Python standard library.

Pipeline:
  1. index every indirect object, including objects packed inside compressed object streams (/ObjStm);
  2. walk the page tree from the document catalogue in reading order;
  3. decode each page's content streams (FlateDecode, ASCIIHexDecode, ASCII85Decode, LZWDecode);
  4. interpret the text operators (BT/ET, Tf, Td, TD, Tm, T*, Tj, TJ, ', ") while tracking the text position;
  5. map character codes to Unicode through the font's /ToUnicode CMap, or its /Encoding and /Differences;
  6. rebuild lines from baselines and paragraphs from the vertical gaps between lines.

Scanned PDFs (images without a text layer) yield no text; the caller reports extraction as failed, which is
what the SRS requires (Version.Text.Failure).

Where it fits
    Registered in docstruct_extractor/__init__.py for application/pdf; extract_pdf_text() at the bottom is
    the entry point. The file is laid out in the same order as the pipeline above.
    Module: text extractor (owner: Shrut).
"""
from __future__ import annotations

import base64
import re
import zlib
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


class PdfError(Exception):
    pass


# ---------------------------------------------------------------------------------------------------------
# Object model
# ---------------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Ref:
    num: int
    gen: int = 0


class Name(str):
    """A PDF name object such as /Type (stored without the slash)."""


@dataclass
class Stream:
    dict: Dict[str, Any]
    raw: bytes


class Operator(str):
    """A content-stream operator such as Tj."""


WHITESPACE = b"\x00\t\n\x0c\r "
DELIMITERS = b"()<>[]{}/%"


class Lexer:
    """Tokeniser shared by the object parser and the content-stream interpreter."""

    def __init__(self, data: bytes, pos: int = 0):
        self.data = data
        self.pos = pos

    def skip_space(self) -> None:
        data, n = self.data, len(self.data)
        while self.pos < n:
            c = data[self.pos]
            if c in WHITESPACE:
                self.pos += 1
            elif c == 0x25:  # % comment to end of line
                while self.pos < n and data[self.pos] not in b"\r\n":
                    self.pos += 1
            else:
                break

    def read_literal_string(self) -> bytes:
        data = self.data
        self.pos += 1  # (
        depth, out = 1, bytearray()
        while self.pos < len(data):
            c = data[self.pos]
            self.pos += 1
            if c == 0x5C:  # backslash
                if self.pos >= len(data):
                    break
                e = data[self.pos]
                self.pos += 1
                simple = {0x6E: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 40, 0x29: 41, 0x5C: 92}
                if e in simple:
                    out.append(simple[e])
                elif 0x30 <= e <= 0x37:  # octal, up to three digits
                    digits = bytes([e])
                    while len(digits) < 3 and self.pos < len(data) and 0x30 <= data[self.pos] <= 0x37:
                        digits += bytes([data[self.pos]])
                        self.pos += 1
                    out.append(int(digits, 8) & 0xFF)
                elif e == 0x0D:  # line continuation
                    if self.pos < len(data) and data[self.pos] == 0x0A:
                        self.pos += 1
                elif e == 0x0A:
                    pass
                else:
                    out.append(e)
            elif c == 0x28:
                depth += 1
                out.append(c)
            elif c == 0x29:
                depth -= 1
                if depth == 0:
                    break
                out.append(c)
            else:
                out.append(c)
        return bytes(out)

    def read_hex_string(self) -> bytes:
        end = self.data.find(b">", self.pos)
        if end < 0:
            end = len(self.data)
        digits = re.sub(rb"[^0-9A-Fa-f]", b"", self.data[self.pos + 1:end])
        self.pos = end + 1
        if len(digits) % 2:
            digits += b"0"
        return bytes.fromhex(digits.decode("ascii"))

    def read_name(self) -> Name:
        start = self.pos + 1
        self.pos = start
        while self.pos < len(self.data) and self.data[self.pos] not in WHITESPACE + DELIMITERS:
            self.pos += 1
        raw = self.data[start:self.pos]
        raw = re.sub(rb"#([0-9A-Fa-f]{2})", lambda m: bytes([int(m.group(1), 16)]), raw)
        return Name(raw.decode("latin-1"))

    def read_regular(self) -> bytes:
        start = self.pos
        while self.pos < len(self.data) and self.data[self.pos] not in WHITESPACE + DELIMITERS:
            self.pos += 1
        return self.data[start:self.pos]

    def next_token(self) -> Any:
        """Returns the next primitive token; arrays and dictionaries come back as marker strings."""
        self.skip_space()
        if self.pos >= len(self.data):
            return None
        c = self.data[self.pos]
        if c == 0x28:
            return self.read_literal_string()
        if c == 0x3C:
            if self.data[self.pos:self.pos + 2] == b"<<":
                self.pos += 2
                return "<<"
            return self.read_hex_string()
        if c == 0x3E and self.data[self.pos:self.pos + 2] == b">>":
            self.pos += 2
            return ">>"
        if c in b"[]{}":
            self.pos += 1
            return chr(c)
        if c == 0x2F:
            return self.read_name()
        word = self.read_regular()
        if not word:
            self.pos += 1
            return Operator(chr(c))
        # A PDF number: optional sign, then digits with an optional decimal point (e.g. 12, -3.5, .25).
        if re.fullmatch(rb"[+-]?(\d+\.?\d*|\.\d+)", word):
            return float(word) if b"." in word else int(word)
        if word == b"true":
            return True
        if word == b"false":
            return False
        if word == b"null":
            return None
        return Operator(word.decode("latin-1"))


class ObjectParser(Lexer):
    """Parses PDF objects (numbers, strings, names, arrays, dictionaries, references, streams)."""

    def parse_object(self) -> Any:
        token = self.next_token()
        return self._complete(token)

    def _complete(self, token: Any) -> Any:
        if token == "[":
            items: List[Any] = []
            while True:
                t = self.next_token()
                if t == "]" or t is None and self.pos >= len(self.data):
                    break
                items.append(self._complete(t))
            return self._fold_refs(items)
        if token == "<<":
            d: Dict[str, Any] = {}
            while True:
                key = self.next_token()
                if key == ">>" or key is None:
                    break
                if not isinstance(key, Name):
                    continue
                value = self._complete(self.next_token())
                # A value may be "num gen R".
                if isinstance(value, int):
                    save = self.pos
                    gen = self.next_token()
                    r = self.next_token()
                    if isinstance(gen, int) and r == "R":
                        value = Ref(value, gen)
                    else:
                        self.pos = save
                d[str(key)] = value
            return d
        return token

    @staticmethod
    def _fold_refs(items: List[Any]) -> List[Any]:
        out: List[Any] = []
        i = 0
        while i < len(items):
            if (i + 2 < len(items) and isinstance(items[i], int) and isinstance(items[i + 1], int)
                    and items[i + 2] == "R"):
                out.append(Ref(items[i], items[i + 1]))
                i += 3
            else:
                out.append(items[i])
                i += 1
        return out


# ---------------------------------------------------------------------------------------------------------
# Stream filters
# ---------------------------------------------------------------------------------------------------------

def _flate(data: bytes) -> bytes:
    try:
        return zlib.decompress(data)
    except zlib.error:
        # Tolerate truncated or slightly corrupt streams: keep whatever decompresses.
        d = zlib.decompressobj()
        try:
            return d.decompress(data)
        except zlib.error:
            return b""


def _ascii_hex(data: bytes) -> bytes:
    digits = re.sub(rb"[^0-9A-Fa-f]", b"", data.split(b">")[0])
    if len(digits) % 2:
        digits += b"0"
    return bytes.fromhex(digits.decode("ascii"))


def _ascii85(data: bytes) -> bytes:
    body = data.strip()
    if body.startswith(b"<~"):
        body = body[2:]
    end = body.find(b"~>")
    if end >= 0:
        body = body[:end]
    return base64.a85decode(re.sub(rb"\s", b"", body))


def _lzw(data: bytes) -> bytes:
    """LZW decoding as used by PDF (variable code width 9-12 bits, early change)."""
    out = bytearray()
    table = [bytes([i]) for i in range(256)] + [b"", b""]
    width, buffer, bits, prev = 9, 0, 0, b""
    for byte in data:
        buffer = (buffer << 8) | byte
        bits += 8
        while bits >= width:
            bits -= width
            code = (buffer >> bits) & ((1 << width) - 1)
            if code == 256:  # clear table
                table = table[:258]
                width, prev = 9, b""
                continue
            if code == 257:  # end of data
                return bytes(out)
            if code < len(table):
                entry = table[code]
                if prev:
                    table.append(prev + entry[:1])
            elif prev:
                entry = prev + prev[:1]
                table.append(entry)
            else:
                continue
            out += entry
            prev = entry
            if len(table) + 1 >= (1 << width) and width < 12:
                width += 1
    return bytes(out)


def _png_unpredict(data: bytes, columns: int) -> bytes:
    """Undoes PNG row predictors (used by cross-reference and object streams)."""
    row_len = columns + 1
    out, prev = bytearray(), bytearray(columns)
    for i in range(0, len(data) - row_len + 1, row_len):
        ftype, row = data[i], bytearray(data[i + 1:i + row_len])
        for j in range(columns):
            left = row[j - 1] if j else 0
            up = prev[j]
            upleft = prev[j - 1] if j else 0
            if ftype == 1:
                row[j] = (row[j] + left) & 0xFF
            elif ftype == 2:
                row[j] = (row[j] + up) & 0xFF
            elif ftype == 3:
                row[j] = (row[j] + ((left + up) >> 1)) & 0xFF
            elif ftype == 4:
                p = left + up - upleft
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - upleft)
                pred = left if pa <= pb and pa <= pc else up if pb <= pc else upleft
                row[j] = (row[j] + pred) & 0xFF
        out += row
        prev = row
    return bytes(out)


# Stage 3 lookup table: filter name in the stream dictionary -> decoder function.
# Each filter has a long name and a short abbreviation; both are accepted.
FILTERS = {
    "FlateDecode": _flate, "Fl": _flate,
    "ASCIIHexDecode": _ascii_hex, "AHx": _ascii_hex,
    "ASCII85Decode": _ascii85, "A85": _ascii85,
    "LZWDecode": _lzw, "LZW": _lzw,
}


# ---------------------------------------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------------------------------------

# Matches the start of an indirect object such as "12 0 obj" (object number, generation number).
OBJ_RE = re.compile(rb"(\d+)\s+(\d+)\s+obj\b")


class PdfDocument:
    def __init__(self, data: bytes):
        if b"%PDF-" not in data[:1024]:
            raise PdfError("not a PDF file")
        if re.search(rb"/Encrypt\s", data):
            raise PdfError("encrypted PDF files are not supported")
        self.data = data
        self.objects: Dict[int, Any] = {}
        self._index()

    def _index(self) -> None:
        # Stage 1: object index. Instead of reading the cross-reference table, scan the whole file for
        # every "N G obj" header and parse what follows. This also works when the xref table is damaged.
        # Later definitions override earlier ones (incremental updates append new revisions).
        for m in OBJ_RE.finditer(self.data):
            num = int(m.group(1))
            parser = ObjectParser(self.data, m.end())
            try:
                value = parser.parse_object()
            except Exception:
                continue
            parser.skip_space()
            if isinstance(value, dict) and self.data.startswith(b"stream", parser.pos):
                value = Stream(value, self._stream_bytes(value, parser.pos + 6))
            self.objects[num] = value
        # Unpack compressed object streams.
        for num, value in list(self.objects.items()):
            if isinstance(value, Stream) and value.dict.get("Type") == "ObjStm":
                self._unpack_object_stream(value)

    def _stream_bytes(self, d: Dict[str, Any], pos: int) -> bytes:
        if self.data[pos:pos + 2] == b"\r\n":
            pos += 2
        elif self.data[pos:pos + 1] in (b"\n", b"\r"):
            pos += 1
        length = d.get("Length")
        if isinstance(length, int) and self.data[pos + length:pos + length + 20].lstrip().startswith(b"endstream"):
            return self.data[pos:pos + length]
        end = self.data.find(b"endstream", pos)
        return self.data[pos:end if end >= 0 else len(self.data)].rstrip(b"\r\n")

    def _unpack_object_stream(self, stream: Stream) -> None:
        data = self.decode(stream)
        n, first = int(stream.dict.get("N", 0)), int(stream.dict.get("First", 0))
        header = re.findall(rb"\d+", data[:first])
        pairs = [(int(header[i]), int(header[i + 1])) for i in range(0, min(len(header), 2 * n) - 1, 2)]
        for num, offset in pairs:
            if num in self.objects and not isinstance(self.objects[num], Stream):
                continue
            try:
                self.objects.setdefault(num, ObjectParser(data, first + offset).parse_object())
            except Exception:
                continue

    def resolve(self, value: Any, depth: int = 0) -> Any:
        while isinstance(value, Ref) and depth < 32:
            value = self.objects.get(value.num)
            depth += 1
        return value

    def decode(self, stream: Stream) -> bytes:
        data = stream.raw
        filters = self.resolve(stream.dict.get("Filter"))
        params = self.resolve(stream.dict.get("DecodeParms"))
        if filters is None:
            return data
        if not isinstance(filters, list):
            filters = [filters]
            params = [params]
        elif not isinstance(params, list):
            params = [params] * len(filters)
        # Filters can be chained (for example ASCII85 then Flate); apply them in the listed order.
        for f, p in zip(filters, params):
            fn = FILTERS.get(str(self.resolve(f)))
            if fn is None:
                raise PdfError(f"unsupported stream filter {f}")
            data = fn(data)
            p = self.resolve(p)
            if isinstance(p, dict) and int(self.resolve(p.get("Predictor", 1)) or 1) >= 10:
                data = _png_unpredict(data, int(self.resolve(p.get("Columns", 1)) or 1))
        return data

    def catalog(self) -> Dict[str, Any]:
        trailer_root = None
        for m in re.finditer(rb"/Root\s+(\d+)\s+(\d+)\s+R", self.data):
            trailer_root = int(m.group(1))
        root = self.objects.get(trailer_root) if trailer_root is not None else None
        if isinstance(root, dict):
            return root
        for value in self.objects.values():
            if isinstance(value, dict) and value.get("Type") == "Catalog":
                return value
        raise PdfError("document catalogue not found")

    def pages(self) -> List[Dict[str, Any]]:
        result: List[Dict[str, Any]] = []
        seen = set()

        # Stage 2: recursive page tree walk. Inner nodes (/Pages) list children in /Kids; leaves are pages.
        # A page without its own /Resources inherits them from its parent. `seen` stops loops in broken files.
        def walk(node_ref: Any, inherited: Dict[str, Any]) -> None:
            key = node_ref.num if isinstance(node_ref, Ref) else id(node_ref)
            if key in seen or len(result) > 10000:
                return
            seen.add(key)
            node = self.resolve(node_ref)
            if not isinstance(node, dict):
                return
            attrs = dict(inherited)
            if "Resources" in node:
                attrs["Resources"] = node["Resources"]
            if node.get("Type") == "Pages" or "Kids" in node:
                for kid in self.resolve(node.get("Kids")) or []:
                    walk(kid, attrs)
            else:
                page = dict(node)
                page.setdefault("Resources", attrs.get("Resources"))
                result.append(page)

        walk(self.catalog().get("Pages"), {})
        return result


# ---------------------------------------------------------------------------------------------------------
# Fonts and encodings
# ---------------------------------------------------------------------------------------------------------

# Adobe glyph names for the characters that /Differences arrays commonly reference.
GLYPHS = {
    "space": " ", "exclam": "!", "quotedbl": '"', "numbersign": "#", "dollar": "$", "percent": "%",
    "ampersand": "&", "quotesingle": "'", "quoteright": "’", "quoteleft": "‘", "parenleft": "(",
    "parenright": ")", "asterisk": "*", "plus": "+", "comma": ",", "hyphen": "-", "minus": "-", "period": ".",
    "slash": "/", "colon": ":", "semicolon": ";", "less": "<", "equal": "=", "greater": ">", "question": "?",
    "at": "@", "bracketleft": "[", "backslash": "\\", "bracketright": "]", "asciicircum": "^",
    "underscore": "_", "grave": "`", "braceleft": "{", "bar": "|", "braceright": "}", "asciitilde": "~",
    "bullet": "•", "endash": "–", "emdash": "—", "quotedblleft": "“",
    "quotedblright": "”", "ellipsis": "…", "fi": "fi", "fl": "fl", "ff": "ff", "ffi": "ffi",
    "ffl": "ffl", "copyright": "©", "registered": "®", "trademark": "™", "degree": "°",
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7",
    "eight": "8", "nine": "9", "nbspace": " ", "rupee": "₹", "Euro": "€",
}


def glyph_to_unicode(name: str) -> str:
    if len(name) == 1:
        return name
    if name in GLYPHS:
        return GLYPHS[name]
    m = re.fullmatch(r"uni([0-9A-Fa-f]{4})+", name)
    if m:
        hexes = re.findall(r"[0-9A-Fa-f]{4}", name[3:])
        return "".join(chr(int(h, 16)) for h in hexes)
    m = re.fullmatch(r"u([0-9A-Fa-f]{4,6})", name)
    if m:
        return chr(int(m.group(1), 16))
    base = name.split(".")[0].split("_")[0]
    return base if len(base) == 1 else ""


def _mac_roman(code: int) -> str:
    return bytes([code]).decode("mac_roman", errors="replace")


def _win_ansi(code: int) -> str:
    try:
        return bytes([code]).decode("cp1252")
    except UnicodeDecodeError:
        return bytes([code]).decode("latin-1")


@dataclass
class Font:
    code_bytes: int = 1
    to_unicode: Dict[int, str] = field(default_factory=dict)
    differences: Dict[int, str] = field(default_factory=dict)
    base_encoding: str = "WinAnsiEncoding"
    #: glyph advance widths in thousandths of text space, from /Widths or the CID /W array
    widths: Dict[int, float] = field(default_factory=dict)
    default_width: float = 500.0

    def codes(self, raw: bytes) -> List[int]:
        step = self.code_bytes
        return [int.from_bytes(raw[i:i + step], "big") for i in range(0, len(raw) - step + 1, step)]

    def advance(self, raw: bytes, size: float, char_spacing: float, word_spacing: float, scale: float) -> float:
        """Horizontal displacement of showing `raw`, in unscaled text space (PDF 1.7 section 9.4.4)."""
        total = 0.0
        for code in self.codes(raw):
            w = self.widths.get(code, self.default_width) / 1000.0
            total += w * size + char_spacing + (word_spacing if self.code_bytes == 1 and code == 32 else 0.0)
        return total * scale

    def decode(self, raw: bytes) -> str:
        out = []
        step = self.code_bytes
        # Stage 5: character code -> Unicode. Try the ToUnicode map first, then /Differences,
        # then the font's base encoding (only for one-byte fonts). Unknown codes are dropped.
        for code in self.codes(raw):
            if code in self.to_unicode:
                out.append(self.to_unicode[code])
            elif code in self.differences:
                out.append(self.differences[code])
            elif step == 1:
                out.append(_mac_roman(code) if self.base_encoding == "MacRomanEncoding" else _win_ansi(code))
        return "".join(out)


def parse_cmap(data: bytes) -> Tuple[Dict[int, str], int]:
    """Parses a /ToUnicode CMap: bfchar and bfrange sections and the code width from codespacerange."""
    mapping: Dict[int, str] = {}
    width = 1
    space = re.search(rb"begincodespacerange\s*<([0-9A-Fa-f]+)>", data)
    if space:
        width = max(1, len(space.group(1)) // 2)

    def utf16(hexstr: bytes) -> str:
        raw = bytes.fromhex(hexstr.decode("ascii")) if hexstr else b""
        if len(raw) % 2:
            raw = b"\x00" + raw
        return raw.decode("utf-16-be", errors="replace")

    # bfchar lines map one code to one string: <0041> <0041>.
    # bfrange lines map a range of codes: <lo> <hi> <start> (counting up) or <lo> <hi> [<a> <b> ...].
    # re.S lets "." also match newlines, because each block spans several lines.
    for block in re.findall(rb"beginbfchar(.*?)endbfchar", data, re.S):
        for src, dst in re.findall(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>", block):
            mapping[int(src, 16)] = utf16(dst)
            width = max(width, len(src) // 2) if not space else width
    for block in re.findall(rb"beginbfrange(.*?)endbfrange", data, re.S):
        for m in re.finditer(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])", block):
            lo, hi, dst = int(m.group(1), 16), int(m.group(2), 16), m.group(3)
            if hi - lo > 65535:
                continue
            if dst.startswith(b"["):
                for k, item in enumerate(re.findall(rb"<([0-9A-Fa-f]*)>", dst)):
                    mapping[lo + k] = utf16(item)
            else:
                start = bytes.fromhex(dst[1:-1].decode("ascii") or "00")
                base = int.from_bytes(start, "big")
                for k in range(hi - lo + 1):
                    value = (base + k).to_bytes(max(2, len(start)), "big")
                    mapping[lo + k] = value.decode("utf-16-be", errors="replace")
    return mapping, width


def _load_widths(doc: PdfDocument, d: Dict[str, Any], font: Font) -> None:
    """Reads glyph widths: /FirstChar + /Widths for simple fonts, /DW + /W for CID (Type0) fonts."""
    if d.get("Subtype") == "Type0":
        descendants = doc.resolve(d.get("DescendantFonts")) or []
        cid = doc.resolve(descendants[0]) if descendants else None
        if not isinstance(cid, dict):
            return
        font.default_width = float(doc.resolve(cid.get("DW")) or 1000)
        w = [doc.resolve(x) for x in (doc.resolve(cid.get("W")) or [])]
        i = 0
        while i < len(w):
            first = w[i]
            if i + 1 < len(w) and isinstance(w[i + 1], list):
                for k, width in enumerate(w[i + 1]):
                    font.widths[int(first) + k] = float(doc.resolve(width))
                i += 2
            elif i + 2 < len(w):
                for code in range(int(first), int(w[i + 1]) + 1):
                    font.widths[code] = float(w[i + 2])
                i += 3
            else:
                break
        return
    first = doc.resolve(d.get("FirstChar"))
    widths = doc.resolve(d.get("Widths"))
    if isinstance(first, int) and isinstance(widths, list):
        for k, width in enumerate(widths):
            width = doc.resolve(width)
            if isinstance(width, (int, float)):
                font.widths[first + k] = float(width)
        descriptor = doc.resolve(d.get("FontDescriptor"))
        missing = doc.resolve(descriptor.get("MissingWidth")) if isinstance(descriptor, dict) else None
        if isinstance(missing, (int, float)) and missing:
            font.default_width = float(missing)


def load_font(doc: PdfDocument, font_obj: Any) -> Font:
    d = doc.resolve(font_obj)
    font = Font()
    if not isinstance(d, dict):
        return font
    if d.get("Subtype") == "Type0":
        font.code_bytes = 2
    enc = doc.resolve(d.get("Encoding"))
    if isinstance(enc, Name):
        font.base_encoding = str(enc)
        if str(enc).startswith("Identity"):
            font.code_bytes = 2
    elif isinstance(enc, dict):
        font.base_encoding = str(doc.resolve(enc.get("BaseEncoding")) or "WinAnsiEncoding")
        code = 0
        # /Differences looks like [32 /space /exclam 65 /A]: a number sets the starting code,
        # and each following glyph name takes the next code.
        for item in doc.resolve(enc.get("Differences")) or []:
            item = doc.resolve(item)
            if isinstance(item, int):
                code = item
            elif isinstance(item, Name):
                font.differences[code] = glyph_to_unicode(str(item))
                code += 1
    _load_widths(doc, d, font)
    tu = doc.resolve(d.get("ToUnicode"))
    if isinstance(tu, Stream):
        try:
            mapping, width = parse_cmap(doc.decode(tu))
            font.to_unicode = mapping
            if d.get("Subtype") == "Type0":
                font.code_bytes = width if width in (1, 2, 3, 4) else 2
        except Exception:
            pass
    return font


# ---------------------------------------------------------------------------------------------------------
# Content stream interpretation and layout
# ---------------------------------------------------------------------------------------------------------

@dataclass
class Fragment:
    x: float
    y: float
    size: float
    text: str
    end: float = 0.0  # x where the fragment's last glyph ends (device space)


# Multiplies two PDF transformation matrices. Each is stored as 6 numbers [a b c d e f], the short form
# of a 3x3 matrix; e and f are the x and y offset. Used to turn text positions into page positions.
def _mul(a: List[float], b: List[float]) -> List[float]:
    return [
        a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
    ]


def interpret(doc: PdfDocument, content: bytes, fonts: Dict[str, Any], depth: int = 0) -> List[Fragment]:
    # Stage 4: text operator interpretation. Content streams are postfix, e.g. "/F1 12 Tf (Hello) Tj":
    # operands come first and are collected in `operands` until an operator arrives and uses them.
    # State: ctm = current transformation matrix (q/Q save and restore it), tm = text matrix (where the
    # next glyph goes), tlm = text line matrix (start of the current line), plus font, size and spacing.
    lexer = Lexer(content)
    operands: List[Any] = []
    frags: List[Fragment] = []
    cache: Dict[str, Font] = {}
    font = Font()
    size = 12.0
    leading = 0.0
    ctm = [1.0, 0, 0, 1.0, 0, 0]
    stack: List[List[float]] = []
    tm = [1.0, 0, 0, 1.0, 0, 0]
    tlm = list(tm)
    char_spacing = word_spacing = 0.0
    scale = 1.0

    def advance(tx: float) -> None:
        nonlocal tm
        tm = _mul([1, 0, 0, 1, tx, 0], tm)

    def show(text: str, width: float) -> None:
        """Records a fragment at the current position and moves the text matrix past it."""
        start = _mul(tm, ctm)
        advance(width)
        end = _mul(tm, ctm)
        if text:
            frags.append(Fragment(start[4], start[5], abs(size * (start[3] or start[0] or 1)), text, end[4]))

    def emit(raw: bytes) -> None:
        show(font.decode(raw), font.advance(raw, size, char_spacing, word_spacing, scale))

    def move(tx: float, ty: float) -> None:
        nonlocal tm, tlm
        tlm = _mul([1, 0, 0, 1, tx, ty], tlm)
        tm = list(tlm)

    while True:
        token = lexer.next_token()
        if token is None and lexer.pos >= len(content):
            break
        if token == "[":
            arr: List[Any] = []
            while True:
                t = lexer.next_token()
                if t == "]" or (t is None and lexer.pos >= len(content)):
                    break
                arr.append(t)
            operands.append(arr)
            continue
        if token == "<<":  # inline dictionary (marked content properties) - skip
            nest = 1
            while nest and lexer.pos < len(content):
                t = lexer.next_token()
                nest += 1 if t == "<<" else -1 if t == ">>" else 0
            continue
        if not isinstance(token, Operator):
            operands.append(token)
            continue

        op = str(token)
        nums = [o for o in operands if isinstance(o, (int, float))]
        if op == "BI":  # inline image: skip binary data up to EI
            end = re.compile(rb"\sEI[\s]").search(content, lexer.pos)
            lexer.pos = end.end() if end else len(content)
        elif op == "q":
            stack.append(list(ctm))
        elif op == "Q":
            ctm = stack.pop() if stack else [1.0, 0, 0, 1.0, 0, 0]
        elif op == "cm" and len(nums) >= 6:
            ctm = _mul([float(n) for n in nums[-6:]], ctm)
        elif op == "BT":
            tm, tlm = [1.0, 0, 0, 1.0, 0, 0], [1.0, 0, 0, 1.0, 0, 0]
        elif op == "Tf" and operands:
            name = next((str(o) for o in operands if isinstance(o, Name)), "")
            if nums:
                size = float(nums[-1])
            if name not in cache:
                cache[name] = load_font(doc, (fonts or {}).get(name))
            font = cache[name]
        elif op == "Tc" and nums:
            char_spacing = float(nums[-1])
        elif op == "Tw" and nums:
            word_spacing = float(nums[-1])
        elif op == "Tz" and nums:
            scale = float(nums[-1]) / 100.0
        elif op == "TL" and nums:
            leading = float(nums[-1])
        elif op == "Td" and len(nums) >= 2:
            move(float(nums[-2]), float(nums[-1]))
        elif op == "TD" and len(nums) >= 2:
            leading = -float(nums[-1])
            move(float(nums[-2]), float(nums[-1]))
        elif op == "Tm" and len(nums) >= 6:
            tlm = [float(n) for n in nums[-6:]]
            tm = list(tlm)
        elif op == "T*":
            move(0, -(leading or size * 1.2))
        elif op == "Tj" and operands and isinstance(operands[-1], bytes):
            emit(operands[-1])
        elif op in ("'", '"') and operands and isinstance(operands[-1], bytes):
            if op == '"' and len(nums) >= 2:
                word_spacing, char_spacing = float(nums[-2]), float(nums[-1])
            move(0, -(leading or size * 1.2))
            emit(operands[-1])
        elif op == "TJ" and operands and isinstance(operands[-1], list):
            for item in operands[-1]:
                if isinstance(item, bytes):
                    emit(item)
                elif isinstance(item, (int, float)):
                    # Numbers shift the next glyph left (positive) or right (negative) in 1/1000 em.
                    advance(-float(item) / 1000.0 * size * scale)
        operands = []
    return frags


def layout(frags: List[Fragment]) -> str:
    """Groups fragments into lines by baseline and lines into paragraphs by vertical gaps."""
    if not frags:
        return ""
    lines: List[Tuple[float, float, List[Fragment]]] = []  # (y, size, fragments)
    # Stage 6a: lines. A fragment joins an existing line when its baseline is within about
    # a third of the font size of that line; otherwise it starts a new line.
    for f in frags:
        tolerance = max(1.0, f.size * 0.35)
        for i, (y, s, items) in enumerate(lines):
            if abs(y - f.y) <= tolerance:
                items.append(f)
                break
        else:
            lines.append((f.y, f.size, [f]))
    lines.sort(key=lambda line: -line[0])  # PDF y grows upwards, so the largest y is the top line

    texts: List[Tuple[float, float, str]] = []
    for y, s, items in lines:
        items.sort(key=lambda f: f.x)
        buf = ""
        last_end: Optional[float] = None
        for f in items:
            # A horizontal gap wider than ~a fifth of the font size between glyph runs is a word space.
            if buf and last_end is not None and f.x - last_end > f.size * 0.18 and not buf.endswith(" ")                     and not f.text.startswith(" "):
                buf += " "
            buf += f.text
            last_end = max(f.end, f.x)
        texts.append((y, max(it.size for it in items), re.sub(r"[ \t]+", " ", buf).strip()))

    gaps = sorted(texts[i][0] - texts[i + 1][0] for i in range(len(texts) - 1) if texts[i][0] - texts[i + 1][0] > 0)
    # Line spacing within a paragraph is the most frequent, smallest gap; use the lower quartile.
    typical = gaps[len(gaps) // 4] if gaps else 14.0

    out: List[str] = []
    para: List[str] = []
    prev: Optional[Tuple[float, float, str]] = None
    for line in texts:
        if prev is not None:
            gap = prev[0] - line[0]
            # Stage 6b: paragraphs. Start a new one when the gap is clearly larger than normal line spacing,
            # when the next line is higher up (gap < 0, e.g. a new column), or when the font size changes (e.g. a heading).
            if gap > typical * 1.45 or gap < 0 or abs(line[1] - prev[1]) > 1.5:
                out.append(" ".join(para))
                para = []
        if line[2]:
            para.append(line[2])
        prev = line
    if para:
        out.append(" ".join(para))
    joined = "\n\n".join(p for p in out if p.strip())
    return re.sub(r"(\w)- (\w)", r"\1\2", joined)  # re-join words hyphenated at line ends


def _page_contents(doc: PdfDocument, page: Dict[str, Any]) -> bytes:
    contents = doc.resolve(page.get("Contents"))
    streams = contents if isinstance(contents, list) else [contents]
    chunks = []
    for s in streams:
        s = doc.resolve(s)
        if isinstance(s, Stream):
            try:
                chunks.append(doc.decode(s))
            except PdfError:
                continue
    return b"\n".join(chunks)


def _forms(doc: PdfDocument, resources: Dict[str, Any]) -> List[Tuple[bytes, Dict[str, Any]]]:
    """Form XObjects often carry the real text (e.g. PDFs produced by some printers)."""
    out = []
    xobjects = doc.resolve(resources.get("XObject")) if isinstance(resources, dict) else None
    for ref in (xobjects or {}).values():
        x = doc.resolve(ref)
        if isinstance(x, Stream) and x.dict.get("Subtype") == "Form":
            try:
                res = doc.resolve(x.dict.get("Resources")) or resources
                out.append((doc.decode(x), res))
            except PdfError:
                continue
    return out


def extract_pdf_text(data: bytes) -> str:
    doc = PdfDocument(data)
    pages_text = []
    # For each page: decode its content, interpret the text operators (also inside form XObjects),
    # then lay the fragments out as paragraphs. Pages are joined with a blank line.
    for page in doc.pages():
        resources = doc.resolve(page.get("Resources")) or {}
        fonts = doc.resolve(resources.get("Font")) if isinstance(resources, dict) else {}
        frags = interpret(doc, _page_contents(doc, page), fonts or {})
        for content, res in _forms(doc, resources):
            frags += interpret(doc, content, doc.resolve(res.get("Font")) or {}, depth=1)
        text = layout(frags)
        if text:
            pages_text.append(text)
    return "\n\n".join(pages_text)
