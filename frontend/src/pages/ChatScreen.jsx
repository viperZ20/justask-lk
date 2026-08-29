import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartHandshake, ArrowLeft, Phone, Leaf, UserRound, Send,
  ShieldAlert, ShieldCheck, MessageCircle, Lock, Stethoscope, Clock,
  Mic, MicOff, Play, XCircle, RotateCcw,
} from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useLang } from '../context/LangContext';
import LangToggle from '../components/LangToggle';
import ThemeToggle from '../components/ThemeToggle';
import { sendMessage, requestDoctor, getDoctorStatus, getHistory, updateSessionLang, endSession } from '../api';
import { useSpeechInput } from '../useSpeechInput';

const POLL_MS = 4000;

export default function ChatScreen() {
  const {
    sessionId, topic, wantsDoctor, setWantsDoctor,
    setSessionId, setAgeBand, setTopic,
  } = useSession();
  const navigate = useNavigate();
  const { t, lang, speechLang } = useLang();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [spokeThis, setSpokeThis] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [crisis, setCrisis] = useState(null);
  const [showHandoff, setShowHandoff] = useState(false);
  const [status, setStatus] = useState('ai');   // ai | waiting | active | closed
  const [doctor, setDoctor] = useState(null);
  const [endedBy, setEndedBy] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const endRef = useRef(null);

  // Speech is transcribed in the browser. Only the resulting text is sent —
  // no audio recording ever leaves the device.
  const speech = useSpeechInput({
    lang: speechLang,
    onResult: (text) => {
      setInput((prev) => (prev ? prev + ' ' : '') + text);
      setSpokeThis(true);
    },
  });

  useEffect(() => {
    if (!sessionId) navigate('/start');
  }, [sessionId, navigate]);

  // Arrived via a "Talk to a Doctor" link — skip the AI conversation and join
  // the queue straight away. Runs once; the flag is cleared so a later state
  // change cannot re-trigger it.
  useEffect(() => {
    if (!sessionId || !wantsDoctor) return;
    setWantsDoctor(false);
    (async () => {
      try {
        await requestDoctor(sessionId);
        setStatus('waiting');
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [sessionId, wantsDoctor, setWantsDoctor]);

  // If the user switches language mid-conversation, tell the server so the
  // AI's replies and any crisis wording follow them.
  useEffect(() => {
    if (!sessionId) return;
    updateSessionLang(sessionId, lang).catch(() => {});
  }, [lang, sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, crisis, showHandoff, status]);

  // While a doctor is involved, poll the server for their replies and for
  // status changes (waiting -> active -> closed).
  const poll = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [st, hist] = await Promise.all([
        getDoctorStatus(sessionId),
        getHistory(sessionId),
      ]);
      setStatus(st.status);
      if (st.endedBy) setEndedBy(st.endedBy);
      if (st.doctor) setDoctor(st.doctor);
      setMessages(hist.messages);
    } catch {
      // A failed poll is not worth interrupting the user over.
    }
  }, [sessionId]);

  useEffect(() => {
    if (status === 'ai') return;
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [status, poll]);

  async function send(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((m) => [...m, { sender: 'patient', content: text }]);
    setInput('');
    setSpokeThis(false);
    if (speech.listening) speech.stop();
    setSending(true);
    setError(null);

    try {
      const res = await sendMessage(sessionId, text, spokeThis);
      if (res.reply) {
        setMessages((m) => [...m, { sender: 'ai', content: res.reply }]);
      }
      if (res.crisis) setCrisis({ helplines: res.helplines });
      if (status === 'ai' && res.suggestEscalation) setShowHandoff(true);
      if (res.handledBy === 'doctor' || res.handledBy === 'queue') poll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function confirmEndChat() {
    setConfirmEnd(false);
    setSending(true);
    setError(null);
    try {
      await endSession(sessionId);
      leaveToLanding();
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  }

  // Leaving clears the session from memory and returns to the public landing
  // page. Nothing about the conversation stays in the browser, which matters
  // on a shared or borrowed device.
  function leaveToLanding() {
    setSessionId(null);
    setAgeBand(null);
    setTopic(null);
    window.location.replace('/landing.html');
  }

  async function askForDoctor() {
    if (status !== 'ai') return;
    setSending(true); setError(null);
    try {
      await requestDoctor(sessionId);
      setStatus('waiting');
      setShowHandoff(false);
      poll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const headerLabel =
    status === 'active' ? t('connectedToDoctor')
    : status === 'waiting' ? t('waitingForDoctor')
    : status === 'closed' ? t('consultationEnded')
    : t('anonymousSession');

  return (
    <div className="frame">
      <div className="header">
        <button className="icon-btn" onClick={() => navigate('/topic')} aria-label={t('back')}>
          <ArrowLeft size={20} />
        </button>
        <div className="avatar"><HeartHandshake size={20} /></div>
        <div className="header-text">
          <h2>{t('brand')}</h2>
          <p><span className="status-dot" /> {headerLabel}</p>
        </div>

        {status === 'ai' && (
          <button
            className="icon-btn doc-request"
            onClick={askForDoctor}
            disabled={sending}
            title={t('talkToDoctor')}
            aria-label={t('talkToDoctor')}
          >
            <Stethoscope size={18} />
          </button>
        )}

        {status !== 'closed' && (
          <button
            className="icon-btn end-btn"
            onClick={() => setConfirmEnd(true)}
            title={t('endChat')}
            aria-label={t('endChat')}
          >
            <XCircle size={17} />
          </button>
        )}
        <ThemeToggle />
        <LangToggle />
        <a href="tel:1333" className="sos-btn">
          <Phone size={14} />
          <span className="sos-label">{t('sos')}</span>
        </a>
      </div>

      <div className="body-area">
        {messages.length === 0 && !sending && (
          <div className="msg-row">
            <div className="avatar-sm"><Leaf size={16} /></div>
            <div className="bubble ai">
              {t('aiGreeting')}
              <span className="ai-disclaimer">{t('aiDisclaimer')}</span>
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          if (m.sender === 'system') {
            return <div key={i} className="system-divider">{m.content}</div>;
          }
          if (m.sender === 'referral') {
            let r; try { r = JSON.parse(m.content); } catch { return null; }
            return (
              <div key={i} className="referral-card">
                <div className="referral-header"><h4>{t('referralTitle')}</h4></div>
                <div className="referral-body">
                  <div className="referral-row">
                    <span className="referral-label">{t('clinic')}</span>
                    <span className="referral-value">{r.clinic}</span>
                  </div>
                  <div className="referral-row">
                    <span className="referral-label">{t('area')}</span>
                    <span className="referral-value">{r.area}</span>
                  </div>
                  <div className="referral-row">
                    <span className="referral-label">{t('howToBook')}</span>
                    <span className="referral-value">{r.booking}</span>
                  </div>
                </div>
                <div className="referral-footer">
                  <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <p>{t('referralNote')}</p>
                </div>
              </div>
            );
          }
          if (m.sender === 'patient') {
            return (
              <div key={i} className="msg-row user">
                <div className="bubble user">
                  {m.content}
                  {m.wasSpoken && <span className="spoken-tag"><Mic size={10} /> {t('spoken')}</span>}
                </div>
              </div>
            );
          }
          if (m.sender === 'doctor_voice') {
            return (
              <div key={i} className="msg-row">
                <div className="avatar-sm doc"><UserRound size={16} /></div>
                <div className="bubble doctor voice-bubble">
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
          const isDoctor = m.sender === 'doctor';
          return (
            <div key={i} className="msg-row">
              <div className={`avatar-sm${isDoctor ? ' doc' : ''}`}>
                {isDoctor ? <UserRound size={16} /> : <Leaf size={16} />}
              </div>
              <div className={`bubble ${isDoctor ? 'doctor' : 'ai'}`}>{m.content}</div>
            </div>
          );
        })}

        {sending && (
          <div className="msg-row">
            <div className="avatar-sm"><Leaf size={16} /></div>
            <div className="bubble ai typing"><span /><span /><span /></div>
          </div>
        )}

        {status === 'waiting' && (
          <div className="waiting-card">
            <Clock size={18} />
            <div>
              <p className="waiting-title">{t('waitingTitle')}</p>
              <p className="waiting-note">{t('waitingNote')}</p>
            </div>
          </div>
        )}

        {crisis && (
          <div className="crisis-banner">
            <h3><ShieldAlert size={18} /> {t('crisisTitle')}</h3>
            <p>{t('crisisBody')}</p>
            <div className="crisis-btns">
              {crisis.helplines.map((h, idx) => (
                <a key={h.number} href={`tel:${h.number}`}
                   className={`crisis-btn${idx > 0 ? ' outline' : ''}`}>
                  <Phone size={14} /> {t('call')} {h.number}
                </a>
              ))}
            </div>
          </div>
        )}

        {showHandoff && status === 'ai' && (
          <div className="handoff-card">
            <div className="verified-badge"><ShieldCheck size={12} /> {t('slmcVerified')}</div>
            <div className="handoff-doctor">
              <div className="doctor-avatar">🩺</div>
              <div className="doctor-info">
                <h4>{t('verifiedDoctor')}</h4>
                <span>{t('realClinician')}</span>
              </div>
            </div>
            <button className="handoff-btn" onClick={askForDoctor} disabled={sending}>
              <MessageCircle size={16} />
              {sending ? t('requesting') : t('connectAnon')}
            </button>
          </div>
        )}

        {confirmEnd && (
          <div className="confirm-card">
            <p className="confirm-text">{t('endChatConfirm')}</p>
            <div className="confirm-actions">
              <button className="mini-btn" onClick={() => setConfirmEnd(false)}>
                {t('endChatCancel')}
              </button>
              <button className="mini-btn danger" onClick={confirmEndChat}>
                {t('endChatYes')}
              </button>
            </div>
          </div>
        )}

        {status === 'closed' && (
          <div className="ended-card">
            <XCircle size={18} />
            <p className="ended-text">{t('endedByDoctor')}</p>
            <button className="handoff-btn" onClick={leaveToLanding}>
              <RotateCcw size={15} />
              {t('backToHome')}
            </button>
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}
        <div ref={endRef} />
      </div>

      {speech.listening && (
        <div className="listening-bar">
          <span className="listening-dot" />
          <span className="listening-text">
            {speech.interim || t('listening')}
          </span>
          <span className="listening-note">{t('listeningNote')}</span>
        </div>
      )}
      {speech.error && <p className="error-msg" style={{ margin: '0 20px 8px' }}>{speech.error}</p>}

      <form className="input-area" onSubmit={send}>
        {speech.supported && status !== 'closed' && (
          <button
            type="button"
            className={`mic-btn${speech.listening ? ' active' : ''}`}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            title={speech.listening ? t('stopListening') : t('speakInstead')}
            aria-label={speech.listening ? t('stopListening') : t('speakInstead')}
          >
            {speech.listening ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
        )}
        <input
          className="input-field"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            status === 'active' ? t('replyToDoctor')
            : status === 'waiting' ? t('typeWhileWait')
            : status === 'closed' ? t('consultEnded')
            : t('typeAnything')
          }
          disabled={sending || status === 'closed'}
          aria-label="Your message"
        />
        <button className="send-btn" type="submit"
                disabled={sending || !input.trim() || status === 'closed'} aria-label="Send">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
