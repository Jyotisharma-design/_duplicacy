const { extractFileId } = require('../server/services/googleDriveService');

describe('extractFileId', () => {
  it('extracts id from /file/d/ link', () => {
    const link = 'https://drive.google.com/file/d/1AbcDEFghIJ/view?usp=sharing';
    expect(extractFileId(link)).toBe('1AbcDEFghIJ');
  });

  it('extracts id from /folders/ link', () => {
    const link = 'https://drive.google.com/drive/folders/1AbcDEFghIJ?usp=sharing';
    expect(extractFileId(link)).toBe('1AbcDEFghIJ');
  });

  it('extracts id from open?id link', () => {
    const link = 'https://drive.google.com/open?id=1AbcDEFghIJ';
    expect(extractFileId(link)).toBe('1AbcDEFghIJ');
  });

  it('returns null for invalid link', () => {
    const link = 'https://example.com';
    expect(extractFileId(link)).toBeNull();
  });
});