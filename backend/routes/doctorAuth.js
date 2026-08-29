const express = require('express');
const router = express.Router();
const DoctorProfile = require('../models/doctorProfile');
const { requireDoctor, signToken } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');
const { audit } = require('../services/audit');
const { checkLock, recordFailure, clearFailures } = require('../services/loginGuard');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/doctor-auth/register
// Creates an UNVERIFIED account. The doctor cannot see or claim any patient
// session until an administrator sets verified = true.
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { fullName, email, password, slmcNumber, specialisation,
            clinicName, clinicArea, bookingInfo } = req.body;

    if (!fullName?.trim()) return res.status(400).json({ error: 'Full name is required' });
    if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'A valid email is required' });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!slmcNumber?.trim()) return res.status(400).json({ error: 'SLMC number is required' });
    if (!specialisation?.trim()) return res.status(400).json({ error: 'Specialisation is required' });

    const clash = await DoctorProfile.findOne({
      $or: [{ email: email.toLowerCase() }, { slmcNumber: slmcNumber.trim() }],
    });
    if (clash) {
      // Deliberately vague: do not confirm which field already exists.
      return res.status(409).json({ error: 'An account with these details already exists' });
    }

    const doctor = await DoctorProfile.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      passwordHash: password, // hashed by the pre-save hook
      slmcNumber: slmcNumber.trim(),
      specialisation: specialisation.trim(),
      clinicName: clinicName?.trim() || '',
      clinicArea: clinicArea?.trim() || '',
      bookingInfo: bookingInfo?.trim() || '',
      verified: false,
    });

    audit.doctorRegistered(doctor, req);

    res.status(201).json({
      message: 'Account created. An administrator must verify your SLMC registration before you can accept consultations.',
      doctor: doctor.toDoctorSelf(),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/doctor-auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Per-account lockout, checked before the password is even compared.
    // The IP rate limiter alone does not stop an attacker rotating addresses.
    const lock = await checkLock(email);
    if (lock.locked) {
      return res.status(429).json({
        error: `Too many failed attempts on this account. Try again in ${lock.minutesLeft} minute${lock.minutesLeft === 1 ? '' : 's'}.`,
      });
    }

    const doctor = await DoctorProfile.findOne({ email: email.toLowerCase().trim() });

    // Same message whether the email is unknown or the password is wrong —
    // otherwise this endpoint tells an attacker which emails are registered.
    const ok = doctor && (await doctor.checkPassword(password));
    if (!ok) {
      const result = await recordFailure(email, req.ip);

      // A single account failing from many addresses is a distributed attack,
      // which is precisely what the per-IP limiter cannot see.
      const detail = result.distinctIps > 2
        ? `${email.toLowerCase().trim()} (${result.failures} failures from ${result.distinctIps} addresses)`
        : email.toLowerCase().trim();
      audit.doctorLoginFailed(detail, req);

      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    await clearFailures(email);
    audit.doctorLoggedIn(doctor, req);

    res.json({
      token: signToken(doctor),
      doctor: doctor.toDoctorSelf(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/doctor-auth/me — used by the dashboard to restore a session
router.get('/me', requireDoctor, (req, res) => {
  res.json({ doctor: req.doctor.toDoctorSelf() });
});

// PATCH /api/doctor-auth/availability — doctor toggles taking new sessions
router.patch('/availability', requireDoctor, async (req, res, next) => {
  try {
    req.doctor.available = Boolean(req.body.available);
    await req.doctor.save();
    res.json({ doctor: req.doctor.toDoctorSelf() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
