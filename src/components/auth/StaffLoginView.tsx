import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export const StaffLoginView: React.FC = () => {
  const { login, language, setLanguage } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(language === 'bn' ? 'ইমেইল এবং পাসওয়ার্ড দিন।' : 'Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : language === 'bn'
          ? 'লগইন ব্যর্থ হয়েছে। সঠিক তথ্য দিন।'
          : 'Invalid credentials. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F5F7FA] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
        <div className="bg-slate-900 px-6 py-6 text-white flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#0DA54F] text-xs font-semibold uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>SUOXI Clinical CRM</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              {language === 'bn' ? 'স্টাফ লগইন' : 'Staff Sign In'}
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              {language === 'bn'
                ? 'সুওক্সি স্কিন কেয়ার অ্যান্ড এস্থেটিক সেন্টার, ঢাকা'
                : 'SUOXI Skin Care & Aesthetic Center, Dhaka'}
            </p>
          </div>
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setLanguage('bn')}
              className={`px-2 py-1 rounded-md transition-colors ${
                language === 'bn' ? 'bg-[#0DA54F] text-white font-semibold' : 'text-slate-300'
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2 py-1 rounded-md transition-colors ${
                language === 'en' ? 'bg-[#0DA54F] text-white font-semibold' : 'text-slate-300'
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {language === 'bn' ? 'স্টাফ ইমেইল' : 'Staff Email'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@suoxiclinic.com"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/30 focus:border-[#0DA54F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {language === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/30 focus:border-[#0DA54F]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0DA54F] hover:bg-[#0b8f44] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>
              {submitting
                ? language === 'bn'
                  ? 'যাচাই করা হচ্ছে...'
                  : 'Signing in...'
                : language === 'bn'
                ? 'সাইন ইন করুন'
                : 'Sign In'}
            </span>
          </button>

          <p className="text-[11px] text-center text-slate-400 pt-2">
            {language === 'bn'
              ? 'সকল ক্লিনিকাল অ্যাক্সেস অডিট ও সেশন দ্বারা সুরক্ষিত।'
              : 'All clinical access is protected by encrypted sessions and audit logging.'}
          </p>
        </form>
      </div>
    </div>
  );
};
