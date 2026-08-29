const crypto = require('crypto');

// Encryption at rest for message content — the Confidentiality leg of CIA,
// and the commitment made in Section 9 of the proposal ("stored chats are
// encrypted").
//
// What this protects against: a database dump. A leaked backup, a
// misconfigured cluster, a stolen disk. In those cases the attacker gets
// ciphertext rather than conversations about someone's addiction or sexual
// health.
//
// What it does NOT protect against: anyone who can run the server code, since
// the key lives in the environment. Encryption at rest is not a defence
// against a compromised backend, and it is worth saying so plainly rather than
// implying more than it delivers.
//
// Algorithm: AES-256-GCM. Chosen over CBC because GCM is authenticated — it
// detects tampering as well as hiding content, which matters for the Integrity
// leg. A modified ciphertext fails to decrypt rather than silently returning
// altered text.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96 bits, the recommended size for GCM
const TAG_LENGTH = 16;

let cachedKey = null;

function getKey() {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;

  // Expect 64 hex characters = 32 bytes.
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  cachedKey = Buffer.from(raw, 'hex');
  return cachedKey;
}

const PREFIX = 'enc:v1:';

/**
 * Encrypt a string for storage.
 * Returns the plaintext unchanged if no key is configured, so a missing key
 * degrades to the previous behaviour rather than crashing mid-conversation.
 */
function encrypt(plaintext) {
  const key = getKey();
  if (!key || typeof plaintext !== 'string' || !plaintext) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Prefixed so mixed plaintext and ciphertext can coexist. Messages written
  // before encryption was enabled stay readable without a migration.
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a stored string. Anything without the prefix is returned as-is,
 * which is what makes the rollout backward compatible.
 */
function decrypt(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return stored;

  const key = getKey();
  if (!key) {
    // Encrypted data with no key is unrecoverable. Say so rather than
    // returning ciphertext into a doctor's screen as if it were a message.
    return '[encrypted — server key unavailable]';
  }

  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = buf.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    // GCM authentication failed: the ciphertext was altered, or the key is
    // wrong. Either way the content cannot be trusted.
    return '[encrypted — could not be read]';
  }
}

function isEnabled() {
  return Boolean(getKey());
}

/**
 * Decrypt the content fields of rows returned by a .lean() query.
 *
 * This exists because .lean() bypasses Mongoose getters entirely — a lean
 * query returns raw ciphertext. Every place that reads messages with .lean()
 * must pass the results through here, or encrypted text reaches the client.
 */
function decryptMessages(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((m) => ({
    ...m,
    content: decrypt(m.content),
    ...(m.audio ? { audio: decrypt(m.audio) } : {}),
  }));
}

module.exports = { encrypt, decrypt, decryptMessages, isEnabled, PREFIX };
