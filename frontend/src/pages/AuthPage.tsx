import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api/client';
import { FieldError } from '../components/Feedback';
import { useAuth } from '../features/auth/AuthContext';

type Mode = 'login' | 'register';

export function AuthPage({ mode }: { mode: Mode }) {
  const { authenticate } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!email.trim()) nextErrors.email = 'Enter your email address.';
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (!password) nextErrors.password = 'Enter your password.';
    else if (password.length < 12) nextErrors.password = 'Use at least 12 characters.';
    else if (password.length > 128) nextErrors.password = 'Password must be 128 characters or fewer.';
    setFieldErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length) return;

    setBusy(true);
    try {
      await authenticate(register ? '/auth/register' : '/auth/login', { email: email.trim(), password });
      const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
      navigate(from?.pathname ? `${from.pathname}${from.search || ''}` : '/links', { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setError('An account with this email already exists. Try signing in instead.');
      else if (cause instanceof ApiError && cause.status === 401) setError('That email and password combination was not recognized.');
      else if (cause instanceof ApiError && cause.details.length) {
        setFieldErrors(Object.fromEntries(cause.details.map(detail => [detail.field, detail.message])));
        setError('Check the highlighted fields and try again.');
      } else setError(cause instanceof ApiError ? cause.message : 'We could not complete your request. Try again.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  return <main className="auth-screen">
    <section className="auth-card" aria-labelledby="auth-title">
      <Link to="/login" className="brand auth-brand"><span className="brand-mark">s</span><span>shortlink<span className="brand-dot">.</span></span></Link>
      <p className="eyebrow">YOUR LINK WORKSPACE</p>
      <h1 id="auth-title">{register ? 'Create your account' : 'Welcome back'}</h1>
      <p className="muted">{register ? 'Make short links and see how they perform.' : 'Sign in to manage your links and analytics.'}</p>
      <form className="form-stack" onSubmit={submit} noValidate>
        <label className="field" htmlFor="email">Email address
          <input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" required value={email} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'email-error' : undefined} onChange={event => setEmail(event.target.value)} />
          <FieldError id="email-error">{fieldErrors.email}</FieldError>
        </label>
        <label className="field" htmlFor="password">Password
          <input id="password" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : undefined} maxLength={128} value={password} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'password-error' : undefined} onChange={event => setPassword(event.target.value)} />
          <FieldError id="password-error">{fieldErrors.password}</FieldError>
          {register && <span className="field-hint">Use 12–128 characters.</span>}
        </label>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <button className="button button-primary button-wide" type="submit" disabled={busy}>
          {busy ? <><span className="spinner spinner-light" aria-hidden="true" /> {register ? 'Creating account…' : 'Signing in…'}</> : register ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="auth-switch">{register ? 'Already have an account?' : 'New to Shortlink?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
      <p className="security-note">Your session is stored for this browser tab and cleared when the tab closes.</p>
    </section>
    <aside className="auth-aside"><div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" /><div className="aside-copy"><span className="eyebrow eyebrow-light">LINKS, WITH A LITTLE MORE CLARITY</span><h2>Make every link easier to understand.</h2><p>Create a short URL, share it anywhere, and see where your audience comes from.</p><div className="preview-card"><span className="preview-icon">↗</span><span><strong>short.link/spring</strong><small>1,284 clicks · this month</small></span><span className="preview-spark" aria-hidden="true">▂▄▃▆▅▇</span></div></div></aside>
  </main>;
}
