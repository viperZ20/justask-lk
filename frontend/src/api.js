const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Temporary test-build gate ──────────────────────────────────────────────
// While the app is exposed through a public tunnel for team testing, the
// backend requires a shared key. It arrives once in the URL (?key=...), is
// kept for the session, and is stripped from the address bar so it is not
// left sitting in a screenshot or shoulder-surfed.
// This whole block is removed for the real deployment.
const KEY_STORE = 'jl_access_key';

(function captureAccessKey() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const key = params.get('key');
  if (key) {
    sessionStorage.setItem(KEY_STORE, key);
    params.delete('key');
    const clean =
      window.location.pathname + (params.toString() ? '?' + params : '') + window.location.hash;
    window.history.replaceState({}, '', clean);
  }
})();

function accessHeaders() {
  const key = typeof window !== 'undefined' ? sessionStorage.getItem(KEY_STORE) : null;
  return key ? { 'x-access-key': key } : {};
}
// ───────────────────────────────────────────────────────────────────────────

// ── Session ownership token ────────────────────────────────────────────────
// Issued when a conversation starts and required to read it back. Held in
// memory only, never in localStorage: a session token in storage would outlive
// the conversation on a shared or borrowed device, which is exactly the
// situation this app exists for.
let sessionToken = null;

export function setSessionToken(t) { sessionToken = t; }
export function clearSessionToken() { sessionToken = null; }

function sessionHeaders() {
  return sessionToken ? { Authorization: `Session ${sessionToken}` } : {};
}

function authHeaders() {
  const token = localStorage.getItem('jl_doctor_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}, withAuth = false) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...accessHeaders(),
      // A doctor's bearer token and a patient's session token are different
      // credentials and must not be sent together.
      ...(withAuth ? authHeaders() : sessionHeaders()),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Something went wrong. Please try again.');
  }
  return res.json();
}

/* ─────────── Patient ─────────── */

export async function createSession(ageBand, lang = 'en') {
  const data = await request('/api/session', {
    method: 'POST',
    body: JSON.stringify({ ageBand, lang }),
  });
  if (data.sessionToken) setSessionToken(data.sessionToken);
  return data;
}

export function updateSessionTopic(sessionId, topic) {
  return request(`/api/session/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ topic }) });
}

// Called when the user switches language mid-session so the AI and the crisis
// wording follow them.
export function updateSessionLang(sessionId, lang) {
  return request(`/api/session/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ lang }) });
}

export function sendMessage(sessionId, message, wasSpoken = false) {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message, wasSpoken }),
  });
}

export function getHistory(sessionId) {
  return request(`/api/chat/${sessionId}`);
}

export function endSession(sessionId) {
  return request(`/api/session/${sessionId}/end`, { method: 'POST' });
}

export function requestDoctor(sessionId) {
  return request('/api/doctor/request', { method: 'POST', body: JSON.stringify({ sessionId }) });
}

export function getDoctorStatus(sessionId) {
  return request(`/api/doctor/status/${sessionId}`);
}

/* ─────────── Doctor ─────────── */

export function doctorRegister(payload) {
  return request('/api/doctor-auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export function doctorLogin(email, password) {
  return request('/api/doctor-auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function doctorMe() {
  return request('/api/doctor-auth/me', {}, true);
}

export function doctorQueue() {
  return request('/api/doctor/queue', {}, true);
}

export function doctorClaim(sessionId) {
  return request('/api/doctor/claim', { method: 'POST', body: JSON.stringify({ sessionId }) }, true);
}

export function doctorConversation(sessionId) {
  return request(`/api/doctor/conversation/${sessionId}`, {}, true);
}

export function doctorSend(sessionId, message) {
  return request('/api/doctor/message', { method: 'POST', body: JSON.stringify({ sessionId, message }) }, true);
}

export function doctorVoice(sessionId, audio, durationSec) {
  return request('/api/doctor/voice', {
    method: 'POST',
    body: JSON.stringify({ sessionId, audio, durationSec }),
  }, true);
}

export function doctorReferral(sessionId) {
  return request('/api/doctor/referral', { method: 'POST', body: JSON.stringify({ sessionId }) }, true);
}

// Pass a sessionId to clear one, or omit it to clear every closed session.
export function doctorClearHistory(sessionId) {
  return request('/api/doctor/clear-history', {
    method: 'POST',
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  }, true);
}

export function doctorClose(sessionId) {
  return request('/api/doctor/close', { method: 'POST', body: JSON.stringify({ sessionId }) }, true);
}

/* ─────────── Administrator ─────────── */
// The admin key is held only for the browser session and sent as a header.
// It is never persisted to localStorage, so closing the tab ends access.

function adminHeaders() {
  const key = sessionStorage.getItem('jl_admin_key');
  return key ? { 'x-admin-key': key } : {};
}

async function adminRequest(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...accessHeaders(),
      ...adminHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Something went wrong. Please try again.');
  }
  return res.json();
}

export function adminDoctors() {
  return adminRequest('/api/admin/doctors');
}

export function adminStats() {
  return adminRequest('/api/admin/stats');
}

export function adminSetVerified(id, verified) {
  return adminRequest(`/api/admin/doctors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ verified }),
  });
}

// Closes sessions the patient has abandoned. There is deliberately no way to
// close a single named session — the admin API does not expose individual
// sessions at all.
export function adminCloseSessions() {
  return adminRequest('/api/admin/sessions/close', { method: 'POST' });
}

export function adminDeleteDoctor(id) {
  return adminRequest(`/api/admin/doctors/${id}`, { method: 'DELETE' });
}

// action: 'all' | 'security' | 'access' | 'admin' | 'accounts'
export function adminAudit(action = 'all', limit = 50) {
  return adminRequest(`/api/admin/audit?action=${action}&limit=${limit}`);
}
