'use client';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  statusCode: number;
  errorCode: string;
  fieldErrors?: Record<string, string[]>;

  constructor(
    message: string,
    statusCode: number,
    errorCode = 'API_ERROR',
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.fieldErrors = fieldErrors;
  }
}

let accessTokenMemory: string | null = null;
let csrfTokenMemory: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAuthTokens(accessToken: string | null, csrfToken?: string | null) {
  accessTokenMemory = accessToken;
  if (csrfToken !== undefined) {
    csrfTokenMemory = csrfToken;
  }
}

export function getAccessToken(): string | null {
  return accessTokenMemory;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const csrf = csrfTokenMemory || readCookie('erp_csrf_token') || '';
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
      });
      if (!res.ok) {
        accessTokenMemory = null;
        return null;
      }
      const data = await res.json();
      accessTokenMemory = data.accessToken ?? null;
      if (data.csrfToken) csrfTokenMemory = data.csrfToken;
      return accessTokenMemory;
    } catch {
      accessTokenMemory = null;
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string; skipAuthRefresh?: boolean } = {},
): Promise<T> {
  const { idempotencyKey, skipAuthRefresh, headers, ...rest } = options;
  const mergedHeaders: Record<string, string> = {
    ...(rest.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(headers as Record<string, string>),
  };

  if (accessTokenMemory) {
    mergedHeaders['Authorization'] = `Bearer ${accessTokenMemory}`;
  }
  if (idempotencyKey) {
    mergedHeaders['Idempotency-Key'] = idempotencyKey;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: 'include',
    headers: mergedHeaders,
  });

  if (res.status === 401 && !skipAuthRefresh && !path.startsWith('/auth/login')) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      mergedHeaders['Authorization'] = `Bearer ${refreshed}`;
      res = await fetch(`${API_BASE}${path}`, {
        ...rest,
        credentials: 'include',
        headers: mergedHeaders,
      });
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const errBody = typeof body === 'object' && body !== null ? body : { message: String(body) };
    throw new ApiError(
      errBody.message || 'Request failed',
      res.status,
      errBody.errorCode || 'REQUEST_FAILED',
      errBody.fieldErrors,
    );
  }

  return body as T;
}
