const mongoose = require('mongoose');

// Audit log — the Integrity leg of CIA.
//
// Records privileged actions so that "who approved this doctor" and "who read
// this consultation" are answerable. Without it, the platform can assert that
// only verified doctors see patient conversations but cannot demonstrate it.
//
// Deliberately records the ACTION, never the content. An audit trail that
// captured message text would defeat the encryption it sits beside.
const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      'doctor.register',
      'doctor.login',
      'doctor.login_failed',
      'doctor.account_locked',
      'doctor.claim_session',
      'doctor.close_session',
      'doctor.view_conversation',
      'admin.approve_doctor',
      'admin.revoke_doctor',
      'admin.delete_doctor',
      'admin.close_stale_sessions',
      'admin.login_failed',
    ],
    required: true,
    index: true,
  },

  // Who acted. A doctor id, or 'admin' for the shared administrator key.
  // Null for anonymous actors, which is most of the platform.
  actorId: { type: String, default: null, index: true },
  actorLabel: { type: String, default: null },  // e.g. doctor's name, for readability

  // What was acted on. A session ID is a random token, not an identity, so
  // recording it does not compromise anonymity.
  targetType: { type: String, default: null },  // 'doctor' | 'session'
  targetId: { type: String, default: null },

  // Small, non-identifying context: a count, a reason, a status change.
  detail: { type: String, default: null },

  // Kept for correlating repeated failures. Not linked to any patient record.
  ip: { type: String, default: null },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
    // Held longer than conversations (90 days vs 30). An audit trail that
    // expires with the thing it audits is not much of an audit trail.
    expires: 60 * 60 * 24 * 90,
  },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
