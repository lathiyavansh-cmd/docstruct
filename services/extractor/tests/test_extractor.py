"""Unit tests for the DocStruct text extractor.

What this file does
    Checks that plain text, Markdown, DOCX and PDF files come out as the expected paragraphs, that bad
    input is reported as a failure, and that extract.py prints the agreed JSON.

How it works
    - Uses Python's built-in unittest; test inputs are generated in memory by fixtures.py.
    - PlainTextTests, DocxTests and PdfTests call extract() with a file's bytes and compare the text.
    - LowLevelTests check pieces of pdf.py directly (tokeniser, CMap parser, LZW decoder).
    - CliTests run extract.py as a separate process, the same way the API does, and read its JSON.

Where it fits
    Run with `npm run test:extractor` and in CI (python -m unittest discover -s services/extractor/tests).
    Module: text extractor (owner: Shrut).
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# Make both the package (in services/extractor) and fixtures.py (in tests/) importable.
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)

from docstruct_extractor import ExtractionError, extract  # noqa: E402
from docstruct_extractor.pdf import Lexer, _lzw, parse_cmap  # noqa: E402
from fixtures import build_docx, build_pdf, text_page  # noqa: E402

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class PlainTextTests(unittest.TestCase):
    def test_decodes_utf8_with_bom_and_normalises_newlines(self):
        self.assertEqual(extract(b"\xef\xbb\xbfOne\r\n\r\nTwo", "text/plain"), "One\n\nTwo")

    def test_falls_back_to_cp1252(self):
        self.assertEqual(extract(b"caf\xe9", "text/markdown"), "café")

    def test_empty_file_is_a_failure(self):
        with self.assertRaises(ExtractionError):
            extract(b"   \n", "text/plain")

    def test_images_are_not_extractable(self):
        with self.assertRaises(ExtractionError):
            extract(b"\x89PNG", "image/png")


class DocxTests(unittest.TestCase):
    def test_paragraphs_runs_and_tables(self):
        data = build_docx(["Intro |paragraph.", "Second one."], table=[["Name", "Role"], ["Vansh", "Owner"]])
        self.assertEqual(extract(data, DOCX), "Intro paragraph.\n\nSecond one.\n\nName | Role\n\nVansh | Owner")

    def test_rejects_a_non_zip(self):
        with self.assertRaises(ExtractionError):
            extract(b"not a zip", DOCX)


class PdfTests(unittest.TestCase):
    def test_lines_join_into_paragraphs_and_gaps_split_them(self):
        page = text_page([["The system shall store", "every uploaded version."], ["Reviewers approve or request changes."]])
        text = extract(build_pdf([page]), "application/pdf")
        self.assertEqual(text, "The system shall store every uploaded version.\n\nReviewers approve or request changes.")

    def test_flate_compressed_streams_and_multiple_pages(self):
        pdf = build_pdf([text_page([["Page one"]]), text_page([["Page two"]])], compress=True)
        self.assertEqual(extract(pdf, "application/pdf"), "Page one\n\nPage two")

    def test_escaped_parentheses_and_octal(self):
        page = b"BT /F1 12 Tf 72 720 Td (Costs \\(INR\\) \\243 100) Tj ET"
        self.assertEqual(extract(build_pdf([page]), "application/pdf"), "Costs (INR) £ 100")

    def test_tj_kerning_gaps_become_spaces(self):
        # -20 is a small kerning shift (no space); -400 is a wide gap, which must become a space.
        page = b"BT /F1 12 Tf 72 720 Td [(Doc)-20(Struct)-400(platform)] TJ ET"
        self.assertEqual(extract(build_pdf([page]), "application/pdf"), "DocStruct platform")

    def test_type0_font_with_tounicode_cmap(self):
        cmap = (b"/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n"
                b"1 begincodespacerange <0000> <FFFF> endcodespacerange\n"
                b"2 beginbfchar <0001> <0048> <0002> <0069> endbfchar\n"
                b"1 beginbfrange <0010> <0012> <0041> endbfrange\n"
                b"endcmap end end")
        cmap_obj = b"<< /Length " + str(len(cmap)).encode() + b" >>\nstream\n" + cmap + b"\nendstream"
        # Page objects are 4 and 5, so the font is object 6 and its CMap object 7.
        font = b"<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 7 0 R >>"
        page = b"BT /F2 12 Tf 72 720 Td <00010002> Tj 0 -14 Td <001000110012> Tj ET"
        pdf = build_pdf([page], fonts=b"<< /F2 6 0 R >>", extra_objects=[font, cmap_obj])
        self.assertEqual(extract(pdf, "application/pdf"), "Hi ABC")

    def test_objects_inside_compressed_object_streams(self):
        # The page's font dictionary lives in an /ObjStm (as PDF 1.5+ writers produce).
        inner = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        header = b"6 0 "
        payload = header + inner
        stream = zlib.compress(payload)
        objstm = (b"<< /Type /ObjStm /N 1 /First " + str(len(header)).encode() + b" /Filter /FlateDecode /Length "
                  + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
        page = b"BT /F9 12 Tf 72 720 Td (Packed font) Tj ET"
        pdf = build_pdf([page], fonts=b"<< /F9 6 0 R >>", extra_objects=[b"null", objstm])
        self.assertEqual(extract(pdf, "application/pdf"), "Packed font")

    def test_differences_encoding(self):
        # Code 65 ("A") is redefined as a bullet and 66 ("B") as a right quote.
        font = b"<< /Type /Font /Subtype /Type1 /Encoding << /Differences [65 /bullet /quoteright] >> >>"
        page = b"BT /F3 12 Tf 72 720 Td (A Docs B) Tj ET"
        pdf = build_pdf([page], fonts=b"<< /F3 6 0 R >>", extra_objects=[font])
        self.assertEqual(extract(pdf, "application/pdf"), "• Docs ’")

    def test_pdf_without_text_reports_failure(self):
        # The page only draws (q ... cm Q) and shows no text, like a scanned page.
        with self.assertRaises(ExtractionError):
            extract(build_pdf([b"q 100 0 0 100 0 0 cm Q"]), "application/pdf")

    def test_not_a_pdf(self):
        with self.assertRaises(ExtractionError):
            extract(b"hello", "application/pdf")


class LowLevelTests(unittest.TestCase):
    def test_lexer_tokens(self):
        lexer = Lexer(b"/Name 12 -3.5 (str) <414243> [ ] true")
        tokens = [lexer.next_token() for _ in range(8)]
        self.assertEqual(tokens, ["Name", 12, -3.5, b"str", b"ABC", "[", "]", True])

    def test_cmap_ranges(self):
        mapping, width = parse_cmap(b"1 begincodespacerange <00> <FF> endcodespacerange "
                                    b"1 beginbfrange <41> <43> <0061> endbfrange")
        self.assertEqual(width, 1)
        self.assertEqual([mapping[0x41], mapping[0x43]], ["a", "c"])

    def test_lzw_decoder(self):
        # "-----A---B" encoded with the PDF LZW example from the specification.
        encoded = bytes([0x80, 0x0B, 0x60, 0x50, 0x22, 0x0C, 0x0C, 0x85, 0x01])
        self.assertEqual(_lzw(encoded), b"-----A---B")


class CliTests(unittest.TestCase):
    def run_cli(self, data: bytes, mime: str):
        # delete=False: the file must be closed before the child process opens it (required on Windows).
        with tempfile.NamedTemporaryFile(delete=False) as fh:
            fh.write(data)
            path = fh.name
        try:
            out = subprocess.run([sys.executable, "-I", os.path.join(ROOT, "extract.py"), path, mime],
                                 capture_output=True, check=True)
            return json.loads(out.stdout.decode("utf-8"))
        finally:
            os.unlink(path)

    def test_success_json(self):
        self.assertEqual(self.run_cli("Ünïcode text".encode(), "text/plain"), {"ok": True, "text": "Ünïcode text", "chars": 12})

    def test_failure_json(self):
        result = self.run_cli(b"garbage", "application/pdf")
        self.assertFalse(result["ok"])
        self.assertIn("not a PDF", result["error"])


if __name__ == "__main__":
    unittest.main()
