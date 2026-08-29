const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

// The ONLY "identity" in JustAsk LK — a random, non-reversible session ID.
// No name, email, phone, or NIC field exists here or anywhere in the schema.
const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    default: () => randomUUID(),
    unique: true,
    required: true,
    index: true,
  },
  ageBand: {
    type: String,
    enum: ['under_16', '16_18', '19_25', '26_40', '40_plus', 'not_specified'],
    default: 'not_specified',
  },
  topic: {
    type: String,
    enum: ['mental_health', 'sexual_health', 'addiction', 'general_health', 'unspecified'],
    default: 'unspecified',
  },

  // Interface language. Drives the AI's reply language, the crisis message
  // wording, and which crisis patterns the safety layer screens against.
  lang: {
    type: String,
    enum: ['en', 'si'],
    default: 'en',
  },

  // Queue state for doctor handoff.
  //   ai      - talking to the AI assistant (default)
  //   waiting - patient asked for a doctor, none has claimed it yet
  //   active  - a verified doctor has claimed this session
  //   closed  - the doctor ended the consultation
  status: {
    type: String,
    enum: ['ai', 'waiting', 'active', 'closed'],
    default: 'ai',
    index: true,
  },

  // Which doctor holds this session. Stores the doctor's id only — this is a
  // link to a professional record, never to anything about the patient.
  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DoctorProfile',
    default: null,
  },
  // Who ended the conversation. Lets each side show an accurate notice rather
  // than a generic "session closed".
  endedBy: {
    type: String,
    // 'admin' covers sessions closed from the monitoring page — usually ones
    // the patient abandoned without ending.
    enum: ['patient', 'doctor', 'admin', null],
    default: null,
  },

  // Updated every time the patient's client polls. A patient who closes their
  // browser cannot tell us they have gone, so "still here" is inferred from
  // recent activity rather than assumed.
  lastSeenAt: { type: Date, default: Date.now },

  requestedAt: { type: Date, default: null },
  claimedAt: { type: Date, default: null },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, // auto-delete after 30 days — minimal retention
  },
});

module.exports = mongoose.model('Session', sessionSchema);
