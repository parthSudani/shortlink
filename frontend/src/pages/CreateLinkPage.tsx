import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api/client';
import { linksApi } from '../lib/api/resources';
import type { LinkDetail } from '../types/api';
import { FieldError } from '../components/Feedback';

export function CreateLinkPage() {
  const navigate = useNavigate();
  const [destinationUrl, setDestinationUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [retryAfter, setRetryAfter] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<LinkDetail | null>(null);
  const [copyNotice, setCopyNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    try {
      const parsed = new URL(destinationUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    } catch { errors.destinationUrl = 'Enter a complete HTTP or HTTPS URL.'; }
    if (customAlias && !/^[A-Za-z0-9_-]{3,32}$/.test(customAlias)) errors.customAlias = 'Use 3–32 letters, numbers, hyphens, or underscores.';
    let expiryIso: string | undefined;
    if (expiresAt) {
      const date = new Date(expiresAt);
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) errors.expiresAt = 'Choose a date and time in the future.';
      else expiryIso = date.toISOString();
    }
    setFieldErrors(errors);
    setError('');
    setRetryAfter(undefined);
    if (Object.keys(errors).length) return;

    setBusy(true);
    try {
      const input = { destinationUrl: destinationUrl.trim(), ...(customAlias ? { customAlias: customAlias.trim() } : {}), ...(expiryIso ? { expiresAt: expiryIso } : {}) };
      setCreated(await linksApi.create(input));
    } catch (cause) {
      if (cause instanceof ApiError) {
        setRetryAfter(cause.retryAfterSeconds);
        const details: Record<string, string> = {};
        for (const detail of cause.details) details[detail.field] = detail.message;
        setFieldErrors(current => ({ ...current, ...details }));
        setError(cause.status === 409 ? 'That custom alias is already taken. Try another one.' : cause.status === 429 ? 'You have reached the link creation limit.' : cause.message);
      } else setError('We could not create this link. Try again.');
    } finally { setBusy(false); }
  }

  async function copy() {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.shortUrl); setCopyNotice('Copied to clipboard.'); }
    catch { setCopyNotice('Copy failed. Select the short URL and copy it manually.'); }
  }

  return <div className="page-stack narrow-page">
    <div className="page-heading"><p className="eyebrow">WORKSPACE / CREATE LINK</p><h1>Create a short link</h1><p className="muted">Turn a long destination into a URL that is easy to share.</p></div>
    {created ? <section className="panel success-panel" aria-labelledby="created-title"><span className="success-mark" aria-hidden="true">✓</span><p className="eyebrow">LINK CREATED</p><h2 id="created-title">Your short URL is ready.</h2><label className="field">Short URL<span className="copy-field"><input readOnly value={created.shortUrl} aria-label="Created short URL"/><button className="button button-primary" onClick={() => void copy()}>Copy link</button></span></label><p className="notice notice-success" aria-live="polite">{copyNotice || 'You can copy it now or find it in your links list.'}</p><div className="button-row"><button className="button button-primary" onClick={() => navigate('/links', { state: { created: true } })}>Go to links</button><button className="button button-quiet" onClick={() => { setCreated(null); setDestinationUrl(''); setCustomAlias(''); setExpiresAt(''); setFieldErrors({}); setError(''); }}>Create another</button></div></section> : <section className="panel form-panel"><form className="form-stack" onSubmit={submit} noValidate>
      <label className="field" htmlFor="destination">Destination URL <span className="required-mark">*</span><input id="destination" type="url" inputMode="url" autoComplete="url" placeholder="https://example.com/your-page" value={destinationUrl} onChange={event => setDestinationUrl(event.target.value)} aria-invalid={Boolean(fieldErrors.destinationUrl)} aria-describedby="destination-hint destination-error"/><span className="field-hint" id="destination-hint">Only public HTTP and HTTPS destinations are accepted.</span><FieldError id="destination-error">{fieldErrors.destinationUrl}</FieldError></label>
      <label className="field" htmlFor="alias">Custom alias <span className="optional-mark">Optional</span><span className="alias-field"><span aria-hidden="true">short.link/</span><input id="alias" autoComplete="off" maxLength={32} placeholder="your-name" value={customAlias} onChange={event => setCustomAlias(event.target.value)} aria-invalid={Boolean(fieldErrors.customAlias)} aria-describedby="alias-hint alias-error"/></span><span className="field-hint" id="alias-hint">3–32 characters: letters, numbers, hyphen, or underscore.</span><FieldError id="alias-error">{fieldErrors.customAlias}</FieldError></label>
      <label className="field" htmlFor="expires">Expiry date and time <span className="optional-mark">Optional · your local time</span><input id="expires" type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} aria-invalid={Boolean(fieldErrors.expiresAt)} aria-describedby="expiry-hint expiry-error"/><span className="field-hint" id="expiry-hint">Leave blank if this link should not expire. The value is sent to the API as UTC.</span><FieldError id="expiry-error">{fieldErrors.expiresAt}</FieldError></label>
      {error && <div className="notice notice-error" role="alert">{error}{retryAfter ? ` Try again in ${retryAfter} seconds.` : ''}</div>}
      <div className="form-actions"><Link className="button button-quiet" to="/links">Cancel</Link><button className="button button-primary" type="submit" disabled={busy}>{busy ? <><span className="spinner spinner-light" aria-hidden="true" /> Creating…</> : 'Create short link'}</button></div>
    </form></section>}
  </div>;
}
