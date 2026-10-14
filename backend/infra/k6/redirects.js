import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
const errors = new Rate('redirect_errors');
const latency = new Trend('redirect_latency', true);
export const options = {
  scenarios: (__ENV.CACHE_MODE || 'enabled') === 'disabled'
    ? { cache_disabled: { executor: 'constant-vus', vus: Number(__ENV.VUS || 25), duration: __ENV.DURATION || '2m', exec: 'uncached' } }
    : { cache_enabled: { executor: 'constant-vus', vus: Number(__ENV.VUS || 25), duration: __ENV.DURATION || '2m', exec: 'cached' } },
  thresholds: { redirect_errors: ['rate<0.01'], redirect_latency: ['p(95)<250'] },
};
const base = __ENV.BASE_URL || 'http://localhost:3000';
const code = __ENV.CODE || 'seedcode';
function hit(url) { const r = http.get(url, { redirects: 0 }); latency.add(r.timings.duration); errors.add(r.status !== 302); check(r, { 'redirects with 302': x => x.status === 302, 'has location': x => Boolean(x.headers.Location) }); sleep(0.02); }
export function cached() { hit(`${base}/${code}`); }
export function uncached() { hit(`${base}/${code}`); }
