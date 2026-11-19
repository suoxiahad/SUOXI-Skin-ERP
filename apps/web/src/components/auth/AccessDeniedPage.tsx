import React from 'react';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext.js';

interface AccessDeniedPageProps {
  requiredPermission?: string;
  onGoHome?: () => void;
}

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({
  requiredPermission,
  onGoHome,
}) => {
  const { t, lang } = useI18n();

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4 text-red-600">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h1 className="text-xl font-bold text-slate-900 mb-2">
          {lang === 'bn' ? 'প্রবেশাধিকার সংরক্ষিত' : 'You do not have access'}
        </h1>

        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          {lang === 'bn'
            ? 'আপনার বর্তমান রোল বা শাখার জন্য এই মডিউল বা রেকর্ডটি দেখার অনুমতি নেই। প্রয়োজন হলে সুপার অ্যাডমিন বা ম্যানেজারের সাথে যোগাযোগ করুন।'
            : 'You do not have permission to view or modify this resource. Security and branch scoping are strictly enforced on the server.'}
        </p>

        {requiredPermission && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-6 text-xs text-slate-500 font-mono">
            Required Permission: {requiredPermission}
          </div>
        )}

        {onGoHome && (
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0DA54F] hover:bg-[#0A8740] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>{t.breadcrumbHome || 'Back to Overview'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
