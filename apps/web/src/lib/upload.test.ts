import { describe, expect, it } from 'vitest';
import { validateFile } from './upload';

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
