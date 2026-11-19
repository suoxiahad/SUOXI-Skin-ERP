import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { validatePasswordPolicy } from '../../utils/passwordPolicy.js';

export const ForceChangePasswordPage: React.FC = () => {
  const { changePassword, logout, user } = useAuth();
  const { t, lang } = useI18n();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Argon2id compliant policy: min 10 chars, upper, lower, digit, symbol, no common passwords
    const policyResult = validatePasswordPolicy(newPassword);
    if (!policyResult.valid) {
      setErrorMessage(lang === 'bn' && policyResult.errorBn ? policyResult.errorBn : policyResult.error || 'Password policy not met');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage(
        lang === 'bn'
          ? 'নতুন পাসওয়ার্ড এবং নিশ্চিতকরণ পাসওয়ার্ড মেলেনি।'
          : 'New password and confirm password do not match.'
      );
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMessage(
        lang === 'bn'
          ? 'নতুন পাসওয়ার্ডটি আগের পাসওয়ার্ডের চেয়ে ভিন্ন হতে হবে।'
          : 'New password must be different from current password.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update password. Please check your current password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-page flex flex-col justify-center items-center p-4 sm:p-6 relative">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 shadow-md">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto mb-4">
          <KeyRound className="w-7 h-7" />
        </div>

        <h1 className="text-xl font-bold text-center text-slate-900 mb-1">
          {lang === 'bn' ? 'নতুন পাসওয়ার্ড সেট করুন' : 'Set a New Password'}
        </h1>
        <p className="text-xs text-center text-slate-500 mb-6">
          {lang === 'bn'
            ? 'প্রথমবার লগইনের জন্য একটি নতুন সুরক্ষিত পাসওয়ার্ড তৈরি করা বাধ্যতামূলক।'
            : 'For security compliance, you must set a new secure password before accessing the system.'}
        </p>

        {errorMessage && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {lang === 'bn' ? 'বর্তমান পাসওয়ার্ড' : 'Current Password'}
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus-ring"
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {lang === 'bn' ? 'নতুন পাসওয়ার্ড (কমপক্ষে ১০ অক্ষর)' : 'New Password (min 10 characters)'}
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus-ring"
              placeholder="Enter at least 10 characters"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {lang === 'bn' ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm New Password'}
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus-ring"
              placeholder="Re-enter new password"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-[#0DA54F] hover:bg-[#0A8740] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>{lang === 'bn' ? 'পাসওয়ার্ড পরিবর্তন করুন' : 'Change Password & Proceed'}</span>
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={logout}
            className="text-xs text-slate-500 hover:text-red-600 font-medium cursor-pointer"
          >
            {t.signOut}
          </button>
        </div>
      </div>
    </div>
  );
};
