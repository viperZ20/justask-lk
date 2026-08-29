const Session = require('../models/session');
const ChatMessage = require('../models/chatMessage');
const { audit } = require('./audit');

// Session timeouts — the Availability leg of CIA.
//
// A browser cannot reliably tell the server it is closing: a closed tab, a dead
// battery, or lost signal all send nothing. Without a sweep, every abandoned
// session stays 'active' forever, the live counts only ever climb, and doctors
// keep consultations attached to patients who left hours ago.
//
// Two different timeouts, because the situations differ:
//   - a patient talking to the AI can pause for a long while and come back
//   - a patient with a doctor waiting on them is occupying a real person

const AI_TIMEOUT_MS = 60 * 60 * 1000;      // 1 hour
const DOCTOR_TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes
const QUEUE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes waiting unanswered

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

async function sweepOnce() {
  const now = Date.now();

  const rules = [
    { status: 'ai', cutoff: new Date(now - AI_TIMEOUT_MS), label: 'ai' },
    { status: 'active', cutoff: new Date(now - DOCTOR_TIMEOUT_MS), label: 'with doctor' },
    { status: 'waiting', cutoff: new Date(now - QUEUE_TIMEOUT_MS), label: 'in queue' },
  ];

  let total = 0;

  for (const rule of rules) {
    const stale = await Session.find({
      status: rule.status,
      $or: [
        { lastSeenAt: { $lt: rule.cutoff } },
        { lastSeenAt: null, createdAt: { $lt: rule.cutoff } },
      ],
    }).select('sessionId lang status').lean();

    if (!stale.length) continue;

    await Session.updateMany(
      { sessionId: { $in: stale.map((s) => s.sessionId) } },
      { $set: { status: 'closed', claimedBy: null, endedBy: 'timeout' } }
    );

    // Leave a note in each conversation. A doctor returning to a closed thread
    // should see why it ended rather than finding it silently gone.
    for (const s of stale) {
      await ChatMessage.create({
        sessionId: s.sessionId,
        sender: 'system',
        content: s.lang === 'si'
          ? 'නිෂ්ක්‍රීයතාවය හේතුවෙන් මෙම සැසිය අවසන් විය.'
          : 'This session was closed after a period of inactivity.',
        crisisFlagged: false,
      }).catch(() => {});
    }

    total += stale.length;
  }

  if (total > 0) {
    console.log(`[timeout] closed ${total} inactive session(s)`);
    audit.closedStaleSessions(total, null);
  }

  return total;
}

function startSessionSweeper() {
  // Run once shortly after boot to clear anything left by a restart, then on
  // a schedule.
  setTimeout(() => sweepOnce().catch((e) => console.error('[timeout]', e.message)), 30_000);

  const timer = setInterval(
    () => sweepOnce().catch((e) => console.error('[timeout]', e.message)),
    SWEEP_INTERVAL_MS
  );

  // Do not hold the process open on shutdown.
  timer.unref?.();

  return timer;
}

module.exports = { startSessionSweeper, sweepOnce, AI_TIMEOUT_MS, DOCTOR_TIMEOUT_MS, QUEUE_TIMEOUT_MS };
