import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Sparkles,
  AlertCircle,
  FileText,
  CreditCard,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Package,
} from 'lucide-react';
import type { PortalHomeDto } from '@suoxi/shared-types';
import { portalApi } from '../api/portalClient.js';
import { usePortalAuth } from '../context/PortalAuthContext.js';

interface PortalHomeViewProps {
  onNavigateTab: (tab: 'sessions' | 'prescriptions' | 'billing' | 'documents' | 'profile') => void;
}

export const PortalHomeView: React.FC<PortalHomeViewProps> = ({ onNavigateTab }) => {
  const { language } = usePortalAuth();
  const [data, setData] = useState<PortalHomeDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        const homeData = await portalApi.getHome();
        if (mounted) setData(homeData);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load home data');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-28 bg-white/70 rounded-2xl border border-slate-100 shadow-2xs" />
        <div className="h-44 bg-white/70 rounded-2xl border border-slate-100 shadow-2xs" />
        <div className="h-36 bg-white/70 rounded-2xl border border-slate-100 shadow-2xs" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl text-rose-800 text-center space-y-2">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="font-semibold text-sm">
          {language === 'bn' ? 'তথ্য লোড করতে সমস্যা হয়েছে' : 'Failed to load portal data'}
        </p>
        <p className="text-xs text-rose-600">{error}</p>
      </div>
    );
  }

  const displayName = language === 'bn' && data.patientNameBangla ? data.patientNameBangla : data.patientName;
  const greeting = language === 'bn' ? `আসসালামু আলাইকুম, ${displayName}` : `Welcome, ${displayName}`;

  return (
    <div className="space-y-5 pb-6">
      {/* 1. Header Greeting & Welcome Banner */}
      <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-800 to-emerald-900 text-white shadow-md">
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-200 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{language === 'bn' ? 'সুওক্সি পেশেন্ট কেয়ার' : 'Suoxi Patient Care'}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-xs text-emerald-100 opacity-90">
            {language === 'bn'
              ? `আইডি: ${data.patientCode} • আপনার সুস্থ ত্বক ও সুস্থতাই আমাদের লক্ষ্য`
              : `ID: ${data.patientCode} • Dedicated to your skin health and aesthetic wellness`}
          </p>
        </div>

        {/* Decorative soft glass backdrop glow */}
        <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-emerald-500/20 blur-xl pointer-events-none" />
      </div>

      {/* 2. Outstanding Due Banner (If any) */}
      {data.billingSummary.hasOutstandingDue && (
        <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200/80 shadow-2xs flex items-start gap-3 text-amber-900">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-950">
                {language === 'bn' ? 'বকেয়া বিল সংক্রান্ত তথ্য' : 'Pending Payment Reminder'}
              </span>
              <span className="font-extrabold text-amber-800 text-sm">
                ৳ {data.billingSummary.outstandingDue.toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-amber-800/90">
              {language === 'bn'
                ? 'পরবর্তী সেশনের পূর্বে অনুগ্রহ করে ক্লিনিক ক্যাশিয়ারের কাছে আপনার বকেয়া পরিশোধ করুন।'
                : 'Please settle your outstanding due at the front desk cashier before your next appointment.'}
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('billing')}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 underline hover:text-amber-950 cursor-pointer min-h-[44px] py-1"
            >
              <span>{language === 'bn' ? 'বিস্তারিত বিলিং দেখুন' : 'View Invoices & Receipts'}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Next Session Card */}
      <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <Calendar className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {language === 'bn' ? 'পরবর্তী সেশন' : 'Next Session'}
              </h2>
              <span className="text-xs font-semibold text-slate-800">
                {data.nextSession ? data.nextSession.serviceName : (language === 'bn' ? 'কোনো শিডিউল নির্ধারিত নেই' : 'No upcoming session')}
              </span>
            </div>
          </div>
          {data.nextSession && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {data.nextSession.status.toUpperCase()}
            </span>
          )}
        </div>

        {data.nextSession ? (
          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium">{data.nextSession.date}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium">{data.nextSession.time}</span>
            </div>
            <div className="col-span-2 text-slate-600 text-[11px]">
              <span className="font-semibold text-slate-700">
                {language === 'bn' ? 'চিকিৎসক: ' : 'Doctor: '}
              </span>
              {data.nextSession.doctorName} • {data.nextSession.branchName}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-1">
            {language === 'bn'
              ? 'আপনার পরবর্তী সেশনের তারিখ নির্ধারণ করতে ক্লিনিক ফ্রন্ট ডেস্কে যোগাযোগ করুন।'
              : 'Contact our front desk team to book your next consultation or treatment.'}
          </p>
        )}

        {data.nextSession && (
          <button
            type="button"
            onClick={() => onNavigateTab('sessions')}
            className="w-full mt-1 min-h-[44px] py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
          >
            <span>{language === 'bn' ? 'সকল সেশন ও আফটারকেয়ার দেখুন' : 'View Sessions & Aftercare'}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
      </div>

      {/* 4. Package Progress Ring Card */}
      {data.packageProgress && (
        <div className="p-5 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                <Package className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {language === 'bn' ? 'চলতি প্যাকেজ' : 'Active Package'}
                </h3>
                <span className="text-xs font-semibold text-slate-800">
                  {data.packageProgress.packageName}
                </span>
              </div>
            </div>
            {data.packageProgress.isExpiringSoon && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                {language === 'bn' ? 'মেয়াদ শেষ হওয়ার পথে' : 'Expiring Soon'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 pt-2">
            {/* Visual Ring Indicator */}
            <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  strokeWidth="3.8"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-700 transition-all duration-500"
                  strokeDasharray={`${Math.round(
                    (data.packageProgress.completedSessions / data.packageProgress.totalSessions) * 100
                  )}, 100`}
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-xs font-extrabold text-slate-800">
                  {data.packageProgress.remainingSessions}
                </span>
                <span className="block text-[9px] text-slate-400 font-medium">
                  {language === 'bn' ? 'বাকি' : 'left'}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>{language === 'bn' ? 'সম্পন্ন সেশন:' : 'Completed:'}</span>
                <span className="font-semibold text-slate-800">
                  {data.packageProgress.completedSessions} / {data.packageProgress.totalSessions}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>{language === 'bn' ? 'মেয়াদ শেষ:' : 'Expires:'}</span>
                <span className="font-medium text-slate-700">{data.packageProgress.expiryDate}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Quick Shortcut Tiles (44px+ touch targets) */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={() => onNavigateTab('prescriptions')}
          className="min-h-[64px] p-4 rounded-2xl bg-white border border-slate-100 shadow-2xs hover:border-emerald-200 text-left transition-all cursor-pointer flex flex-col justify-between"
        >
          <FileText className="w-5 h-5 text-emerald-700" />
          <div>
            <span className="block font-bold text-xs text-slate-800">
              {language === 'bn' ? 'প্রেসক্রিপশন' : 'Prescriptions'}
            </span>
            <span className="text-[10px] text-slate-400">
              {language === 'bn' ? 'ডাক্তারের নির্দেশ ও ওষুধ' : 'Doctor advice & Rx'}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('billing')}
          className="min-h-[64px] p-4 rounded-2xl bg-white border border-slate-100 shadow-2xs hover:border-emerald-200 text-left transition-all cursor-pointer flex flex-col justify-between"
        >
          <CreditCard className="w-5 h-5 text-teal-600" />
          <div>
            <span className="block font-bold text-xs text-slate-800">
              {language === 'bn' ? 'বিলিং ও রসিদ' : 'Billing & Receipts'}
            </span>
            <span className="text-[10px] text-slate-400">
              {language === 'bn' ? 'ইনভয়েস ও পেমেন্ট হিস্ট্রি' : 'Invoices & history'}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
};
