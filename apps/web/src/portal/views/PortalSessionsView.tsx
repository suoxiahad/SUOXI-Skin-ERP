import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  FileText,
  User,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import type { PortalSessionItemDto } from '@suoxi/shared-types';
import { portalApi } from '../api/portalClient.js';
import { usePortalAuth } from '../context/PortalAuthContext.js';

export const PortalSessionsView: React.FC = () => {
  const { language } = usePortalAuth();
  const [sessions, setSessions] = useState<PortalSessionItemDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        const list = await portalApi.getSessions();
        if (mounted) setSessions(list);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load sessions');
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const now = new Date();
  const upcomingList = sessions.filter((s) => s.status === 'scheduled' || new Date(s.date) >= now);
  const pastList = sessions.filter((s) => s.status !== 'scheduled' && new Date(s.date) < now);
  const displayList = activeSubTab === 'upcoming' ? upcomingList : pastList;

  return (
    <div className="space-y-4 pb-6">
      {/* View Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {language === 'bn' ? 'আমার চিকিৎসা সেশনসমূহ' : 'My Treatment Sessions'}
        </h2>
        <p className="text-xs text-slate-500">
          {language === 'bn'
            ? 'আপনার শিডিউল করা সেশন ও পোস্ট-ট্রিটমেন্ট আফটারকেয়ার নির্দেশনা'
            : 'Scheduled appointments and post-procedure care instructions'}
        </p>
      </div>

      {/* Sub-tab pills (44px+ min touch height) */}
      <div className="flex bg-slate-200/70 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveSubTab('upcoming')}
          className={`flex-1 min-h-[44px] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'upcoming'
              ? 'bg-white text-emerald-800 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4 text-emerald-700" />
          <span>
            {language === 'bn' ? 'আসন্ন সেশন' : 'Upcoming'} ({upcomingList.length})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('past')}
          className={`flex-1 min-h-[44px] rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeSubTab === 'past'
              ? 'bg-white text-emerald-800 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>
            {language === 'bn' ? 'পূর্ববর্তী সেশন' : 'Completed'} ({pastList.length})
          </span>
        </button>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          <div className="h-32 bg-white rounded-2xl animate-pulse border border-slate-100" />
          <div className="h-32 bg-white rounded-2xl animate-pulse border border-slate-100" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && displayList.length === 0 && (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-100 shadow-2xs space-y-2">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="font-semibold text-xs text-slate-700">
            {language === 'bn' ? 'কোনো সেশন পাওয়া যায়নি' : 'No sessions found'}
          </p>
          <p className="text-[11px] text-slate-400">
            {language === 'bn'
              ? 'পরবর্তী অ্যাপয়েন্টমেন্ট বুকিংয়ের জন্য ক্লিনিক ফ্রন্ট ডেস্কে যোগাযোগ করুন।'
              : 'Contact our front desk team to book your next session.'}
          </p>
        </div>
      )}

      {/* Session Cards */}
      {!isLoading &&
        !error &&
        displayList.map((s) => (
          <div
            key={s.id}
            className="p-5 rounded-2xl bg-white border border-slate-100 shadow-2xs space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider">
                  {s.sessionNumber}
                </span>
                <h3 className="font-bold text-sm text-slate-800">
                  {language === 'bn' && s.serviceNameBangla ? s.serviceNameBangla : s.serviceName}
                </h3>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                  s.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : s.status === 'scheduled'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {s.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{s.date}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{s.time}</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{s.doctorName}</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{s.branchName}</span>
              </div>
            </div>

            {/* SECURITY RULE: Published Aftercare instructions only */}
            {s.aftercarePublished && s.aftercareInstructions && (
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-xs text-emerald-950 space-y-1">
                <div className="flex items-center gap-1 font-bold text-emerald-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    {language === 'bn' ? 'চিকিৎসোত্তর যত্ন (আফটারকেয়ার)' : 'Post-Treatment Aftercare'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-900/90 whitespace-pre-line">
                  {s.aftercareInstructions}
                </p>
              </div>
            )}
          </div>
        ))}
    </div>
  );
};
