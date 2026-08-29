// accessGate.js
//
// A shared-secret gate for temporary public tunnels during team testing.
//
// This is NOT authentication and is not part of the product. It exists so that
// a tunnel URL leaking does not let a stranger consume the AI quota or create
// doctor accounts. It is removed (or simply left disabled) for the real
// deployment, where proper auth and rate limiting apply.
//
// Enabled only when TEST_ACCESS_KEY is set in the environment. With no key
// set, this middleware does nothing — so local development is unaffected.

const OPEN_PATHS = [
  '/api/health', // Render and uptime checks must stay reachable
];

function accessGate(req, res, next) {
  const key = process.env.TEST_ACCESS_KEY;

  // Not configured — gate is off.
  if (!key) return next();

  if (OPEN_PATHS.includes(req.path)) return next();

  // Browsers cannot set headers on a plain page load, so the key is accepted
  // from a query string too. The frontend stores it and sends it as a header
  // on every subsequent API call.
  const supplied =
    req.get('x-access-key') ||
    req.query.key ||
    null;

  if (supplied === key) return next();

  return res.status(401).json({
    error: 'This is a private test build. Ask the team for the access link.',
  });
}

module.exports = { accessGate };
