import { Languages } from 'lucide-react';
import { useLang } from '../context/LangContext';

export default function LangToggle() {
  const { lang, toggle } = useLang();
  return (
    <button
      className="lang-toggle"
      onClick={toggle}
      title={lang === 'en' ? 'සිංහල භාෂාවට මාරු වන්න' : 'Switch to English'}
      aria-label={lang === 'en' ? 'Switch to Sinhala' : 'Switch to English'}
    >
      <Languages size={13} />
      <span>{lang === 'en' ? 'සිංහල' : 'EN'}</span>
    </button>
  );
}
