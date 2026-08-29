const express = require('express');
const router = express.Router();
const Session = require('../models/session');
const ChatMessage = require('../models/chatMessage');
const { screen } = require('../services/safetyLayer');
const { generateReply } = require('../services/aiEngine');
const { decryptMessages } = require('../services/encryption');
const { requireSessionToken } = require('../middleware/sessionAuth');

const MAX_MESSAGE_LENGTH = 2000;

// POST /api/chat
// Body: { sessionId, message }
//
// Behaviour depends on session status:
//   ai              -> the assistant replies
//   waiting/active  -> the message is stored for the doctor; the AI does NOT
//                      reply. The patient's client polls for the doctor's
//                      answer instead. Without this, the interface would claim
//                      a doctor was present while a model did the talking.
// Requires the session token.
//
// This was the most serious of the unprotected routes: reading a conversation
// was already gated, but WRITING to one was not. Anyone with a session ID could
// post messages that the patient — and any doctor who joined — would see as
// coming from the patient themselves.
router.post('/', requireSessionToken, async (req, res, next) => {
  try {
    const { sessionId, message, wasSpoken } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'A session is required' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Message is too long' });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Sending a message is the clearest possible sign the patient is still
    // here, so it doubles as the presence heartbeat. Previously lastSeenAt was
    // only touched by the doctor-status poll, which does not run during an AI
    // conversation — so an active chat looked abandoned after five minutes and
    // vanished from the admin's live counts.
    //
    // Fire-and-forget: a failed timestamp write must never break a reply.
    Session.updateOne({ sessionId }, { lastSeenAt: new Date() }).catch(() => {});

    // ---- Safety screen runs FIRST, always, regardless of who is answering ----
    const safety = screen(message, session.ageBand);

    await ChatMessage.create({
      sessionId,
      sender: 'patient',
      content: message,
      wasSpoken: Boolean(wasSpoken), // transcribed in the browser; no audio stored
      crisisFlagged: safety.crisis,
    });

    // Crisis short-circuits everything. The user gets a fixed, reviewed
    // response with real helplines — no model, no waiting for a doctor.
    if (safety.crisis) {
      await ChatMessage.create({
        sessionId, sender: 'ai', content: safety.message, crisisFlagged: true,
      });
      return res.json({
        reply: safety.message,
        crisis: true,
        helplines: safety.helplines,
        suggestEscalation: true,
        handledBy: 'safety',
      });
    }

    // ---- A doctor is involved: store and stay quiet ----
    if (session.status === 'waiting' || session.status === 'active') {
      return res.json({
        reply: null,
        crisis: false,
        helplines: [],
        suggestEscalation: false,
        handledBy: session.status === 'active' ? 'doctor' : 'queue',
      });
    }

    if (session.status === 'closed') {
      return res.json({
        reply: 'This consultation has ended. Start a new session any time.',
        crisis: false, helplines: [], suggestEscalation: false, handledBy: 'system',
      });
    }

    // ---- Normal AI path ----
    // .lean() bypasses the model's decryption getters, so this is decrypted
    // explicitly. Without it the AI would receive ciphertext as conversation
    // history.
    const priorMessages = decryptMessages(
      await ChatMessage.find({ sessionId })
        .sort({ createdAt: 1 })
        .select('sender content -_id')
        .lean()
    );

    const turnCount = priorMessages.filter((m) => m.sender === 'patient').length;
    const history = priorMessages
      .filter((m) => m.sender === 'patient' || m.sender === 'ai')
      .slice(0, -1);

    const { reply, suggestEscalation } = await generateReply({
      message, topic: session.topic, ageBand: session.ageBand, turnCount, history,
    });

    // ---- Screen the AI's OWN output before it goes out ----
    const outbound = screen(reply, session.ageBand);
    const safeReply = outbound.crisis ? outbound.message : reply;

    await ChatMessage.create({
      sessionId, sender: 'ai', content: safeReply, crisisFlagged: outbound.crisis,
    });

    res.json({
      reply: safeReply,
      crisis: false,
      distress: safety.distress,
      helplines: [],
      suggestEscalation,
      handledBy: 'ai',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/:sessionId — full history. The patient's client polls this
// while a doctor is connected, to pick up the doctor's replies.
// Requires the session token issued when the conversation started. Previously
// this returned an entire conversation to anyone holding the session ID.
router.get('/:sessionId', requireSessionToken, async (req, res, next) => {
  try {
    const messages = decryptMessages(
      await ChatMessage.find({ sessionId: req.params.sessionId })
        .sort({ createdAt: 1 })
        .select('sender content audio wasSpoken crisisFlagged createdAt -_id')
        .lean()
    );

    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
