/**
 * SUOXI CRM — Argon2id Compliant Password Policy Validator
 *
 * Rules:
 * 1. Minimum 10 characters long
 * 2. At least one uppercase letter (A-Z)
 * 3. At least one lowercase letter (a-z)
 * 4. At least one numeric digit (0-9)
 * 5. At least one special character / symbol
 * 6. No easily guessable / common passwords
 */

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password123!',
  'admin12345',
  'admin12345!',
  'suoxicrm123',
  'suoxicrm123!',
  'welcome123',
  'welcome123!',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'letmein123!',
  'suoxi2026!',
]);

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
  errorBn?: string;
}

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  if (!password || password.length < 10) {
    return {
      valid: false,
      error: 'New password must be at least 10 characters long.',
      errorBn: 'নতুন পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।',
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one uppercase letter (A-Z).',
      errorBn: 'পাসওয়ার্ডে অন্তত একটি বড় হাতের অক্ষর (A-Z) থাকতে হবে।',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one lowercase letter (a-z).',
      errorBn: 'পাসওয়ার্ডে অন্তত একটি ছোট হাতের অক্ষর (a-z) থাকতে হবে।',
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one numeric digit (0-9).',
      errorBn: 'পাসওয়ার্ডে অন্তত একটি সংখ্যা (0-9) থাকতে হবে।',
    };
  }

  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return {
      valid: false,
      error: 'Password must contain at least one symbol or special character (!@#$%^&*...).',
      errorBn: 'পাসওয়ার্ডে অন্তত একটি বিশেষ চিহ্ন (!@#$%^&*...) থাকতে হবে।',
    };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase().trim())) {
    return {
      valid: false,
      error: 'This password is too common or easily guessable. Choose a stronger password.',
      errorBn: 'এই পাসওয়ার্ডটি অত্যন্ত সাধারণ। অনুগ্রহ করে একটি শক্তিশালী পাসওয়ার্ড দিন।',
    };
  }

  return { valid: true };
}
