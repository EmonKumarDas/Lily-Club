import crypto from 'node:crypto';
import { getConfig } from './config.js';

const ENVELOPE_PREFIX = 'enc:v1:';

function deriveKey32(): Buffer {
  const cfg = getConfig();
  const raw = (cfg.FIELD_ENCRYPTION_KEY || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Derive deterministic 256-bit key via HKDF-SHA256 from configured secret material
  const ikm = raw || cfg.SESSION_SECRET;
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(ikm, 'utf8'), Buffer.from('lilycc-field-salt-v1', 'utf8'), Buffer.from('lilycc-aes-256-gcm-dek', 'utf8'), 32)
  );
}

/**
 * Standard NIST AES-256-GCM authenticated encryption for sensitive PII fields
 * (customer phone, alt_phone, address, payment reference_number).
 * Never uses custom cryptography; uses 96-bit random IV and 128-bit authentication tag.
 */
export function encryptSensitiveField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  const str = String(plaintext);
  if (str === '') return '';
  if (str.startsWith(ENVELOPE_PREFIX)) return str; // Already encrypted

  const key = deriveKey32();
  const iv = crypto.randomBytes(12); // 96-bit NIST recommended IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag(); // 128-bit auth tag

  return `${ENVELOPE_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSensitiveField(ciphertext: string | null | undefined): string | null {
  if (ciphertext === null || ciphertext === undefined) return null;
  const str = String(ciphertext);
  if (!str.startsWith(ENVELOPE_PREFIX)) {
    // Graceful backward compatibility for existing plaintext rows before migration
    return str;
  }

  try {
    const payload = str.slice(ENVELOPE_PREFIX.length);
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || dataB64 === undefined) return '[REDACTED]';

    const key = deriveKey32();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '[DECRYPTION_FAILED]';
  }
}

/**
 * Blind-index HMAC-SHA256 for exact phone duplicate detection without storing plaintext phone in index.
 */
export function computePhoneBlindIndex(roomId: string, normalizedPhone: string): string {
  const key = deriveKey32();
  return crypto
    .createHmac('sha256', key)
    .update(`${roomId}:${normalizedPhone}`)
    .digest('hex');
}
