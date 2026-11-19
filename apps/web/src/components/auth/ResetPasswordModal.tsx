import React, { useState, useEffect } from 'react';
import { X, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { authApi } from '../../api/auth.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { validatePasswordPolicy } from '../../utils/passwordPolicy.js';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialToken?: string;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialToken = '',
}) => {
  const { lang } = useI18n();
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialToken) {
      setToken(initialToken);
    }
  }, [initialToken]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const policyResult = validatePasswordPolicy(newPassword);
    if (!policyResult.valid) {
      setErrorMessage(
        lang === 'bn' && policyResult.errorBn ? policyResult.errorBn : policyResult.error || 'Password policy not met'
      );
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

    setIsSubmitting(true);
    try {
      const res = await authApi.resetPassword({
        token: token.trim(),
        newPassword,
      });
      setStatusMessage(res.message || 'Password has been successfully reset.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid, expired, or already-consumed reset token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#0DA54F] flex items-center justify-center mb-3">
          <KeyRound className="w-6 h-6" />
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-1">
          {lang === 'bn' ? 'পাসওয়ার্ড রিসেট ফর্ম' : 'Reset Password'}
        </h2>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          {lang === 'bn'
            ? 'প্রাপ্ত ওয়ান-টাইম সিকিউরিটি টোকেন এবং আপনার নতুন পাসওয়ার্ড প্রদান করুন।'
            : 'Enter the one-time security token and your new password.'}
        </p>

        {statusMessage ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#0DA54F] mt-0.5" />
              <div className="flex-1 font-medium">{statusMessage}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onSuccess();
              }}
              className="w-full py-2 bg-[#0DA54F] text-white font-bold rounded-lg text-xs"
            >
              {lang === 'bn' ? 'লগইন করুন' : 'Proceed to Sign In'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <div>{errorMessage}</div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {lang === 'bn' ? 'রিসেট টোকেন' : 'Reset Token'}
              </label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus-ring"
                placeholder="Paste your reset token"
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
                {lang === 'bn' ? 'পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm Password'}
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

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                {lang === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-[#0DA54F] hover:bg-[#0A8740] text-white text-xs font-bold rounded-xl disabled:opacity-60"
              >
                {isSubmitting ? 'Resetting...' : lang === 'bn' ? 'পাসওয়ার্ড আপডেট করুন' : 'Reset Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
