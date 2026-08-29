import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HeartHandshake, Lock, Baby, Users, User, UserRound, Heart, Stethoscope } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useLang } from '../context/LangContext';
import LangToggle from '../components/LangToggle';
import ThemeToggle from '../components/ThemeToggle';
import { createSession } from '../api';

const AGE_BANDS = [
  { value: 'under_16', key: 'under16', Icon: Baby, tint: 'rgba(143,166,138,0.15)', color: '#6B8566' },
  { value: '16_18', key: 'age1618', Icon: Users, tint: 'rgba(212,165,165,0.18)', color: '#B88787' },
  { value: '19_25', key: 'age1925', Icon: User, tint: 'rgba(143,166,138,0.15)', color: '#6B8566' },
  { value: '26_40', key: 'age2640', Icon: UserRound, tint: 'rgba(193,124,96,0.15)', color: '#A6654A' },
  { value: '40_plus', key: 'age40plus', Icon: Heart, tint: 'rgba(212,165,165,0.18)', color: '#B88787' },
];

export default function AgeSelect() {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const { setSessionId, setAgeBand, wantsDoctor, setWantsDoctor } = useSession();
  const { t } = useLang();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // Arrived from a "Talk to a Doctor" link on the landing page.
  useEffect(() => {
    if (params.get('doctor') === '1') setWantsDoctor(true);
  }, [params, setWantsDoctor]);

  async function choose(band) {
    setLoading(band);
    setError(null);
    try {
      const data = await createSession(band);
      setSessionId(data.sessionId);
      setAgeBand(data.ageBand);
      navigate('/topic');
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div className="frame">
      <div className="header">
        <div className="avatar"><HeartHandshake size={20} /></div>
        <div className="header-text">
          <h2>{t('brand')}</h2>
          <p><span className="status-dot" /> {t('anonymousSession')}</p>
        </div>
        <ThemeToggle />
        <LangToggle />
      </div>

      <div className="body-area">
        <div>
          <p className="eyebrow">{t('step1')}</p>
          <h1 className="title">{t('ageTitle')}</h1>
          <p className="lede">{t('ageLede')}</p>
        </div>

        {wantsDoctor && (
          <div className="intent-note">
            <Stethoscope size={15} />
            <span>{t('doctorIntent')}</span>
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <div className="option-list">
          {AGE_BANDS.map(({ value, key, Icon, tint, color }) => (
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
                {loading === value ? t('starting') : t(key + 'Note')}
              </span>
            </button>
          ))}
        </div>

        <p className="foot-note">
          <Lock size={12} />
          {t('noIdentity')}
        </p>
      </div>
    </div>
  );
}
