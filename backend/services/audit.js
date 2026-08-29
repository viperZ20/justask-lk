const AuditLog = require('../models/auditLog');

// Writing an audit entry must never break the action it is recording. A doctor
// mid-consultation should not see an error because the log was unwritable, so
// every call here is fire-and-forget and failures are logged to the console
// rather than thrown.
//
// The trade-off is honest: this favours availability over guaranteed audit
// completeness. For a prototype that is the right way round; a regulated
// deployment would need writes that fail loudly.

function record({ action, actorId, actorLabel, targetType, targetId, detail, req }) {
  const entry = {
    action,
    actorId: actorId ? String(actorId) : null,
    actorLabel: actorLabel || null,
    targetType: targetType || null,
    targetId: targetId || null,
    detail: detail || null,
    ip: req?.ip || null,
  };

  AuditLog.create(entry).catch((err) => {
    console.error('[audit] failed to write entry:', action, err.message);
  });
}

// Convenience wrappers so call sites read clearly.
const audit = {
  doctorRegistered: (doctor, req) =>
    record({ action: 'doctor.register', actorId: doctor._id, actorLabel: doctor.fullName,
             targetType: 'doctor', targetId: String(doctor._id), req }),

  doctorLoggedIn: (doctor, req) =>
    record({ action: 'doctor.login', actorId: doctor._id, actorLabel: doctor.fullName, req }),

  doctorLoginFailed: (email, req) =>
    // The email is recorded, not the password attempt. Repeated entries for one
    // address are the signal worth spotting.
    record({ action: 'doctor.login_failed', detail: email, req }),

  claimedSession: (doctor, sessionId, req) =>
    record({ action: 'doctor.claim_session', actorId: doctor._id, actorLabel: doctor.fullName,
             targetType: 'session', targetId: sessionId, req }),

  closedSession: (doctor, sessionId, req) =>
    record({ action: 'doctor.close_session', actorId: doctor._id, actorLabel: doctor.fullName,
             targetType: 'session', targetId: sessionId, req }),

  viewedConversation: (doctor, sessionId, req) =>
    record({ action: 'doctor.view_conversation', actorId: doctor._id, actorLabel: doctor.fullName,
             targetType: 'session', targetId: sessionId, req }),

  // Admin actions carry the administrator's name so the log can answer
  // "who approved this", not just "an admin did".
  approvedDoctor: (doctor, req) =>
    record({ action: 'admin.approve_doctor', actorId: 'admin',
             actorLabel: req?.adminName || 'admin', targetType: 'doctor',
             targetId: String(doctor._id), detail: doctor.fullName, req }),

  revokedDoctor: (doctor, released, req) =>
    record({ action: 'admin.revoke_doctor', actorId: 'admin',
             actorLabel: req?.adminName || 'admin', targetType: 'doctor',
             targetId: String(doctor._id),
             detail: `${doctor.fullName}; ${released} session(s) released`, req }),

  deletedDoctor: (name, id, req) =>
    record({ action: 'admin.delete_doctor', actorId: 'admin',
             actorLabel: req?.adminName || 'admin', targetType: 'doctor',
             targetId: String(id), detail: name, req }),

  closedStaleSessions: (count, req) =>
    record({ action: 'admin.close_stale_sessions', actorId: 'admin',
             actorLabel: req?.adminName || 'system',
             detail: `${count} session(s)`, req }),

  adminLoginFailed: (req) =>
    record({ action: 'admin.login_failed', req }),
};

module.exports = { audit, record };
