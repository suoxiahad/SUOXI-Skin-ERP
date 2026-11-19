/**
 * Patient Portal Dedicated API Client (Prompt 18)
 * Realm: 'portal' (Isolated cookies & CSRF binding)
 */

import type {
  PortalMeDto,
  PortalHomeDto,
  PortalSessionItemDto,
  PortalPrescriptionDto,
  PortalBillingSummaryDto,
  PortalDocumentDto,
  PortalProfileDto,
  PortalProfileUpdateDto,
} from '@suoxi/shared-types';

let portalCsrfToken: string | null = null;

export function getPortalCsrf(): string | null {
  return portalCsrfToken;
}

export function setPortalCsrf(token: string | null): void {
  portalCsrfToken = token;
}

export async function ensurePortalCsrf(): Promise<string> {
  if (portalCsrfToken) return portalCsrfToken;
  const res = await fetch('/portal/auth/csrf', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to obtain portal security token');
  }
  const json = await res.json();
  portalCsrfToken = json.data?.csrfToken || json.csrfToken;
  return portalCsrfToken!;
}

async function portalFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Double-submit CSRF header for mutating requests per B.5a
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const token = await ensurePortalCsrf();
    headers['x-csrf-token'] = token;
    if (options.body && typeof options.body === 'string') {
      headers['content-type'] = 'application/json';
    }
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let errBody: any;
    try {
      errBody = await res.json();
    } catch {
      errBody = { message: res.statusText };
    }
    const message =
      errBody?.error?.message || errBody?.message || `Request failed (${res.status})`;
    const error: any = new Error(message);
    error.statusCode = res.status;
    error.code = errBody?.error?.code || 'PORTAL_ERROR';
    throw error;
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export const portalApi = {
  // Auth
  async getCsrf(): Promise<string> {
    return ensurePortalCsrf();
  },

  async login(loginIdentifier: string, passwordPlain: string): Promise<PortalMeDto> {
    const data = await portalFetch<{ account: PortalMeDto; csrfToken: string }>(
      '/portal/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ loginIdentifier, password: passwordPlain }),
      }
    );
    if (data.csrfToken) {
      setPortalCsrf(data.csrfToken);
    }
    return data.account;
  },

  async setup(token: string, passwordPlain: string): Promise<{ success: boolean; message: string }> {
    return portalFetch('/portal/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ token, password: passwordPlain }),
    });
  },

  async forgot(loginIdentifier: string): Promise<{ success: boolean; message: string }> {
    return portalFetch('/portal/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ loginIdentifier }),
    });
  },

  async reset(token: string, passwordPlain: string): Promise<{ success: boolean; message: string }> {
    return portalFetch('/portal/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password: passwordPlain }),
    });
  },

  async logout(): Promise<void> {
    try {
      await portalFetch('/portal/auth/logout', { method: 'POST' });
    } finally {
      setPortalCsrf(null);
    }
  },

  // Portal User Profile
  async getMe(): Promise<PortalMeDto> {
    return portalFetch<PortalMeDto>('/portal/me');
  },

  // Data views
  async getHome(): Promise<PortalHomeDto> {
    return portalFetch<PortalHomeDto>('/portal/home');
  },

  async getSessions(): Promise<PortalSessionItemDto[]> {
    return portalFetch<PortalSessionItemDto[]>('/portal/sessions');
  },

  async getPrescriptions(): Promise<PortalPrescriptionDto[]> {
    return portalFetch<PortalPrescriptionDto[]>('/portal/prescriptions');
  },

  getPrescriptionPdfUrl(prescriptionId: string): string {
    return `/portal/prescriptions/${prescriptionId}/pdf`;
  },

  async getBilling(): Promise<PortalBillingSummaryDto> {
    return portalFetch<PortalBillingSummaryDto>('/portal/billing');
  },

  async getDocuments(): Promise<PortalDocumentDto[]> {
    return portalFetch<PortalDocumentDto[]>('/portal/documents');
  },

  async getProfile(): Promise<PortalProfileDto> {
    return portalFetch<PortalProfileDto>('/portal/profile');
  },

  async updateProfile(updates: PortalProfileUpdateDto): Promise<PortalProfileDto> {
    return portalFetch<PortalProfileDto>('/portal/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // Contact OTP Verification
  async requestContactOtp(
    changeType: 'mobile' | 'email',
    targetValue: string
  ): Promise<{ success: boolean; message: string; simulatedOtp?: string }> {
    return portalFetch('/portal/verify/request', {
      method: 'POST',
      body: JSON.stringify({ changeType, targetValue }),
    });
  },

  async confirmContactOtp(
    changeType: 'mobile' | 'email',
    targetValue: string,
    otp: string
  ): Promise<{ success: boolean; message: string }> {
    return portalFetch('/portal/verify/confirm', {
      method: 'POST',
      body: JSON.stringify({ changeType, targetValue, otp }),
    });
  },
};
