const express = require('express');
const router = express.Router();
const Session = require('../models/session');
const ChatMessage = require('../models/chatMessage');
const DoctorProfile = require('../models/doctorProfile');
const { screen } = require('../services/safetyLayer');
const { decryptMessages } = require('../services/encryption');
const { audit } = require('../services/audit');
const { requireDoctor, requireVerified } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────
// PATIENT SIDE — no authentication, session ID only
// ─────────────────────────────────────────────────────────────

// POST /api/doctor/request
// The patient asks for a doctor. This does NOT connect anyone — it places the
// session in the waiting queue for a verified doctor to claim.
router.post('/request', async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'A session is required' });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status === 'active') {
      return res.status(409).json({ error: 'A doctor is already in this conversation' });
    }

    session.status = 'waiting';
    session.requestedAt = new Date();
    await session.save();

    // How many are ahead of them, so the wait feels less blind.
    const ahead = await Session.countDocuments({
      status: 'waiting',
      requestedAt: { $lt: session.requestedAt },
    });

    const notice = session.lang === 'si'
      ? 'ඔබ සත්‍යාපිත වෛද්‍යවරයෙකු සඳහා පෝලිමේ තබා ඇත. ඔබේ අනන්‍යතාවය බෙදා නොගැනේ — ඔවුන් දකින්නේ මෙම සංවාදය පමණි.'
      : 'You have been placed in the queue for a verified doctor. Your identity is not shared \u2014 they will only see this conversation.';

    await ChatMessage.create({
      sessionId, sender: 'system', content: notice, crisisFlagged: false,
    });

    res.json({ status: 'waiting', queuePosition: ahead + 1, notice });
  } catch (err) {
    next(err);
  }
});

// GET /api/doctor/status/:sessionId
// The patient's client polls this to learn when a doctor has joined.
router.get('/status/:sessionId', async (req, res, next) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId })
      .populate('claimedBy');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // This endpoint is polled continuously by the patient's client, so it
    // doubles as a presence heartbeat. Fire-and-forget: a failed write here
    // must never break the patient's chat.
    Session.updateOne({ sessionId: session.sessionId }, { lastSeenAt: new Date() })
      .catch(() => {});

    res.json({
      status: session.status,
      endedBy: session.endedBy,
      doctor: session.claimedBy ? session.claimedBy.toPublicProfile() : null,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// DOCTOR SIDE — requires a signed-in, administrator-verified doctor
// ─────────────────────────────────────────────────────────────

// GET /api/doctor/queue — sessions waiting for someone to pick them up
router.get('/queue', requireDoctor, requireVerified, async (req, res, next) => {
  try {
    const waiting = await Session.find({ status: 'waiting' })
      .sort({ requestedAt: 1 })
      .select('sessionId topic ageBand requestedAt lastSeenAt -_id')
      .lean();

    // Sessions this doctor is already handling.
    // Both open and closed sessions this doctor holds. Closed ones stay
    // visible so the doctor can read back what was said, and are cleared
    // explicitly rather than vanishing on their own.
    const mine = await Session.find({
      claimedBy: req.doctor._id,
      status: { $in: ['active', 'closed'] },
    })
      .sort({ claimedAt: -1 })
      .select('sessionId topic ageBand status claimedAt lastSeenAt -_id')
      .lean();

    // The doctor sees a topic, an age band, and a random ID. Nothing else
    // exists to send — there are no identity fields in the session schema.
    res.json({ waiting, mine });
  } catch (err) {
    next(err);
  }
});

// POST /api/doctor/claim — take a waiting session
router.post('/claim', requireDoctor, requireVerified, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'A session is required' });

    // Atomic claim: if two doctors click at the same moment, only one wins.
    const session = await Session.findOneAndUpdate(
      { sessionId, status: 'waiting' },
      { status: 'active', claimedBy: req.doctor._id, claimedAt: new Date() },
      { returnDocument: 'after' }
    );

    if (!session) {
      return res.status(409).json({ error: 'That session is no longer waiting' });
    }

    const opener = session.lang === 'si'
      ? 'ආයුබෝවන්. මම සත්‍යාපිත වෛද්‍යවරයෙක්, මම මෙම සංවාදයට එකතු වී ඇත. මට මෙතෙක් සංවාදය පෙනෙනවා, නමුත් ඔබ කවුදැයි මම දන්නේ නෑ — කවදාවත් දැනගන්නෙත් නෑ. ඔබ සූදානම් වූ විට සිදුවෙමින් තියෙන දේ කියන්න.'
      : "Hello. I'm a verified doctor and I've joined this chat. I can see the conversation so far, but I have no idea who you are \u2014 and I never will. Tell me what's been going on when you're ready.";

    await ChatMessage.create({
      sessionId, sender: 'doctor', content: opener, crisisFlagged: false,
    });

    audit.claimedSession(req.doctor, sessionId, req);

    res.json({ session: { sessionId: session.sessionId, topic: session.topic, ageBand: session.ageBand } });
  } catch (err) {
    next(err);
  }
});

// GET /api/doctor/conversation/:sessionId — the full thread, for the doctor
router.get('/conversation/:sessionId', requireDoctor, requireVerified, async (req, res, next) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // A doctor may only read a session they hold.
    if (String(session.claimedBy) !== String(req.doctor._id)) {
      return res.status(403).json({ error: 'This session is not assigned to you' });
    }

    const messages = decryptMessages(
      await ChatMessage.find({ sessionId: req.params.sessionId })
        .sort({ createdAt: 1 })
        .select('sender content audio wasSpoken crisisFlagged createdAt -_id')
        .lean()
    );

    // A doctor reading a patient's conversation is a privileged action and is
    // recorded. This is what makes "only verified doctors see conversations"
    // demonstrable rather than merely asserted.
    audit.viewedConversation(req.doctor, req.params.sessionId, req);

    res.json({
      messages,
      session: {
        sessionId: session.sessionId,
        topic: session.topic,
        ageBand: session.ageBand,
        status: session.status,
        lastSeenAt: session.lastSeenAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/doctor/voice — the doctor sends a voice note
// Doctors are identified to the platform, so their real voice carries no
// anonymity risk. The reverse direction deliberately has no equivalent
// endpoint: patient speech is transcribed in the browser and only text is
// sent, because a voice recording is biometric data.
router.post('/voice', requireDoctor, requireVerified, async (req, res, next) => {
  try {
    const { sessionId, audio, durationSec } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'A session is required' });
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ error: 'No recording received' });
    }
    // Roughly 1.4 MB of base64 — about a minute of compressed speech.
    if (audio.length > 1_400_000) {
      return res.status(400).json({ error: 'Voice note is too long. Please keep it under a minute.' });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (String(session.claimedBy) !== String(req.doctor._id)) {
      return res.status(403).json({ error: 'This session is not assigned to you' });
    }

    const seconds = Math.max(1, Math.round(Number(durationSec) || 0));

    await ChatMessage.create({
      sessionId,
      sender: 'doctor_voice',
      content: `Voice note \u00b7 ${seconds}s`,
      audio,
      crisisFlagged: false,
    });

    res.status(201).json({ sent: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/doctor/message — the doctor replies to the patient
router.post('/message', requireDoctor, requireVerified, async (req, res, next) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'A session is required' });
    if (!message?.trim()) return res.status(400).json({ error: 'Message cannot be empty' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message is too long' });

    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (String(session.claimedBy) !== String(req.doctor._id)) {
      return res.status(403).json({ error: 'This session is not assigned to you' });
    }

    await ChatMessage.create({
      sessionId, sender: 'doctor', content: message.trim(), crisisFlagged: false,
    });

    res.status(201).json({ sent: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/doctor/referral — attach the doctor's practice details
router.post('/referral', requireDoctor, requireVerified, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (String(session.claimedBy) !== String(req.doctor._id)) {
      return res.status(403).json({ error: 'This session is not assigned to you' });
    }
    if (!req.doctor.clinicName) {
      return res.status(400).json({ error: 'Add your clinic details to your profile first' });
    }

    await ChatMessage.create({
      sessionId,
      sender: 'referral',
      content: JSON.stringify(req.doctor.toPublicProfile().referral),
      crisisFlagged: false,
    });

    res.status(201).json({ sent: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/doctor/close — end the consultation
router.post('/close', requireDoctor, requireVerified, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (String(session.claimedBy) !== String(req.doctor._id)) {
      return res.status(403).json({ error: 'This session is not assigned to you' });
    }

    session.status = 'closed';
    session.endedBy = 'doctor';
    await session.save();

    audit.closedSession(req.doctor, sessionId, req);

    // The patient's client polls the message list, so the notice reaching them
    // is what tells them the doctor has gone. Written in their language.
    await ChatMessage.create({
      sessionId,
      sender: 'system',
      content: session.lang === 'si'
        ? 'වෛද්‍යවරයා මෙම උපදේශනය අවසන් කර ඇත. ඔබ ගැන සැලකිලිමත් වන්න.'
        : 'The doctor has ended this consultation. Take care of yourself.',
      crisisFlagged: false,
    });

    res.json({ closed: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/doctor/clear-history
// Removes closed or abandoned consultations from this doctor's list.
// Only detaches them from the doctor — the conversation records themselves are
// untouched, and still expire on their own 30-day schedule.
router.post('/clear-history', requireDoctor, requireVerified, async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    const base = { claimedBy: req.doctor._id };

    // A single session, or every finished one.
    const filter = sessionId
      ? { ...base, sessionId }
      : { ...base, status: 'closed' };

    const result = await Session.updateMany(filter, { $set: { claimedBy: null } });

    res.json({ cleared: result.modifiedCount || 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
