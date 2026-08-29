import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, LogOut, RefreshCw, Check, X, Clock, Users, AlertTriangle,
  Activity, Trash2, Eraser, UserX, Leaf, Stethoscope, Archive,
  ScrollText, ChevronDown, ChevronRight, AlertCircle,
} from 'lucide-react';
import {
  adminStats, adminDoctors, adminSetVerified,
  adminCloseSessions, adminDeleteDoctor, adminAudit,
} from '../api';
import ThemeToggle from '../components/ThemeToggle';

const KEY_STORE = 'jl_admin_key';

export default function AdminDashboard() {
  const [key, setKey] = useState(() => sessionStorage.getItem(KEY_STORE) || '');
  const [signedIn, setSignedIn] = useState(Boolean(sessionStorage.getItem(KEY_STORE)));
  const [doctors, setDoctors] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  // Deleting is irreversible, so it takes a second click rather than a
  // browser confirm() — one misplaced tap should not remove an account.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState(null);
  const [auditFilter, setAuditFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([adminDoctors(), adminStats()]);
      setDoctors(d.doctors);
      setStats(s);
      setError(null);
    } catch (err) {
      setError(err.message);
      if (err.message.toLowerCase().includes('key')) signOut();
    }
  }, []);

  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  function signIn(e) {
    e.preventDefault();
    if (!key.trim()) return;
    sessionStorage.setItem(KEY_STORE, key.trim());
    setSignedIn(true);
  }

  function signOut() {
    sessionStorage.removeItem(KEY_STORE);
    setSignedIn(false);
    setKey('');
    setDoctors([]);
    setStats(null);
  }

  // Loaded only when the panel is opened, and again when the filter changes —
  // the trail can be long and most visits do not need it.
  useEffect(() => {
    if (!showAudit) return;
    let cancelled = false;
    adminAudit(auditFilter, 60)
      .then((r) => { if (!cancelled) setAudit(r); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [showAudit, auditFilter]);

  async function deleteDoctor(id) {
    setBusy(id);
    setError(null);
    try {
      const res = await adminDeleteDoctor(id);
      setConfirmDelete(null);
      await load();
      setError(
        `Removed ${res.fullName}.` +
        (res.detachedSessions ? ` ${res.detachedSessions} past session${res.detachedSessions > 1 ? 's' : ''} detached.` : '')
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function clearStale() {
    setBusy('stale');
    setError(null);
    try {
      const res = await adminCloseSessions();
      await load();
      setError(`Closed ${res.closed} inactive session${res.closed === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function setVerified(id, verified) {
    setBusy(id);
    setError(null);
    try {
      const res = await adminSetVerified(id, verified);
      if (res.releasedSessions > 0) {
        setError(
          `Access revoked. ${res.releasedSessions} consultation${res.releasedSessions > 1 ? 's were' : ' was'} returned to the queue.`
        );
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  // ---- Sign in ----
  if (!signedIn) {
    return (
      <div className="frame doctor-frame">
        <div className="header">
          <div className="avatar"><ShieldCheck size={20} /></div>
          <div className="header-text">
            <h2>JustAsk LK</h2>
            <p>Administrator</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="body-area">
          <div>
            <p className="eyebrow">Restricted</p>
            <h1 className="title">Administrator access</h1>
            <p className="lede">
              This page verifies doctor registrations. It does not show any
              patient conversation.
            </p>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <form className="form" onSubmit={signIn}>
            <label className="field">
              <span>Administrator key</span>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <button className="handoff-btn" type="submit">Continue</button>
          </form>
        </div>
      </div>
    );
  }

  const pending = doctors.filter((d) => !d.verified);
  const approved = doctors.filter((d) => d.verified);

  // ---- Dashboard ----
  return (
    <div className="frame doctor-frame wide">
      <div className="header">
        <div className="avatar"><ShieldCheck size={20} /></div>
        <div className="header-text">
          <h2>Administrator</h2>
          <p>Doctor verification</p>
        </div>
        <button className="icon-btn" onClick={load} aria-label="Refresh">
          <RefreshCw size={17} />
        </button>
        <ThemeToggle />
        <button className="icon-btn" onClick={signOut} aria-label="Sign out">
          <LogOut size={17} />
        </button>
      </div>

      <div className="body-area">
        {error && <p className="error-msg">{error}</p>}

        {stats && (
          <>
            <p className="section-head"><ShieldCheck size={13} /> Doctors</p>
            <div className="stat-row">
              <div className="stat"><Clock size={14} /><b>{stats.pending}</b><span>pending</span></div>
              <div className="stat"><ShieldCheck size={14} /><b>{stats.verified}</b><span>verified</span></div>
            </div>

            <div className="queue-head-row" style={{ marginTop: 14 }}>
              <p className="section-head" style={{ margin: 0 }}>
                <Activity size={13} /> Sessions right now
              </p>
              {stats.stale > 0 && (
                <button
                  className="clear-all-btn"
                  onClick={clearStale}
                  disabled={busy === 'stale'}
                  title="Close sessions with no patient activity for 5 minutes"
                >
                  <Eraser size={11} /> Clear {stats.stale} inactive
                </button>
              )}
            </div>
            <div className="stat-row">
              <div className="stat"><Leaf size={14} /><b>{stats.withAi ?? 0}</b><span>with AI</span></div>
              <div className="stat"><Users size={14} /><b>{stats.waiting}</b><span>in queue</span></div>
              <div className="stat"><Stethoscope size={14} /><b>{stats.active}</b><span>with doctor</span></div>
              <div className="stat"><Archive size={14} /><b>{stats.closedToday ?? 0}</b><span>ended today</span></div>
            </div>
          </>
        )}

        {pending.length > 0 && (
          <>
            <p className="section-head">
              <AlertTriangle size={13} /> Awaiting verification ({pending.length})
            </p>
            {pending.map((d) => (
              <DoctorRow key={d._id} d={d} busy={busy} onSet={setVerified}
                onDelete={deleteDoctor} confirmDelete={confirmDelete}
                setConfirmDelete={setConfirmDelete} pending />
            ))}
          </>
        )}

        <p className="section-head" style={{ marginTop: pending.length ? 20 : 0 }}>
          <ShieldCheck size={13} /> Verified ({approved.length})
        </p>
        {approved.length === 0 && <p className="queue-empty">No verified doctors yet.</p>}
        {approved.map((d) => (
          <DoctorRow key={d._id} d={d} busy={busy} onSet={setVerified}
            onDelete={deleteDoctor} confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete} />
        ))}

        {/* ── Audit trail ── */}
        <div className="queue-head-row" style={{ marginTop: 22 }}>
          <button className="audit-toggle" onClick={() => setShowAudit(!showAudit)}>
            {showAudit ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <ScrollText size={13} /> Audit trail
          </button>
          {audit?.recentFailures > 0 && (
            <span className="audit-alert">
              <AlertCircle size={11} /> {audit.recentFailures} failed sign-in
              {audit.recentFailures === 1 ? '' : 's'} in the last hour
            </span>
          )}
        </div>

        {showAudit && (
          <>
            <div className="audit-filters">
              {[
                ['all', 'Everything'],
                ['security', 'Security'],
                ['access', 'Record access'],
                ['admin', 'Admin actions'],
                ['accounts', 'Accounts'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`audit-chip${auditFilter === key ? ' on' : ''}`}
                  onClick={() => setAuditFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {!audit && <p className="queue-empty">Loading…</p>}
            {audit?.entries.length === 0 && (
              <p className="queue-empty">Nothing recorded yet for this filter.</p>
            )}

            {audit?.entries.map((e, i) => (
              <div key={i} className={`audit-row${isSecurityEvent(e.action) ? ' flagged' : ''}`}>
                <span className="audit-when">{formatWhen(e.createdAt)}</span>
                <span className="audit-action">{describe(e)}</span>
              </div>
            ))}

            <p className="admin-note" style={{ marginTop: 10, paddingTop: 10 }}>
              Records that an action happened, who performed it, and when — never
              what was said. An audit log holding message content would defeat the
              encryption it sits beside. Entries are kept 90 days.
            </p>
          </>
        )}

        <p className="admin-note">
          Verifying an account confirms you have checked the SLMC registration
          number against the official register. Until then the doctor cannot see
          any patient session.
        </p>
      </div>
    </div>
  );
}

const SECURITY_ACTIONS = new Set([
  'doctor.login_failed', 'doctor.account_locked', 'admin.login_failed',
]);

function isSecurityEvent(action) {
  return SECURITY_ACTIONS.has(action);
}

function formatWhen(iso) {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

// Turns a stored action into something readable at a glance. The wording names
// the actor first, since the point of the log is answering "who did this".
function describe(e) {
  const who = e.actorLabel || e.actorId || 'someone';
  const target = e.detail || (e.targetId ? e.targetId.slice(0, 8) : '');

  switch (e.action) {
    case 'doctor.register':            return `${who} registered an account`;
    case 'doctor.login':               return `${who} signed in`;
    case 'doctor.login_failed':        return `Failed sign-in for ${target}`;
    case 'doctor.account_locked':      return `Account locked after repeated failures: ${target}`;
    case 'doctor.claim_session':       return `${who} claimed session ${target}`;
    case 'doctor.close_session':       return `${who} ended session ${target}`;
    case 'doctor.view_conversation':   return `${who} opened conversation ${target}`;
    case 'admin.approve_doctor':       return `${who} approved ${target}`;
    case 'admin.revoke_doctor':        return `${who} revoked ${target}`;
    case 'admin.delete_doctor':        return `${who} deleted ${target}`;
    case 'admin.close_stale_sessions': return `${who} closed ${target}`;
    case 'admin.login_failed':         return 'Failed administrator sign-in';
    default:                           return `${e.action} ${target}`;
  }
}

function DoctorRow({ d, busy, onSet, onDelete, confirmDelete, setConfirmDelete, pending = false }) {
  const awaitingConfirm = confirmDelete === d._id;

  return (
    <div className={`doctor-row${pending ? ' pending' : ''}`}>
      <div className="doctor-row-main">
        <p className="doctor-row-name">{d.fullName}</p>
        <p className="doctor-row-meta">
          {d.specialisation} &middot; SLMC {d.slmcNumber}
        </p>
        <p className="doctor-row-meta dim">{d.email}</p>
        {d.clinicName && (
          <p className="doctor-row-meta dim">{d.clinicName}, {d.clinicArea}</p>
        )}
        {awaitingConfirm && (
          <p className="doctor-row-meta warn">
            Remove this account permanently? This cannot be undone.
          </p>
        )}
      </div>

      <div className="doctor-row-actions">
        {awaitingConfirm ? (
          <>
            <button className="mini-btn" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="mini-btn danger"
              disabled={busy === d._id}
              onClick={() => onDelete(d._id)}
            >
              {busy === d._id ? '…' : <><UserX size={12} /> Remove</>}
            </button>
          </>
        ) : (
          <>
            <button
              className={`mini-btn${d.verified ? ' danger' : ''}`}
              disabled={busy === d._id}
              onClick={() => onSet(d._id, !d.verified)}
            >
              {busy === d._id ? '…' : d.verified ? <><X size={12} /> Revoke</> : <><Check size={12} /> Approve</>}
            </button>
            <button
              className="clear-one-btn"
              onClick={() => setConfirmDelete(d._id)}
              title="Remove this account permanently"
              aria-label="Remove this account permanently"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
