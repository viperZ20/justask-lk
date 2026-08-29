import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import { LangProvider } from './context/LangContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';
import './index.css';

// The marketing/landing page is a standalone static file in /public.
// Anyone hitting the root gets sent there; the React app lives under /start.
if (window.location.pathname === '/') {
  window.location.replace('/landing.html');
}

// Apply the saved language and theme before React mounts, so there is no
// flash of the wrong one on load.
const savedLang = localStorage.getItem('jl_lang');
if (savedLang === 'si') {
  document.documentElement.lang = 'si';
  document.body.classList.add('lang-si');
}

const savedTheme = localStorage.getItem('jl_theme');
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
  document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = 'dark';
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LangProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </LangProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
