import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, ShieldCheck, Lock } from 'lucide-react';
import { doctorLogin, doctorRegister } from '../api';

export default function DoctorLogin() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    email: '', password: '', fullName: '', slmcNumber: '',
    specialisation: '', clinicName: '', clinicArea: '', bookingInfo: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const navigate = useNavigate();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === 'login') {
        const res = await doctorLogin(form.email, form.password);
        localStorage.setItem('jl_doctor_token', res.token);
        navigate('/doctor/dashboard');
      } else {
        const res = await doctorRegister(form);
        setNotice(res.message);
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="frame doctor-frame">
      <div className="header">
        <div className="avatar"><Stethoscope size={20} /></div>
        <div className="header-text">
          <h2>JustAsk LK</h2>
          <p><ShieldCheck size={12} /> Professional Access</p>
        </div>
      </div>

      <div className="body-area">
        <div>
          <p className="eyebrow">{mode === 'login' ? 'Sign in' : 'Register'}</p>
          <h1 className="title">
            {mode === 'login' ? 'Doctor sign in' : 'Register as a doctor'}
          </h1>
          <p className="lede">
            {mode === 'login'
              ? 'Only verified professionals can view or accept patient consultations.'
              : 'Your SLMC registration will be checked by an administrator before your account can accept consultations.'}
          </p>
        </div>

        {error && <p className="error-msg">{error}</p>}
        {notice && <p className="notice-msg">{notice}</p>}

        <form className="form" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label className="field">
                <span>Full name</span>
                <input value={form.fullName} onChange={set('fullName')} required />
              </label>
              <label className="field">
                <span>SLMC registration number</span>
                <input value={form.slmcNumber} onChange={set('slmcNumber')} required />
              </label>
              <label className="field">
                <span>Specialisation</span>
                <input value={form.specialisation} onChange={set('specialisation')}
                       placeholder="e.g. General Practice" required />
              </label>
              <label className="field">
                <span>Clinic name <em>(shown on referrals)</em></span>
                <input value={form.clinicName} onChange={set('clinicName')} />
              </label>
              <label className="field">
                <span>Clinic area</span>
                <input value={form.clinicArea} onChange={set('clinicArea')} placeholder="e.g. Colombo 03" />
              </label>
              <label className="field">
                <span>How patients can book</span>
                <input value={form.bookingInfo} onChange={set('bookingInfo')} placeholder="e.g. Walk-in, OPD 8am-4pm" />
              </label>
            </>
          )}

          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set('email')} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={form.password} onChange={set('password')}
                   minLength={8} required />
          </label>

          <button className="handoff-btn" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          className="link-btn"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
        >
          {mode === 'login' ? 'No account? Register →' : '← Back to sign in'}
        </button>

        <p className="foot-note">
          <Lock size={12} />
          Patients remain anonymous to you at all times.
        </p>
      </div>
    </div>
  );
}
