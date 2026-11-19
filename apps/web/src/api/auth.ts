import { api } from './client.js';
import type {
  SessionUserDto,
  LoginRequest,
  LoginResponse,
  CsrfTokenResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from '@suoxi/shared-types';

export const authApi = {
  getCsrf: () => api.get<CsrfTokenResponse>('/auth/csrf', { skipCsrf: true }),
  
  getMe: () => api.get<SessionUserDto>('/auth/me'),

  login: (credentials: LoginRequest) =>
    api.post<LoginResponse>('/auth/login', credentials),

  logout: () =>
    api.post<{ success: boolean; csrfToken: string }>('/auth/logout', {}),

  changePassword: (data: ChangePasswordRequest) =>
    api.post<{ success: boolean; csrfToken: string }>('/auth/change-password', data),

  forgotPassword: (data: ForgotPasswordRequest) =>
    api.post<{ message: string }>('/auth/forgot-password', data),

  resetPassword: (data: ResetPasswordRequest) =>
    api.post<{ message: string }>('/auth/reset-password', data),
};
