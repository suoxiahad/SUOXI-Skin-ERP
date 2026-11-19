/**
 * SUOXI CRM — Typed API Client
 * 
 * Rules:
 * 1. Base URL from VITE_API_BASE_URL (defaults to /api/v1).
 * 2. credentials: "include" for HttpOnly session cookie transmission.
 * 3. Enforces Section B.5a in-memory CSRF on all mutating methods.
 * 4. Central 401 handler (redirects to login).
 * 5. Handles 403 CSRF_FAILED with one-time refetch and retry rules.
 * 6. Maps 403/404/409/422/429 to localized user-friendly messages.
 */

import {
  getCsrfToken,
  ensureCsrf,
  fetchCsrfToken,
  clearCsrfToken,
  setCsrfToken,
} from './csrf.js';

export interface ApiRequestOptions extends RequestInit {
  idempotencyKey?: string;
  skipCsrf?: boolean;
  isRetry?: boolean;
}

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

let currentActiveBranchId: string | null = null;

export function setActiveBranchId(branchId: string | null): void {
  currentActiveBranchId = branchId;
}

export function getActiveBranchId(): string | null {
  return currentActiveBranchId;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function getBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string') {
    return envUrl.replace(/\/$/, '');
  }
  return '/api/v1';
}

function mapStatusToMessage(statusCode: number, serverMessage?: string): string {
  if (serverMessage && serverMessage.trim().length > 0 && !serverMessage.toLowerCase().includes('internal')) {
    return serverMessage;
  }

  switch (statusCode) {
    case 400:
      return 'Invalid request data. Please check your input.';
    case 401:
      return 'Session expired. Please sign in again.';
    case 403:
      return 'Access denied. You do not have permission to perform this action.';
    case 404:
      return 'Requested resource was not found.';
    case 409:
      return 'State conflict. A request with these details is already being processed.';
    case 422:
      return 'Validation failed. Please verify the provided details.';
    case 423:
      return 'Account locked. Try again in 15 minutes.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${baseUrl}${normalizedPath}`;

  const method = (options.method || 'GET').toUpperCase();
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  // Requirement 7: Active branch sent in X-Branch-Id header on every API request
  if (currentActiveBranchId && !headers.has('X-Branch-Id')) {
    headers.set('X-Branch-Id', currentActiveBranchId);
  }

  if (isMutating && !options.skipCsrf) {
    // 1. Enforce in-memory CSRF token
    const token = await ensureCsrf(baseUrl);
    if (!token) {
      throw new ApiClientError(
        403,
        'CSRF_BLOCKED_CLIENT',
        'CSRF protection token unavailable. Mutation blocked client-side.'
      );
    }
    headers.set('X-CSRF-Token', token);

    // 2. Enforce Content-Type: application/json
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    // 3. Attach Idempotency-Key if provided
    if (options.idempotencyKey) {
      headers.set('Idempotency-Key', options.idempotencyKey);
    }
  }

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      method,
      headers,
      credentials: 'include', // sends and receives HttpOnly session cookies
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiClientError(0, 'NETWORK_ERROR', errorMsg);
  }

  // 4. Handle 401 Unauthorized: discard token and re-fetch per Prompt 2C B.5a
  if (response.status === 401) {
    clearCsrfToken();
    fetchCsrfToken(baseUrl).catch(() => {
      // In-flight or background refresh for subsequent attempts
    });
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
    const errorBody = await response.json().catch(() => null);
    throw new ApiClientError(
      401,
      errorBody?.error?.code || 'UNAUTHORIZED',
      errorBody?.error?.message || 'Incorrect username or password',
      errorBody?.error?.details,
      errorBody?.error?.requestId
    );
  }

  // 5. Handle 403 CSRF_FAILED with strict Section B.5a retry rules
  if (response.status === 403 && !options.isRetry) {
    const errorBody = await response.json().catch(() => null);
    const errorCode = errorBody?.error?.code || '';
    const errorMsg = errorBody?.error?.message || '';

    if (errorCode === 'FORBIDDEN' && errorMsg.includes('CSRF_FAILED')) {
      // Re-fetch token once
      clearCsrfToken();
      let newToken: string;
      try {
        newToken = await fetchCsrfToken(baseUrl);
      } catch {
        throw new ApiClientError(
          403,
          'CSRF_FAILED',
          'Security check expired. Refresh and try again.'
        );
      }

      // Check retry rule: Retry ONLY auth endpoints or requests with Idempotency-Key
      const isAuthEndpoint = normalizedPath.includes('/auth/');
      const hasIdempotency = Boolean(options.idempotencyKey || headers.has('Idempotency-Key'));

      if (isAuthEndpoint || hasIdempotency) {
        return apiRequest<T>(path, {
          ...options,
          isRetry: true,
        });
      } else {
        // Non-idempotent unsafe business mutation: show exact user-facing message
        throw new ApiClientError(
          403,
          'CSRF_EXPIRED',
          'Security check expired. Refresh and try again.'
        );
      }
    }

    throw new ApiClientError(
      403,
      errorCode,
      mapStatusToMessage(403, errorMsg),
      errorBody?.error?.details,
      errorBody?.error?.requestId
    );
  }

  // 6. Handle other error statuses
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const code = errorBody?.error?.code || `HTTP_${response.status}`;
    const serverMessage = errorBody?.error?.message;
    const userMessage = mapStatusToMessage(response.status, serverMessage);

    throw new ApiClientError(
      response.status,
      code,
      userMessage,
      errorBody?.error?.details,
      errorBody?.error?.requestId
    );
  }

  // 7. Parse successful JSON response and unwrap { data, meta }
  if (response.status === 204) {
    return {} as T;
  }

  const json = await response.json();

  // If response contains new csrfToken (after login, logout, change-password), replace it
  if (json?.data?.csrfToken && typeof json.data.csrfToken === 'string') {
    setCsrfToken(json.data.csrfToken);
  }

  // Unwrap envelope
  return (json?.data !== undefined ? json.data : json) as T;
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
