/**
 * What this file does
 *   Unit tests for validateFile() in upload.ts, run with Vitest.
 *
 * How it works
 *   - Builds fake File objects that only have a name and a size, which is all validateFile() reads.
 *   - Checks that supported types pass (any letter case), other types are refused, and that too-large
 *     and empty files get the right message.
 *
 * Where it fits
 *   Run by the web app's test command; not part of the running app. Module: M03 documents (owner: Shrut).
 */
import { describe, expect, it } from 'vitest';
import { validateFile } from './upload';

// A fake File: the cast is safe here because validateFile() never reads the file contents.
const file = (name: string, size: number) => ({ name, size }) as File;

describe('validateFile (Doc.Upload.Format, Doc.Upload.Size)', () => {
  it('accepts the supported formats', () => {
    for (const name of ['a.pdf', 'b.DOCX', 'c.txt', 'd.md', 'e.png', 'f.jpeg']) expect(validateFile(file(name, 10))).toBeNull();
  });

  it('rejects other formats with the list of accepted ones', () => {
    expect(validateFile(file('virus.exe', 10))).toContain('PDF, DOCX, TXT, MD, PNG or JPEG');
  });

  it('states the 50 MB limit before uploading', () => {
    expect(validateFile(file('big.pdf', 51 * 1024 * 1024))).toContain('50.0 MB');
    expect(validateFile(file('empty.txt', 0))).toContain('empty');
  });
});
