import { Inject, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual as nodeTimingSafeEqual,
} from 'node:crypto';
import { APP_CONFIG } from '../config/config.module';
import type { Env } from '../config/env';

const IV_BYTES = 12; // recommended for GCM
const TAG_BYTES = 16;
const KEY_BYTES = 32; // AES-256
const MIN_TOKEN_BYTES = 16;

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: Env) {
    this.key = Buffer.from(config.ENCRYPTION_KEY, 'base64');
    if (this.key.length !== KEY_BYTES) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  }

  /** Cryptographically random base64url token; never shorter than 16 bytes (128 bits). */
  randomToken(bytes = 32): string {
    if (!Number.isInteger(bytes)) throw new Error('randomToken: bytes must be an integer');
    if (bytes < MIN_TOKEN_BYTES) throw new Error('randomToken: bytes must be at least 16');
    return randomBytes(bytes).toString('base64url');
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** AES-256-GCM. Output: `iv.tag.data`, each base64url. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split('.');
    if (parts.length !== 3) throw new Error('Malformed ciphertext');
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64url')) as [
      Buffer,
      Buffer,
      Buffer,
    ];
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /** Constant-time comparison; false (not a throw) when lengths differ. */
  timingSafeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && nodeTimingSafeEqual(x, y);
  }
}
