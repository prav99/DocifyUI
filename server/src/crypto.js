// Envelope encryption for provider credentials at rest.
//
// OAuth access/refresh tokens and Jira/Confluence/Notion API credentials are
// the highest-value rows in the database: they grant read access to a
// customer's source. They are encrypted with AES-256-GCM before they ever
// reach storage and decrypted only at the point of an outbound API call.
//
// The key comes from CREDENTIAL_KEY (64 hex chars = 32 bytes). Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Ciphertext format:  enc:v1:<iv-b64>:<tag-b64>:<ciphertext-b64>
// Values that do not carry the prefix are returned unchanged, so an existing
// database keeps working and re-encrypts naturally as rows are rewritten.

import crypto from 'crypto';

const PREFIX = 'enc:v1:';
const IS_PROD = process.env.NODE_ENV === 'production';
let warned = false;

function key() {
  const raw = process.env.CREDENTIAL_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    if (!warned) {
      warned = true;
      console[IS_PROD ? 'error' : 'warn'](
        '[security] CREDENTIAL_KEY is not set to 64 hex characters — provider tokens ' +
        (IS_PROD
          ? 'CANNOT be stored. Connecting a source will fail until it is set. Generate one with: ' +
            'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
          : 'are being stored in plaintext. Set it before connecting real customer accounts.')
      );
    }
    return null;
  }
  return Buffer.from(raw, 'hex');
}

export function credentialEncryptionEnabled() {
  return key() !== null;
}

export function encryptSecret(plain) {
  if (plain == null || plain === '') return plain;
  const k = key();
  // Fail closed in production: writing a customer's repository token to the
  // database in plaintext is worse than refusing the connection, and it would
  // silently contradict the security policy. Local development still degrades
  // to plaintext so the product runs with no setup.
  if (!k && IS_PROD) {
    throw new Error('Credential storage is not configured on this server (CREDENTIAL_KEY). Ask an administrator to set it, then reconnect.');
  }
  if (!k) return plain;
  if (String(plain).startsWith(PREFIX)) return plain; // already encrypted
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return PREFIX + iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + ct.toString('base64');
}

export function decryptSecret(stored) {
  if (stored == null || stored === '') return stored;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return stored; // legacy plaintext row
  const k = key();
  if (!k) return '';
  try {
    const [, , ivB64, tagB64, ctB64] = s.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64'));
    d.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ctB64, 'base64')), d.final()]).toString('utf8');
  } catch {
    // Wrong key or tampered row: fail closed rather than leak a partial value.
    return '';
  }
}

// Prisma middleware: encrypt Source.token / Source.refreshToken on the way in,
// decrypt on the way out. One chokepoint means no call site can forget.
const FIELDS = ['token', 'refreshToken'];

export function installCredentialEncryption(prisma) {
  prisma.$use(async (params, next) => {
    if (params.model === 'Source') {
      const data = params.args && params.args.data;
      if (data) {
        for (const f of FIELDS) {
          if (typeof data[f] === 'string') data[f] = encryptSecret(data[f]);
          else if (data[f] && typeof data[f].set === 'string') data[f].set = encryptSecret(data[f].set);
        }
      }
      const create = params.args && params.args.create;
      const update = params.args && params.args.update;
      for (const blob of [create, update]) {
        if (!blob) continue;
        for (const f of FIELDS) if (typeof blob[f] === 'string') blob[f] = encryptSecret(blob[f]);
      }
    }
    const result = await next(params);
    if (params.model === 'Source' && result) {
      const dec = (row) => {
        if (!row || typeof row !== 'object') return row;
        for (const f of FIELDS) if (typeof row[f] === 'string') row[f] = decryptSecret(row[f]);
        return row;
      };
      return Array.isArray(result) ? result.map(dec) : dec(result);
    }
    return result;
  });
}
