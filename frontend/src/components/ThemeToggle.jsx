import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={dark ? 'Switch to light' : 'Switch to dark'}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
