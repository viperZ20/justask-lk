import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HeartHandshake, ArrowLeft, Brain, Heart, ShieldCheck, Leaf, Lock } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useLang } from '../context/LangContext';
import LangToggle from '../components/LangToggle';
import ThemeToggle from '../components/ThemeToggle';
import { updateSessionTopic } from '../api';

const TOPICS = [
  { value: 'mental_health', key: 'mentalHealth', noteKey: 'mentalNote', Icon: Brain, tint: 'rgba(143,166,138,0.15)', color: '#6B8566' },
  { value: 'sexual_health', key: 'sexualHealth', noteKey: 'sexualNote', Icon: Heart, tint: 'rgba(212,165,165,0.18)', color: '#B88787' },
  { value: 'addiction', key: 'addiction', noteKey: 'addictionNote', Icon: ShieldCheck, tint: 'rgba(193,124,96,0.15)', color: '#A6654A' },
  { value: 'general_health', key: 'generalHealth', noteKey: 'generalNote', Icon: Leaf, tint: 'rgba(212,197,178,0.35)', color: '#BBA98F' },
];

export default function TopicSelect() {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const { sessionId, setTopic } = useSession();
  const { t } = useLang();
  const navigate = useNavigate();

  if (!sessionId) {
    navigate('/start');
    return null;
  }

  async function choose(topic) {
    setLoading(topic);
    setError(null);
    try {
      const data = await updateSessionTopic(sessionId, topic);
      setTopic(data.topic);
      navigate('/chat');
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div className="frame">
      <div className="header">
        <button className="icon-btn" onClick={() => navigate('/start')} aria-label={t('back')}>
          <ArrowLeft size={20} />
        </button>
        <div className="avatar">
          <HeartHandshake size={20} />
        </div>
        <div className="header-text">
          <h2>{t('brand')}</h2>
          <p><span className="status-dot" /> {t('anonymousSession')}</p>
        </div>
        <ThemeToggle />
        <LangToggle />
      </div>

      <div className="body-area">
        <div>
          <p className="eyebrow">{t('step2')}</p>
          <h1 className="title">{t('topicTitle')}</h1>
          <p className="lede">{t('topicLede')}</p>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="option-list">
          {TOPICS.map(({ value, key, noteKey, Icon, tint, color }) => (
            <button
              key={value}
              className="option"
              onClick={() => choose(value)}
              disabled={loading !== null}
            >
              <span className="option-main">
                <span className="option-icon" style={{ backgroundColor: tint, color }}>
                  <Icon size={17} />
                </span>
                <span className="option-label">{t(key)}</span>
              </span>
              <span className="option-note">
                {loading === value ? t('opening') : t(noteKey)}
              </span>
            </button>
          ))}
        </div>

        <button
          className="link-btn"
          onClick={() => navigate('/chat')}
          disabled={loading !== null}
        >
          {t('orJustType')}
        </button>

        <p className="foot-note"><Lock size={12} />{t('privateNote')}</p>
      </div>
    </div>
  );
}
