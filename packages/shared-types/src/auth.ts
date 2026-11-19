export interface SessionUserDto {
  id: string;
  username: string;
  email: string;
  phone: string;
  fullName: string;
  fullNameBn?: string;
  roles: string[];
  effectivePermissions: string[];
  branches: Array<{
    id: string;
    code: string;
    name: string;
    nameBn?: string;
    isDefault: boolean;
  }>;
  allBranches: boolean;
  mustChangePassword: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: SessionUserDto;
  csrfToken: string;
}

export interface CsrfTokenResponse {
  csrfToken: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordRequest {
  usernameOrEmail: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
