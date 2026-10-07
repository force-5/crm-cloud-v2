import { validationError } from './errors';

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/**
 * The contracts schema already checks the data-URL prefix and that the body is base64. This checks
 * the decoded bytes really are the declared image type, so arbitrary files can't be uploaded to the
 * tenant's public branding by renaming them (security review L9).
 */
export function assertImageDataUrl(dataUrl: string, field = 'dataUrl'): void {
  const m = /^data:image\/(png|jpeg|webp);base64,/.exec(dataUrl);
  const head = m ? Buffer.from(dataUrl.slice(m[0].length, m[0].length + 24), 'base64') : Buffer.alloc(0);
  if (!m || !SIGNATURES[m[1]!]!(head)) {
    throw validationError({ [field]: 'Image must be a PNG, JPEG or WebP file.' });
  }
}
