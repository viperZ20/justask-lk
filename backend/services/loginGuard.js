const mongoose = require('mongoose');

// Per-account login protection.
//
// The IP rate limiter caps attempts from one address. An attacker rotating
// addresses gets a fresh allowance each time, so it does nothing against a
// distributed attempt on one account. This counts failures against the ACCOUNT,
// which rotation cannot avoid.
//
// Attempts are tracked in their own short-lived collection rather than on the
// doctor record, for two reasons: a failed attempt against an email that is not
// registered still needs recording (otherwise the endpoint reveals which
// emails exist by which ones get locked), and the records expire on their own.
//
// The trade-off, stated plainly: this makes a denial-of-service against a known
// doctor's account possible — repeatedly failing their login locks them out.
// That is why the lockout is short and self-clearing rather than needing an
// administrator to unlock. For a service with a handful of doctors that is the
// lesser risk; a larger deployment would want something more sophisticated.

const MAX_FAILURES = 6;
const LOCKOUT_MS = 15 * 60 * 1000;

const loginAttemptSchema = new mongoose.Schema({
  // Lower-cased email. Recorded even when no such account exists, so lockout
  // behaviour cannot be used to enumerate registered addresses.
  email: { type: String, required: true, index: true },
  ip: { type: String, default: null },
  createdAt: {
    type: Date,
    default: Date.now,
    // Slightly longer than the lockout window so the count stays accurate
    // right up to the moment it expires.
    expires: 30 * 60,
  },
});

const LoginAttempt =
  mongoose.models.LoginAttempt || mongoose.model('LoginAttempt', loginAttemptSchema);

function normalise(email) {
  return String(email || '').toLowerCase().trim();
}

/**
 * Is this account currently locked?
 * @returns {{ locked: boolean, minutesLeft: number }}
 */
async function checkLock(email) {
  const key = normalise(email);
  const windowStart = new Date(Date.now() - LOCKOUT_MS);

  const failures = await LoginAttempt.countDocuments({
    email: key,
    createdAt: { $gte: windowStart },
  });

  if (failures < MAX_FAILURES) return { locked: false, minutesLeft: 0 };

  // Locked until the oldest failure in the window ages out.
  const oldest = await LoginAttempt.findOne({ email: key, createdAt: { $gte: windowStart } })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();

  const unlockAt = new Date(oldest.createdAt).getTime() + LOCKOUT_MS;
  const minutesLeft = Math.max(1, Math.ceil((unlockAt - Date.now()) / 60000));

  return { locked: true, minutesLeft };
}

/**
 * Record a failed attempt.
 * @returns {{ failures: number, distinctIps: number }}
 */
async function recordFailure(email, ip) {
  const key = normalise(email);
  await LoginAttempt.create({ email: key, ip: ip || null });

  const windowStart = new Date(Date.now() - LOCKOUT_MS);
  const recent = await LoginAttempt.find({ email: key, createdAt: { $gte: windowStart } })
    .select('ip')
    .lean();

  const distinctIps = new Set(recent.map((r) => r.ip).filter(Boolean)).size;

  return { failures: recent.length, distinctIps };
}

/** Clear the counter after a successful sign-in. */
async function clearFailures(email) {
  await LoginAttempt.deleteMany({ email: normalise(email) });
}

module.exports = { checkLock, recordFailure, clearFailures, MAX_FAILURES, LOCKOUT_MS, LoginAttempt };
