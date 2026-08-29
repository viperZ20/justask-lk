const express = require('express');
const router = express.Router();
const Session = require('../models/session');
const { signSessionToken, requireSessionToken } = require('../middleware/sessionAuth');

const VALID_AGE_BANDS = ['under_16', '16_18', '19_25', '26_40', '40_plus', 'not_specified'];
const VALID_LANGS = ['en', 'si'];
const VALID_TOPICS = ['mental_health', 'sexual_health', 'addiction', 'general_health', 'unspecified'];

// POST /api/session
// Creates a new anonymous session. Called when the app first loads.
router.post('/', async (req, res, next) => {
  try {
    const { ageBand, lang } = req.body;

    // Validate: never trust what the client sends
    if (ageBand !== undefined && !VALID_AGE_BANDS.includes(ageBand)) {
      return res.status(400).json({ error: 'Invalid age band' });
    }

    if (lang !== undefined && !VALID_LANGS.includes(lang)) {
      return res.status(400).json({ error: 'Invalid language' });
    }

    const session = await Session.create({
      ageBand: ageBand || 'not_specified',
      lang: lang || 'en',
    });

    // Return ONLY the session ID — never the Mongo _id or internals
    // The token proves ownership of this conversation. Knowing the session ID
    // is no longer enough to read it. The token carries only the session ID —
    // no identity is created or stored.
    res.status(201).json({
      sessionId: session.sessionId,
      ageBand: session.ageBand,
      lang: session.lang,
      sessionToken: signSessionToken(session.sessionId),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/session/:sessionId
// Updates the session with the chosen topic (step 2 of onboarding).
// Requires the session token. Without it, anyone holding a session ID could
// change another patient's topic or language mid-conversation.
router.patch('/:sessionId', requireSessionToken, async (req, res, next) => {
  try {
    const { topic, ageBand, lang } = req.body;

    if (topic !== undefined && !VALID_TOPICS.includes(topic)) {
      return res.status(400).json({ error: 'Invalid topic' });
    }
    if (ageBand !== undefined && !VALID_AGE_BANDS.includes(ageBand)) {
      return res.status(400).json({ error: 'Invalid age band' });
    }

    if (lang !== undefined && !VALID_LANGS.includes(lang)) {
      return res.status(400).json({ error: 'Invalid language' });
    }

    const update = {};
    if (topic) update.topic = topic;
    if (ageBand) update.ageBand = ageBand;
    if (lang) update.lang = lang;

    const session = await Session.findOneAndUpdate(
      { sessionId: req.params.sessionId },
      update,
      { returnDocument: 'after' }
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: session.sessionId,
      ageBand: session.ageBand,
      topic: session.topic,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/session/:sessionId/end
// The patient ends their own session. Works whether they are talking to the
// AI or to a doctor — in the doctor case the consultation is released so the
// doctor is not left waiting on someone who has gone.
// Requires the session token — ending someone else's conversation is a small
// but real denial of service, and it would look to them like a crash.
router.post('/:sessionId/end', requireSessionToken, async (req, res, next) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status === 'closed') {
      return res.json({ status: 'closed', alreadyClosed: true });
    }

    const wasWithDoctor = session.status === 'active' || session.status === 'waiting';

    session.status = 'closed';
    session.endedBy = 'patient';
    // claimedBy is deliberately NOT cleared here. The doctor needs to keep
    // read access so their screen can show that the patient left, and so they
    // can read back what was said. It is detached only when the doctor clears
    // the session from their list.
    await session.save();

    const ChatMessage = require('../models/chatMessage');
    await ChatMessage.create({
      sessionId: session.sessionId,
      sender: 'system',
      content: session.lang === 'si'
        ? 'මෙම සංවාදය අවසන් කර ඇත.'
        : 'This conversation has been ended.',
      crisisFlagged: false,
    });

    res.json({ status: 'closed', wasWithDoctor });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
