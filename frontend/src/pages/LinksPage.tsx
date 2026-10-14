import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { EmptyState, ErrorNotice, Loading } from '../components/Feedback';
import { linksApi } from '../lib/api/resources';
import type { LinkItem, LinkPage } from '../types/api';

function formatDate(value: string | null) {
  if (!value) return 'Does not expire';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
}

export function LinksPage() {
  const location = useLocation();
  const [data, setData] = useState<LinkPage | null>(null);
  const [response, setResponse] = useState<{ key: string; error: string }>({ key: '', error: '' });
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const requestKey = `${page}:${location.key}:${refresh}`;
  const loading = response.key !== requestKey;
  const error = response.key === requestKey ? response.error : '';
  const routeNotice = (location.state as { created?: boolean } | null)?.created ? 'Your link is ready.' : '';

  useEffect(() => {
    const controller = new AbortController();
    linksApi.list(page, controller.signal).then(result => {
      setData(result);
      setNow(Date.now());
      setResponse({ key: requestKey, error: '' });
    }).catch(cause => {
      if (!controller.signal.aborted) setResponse({ key: requestKey, error: cause instanceof Error ? cause.message : 'We could not load your links.' });
    });
    return () => controller.abort();
  }, [page, requestKey]);

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setNotice('Short URL copied.'); setNoticeError(false); }
    catch { setNotice('Copy failed. Select the short URL and copy it manually.'); setNoticeError(true); }
  }

  async function remove(link: LinkItem) {
    if (!window.confirm(`Delete ${link.shortUrl}? Anyone using it will no longer be redirected.`)) return;
    setDeleting(link.id); setNotice(''); setNoticeError(false);
    try {
      await linksApi.remove(link.id);
      setNotice('Link deleted.');
      setNoticeError(false);
      if (data && data.items.length === 1 && page > 0) setPage(current => current - 1);
      else setData(current => current ? { ...current, items: current.items.filter(item => item.id !== link.id), totalItems: Math.max(0, current.totalItems - 1) } : current);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not delete this link.'); setNoticeError(true); }
    finally { setDeleting(null); }
  }

  return <div className="page-stack">
    <div className="page-heading heading-row"><div><p className="eyebrow">WORKSPACE / LINKS</p><h1>Your links</h1><p className="muted">Manage short URLs and see what is working.</p></div><Link className="button button-primary" to="/links/new"><span aria-hidden="true">＋</span> Create link</Link></div>
    <div className="stats-row"><article className="stat-card"><span className="stat-label">Total links</span><strong>{data?.totalItems ?? '—'}</strong><span className="stat-foot">Across your workspace</span></article><article className="stat-card"><span className="stat-label">Clicks on this page</span><strong>{data?.items.reduce((sum, item) => sum + item.totalClicks, 0).toLocaleString() ?? '—'}</strong><span className="stat-foot">Recent page, all time</span></article><article className="stat-card stat-card-accent"><span className="stat-label">Quick tip</span><strong className="tip-mark">↗</strong><span className="stat-foot">Open analytics to explore traffic.</span></article></div>
    <section className="panel links-panel" aria-labelledby="links-heading">
      <div className="panel-heading"><div><h2 id="links-heading">All links</h2><p className="muted">Your shortened URLs and their activity</p></div><button className="button button-quiet button-small" onClick={() => setRefresh(value => value + 1)} disabled={loading}>↻ Refresh</button></div>
      {(notice || routeNotice) && <p className={`notice ${noticeError ? 'notice-error' : 'notice-success'}`} role={noticeError ? 'alert' : 'status'}>{notice || routeNotice}</p>}
      {error && <ErrorNotice onRetry={() => setRefresh(value => value + 1)}>{error}</ErrorNotice>}
      {loading && !data ? <Loading label="Loading your links…" /> : data?.items.length === 0 ? <EmptyState title="No links yet" action={<Link className="button button-primary" to="/links/new">Create your first link</Link>}>Your short URLs will appear here, along with click totals and analytics.</EmptyState> : data && <>
        <div className="table-scroll"><table className="links-table"><thead><tr><th scope="col">Short URL</th><th scope="col">Destination</th><th scope="col">Created</th><th scope="col">Expires</th><th scope="col" className="numeric">Clicks</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>{data.items.map(link => {
            const expired = Boolean(link.expiresAt && now > 0 && Date.parse(link.expiresAt) <= now);
            return <tr key={link.id}>
              <td><div className="short-cell"><a className="short-url" href={link.shortUrl} target="_blank" rel="noreferrer">{link.shortUrl}</a><button className="icon-button" aria-label={`Copy ${link.shortUrl}`} title="Copy short URL" onClick={() => void copy(link.shortUrl)}>▢</button>{expired && <span className="status-pill expired">Expired</span>}</div></td>
              <td><a className="destination" href={link.destinationUrl} target="_blank" rel="noreferrer" title={link.destinationUrl}>{link.destinationUrl}</a></td>
              <td className="date-cell">{formatDate(link.createdAt)}</td><td className="date-cell">{formatDate(link.expiresAt)}</td>
              <td className="numeric click-count">{link.totalClicks.toLocaleString()}</td>
              <td><div className="row-actions"><Link className="text-action" to={`/links/${encodeURIComponent(link.id)}/analytics`}>Analytics</Link><button className="text-action danger-action" disabled={deleting === link.id} onClick={() => void remove(link)}>{deleting === link.id ? 'Deleting…' : 'Delete'}</button></div></td>
            </tr>;
          })}</tbody></table></div>
        <div className="pagination"><span>Page {data.page + 1} of {Math.max(1, data.totalPages)} <span className="muted">· {data.totalItems} links</span></span><div className="pagination-actions"><button className="button button-quiet button-small" disabled={page <= 0 || loading} onClick={() => setPage(value => Math.max(0, value - 1))}>← Previous</button><button className="button button-quiet button-small" disabled={loading || data.page + 1 >= data.totalPages} onClick={() => setPage(value => value + 1)}>Next →</button></div></div>
      </>}
    </section>
  </div>;
}
