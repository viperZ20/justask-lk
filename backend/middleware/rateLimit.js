const rateLimit = require('express-rate-limit');

// Rate limiting — the Integrity and Availability legs of CIA.
//
// Without this, doctor login can be brute-forced at whatever speed the network
// allows, and a single script can exhaust the AI quota or fill the database.
//
// Note on keying: these limit by IP. That is deliberate and worth stating —
// the platform holds no user identity to limit by, so IP is the only signal
// available. It is imperfect (shared networks, mobile carriers) but the
// alternative is no limit at all.

// Login: strict. Real users mistype a password twice, not twenty times.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts count, so a doctor signing in correctly several times
  // in a shift is never locked out.
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
  },
});

// Registration: stops someone scripting hundreds of fake doctor accounts.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registrations from this address. Please try again later.' },
});

// Admin: the key is the real protection, but limiting slows a guessing attack.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many administrator requests. Please wait a few minutes.' },
});

// Chat: protects the AI quota, which is a genuine availability risk on a free
// tier. Set high enough that a person typing quickly is never affected.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'You are sending messages very quickly. Take a moment, then try again.',
  },
});

// Everything else: a broad backstop.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

module.exports = {
  loginLimiter,
  registerLimiter,
  adminLimiter,
  chatLimiter,
  generalLimiter,
};
