/**
 * Encryption utilities for sensitive data
 * CRITICAL: OAuth tokens, API keys MUST be encrypted before database storage
 * @see Architecture Section 13.3
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for encryption');
  }
  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt sensitive text using AES-256-GCM
 * @param text - Plaintext to encrypt
 * @returns Encrypted string in format: iv:ciphertext:authTag (hex encoded)
 *
 * @example
 * const encryptedToken = encrypt(oauthAccessToken);
 * await db.insert(oauthConnections).values({
 *   encryptedAccessToken: encryptedToken,
 * });
 */
export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
}

/**
 * Decrypt encrypted text using AES-256-GCM
 * @param encryptedText - Encrypted string in format: iv:ciphertext:authTag
 * @returns Decrypted plaintext
 *
 * @example
 * const connection = await db.query.oauthConnections.findFirst({ ... });
 * const accessToken = decrypt(connection.encryptedAccessToken);
 * // Use accessToken for API call
 */
export function decrypt(encryptedText: string): string {
  const key = getKey();
  const [ivHex, encrypted, authTagHex] = encryptedText.split(':');

  if (!ivHex || !encrypted || !authTagHex) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
