import { apiRequest } from './client';
import type { AnalyticsSummary, DailyClicks, Devices, LinkCreate, LinkDetail, LinkPage, Referrers } from '../../types/api';

export const linksApi = {
  list: (page: number, signal?: AbortSignal) => apiRequest<LinkPage>(`/api/v1/links?page=${page}&size=10`, { signal }),
  get: (id: string, signal?: AbortSignal) => apiRequest<LinkDetail>(`/api/v1/links/${encodeURIComponent(id)}`, { signal }),
  create: (input: LinkCreate, signal?: AbortSignal) => apiRequest<LinkDetail>(`/api/v1/links`, { method: 'POST', body: JSON.stringify(input), signal }),
  remove: (id: string, signal?: AbortSignal) => apiRequest<void>(`/api/v1/links/${encodeURIComponent(id)}`, { method: 'DELETE', signal }),
};

export const analyticsApi = {
  summary: (id: string, signal?: AbortSignal) => apiRequest<AnalyticsSummary>(`/api/v1/links/${encodeURIComponent(id)}/analytics/summary`, { signal }),
  clicks: (id: string, signal?: AbortSignal) => apiRequest<DailyClicks>(`/api/v1/links/${encodeURIComponent(id)}/analytics/clicks?days=30`, { signal }),
  referrers: (id: string, signal?: AbortSignal) => apiRequest<Referrers>(`/api/v1/links/${encodeURIComponent(id)}/analytics/referrers?days=30&limit=10`, { signal }),
  devices: (id: string, signal?: AbortSignal) => apiRequest<Devices>(`/api/v1/links/${encodeURIComponent(id)}/analytics/devices?days=30`, { signal }),
};
