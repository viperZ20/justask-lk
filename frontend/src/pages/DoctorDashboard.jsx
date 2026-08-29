import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope, ShieldCheck, LogOut, Send, MapPin, XCircle,
  Inbox, UserRound, Leaf, AlertTriangle, Mic, Square, Trash2, Eraser,
} from 'lucide-react';
import {
  doctorMe, doctorQueue, doctorClaim, doctorConversation,
  doctorSend, doctorReferral, doctorClose, doctorVoice, doctorClearHistory,
} from '../api';
import ThemeToggle from '../components/ThemeToggle';
import { useVoiceRecorder } from '../useVoiceRecorder';

const POLL_MS = 4000;

// The patient's client polls every few seconds. If we have not heard from it
// in a while they have most likely closed the tab — the browser cannot tell us
// they left, so this is inferred rather than reported.
const PRESENCE_STALE_MS = 20000;

function isPatientPresent(lastSeenAt) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < PRESENCE_STALE_MS;
}

export default function DoctorDashboard() {
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState(null);
  const [queue, setQueue] = useState({ waiting: [], mine: [] });
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [convoStatus, setConvoStatus] = useState('active');
  const [convoLastSeen, setConvoLastSeen] = useState(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  // Doctors may send real voice notes — they are identified to the platform,
  // so their voice is not anonymising data. Patients never record.
  const rec = useVoiceRecorder({ maxSeconds: 60 });

  async function sendVoice() {
    const out = await rec.stop();
    if (!out?.audio) return;
    try {
      await doctorVoice(active, out.audio, out.durationSec);
      const r = await doctorConversation(active);
      setMessages(r.messages);
    } catch (err) {
      setError(err.message);
    }
  }

  const token = localStorage.getItem('jl_doctor_token');

  function signOut() {
    localStorage.removeItem('jl_doctor_token');
    navigate('/doctor');
  }

  // ---- Load the signed-in doctor ----
  useEffect(() => {
    if (!token) { navigate('/doctor'); return; }
    doctorMe()
      .then((r) => setDoctor(r.doctor))
      .catch(() => signOut());
  }, [token, navigate]);

  // ---- Poll the queue ----
  const refreshQueue = useCallback(async () => {
    try {
      setQueue(await doctorQueue());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (!doctor?.verified) return;
    refreshQueue();
    const t = setInterval(refreshQueue, POLL_MS);
    return () => clearInterval(t);
  }, [doctor, refreshQueue]);

  // ---- Poll the open conversation ----
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const load = async () => {
      try {
        const r = await doctorConversation(active);
        if (stop) return;
        setMessages(r.messages);
        // The patient may end the chat from their side; the doctor finds out
        // here rather than typing into a conversation nobody is reading.
        if (r.session?.status) setConvoStatus(r.session.status);
        if (r.session?.lastSeenAt) setConvoLastSeen(r.session.lastSeenAt);
      } catch (err) {
        if (!stop) setError(err.message);
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [active]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function claim(sessionId) {
    setBusy(true); setError(null);
    try {
      await doctorClaim(sessionId);
      setActive(sessionId);
      setConvoStatus('active');
      await refreshQueue();
    } catch (err) {
      setError(err.message);
      await refreshQueue();
    } finally {
      setBusy(false);
    }
  }

  async function send(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true); setError(null);
    try {
      await doctorSend(active, text);
      setInput('');
      const r = await doctorConversation(active);
      setMessages(r.messages);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function attachReferral() {
    try {
      await doctorReferral(active);
      const r = await doctorConversation(active);
      setMessages(r.messages);
    } catch (err) {
      setError(err.message);
    }
  }

  async function endConsult() {
    try {
      await doctorClose(active);
      backToQueue();
    } catch (err) {
      setError(err.message);
    }
  }

  // Closing a conversation returns the doctor to their queue rather than
  // signing them out — they may have other patients waiting.
  async function clearHistory(sessionId) {
    setBusy(sessionId || 'all');
    setError(null);
    try {
      const res = await doctorClearHistory(sessionId);
      if (active === sessionId) backToQueue();
      else await refreshQueue();
      if (!sessionId) setError(`Cleared ${res.cleared} finished consultation${res.cleared === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function backToQueue() {
    setActive(null);
    setMessages([]);
    setConvoStatus('active');
    refreshQueue();
  }

  if (!doctor) {
    return <div className="frame doctor-frame"><div className="body-area"><p className="lede">Loading…</p></div></div>;
  }

  // ---- Awaiting administrator verification ----
  if (!doctor.verified) {
    return (
      <div className="frame doctor-frame">
        <div className="header">
          <div className="avatar"><Stethoscope size={20} /></div>
          <div className="header-text">
            <h2>{doctor.fullName}</h2>
            <p>{doctor.specialisation}</p>
          </div>
          <ThemeToggle />
        <button className="icon-btn" onClick={signOut} aria-label="Sign out"><LogOut size={18} /></button>
        </div>
        <div className="body-area">
          <div className="pending-card">
            <AlertTriangle size={22} />
            <h3>Awaiting verification</h3>
            <p>
              An administrator must confirm your SLMC registration before you can
              view or accept patient consultations. You will not appear in the
              available-doctor pool until then.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="frame doctor-frame wide">
      <div className="header">
        <div className="avatar"><Stethoscope size={20} /></div>
        <div className="header-text">
          <h2>{doctor.fullName}</h2>
          <p><ShieldCheck size={12} /> {doctor.specialisation} &middot; Verified</p>
        </div>
        <button className="icon-btn" onClick={signOut} aria-label="Sign out"><LogOut size={18} /></button>
      </div>

      {error && <p className="error-msg" style={{ margin: '12px 20px 0' }}>{error}</p>}

      <div className="dash">
        {/* ---- Queue ---- */}
        <aside className="queue">
          <p className="queue-head"><Inbox size={13} /> Waiting ({queue.waiting.length})</p>
          {queue.waiting.length === 0 && <p className="queue-empty">No one waiting.</p>}
          {queue.waiting.map((s) => (
            <div key={s.sessionId} className="queue-item">
              <p className="queue-topic">{s.topic.replace(/_/g, ' ')}</p>
              <p className="queue-meta">Age {s.ageBand.replace(/_/g, '–')} &middot; {s.sessionId.slice(0, 6)}</p>
              <button className="claim-btn" onClick={() => claim(s.sessionId)} disabled={busy}>
                Claim
              </button>
            </div>
          ))}

          {queue.mine.length > 0 && (
            <>
              <div className="queue-head-row" style={{ marginTop: 18 }}>
                <p className="queue-head" style={{ margin: 0 }}>Your sessions</p>
                {queue.mine.some((s) => s.status === 'closed') && (
                  <button
                    className="clear-all-btn"
                    onClick={() => clearHistory()}
                    disabled={busy === 'all'}
                    title="Remove finished consultations from this list"
                  >
                    <Eraser size={11} /> Clear finished
                  </button>
                )}
              </div>

              {queue.mine.map((s) => {
                const closed = s.status === 'closed';
                const present = !closed && isPatientPresent(s.lastSeenAt);
                return (
                  <div
                    key={s.sessionId}
                    className={`queue-item mine${active === s.sessionId ? ' selected' : ''}${closed ? ' closed' : ''}`}
                  >
                    <button className="queue-item-main" onClick={() => setActive(s.sessionId)}>
                      <p className="queue-topic">{s.topic.replace(/_/g, ' ')}</p>
                      <p className="queue-meta">
                        <span className={`presence ${closed ? 'ended' : present ? 'here' : 'away'}`} />
                        {closed ? 'Ended' : present ? 'Patient here' : 'Patient away'}
                        {' \u00b7 '}{s.sessionId.slice(0, 6)}
                      </p>
                    </button>
                    {closed && (
                      <button
                        className="clear-one-btn"
                        onClick={() => clearHistory(s.sessionId)}
                        disabled={busy === s.sessionId}
                        title="Remove from list"
                        aria-label="Remove from list"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}

          <p className="queue-note">
            You see a topic, an age band, and a random ID. No name, NIC, phone,
            or email exists in the patient record.
          </p>
        </aside>

        {/* ---- Conversation ---- */}
        <section className="convo">
          {!active && (
            <p className="empty-hint">Claim a waiting session to begin.</p>
          )}

          {active && (
            <>
              <div className="convo-msgs">
                {messages.map((m, i) => {
                  if (m.sender === 'system') {
                    return <div key={i} className="system-divider">{m.content}</div>;
                  }
                  if (m.sender === 'referral') {
                    return <div key={i} className="system-divider">Referral card sent</div>;
                  }
                  if (m.sender === 'doctor_voice') {
                    return (
                      <div key={i} className="msg-row user">
                        <div className="bubble user voice-bubble">
                          <span className="voice-label">{m.content}</span>
                          {m.audio && <audio
                            controls
                            controlsList="nodownload noplaybackrate"
                            disablePictureInPicture
                            onContextMenu={(e) => e.preventDefault()}
                            src={m.audio}
                            className="voice-player"
                          />}
                        </div>
                      </div>
                    );
                  }
                  const mine = m.sender === 'doctor';
                  return (
                    <div key={i} className={`msg-row${mine ? ' user' : ''}`}>
                      {!mine && (
                        <div className="avatar-sm">
                          {m.sender === 'ai' ? <Leaf size={16} /> : <UserRound size={16} />}
                        </div>
                      )}
                      <div className={`bubble ${mine ? 'user' : m.sender === 'ai' ? 'ai' : 'doctor'}`}>
                        {m.sender === 'ai' && <span className="tag-ai">AI assistant</span>}
                        {m.content}
                        {m.crisisFlagged && <span className="tag-crisis">Crisis flagged</span>}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {convoStatus === 'closed' ? (
                <div className="ended-banner">
                  <XCircle size={15} />
                  <span>This consultation has ended.</span>
                  <button className="mini-btn" onClick={backToQueue}>
                    Back to queue
                  </button>
                </div>
              ) : (
              <div className="convo-actions">
                {rec.recording ? (
                  <>
                    <button className="mini-btn recording" onClick={sendVoice}>
                      <Square size={12} /> Send ({rec.seconds}s)
                    </button>
                    <button className="mini-btn danger" onClick={rec.cancel}>
                      <Trash2 size={12} /> Discard
                    </button>
                  </>
                ) : (
                  <button className="mini-btn" onClick={rec.start}>
                    <Mic size={13} /> Voice note
                  </button>
                )}
                <button className="mini-btn" onClick={attachReferral}>
                  <MapPin size={13} /> Send referral
                </button>
                <button className="mini-btn danger" onClick={endConsult}>
                  <XCircle size={13} /> End consultation
                </button>
              </div>
              )}

              {convoStatus === 'active' && convoLastSeen && !isPatientPresent(convoLastSeen) && (
                <p className="away-note">
                  The patient has not been active for a moment. They may have closed the page.
                </p>
              )}

              <form className="input-area" onSubmit={send}>
                <input
                  className="input-field"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={convoStatus === 'closed' ? 'This consultation has ended' : 'Reply to the patient…'}
                  disabled={busy || convoStatus === 'closed'}
                />
                <button className="send-btn" type="submit" disabled={busy || !input.trim() || convoStatus === 'closed'}>
                  <Send size={18} />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
