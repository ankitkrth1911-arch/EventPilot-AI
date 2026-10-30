/**
 * REST API client for EventPilot backend (FastAPI + Supabase)
 */

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export interface HealthResponse {
  status: string;
  database?: string;
}

export interface BackendEventRow {
  id: string;
  name: string;
  event_type: 'wedding' | 'birthday' | 'community';
  event_date: string | null;
  location: string | null;
  guest_count: number | null;
  budget: string | number | null;
  plan: {
    workspace?: any;
    rule_based?: any;
    warnings?: string[];
    per_guest_cost?: number;
    days_until_event?: number;
    [key: string]: any;
  } | null;
  created_at: string;
}

export interface GeneratedPlanResponse {
  event_type: string;
  total_budget: number;
  guest_count: number;
  per_guest_cost: number;
  budget_breakdown: Array<{
    category: string;
    percentage: number;
    amount: number;
  }>;
  checklist: Array<{
    phase: string;
    tasks: Array<{
      id: string | number;
      task: string;
      done: boolean;
    }>;
  }>;
  warnings?: string[];
  days_until_event?: number;
  generated_by?: string;
}

export function isApiConfigured(): boolean {
  return Boolean(API_URL && API_URL.trim().length > 0);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!isApiConfigured()) {
    throw new Error('VITE_API_URL is not configured. Please set VITE_API_URL in your environment.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

  try {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (response.status === 503) {
      throw new Error('Server database is unavailable, try again shortly.');
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json().catch(() => null) : await response.text();

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      if (data && typeof data === 'object') {
        if (typeof data.error === 'string') {
          message = data.error;
        } else if (typeof data.detail === 'string') {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          message = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
        }
      } else if (typeof data === 'string' && data) {
        message = data;
      }
      throw new Error(message);
    }

    return data as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out after 15 seconds. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

export async function listEvents(params?: {
  limit?: number;
  offset?: number;
  event_type?: string;
}): Promise<BackendEventRow[]> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.offset !== undefined) query.set('offset', String(params.offset));
  if (params?.event_type) query.set('event_type', params.event_type);

  const qs = query.toString();
  return request<BackendEventRow[]>(`/api/events${qs ? `?${qs}` : ''}`);
}

export async function getEvent(id: string): Promise<BackendEventRow> {
  return request<BackendEventRow>(`/api/events/${encodeURIComponent(id)}`);
}

export async function createEvent(payload: {
  name: string;
  event_type: 'wedding' | 'birthday' | 'community';
  event_date?: string | null;
  location?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  plan?: any;
}): Promise<BackendEventRow> {
  return request<BackendEventRow>('/api/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEvent(
  id: string,
  payload: Partial<{
    name: string;
    event_type: 'wedding' | 'birthday' | 'community';
    event_date: string | null;
    location: string | null;
    guest_count: number | null;
    budget: number | null;
    plan: any;
  }>
): Promise<BackendEventRow> {
  return request<BackendEventRow>(`/api/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteEvent(id: string): Promise<{ deleted: boolean; id: string }> {
  return request<{ deleted: boolean; id: string }>(`/api/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function generatePlan(payload: {
  event_type: 'wedding' | 'birthday' | 'community';
  budget: number;
  guest_count: number;
  event_date?: string | null;
}): Promise<GeneratedPlanResponse> {
  return request<GeneratedPlanResponse>('/api/generate-plan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
