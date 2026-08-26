// AES-256-GCM encryption for connector credentials at rest.
// The key is derived from the service-role secret so no extra config is
// required, but CONNECTOR_ENCRYPTION_KEY overrides it when provided.
import crypto from 'node:crypto';

const RAW =
  process.env.CONNECTOR_ENCRYPTION_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'sutradhar-local-dev-key';

// 32-byte key derived deterministically from the secret.
const KEY = crypto.createHash('sha256').update(String(RAW) + '|sutradhar-connectors-v1').digest();

const PREFIX = 'v1:';

/** Encrypt a plaintext secret. Returns '' for empty input. */
export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a value produced by encrypt(). Returns '' when undecryptable. */
export function decrypt(payload) {
  if (!payload) return '';
  const s = String(payload);
  if (!s.startsWith(PREFIX)) return '';
  try {
    const buf = Buffer.from(s.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Last-4 style hint that is safe to show in the UI. */
export function tokenHint(plain) {
  if (!plain) return '';
  const s = String(plain);
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256base64url(input) {
  return crypto.createHash('sha256').update(input).digest('base64url');
}
