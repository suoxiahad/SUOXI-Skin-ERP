import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  PlayCircle,
  User,
  Sparkles,
  Search,
  Filter,
  ArrowRight,
  RefreshCw,
  Plus,
  Layers,
  Activity,
} from 'lucide-react';
import { sessionsApi } from '../../api/sessions.js';
import type { TreatmentSessionDto, TreatmentSessionStatus } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';

interface SessionListViewProps {
  onSelectSession?: (sessionId: string) => void;
  onNewSession?: () => void;
}

export const SessionListView: React.FC<SessionListViewProps> = ({
  onSelectSession,
  onNewSession,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';

  const [loading, setLoading] = useState<boolean>(true);
  const [sessions, setSessions] = useState<TreatmentSessionDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await sessionsApi.listSessions({
        status: statusFilter !== 'all' ? (statusFilter as TreatmentSessionStatus) : undefined,
        date: dateFilter || undefined,
      });
      setSessions(data);
    } catch (err: any) {
      console.error('Failed to load treatment sessions:', err);
      setError(err.message || 'Failed to load treatment sessions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFilter]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.sessionCode.toLowerCase().includes(q) ||
      (s.patientName && s.patientName.toLowerCase().includes(q)) ||
      (s.patientCode && s.patientCode.toLowerCase().includes(q)) ||
      (s.serviceName && s.serviceName.toLowerCase().includes(q)) ||
      (s.doctorName && s.doctorName.toLowerCase().includes(q)) ||
      (s.therapistName && s.therapistName.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: TreatmentSessionStatus) => {
    switch (status) {
      case 'planned':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            {isBn ? 'পরিকল্পিত' : 'Planned'}
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <PlayCircle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            {isBn ? 'চলমান' : 'In Progress'}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {isBn ? 'সম্পন্ন' : 'Completed'}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300">
            <XCircle className="w-3.5 h-3.5 text-slate-500" />
            {isBn ? 'বাতিল' : 'Cancelled'}
          </span>
        );
      case 'missed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            {isBn ? 'অনুপস্থিত' : 'Missed'}
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {isBn ? 'ট্রিটমেন্ট সেশন ও থেরাপি রেজিস্টার' : 'Treatment Sessions & Therapy Log'}
              </h1>
              <p className="text-xs text-slate-500">
                {isBn
                  ? 'ক্লিনিকাল সেশনের অগ্রগতি, ফলাফল, আফটারকেয়ার ও পরবর্তী সেশন শিডিউলিং'
                  : 'Procedural session logs, before/after photos, consumable tracking & next session scheduling'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadSessions()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {isBn ? 'রিফ্রেশ' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={
                isBn
                  ? 'রোগীর নাম, আইডি, সেশন কোড বা সার্ভিস খুঁজুন...'
                  : 'Search by patient, code, service, doctor or therapist...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Status Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: isBn ? 'সকল' : 'All' },
              { id: 'planned', label: isBn ? 'পরিকল্পিত' : 'Planned' },
              { id: 'completed', label: isBn ? 'সম্পন্ন' : 'Completed' },
              { id: 'in_progress', label: isBn ? 'চলমান' : 'In Progress' },
              { id: 'missed', label: isBn ? 'মিসড' : 'Missed' },
              { id: 'cancelled', label: isBn ? 'বাতিল' : 'Cancelled' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setStatusFilter(chip.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  statusFilter === chip.id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm text-slate-700">{error}</p>
            <button
              onClick={() => loadSessions()}
              className="px-4 py-2 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100"
            >
              Retry
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              {isBn ? 'কোনো সেশন পাওয়া যায়নি' : 'No treatment sessions found'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {isBn
                ? 'ফিল্টার পরিবর্তন করে পুনরায় চেষ্টা করুন।'
                : 'No session matched the selected filters. Appointments can be converted to treatment sessions.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Session Code</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Treatment Service</th>
                  <th className="py-3 px-4">Session No.</th>
                  <th className="py-3 px-4">Doctor & Therapist</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Next Session</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => onSelectSession?.(session.id)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {session.sessionCode}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{session.patientName || 'Unknown Patient'}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{session.patientCode}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">
                        {isBn && session.serviceNameBn ? session.serviceNameBn : session.serviceName}
                      </div>
                      {session.resourceName && (
                        <div className="text-[11px] text-slate-400">{session.resourceName}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900">
                        Session {session.sessionNo}
                      </span>
                      <span className="text-slate-400"> of {session.totalSessions}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800 font-medium">{session.doctorName}</div>
                      {session.therapistName && (
                        <div className="text-[11px] text-slate-500">Therapist: {session.therapistName}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(session.status)}
                    </td>
                    <td className="py-3 px-4">
                      {session.nextSessionDate ? (
                        <div className="text-emerald-700 font-medium">
                          {session.nextSessionDate} at {session.nextSessionStartTime || 'Scheduled'}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not set</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSession?.(session.id);
                        }}
                        className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-800 font-medium group-hover:translate-x-0.5 transition-transform"
                      >
                        {isBn ? 'বিবরণ' : 'Open'}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
