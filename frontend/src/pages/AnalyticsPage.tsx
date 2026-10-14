import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorNotice, Loading } from '../components/Feedback';
import { analyticsApi, linksApi } from '../lib/api/resources';
import type { AnalyticsSummary, DailyClicks, Devices, LinkDetail, Referrers } from '../types/api';

type Result<T> = { value: T | null; error: string; loading: boolean };
function useSection<T>(id: string, load: (id: string, signal: AbortSignal) => Promise<T>, refreshKey = 0): Result<T> {
  const requestKey = `${id}:${refreshKey}`;
  const [result, setResult] = useState<{ key: string; value: T | null; error: string }>({ key: '', value: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    load(id, controller.signal).then(value => setResult({ key: requestKey, value, error: '' }))
      .catch(error => { if (!controller.signal.aborted) setResult({ key: requestKey, value: null, error: error instanceof Error ? error.message : 'This section could not be loaded.' }); });
    return () => controller.abort();
  }, [id, load, requestKey]);
  return result.key === requestKey ? { ...result, loading: false } : { value: null, error: '', loading: true };
}

const loadSummary = (id: string, signal: AbortSignal) => analyticsApi.summary(id, signal);
const loadClicks = (id: string, signal: AbortSignal) => analyticsApi.clicks(id, signal);
const loadReferrers = (id: string, signal: AbortSignal) => analyticsApi.referrers(id, signal);
const loadDevices = (id: string, signal: AbortSignal) => analyticsApi.devices(id, signal);
const loadLink = (id: string, signal: AbortSignal) => linksApi.get(id, signal);

const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(value)) : 'No clicks yet';
const utcDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorNotice onRetry={onRetry}>{message}</ErrorNotice>;
}

function ClickChart({ data }: { data: DailyClicks }) {
  const max = Math.max(1, ...data.items.map(item => item.clicks));
  const total = data.items.reduce((sum, item) => sum + item.clicks, 0);
  const points = data.items.map((point, index) => ({ ...point, x: 22 + index * (656 / Math.max(1, data.items.length - 1)) }));
  return <>
    {total === 0 ? <div className="chart-empty"><span aria-hidden="true">⌁</span><strong>No clicks in this period</strong><p>Daily click activity will appear here.</p></div> : <>
      <div className="chart-wrap"><svg className="click-chart" viewBox="0 0 700 220" role="img" aria-labelledby="chart-title chart-desc" preserveAspectRatio="none">
        <title id="chart-title">Daily link clicks over the last 30 days</title><desc id="chart-desc">A bar chart with {data.items.length} daily values and {total} clicks in total. Dates are UTC.</desc>
        {[0, 1, 2, 3].map(row => <line key={row} x1="22" x2="678" y1={30 + row * 48} y2={30 + row * 48} className="chart-gridline" />)}
        {points.map(point => {
          const height = point.clicks === 0 ? 3 : Math.max(5, (point.clicks / max) * 142);
          return <rect key={point.date} x={point.x - 4.5} y={188 - height} width="9" height={height} rx="4.5" className={point.clicks ? 'chart-bar' : 'chart-bar chart-bar-zero'}><title>{`${utcDate(point.date)} UTC: ${point.clicks} ${point.clicks === 1 ? 'click' : 'clicks'}`}</title></rect>;
        })}
        <text x="22" y="212" className="chart-label">{utcDate(data.items[0]?.date || new Date().toISOString().slice(0, 10))}</text><text x="678" y="212" textAnchor="end" className="chart-label">{utcDate(data.items.at(-1)?.date || new Date().toISOString().slice(0, 10))}</text>
      </svg></div>
      <details className="data-table-details"><summary>View daily values as a table</summary><div className="table-scroll"><table className="data-table"><caption className="visually-hidden">Daily clicks in UTC for the last 30 days</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">Clicks</th></tr></thead><tbody>{data.items.map(item => <tr key={item.date}><td>{utcDate(item.date)}</td><td>{item.clicks}</td></tr>)}</tbody></table></div></details>
    </>}
  </>;
}

export function AnalyticsPage() {
  const { id = '' } = useParams();
  const [refresh, setRefresh] = useState(0);
  const link = useSection<LinkDetail>(id, loadLink, refresh);
  const summary = useSection<AnalyticsSummary>(id, loadSummary, refresh);
  const clicks = useSection<DailyClicks>(id, loadClicks, refresh);
  const referrers = useSection<Referrers>(id, loadReferrers, refresh);
  const devices = useSection<Devices>(id, loadDevices, refresh);
  const deviceTotal = useMemo(() => devices.value?.items.reduce((sum, item) => sum + item.clicks, 0) || 0, [devices.value]);
  const retry = () => setRefresh(value => value + 1);

  if (!id) return <ErrorNotice>Link not found or not available to your account.</ErrorNotice>;
  return <div className="page-stack">
    <div className="page-heading"><Link className="back-link" to="/links">← Back to links</Link><p className="eyebrow">ANALYTICS / LAST 30 DAYS</p><h1>Link performance</h1>
      {link.loading ? <p className="muted">Loading link…</p> : link.error ? <SectionError message={link.error} onRetry={retry} /> : link.value && <div className="analytics-link-summary"><span className="short-url">{link.value.shortUrl}</span><a className="destination" href={link.value.destinationUrl} target="_blank" rel="noreferrer">{link.value.destinationUrl}</a></div>}
    </div>
    {summary.loading ? <Loading label="Loading click summary…" /> : summary.error ? <SectionError message={summary.error} onRetry={retry} /> : summary.value && <div className="stats-row analytics-stats">
      <article className="stat-card"><span className="stat-label">Total clicks</span><strong>{summary.value.totalClicks.toLocaleString()}</strong><span className="stat-foot">All time</span></article>
      <article className="stat-card"><span className="stat-label">Last 30 days</span><strong>{summary.value.clicksLast30Days.toLocaleString()}</strong><span className="stat-foot">Recent activity</span></article>
      <article className="stat-card"><span className="stat-label">First click</span><strong className="stat-date">{dateTime(summary.value.firstClickAt)}</strong><span className="stat-foot">Recorded in UTC</span></article>
      <article className="stat-card"><span className="stat-label">Last click</span><strong className="stat-date">{dateTime(summary.value.lastClickAt)}</strong><span className="stat-foot">Recorded in UTC</span></article>
    </div>}
    <div className="analytics-grid">
      <section className="panel chart-panel" aria-labelledby="daily-heading"><div className="panel-heading"><div><p className="eyebrow">ACTIVITY</p><h2 id="daily-heading">Daily clicks</h2><p className="muted">30 days · dates shown in UTC</p></div><span className="period-pill">30 days</span></div>
        {clicks.loading ? <Loading label="Loading daily clicks…" /> : clicks.error ? <SectionError message={clicks.error} onRetry={retry} /> : clicks.value && <ClickChart data={clicks.value} />}
      </section>
      <section className="panel analytics-panel" aria-labelledby="referrer-heading"><div className="panel-heading"><div><p className="eyebrow">AUDIENCE</p><h2 id="referrer-heading">Top referrers</h2></div></div>
        {referrers.loading ? <Loading label="Loading referrers…" /> : referrers.error ? <SectionError message={referrers.error} onRetry={retry} /> : referrers.value?.items.length ? <ol className="rank-list">{referrers.value.items.map((item, index) => <li key={`${item.referrer}-${index}`}><span className="rank-index">{String(index + 1).padStart(2, '0')}</span><span className="rank-name">{item.referrer}</span><strong>{item.clicks.toLocaleString()}</strong></li>)}</ol> : <p className="muted">No referrer activity yet. Direct visits will be listed here.</p>}
      </section>
      <section className="panel analytics-panel device-panel" aria-labelledby="device-heading"><div className="panel-heading"><div><p className="eyebrow">DEVICES</p><h2 id="device-heading">Device split</h2></div><span className="period-pill">30 days</span></div>
        {devices.loading ? <Loading label="Loading devices…" /> : devices.error ? <SectionError message={devices.error} onRetry={retry} /> : devices.value && <div className="device-list">{devices.value.items.map(item => <div className="device-row" key={item.device}><div className="device-label"><span>{item.device[0].toUpperCase() + item.device.slice(1)}</span><strong>{item.clicks.toLocaleString()} · {deviceTotal ? Math.round(item.clicks / deviceTotal * 100) : 0}%</strong></div><div className="meter" role="progressbar" aria-label={`${item.device} share`} aria-valuenow={item.clicks} aria-valuemin={0} aria-valuemax={Math.max(1, deviceTotal)}><span style={{ width: `${deviceTotal ? item.clicks / deviceTotal * 100 : 0}%` }} /></div></div>)}{deviceTotal === 0 && <p className="muted">Device data appears after your first click.</p>}</div>}
      </section>
    </div>
  </div>;
}
