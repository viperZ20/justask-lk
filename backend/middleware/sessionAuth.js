const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Proof of ownership for anonymous sessions.
//
// The problem this solves: GET /api/chat/:sessionId returned a whole
// conversation to anyone holding the ID. A UUID is unguessable, so the
// practical risk was low — but possession of the ID was the only thing
// standing between an attacker and the conversation. Session IDs end up in
// browser history, get copied into messages, and sit on shared screens.
//
// The fix is a bearer token issued alongside the session and held only in
// memory by the client. Knowing the session ID is no longer enough; a request
// must also present a token signed by this server.
//
// Note what this does NOT do: it creates no account and stores no identity.
// The token contains only the session ID it authorises. Anonymity is unchanged.

const SESSION_TOKEN_TTL = '24h';

function signSessionToken(sessionId) {
  return jwt.sign(
    { sid: sessionId, kind: 'session' },
    process.env.JWT_SECRET,
    { expiresIn: SESSION_TOKEN_TTL }
  );
}

/**
 * Requires a valid session token matching the :sessionId in the URL or the
 * sessionId in the body. Attaches req.sessionId when it passes.
 */
function requireSessionToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Session ') ? header.slice(8) : null;

  const claimed = req.params.sessionId || req.body?.sessionId;

  if (!token) {
    return res.status(401).json({ error: 'This conversation requires its own session.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.kind !== 'session') {
      // A doctor's token must not be usable as a session token, or vice versa.
      return res.status(401).json({ error: 'Invalid session token.' });
    }

    // The token must match the session being requested. Without this check a
    // valid token for one conversation would open any other.
    if (!claimed || payload.sid !== claimed) {
      return res.status(403).json({ error: 'This session does not belong to you.' });
    }

    req.sessionId = payload.sid;
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please start a new conversation.' });
  }
}

module.exports = { signSessionToken, requireSessionToken, SESSION_TOKEN_TTL };
