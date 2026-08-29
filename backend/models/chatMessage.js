const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../services/encryption');

// Conversation history, linked only to a random sessionId.
// No identity fields exist here.
const chatMessageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },

  sender: {
    type: String,
    // 'system'      - queue notices, doctor joined/left, timeouts
    // 'referral'    - a referral card payload (JSON in content)
    // 'doctor_voice'- a voice note recorded by the doctor
    //
    // There is deliberately no 'patient_voice'. Patient speech is transcribed
    // in the browser and only the text is sent — a voice is biometric data.
    enum: ['patient', 'ai', 'doctor', 'system', 'referral', 'doctor_voice'],
    required: true,
  },

  // Encrypted at rest. The getter/setter pair means every read and write in
  // the rest of the codebase deals in plaintext and never has to remember to
  // encrypt — a route that forgot would be a silent data leak.
  //
  // maxlength is not set here: ciphertext is longer than plaintext, so the
  // length limit is enforced in the routes on the incoming message instead.
  content: {
    type: String,
    required: true,
    set: encrypt,
    get: decrypt,
  },

  // Voice notes are encrypted too — a recording of a real clinician discussing
  // a patient's case is at least as sensitive as the text around it.
  audio: {
    type: String,
    default: null,
    set: (v) => (v ? encrypt(v) : v),
    get: (v) => (v ? decrypt(v) : v),
  },

  crisisFlagged: { type: Boolean, default: false },

  // Set on patient messages that were spoken rather than typed. The audio
  // itself never existed on the server.
  wasSpoken: { type: Boolean, default: false },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 30, // matches session retention
  },
});

// Getters must be applied when documents are converted, or encrypted values
// would reach the client. Note that .lean() bypasses getters entirely — any
// query using .lean() has to decrypt explicitly. See routes/chat.js.
chatMessageSchema.set('toJSON', { getters: true });
chatMessageSchema.set('toObject', { getters: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
