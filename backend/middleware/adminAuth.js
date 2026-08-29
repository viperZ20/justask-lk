// adminAuth.js
//
// Gate for the administrator interface.
//
// Previously this accepted a single shared key, which meant the audit log could
// only ever record actorId: 'admin' — it could say a doctor was approved, but
// never by whom. For a health platform that is a real gap: "who granted this
// person access to patient conversations" should be answerable.
//
// Keys are now named. ADMIN_KEYS holds entries of the form name:key, separated
// by commas, so each administrator has their own credential and every action
// records who performed it.
//
//   ADMIN_KEYS=kavi:3f9a...,chanuka:8b12...
//
// The older single-value ADMIN_KEY still works and records the actor as
// 'admin', so an existing deployment keeps running after an upgrade.
//
// This is still shared-secret authentication, not user accounts with passwords
// and sessions. A production deployment would want proper admin accounts; the
// improvement here is attribution, not a change of mechanism.

function parseKeys() {
  const named = process.env.ADMIN_KEYS;
  const single = process.env.ADMIN_KEY;

  const map = new Map();

  if (named) {
    for (const entry of named.split(',')) {
      const [name, key] = entry.split(':').map((s) => s && s.trim());
      if (name && key) map.set(key, name);
    }
  }

  if (single) map.set(single.trim(), 'admin');

  return map;
}

function requireAdmin(req, res, next) {
  const keys = parseKeys();

  // Refuse to run at all if nothing is configured. Failing closed matters more
  // than convenience for an endpoint that grants access to doctor records.
  if (keys.size === 0) {
    return res.status(503).json({
      error: 'Administrator access is not configured on this server.',
    });
  }

  const supplied = req.get('x-admin-key');

  if (!supplied || !keys.has(supplied)) {
    return res.status(401).json({ error: 'Incorrect administrator key.' });
  }

  // Who acted — used by the audit log.
  req.adminName = keys.get(supplied);
  next();
}

module.exports = { requireAdmin };
