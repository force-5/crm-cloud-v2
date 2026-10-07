import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * AES-256-GCM for the short-lived pending-login password (tenant picker). The key is derived from
 * SESSION_SECRET, so a stolen session-store record alone does not reveal the password.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(hkdfSync('sha256', secret, 'force5-crm-bff', 'pending-login-password', 32));
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
  }

  decrypt(box: string): string | null {
    try {
      const buf = Buffer.from(box, 'base64url');
      // authTagLength pins the 16-byte tag; otherwise Node accepts truncated tags.
      const decipher = createDecipheriv('aes-256-gcm', this.key, buf.subarray(0, 12), { authTagLength: 16 });
      decipher.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
