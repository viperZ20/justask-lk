const express = require('express');
const router = express.Router();
const DoctorProfile = require('../models/doctorProfile');
const Session = require('../models/session');
const { requireAdmin } = require('../middleware/adminAuth');
const AuditLog = require('../models/auditLog');

// Every route here requires the administrator key.
router.use(requireAdmin);

// GET /api/admin/doctors — every registered doctor, pending first
router.get('/doctors', async (req, res, next) => {
  try {
    // passwordHash is never selected. There is no reason for it to leave the
    // database, and excluding it here means a future logging change cannot
    // accidentally write hashes to a log file.
    const doctors = await DoctorProfile.find({})
      .select('fullName email slmcNumber specialisation clinicName clinicArea verified available createdAt')
      .sort({ verified: 1, createdAt: -1 })
      .lean();

    res.json({
      doctors,
      pending: doctors.filter((d) => !d.verified).length,
      verified: doctors.filter((d) => d.verified).length,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/doctors/:id — approve or revoke
router.patch('/doctors/:id', async (req, res, next) => {
  try {
    const { verified } = req.body;

    if (typeof verified !== 'boolean') {
      return res.status(400).json({ error: 'verified must be true or false' });
    }

    const doctor = await DoctorProfile.findById(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    doctor.verified = verified;
    // Revoking also removes them from the available pool immediately.
    if (!verified) doctor.available = false;
    await doctor.save();

    // If access is being revoked, release any consultation they are holding
    // back into the queue rather than leaving a patient stranded.
    let released = 0;
    if (!verified) {
      const result = await Session.updateMany(
        { claimedBy: doctor._id, status: 'active' },
        { $set: { status: 'waiting', claimedBy: null, claimedAt: null } }
      );
      released = result.modifiedCount || 0;
    }

    res.json({
      doctor: {
        id: doctor._id,
        fullName: doctor.fullName,
        verified: doctor.verified,
      },
      releasedSessions: released,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/stats — a small overview for the dashboard
router.get('/stats', async (req, res, next) => {
  try {
    const [pending, verified, waiting, active] = await Promise.all([
      DoctorProfile.countDocuments({ verified: false }),
      DoctorProfile.countDocuments({ verified: true }),
      Session.countDocuments({ status: 'waiting' }),
      Session.countDocuments({ status: 'active' }),
    ]);

    // Note what is absent: no patient content, no message text, no session IDs.
    // An administrator manages professionals, not conversations.
    res.json({ pending, verified, waiting, active });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/sessions — live session list for monitoring
// Metadata only: topic, age band, status, timing. Never message content.
// An administrator manages the service, not the conversations — being able to
// read patient messages at will would undo the anonymity the platform promises.
router.get('/sessions', async (req, res, next) => {
  try {
    const sessions = await Session.find({ status: { $in: ['waiting', 'active'] } })
      .sort({ requestedAt: -1, claimedAt: -1 })
      .select('sessionId topic ageBand status requestedAt claimedAt lastSeenAt -_id')
      .limit(100)
      .lean();

    // Flag ones the patient appears to have abandoned.
    const STALE_MS = 5 * 60 * 1000;
    const now = Date.now();
    const withStale = sessions.map((s) => ({
      ...s,
      stale: s.lastSeenAt ? now - new Date(s.lastSeenAt).getTime() > STALE_MS : true,
    }));

    res.json({
      sessions: withStale,
      staleCount: withStale.filter((s) => s.stale).length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/sessions/close — close stale or specific sessions
// Closing is not deleting. The conversation records remain and expire on their
// own 30-day schedule; this only releases the session so it stops appearing as
// live and frees any doctor still attached to it.
router.post('/sessions/close', async (req, res, next) => {
  try {
    const { sessionId, staleOnly } = req.body;

    let filter;
    if (sessionId) {
      filter = { sessionId, status: { $in: ['waiting', 'active'] } };
    } else if (staleOnly) {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000);
      filter = {
        status: { $in: ['waiting', 'active'] },
        $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: null }],
      };
    } else {
      return res.status(400).json({ error: 'Specify a session or set staleOnly' });
    }

    const result = await Session.updateMany(filter, {
      $set: { status: 'closed', claimedBy: null, endedBy: 'admin' },
    });

    res.json({ closed: result.modifiedCount || 0 });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/doctors/:id — permanently remove an account
//
// Used for registrations that are not genuine (a bogus SLMC number, a test
// account). Deliberately separate from Revoke: revoking keeps the record and
// its history, deleting removes the account entirely.
//
// Any consultations the doctor held are released back to the queue first.
// Without that, sessions would keep a claimedBy pointing at a record that no
// longer exists, and the patient would be stranded with an invisible doctor.
router.delete('/doctors/:id', async (req, res, next) => {
  try {
    const doctor = await DoctorProfile.findById(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    // Refuse to delete anyone still holding a live consultation. Releasing a
    // patient mid-conversation without warning is worse than making the
    // administrator revoke first and delete afterwards.
    const live = await Session.countDocuments({
      claimedBy: doctor._id,
      status: 'active',
    });
    if (live > 0) {
      return res.status(409).json({
        error: `This doctor is in ${live} live consultation${live > 1 ? 's' : ''}. Revoke access first, then delete.`,
      });
    }

    // Detach any closed sessions so nothing points at a missing record.
    const released = await Session.updateMany(
      { claimedBy: doctor._id },
      { $set: { claimedBy: null } }
    );

    const name = doctor.fullName;
    await DoctorProfile.deleteOne({ _id: doctor._id });

    res.json({
      deleted: true,
      fullName: name,
      detachedSessions: released.modifiedCount || 0,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/audit — the audit trail
//
// This is what makes "only verified doctors see patient conversations" a
// checkable claim rather than an assertion. It records that an action happened,
// who performed it, and when — never what was said. An audit log holding
// message content would defeat the encryption sitting beside it.
router.get('/audit', async (req, res, next) => {
  try {
    const { action, limit } = req.query;

    const filter = {};
    if (action && action !== 'all') {
      // Grouped filters, since "show me security events" is more useful than
      // picking one action name at a time.
      const groups = {
        security: ['doctor.login_failed', 'doctor.account_locked', 'admin.login_failed'],
        access: ['doctor.view_conversation', 'doctor.claim_session', 'doctor.close_session'],
        admin: ['admin.approve_doctor', 'admin.revoke_doctor', 'admin.delete_doctor',
                'admin.close_stale_sessions'],
        accounts: ['doctor.register', 'doctor.login'],
      };
      filter.action = groups[action] ? { $in: groups[action] } : action;
    }

    const entries = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200))
      .select('action actorLabel actorId targetType targetId detail createdAt -_id')
      .lean();

    // A count of failed sign-ins in the last hour, which is the number worth
    // noticing at a glance.
    const recentFailures = await AuditLog.countDocuments({
      action: { $in: ['doctor.login_failed', 'doctor.account_locked'] },
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });

    res.json({ entries, recentFailures });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
