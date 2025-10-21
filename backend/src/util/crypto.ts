import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

type EncryptedPayload = {
  ct: string;
  iv: string;
  tag: string;
};

const PREFIX = 'enc.v1:';

function getKey(): Buffer {
  const keyB64 = process.env.PII_ENC_KEY;
  if (!keyB64) {
    throw new Error('PII_ENC_KEY must be configured');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('PII_ENC_KEY must decode to 32 bytes');
  }
  return key;
}

export function encryptPII(plain: string): EncryptedPayload {
  if (!plain) {
    throw new Error('Cannot encrypt empty payload');
  }
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ct: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  };
}

function parseValue(value: string | EncryptedPayload | null | undefined): EncryptedPayload | null {
  if (!value) return null;
  if (typeof value === 'object' && 'ct' in value && 'iv' in value && 'tag' in value) {
    return value as EncryptedPayload;
  }
  if (typeof value === 'string') {
    if (!value.startsWith(PREFIX)) {
      return null;
    }
    const [, payload] = value.split(PREFIX);
    const parts = payload.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }
    const [iv, tag, ct] = parts;
    return { iv, tag, ct };
  }
  return null;
}

export function serializeEncryptedPII(payload: EncryptedPayload): string {
  return `${PREFIX}${payload.iv}.${payload.tag}.${payload.ct}`;
}

export function decryptPII(value: string | EncryptedPayload | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && !value.startsWith(PREFIX)) {
    return value;
  }
  const parsed = parseValue(value);
  if (!parsed) {
    return '';
  }
  const key = getKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(parsed.ct, 'base64')),
    decipher.final()
  ]);
  return plain.toString('utf8');
}

export function maskPII(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return '***';
  const visible = value.slice(-4);
  return `***${visible}`;
}

export function isEncryptedPII(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}
