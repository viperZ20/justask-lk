const jwt = require('jsonwebtoken');
const DoctorProfile = require('../models/doctorProfile');

// Protects every doctor-side route. Two checks, deliberately separate:
//   requireDoctor  - is this a valid logged-in doctor?
//   requireVerified - has an administrator approved them?
// Registration alone must never grant access to patient conversations.

async function requireDoctor(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Not signed in' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const doctor = await DoctorProfile.findById(payload.id);

    if (!doctor) {
      return res.status(401).json({ error: 'Account not found' });
    }

    req.doctor = doctor;
    next();
  } catch (err) {
    // Covers expired and malformed tokens alike. Never leak the reason.
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

function requireVerified(req, res, next) {
  if (!req.doctor?.verified) {
    return res.status(403).json({
      error: 'Your account is awaiting administrator verification.',
    });
  }
  next();
}

function signToken(doctor) {
  return jwt.sign({ id: doctor._id }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

module.exports = { requireDoctor, requireVerified, signToken };
