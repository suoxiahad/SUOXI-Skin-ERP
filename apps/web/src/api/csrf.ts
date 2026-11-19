/**
 * Section B.5a In-Memory CSRF Token Module
 * 
 * SECURITY MANDATE:
 * - Token is held in volatile memory ONLY (closure variable).
 * - NEVER stored in localStorage, sessionStorage, cookies (readable by JS), URL, or logs.
 * - Auto-refreshes before mutations and on auth state transitions.
 */

let memoryCsrfToken: string | null = null;
let csrfFetchPromise: Promise<string> | null = null;

export function getCsrfToken(): string | null {
  return memoryCsrfToken;
}

export function setCsrfToken(token: string | null): void {
  memoryCsrfToken = token;
}

export function clearCsrfToken(): void {
  memoryCsrfToken = null;
}

export async function fetchCsrfToken(apiBaseUrl = '/api/v1'): Promise<string> {
  const url = `${apiBaseUrl}/auth/csrf`;
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSRF token: HTTP ${response.status}`);
  }

  const json = await response.json();
  const token = json?.data?.csrfToken;

  if (!token || typeof token !== 'string') {
    throw new Error('Malformed CSRF token received from server');
  }

  memoryCsrfToken = token;
  return token;
}

/**
 * Ensures a valid CSRF token is held in memory before mutations or form renders.
 * Deduplicates in-flight requests.
 */
export async function ensureCsrf(apiBaseUrl = '/api/v1'): Promise<string> {
  if (memoryCsrfToken) {
    return memoryCsrfToken;
  }

  if (csrfFetchPromise) {
    return csrfFetchPromise;
  }

  csrfFetchPromise = fetchCsrfToken(apiBaseUrl)
    .finally(() => {
      csrfFetchPromise = null;
    });

  return csrfFetchPromise;
}
