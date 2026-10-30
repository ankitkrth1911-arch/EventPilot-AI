/**
 * REST API client for EventPilot backend (FastAPI + Supabase)
 * Hardened with exponential backoff for GETs, 429/503 Retry-After awareness,
 * ETag optimistic concurrency, and idempotency key support.
 */

export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export interface HealthResponse {
  status: string;
  database?: string;
  live?: boolean;
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
  _etag?: string;
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

export interface ApiError extends Error {
  status?: number;
  retryAfter?: number;
}

export function isApiConfigured(): boolean {
  return Boolean(API_URL && API_URL.trim().length > 0);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function executeSingleFetch(
  url: string,
  options: RequestInit,
  signal?: AbortSignal
): Promise<{ response: Response; data: any }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  // Propagate caller abort signal if supplied
  const abortHandler = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    signal.addEventListener('abort', abortHandler);
  }

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

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json().catch(() => null) : await response.text();

    return { response, data };
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', abortHandler);
    }
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal
): Promise<T> {
  if (!isApiConfigured()) {
    throw new Error('VITE_API_URL is not configured. Please set VITE_API_URL in your environment.');
  }

  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const method = (options.method || 'GET').toUpperCase();
  const isGetRequest = method === 'GET';

  const maxRetries = isGetRequest ? 2 : 0;
  let attempt = 0;

  while (true) {
    try {
      const { response, data } = await executeSingleFetch(url, options, signal);

      // Handle 429 and 503 with Retry-After header
      if (response.status === 429 || response.status === 503) {
        const retryHeader = response.headers.get('Retry-After');
        const retrySec = retryHeader ? parseInt(retryHeader, 10) : response.status === 429 ? 3 : 2;

        if (isGetRequest && attempt < maxRetries) {
          attempt++;
          // Wait for retrySec or exponential backoff + jitter
          const backoffMs = (retrySec || Math.pow(2, attempt)) * 1000 + Math.random() * 200;
          await sleep(backoffMs);
          continue;
        }

        const err: ApiError = new Error(
          response.status === 429
            ? `Rate limit reached. Please wait ${retrySec}s before trying again.`
            : 'Server is currently busy. Please retry shortly.'
        );
        err.status = response.status;
        err.retryAfter = retrySec;
        throw err;
      }

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
        const err: ApiError = new Error(message);
        err.status = response.status;
        throw err;
      }

      // Capture ETag if present and data is an object
      const etag = response.headers.get('ETag');
      if (etag && data && typeof data === 'object' && !Array.isArray(data)) {
        (data as any)._etag = etag.replace(/^"+|"+$/g, '');
      }

      return data as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (signal?.aborted) {
          throw err;
        }
        throw new Error('Request timed out after 15 seconds. Please try again.');
      }

      // Retry GET requests on network failures with exponential backoff and jitter
      if (isGetRequest && attempt < maxRetries && err.name !== 'AbortError' && err.status !== 404 && err.status !== 422) {
        attempt++;
        const backoffMs = Math.min(2000, 200 * Math.pow(2, attempt)) + Math.random() * 150;
        await sleep(backoffMs);
        continue;
      }

      throw err;
    }
  }
}

export async function getLivez(signal?: AbortSignal): Promise<{ status: string; live: boolean }> {
  return request<{ status: string; live: boolean }>('/livez', {}, signal);
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', {}, signal);
}

export async function listEvents(
  params?: {
    limit?: number;
    offset?: number;
    event_type?: string;
  },
  signal?: AbortSignal
): Promise<BackendEventRow[]> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) query.set('limit', String(params.limit));
  if (params?.offset !== undefined) query.set('offset', String(params.offset));
  if (params?.event_type) query.set('event_type', params.event_type);

  const qs = query.toString();
  return request<BackendEventRow[]>(`/api/events${qs ? `?${qs}` : ''}`, {}, signal);
}

export async function getEvent(id: string, signal?: AbortSignal): Promise<BackendEventRow> {
  return request<BackendEventRow>(`/api/events/${encodeURIComponent(id)}`, {}, signal);
}

export async function createEvent(
  payload: {
    name: string;
    event_type: 'wedding' | 'birthday' | 'community';
    event_date?: string | null;
    location?: string | null;
    guest_count?: number | null;
    budget?: number | null;
    plan?: any;
  },
  idempotencyKey?: string,
  signal?: AbortSignal
): Promise<BackendEventRow> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  return request<BackendEventRow>(
    '/api/events',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    },
    signal
  );
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
  }>,
  ifMatchETag?: string,
  signal?: AbortSignal
): Promise<BackendEventRow> {
  const headers: Record<string, string> = {};
  if (ifMatchETag) {
    headers['If-Match'] = `"${ifMatchETag.replace(/^"+|"+$/g, '')}"`;
  }

  return request<BackendEventRow>(
    `/api/events/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    },
    signal
  );
}

export async function deleteEvent(id: string, signal?: AbortSignal): Promise<{ deleted: boolean; id: string }> {
  return request<{ deleted: boolean; id: string }>(
    `/api/events/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
    signal
  );
}

export async function generatePlan(
  payload: {
    event_type: 'wedding' | 'birthday' | 'community';
    budget: number;
    guest_count: number;
    event_date?: string | null;
    event_id?: string;
  },
  signal?: AbortSignal
): Promise<GeneratedPlanResponse> {
  return request<GeneratedPlanResponse>(
    '/api/generate-plan',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    signal
  );
}
