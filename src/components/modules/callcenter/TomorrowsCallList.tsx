import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  CheckCircle,
  Clock,
  Send,
  AlertCircle,
  FileText,
  User,
  Phone,
  RefreshCw,
  Calendar,
  Lock,
  MessageSquare,
  Search,
  Check,
  CalendarCheck,
  CheckCircle2,
  PhoneIncoming,
  RotateCcw,
  MessageCircle,
  UserCheck,
  Tag,
  ArrowRight,
  X,
  History,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { CallCenterTask, CallStatus, SmsStatus, CallOutcome, PatientIntent, FollowupPurpose } from '../../../types/index.ts';
import { formatTime12h, formatDateDhaka, getStatusBadgeClass } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

export const TomorrowsCallList: React.FC = () => {
  const { addToast, currentUser } = useApp();
  const [tasks, setTasks] = useState<CallCenterTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'connected' | 'callback' | 'confirmed' | 'rescheduled'>('all');
  const [activeTaskModal, setActiveTaskModal] = useState<CallCenterTask | null>(null);

  // Modal Form States (HubSpot / Zoho CRM Style)
  const [callOutcome, setCallOutcome] = useState<string>('Connected');
  const [patientIntent, setPatientIntent] = useState<string>('Appointment Confirmed');
  const [followupPurpose, setFollowupPurpose] = useState<string>('New Booking Confirmation');
  const [nextFollowupDate, setNextFollowupDate] = useState<string>('');
  const [nextFollowupTime, setNextFollowupTime] = useState<string>('11:00');
  const [callNotes, setCallNotes] = useState('');
  const [smsStatus, setSmsStatus] = useState<SmsStatus>('gateway_accepted');
  const [isSaving, setIsSaving] = useState(false);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const list = await api.callCenter.listTomorrowCalls();
      setTasks(list);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to load followup calls',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const normalizeOutcome = (raw?: string): string => {
    if (!raw) return 'Connected';
    const lower = raw.toLowerCase();
    if (lower === 'connected' || lower.includes('answered')) return 'Connected';
    if (lower === 'busy' || lower.includes('waiting')) return 'Call Waiting';
    if (lower === 'no_answer' || lower.includes('ringing') || lower === 'no answer') return 'No Answer';
    if (lower === 'switched_off' || lower.includes('unreachable') || lower === 'switched off') return 'Switched Off';
    if (lower === 'callback_requested' || lower.includes('callback') || lower === 'call back requested') return 'Call Back Requested';
    if (lower === 'wrong_number' || lower.includes('wrong') || lower === 'wrong number') return 'Wrong Number';
    return raw;
  };

  const normalizeIntent = (raw?: string): string => {
    if (!raw) return 'Follow-up Later';
    const lower = raw.toLowerCase();
    if (lower === 'confirmed' || lower.includes('confirmed')) return 'Appointment Confirmed';
    if (lower === 'rescheduled' || lower.includes('postponed')) return 'Rescheduled';
    if (lower === 'thinking' || lower.includes('follow-up later') || lower.includes('later')) return 'Follow-up Later';
    if (lower === 'not_interested' || lower === 'cancelled' || lower.includes('cancel')) return 'Cancelled';
    if (lower === 'post_care_done' || lower.includes('post-care') || lower.includes('complete')) return 'Post-Care Follow-up Complete';
    return raw;
  };

  const openLogModal = (task: CallCenterTask) => {
    setActiveTaskModal(task);
    const initialOutcome = task.callOutcome
      ? normalizeOutcome(task.callOutcome)
      : task.callStatus === 'confirmed'
      ? 'Connected'
      : task.callStatus === 'no_answer'
      ? 'No Answer'
      : 'Connected';
    const initialIntent = task.patientIntent
      ? normalizeIntent(task.patientIntent)
      : task.callStatus === 'confirmed'
      ? 'Appointment Confirmed'
      : 'Follow-up Later';

    setCallOutcome(initialOutcome);
    setPatientIntent(initialIntent);
    setFollowupPurpose(task.followupPurpose || 'New Booking Confirmation');
    setNextFollowupDate(task.nextFollowupDate || '2026-10-18');
    setNextFollowupTime(task.nextFollowupTime || '11:00');
    setCallNotes(task.callNotes || '');
    setSmsStatus(task.smsStatus || 'gateway_accepted');
  };

  const handleSaveFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTaskModal) return;

    setIsSaving(true);
    try {
      // Map intent and outcome to callStatus for backward compatibility with appointment sync
      let derivedCallStatus: CallStatus = 'call_attempted';
      if (patientIntent === 'Appointment Confirmed' || patientIntent === 'confirmed') derivedCallStatus = 'confirmed';
      else if (patientIntent === 'Rescheduled' || patientIntent === 'rescheduled') derivedCallStatus = 'rescheduled';
      else if (patientIntent === 'Cancelled' || patientIntent === 'not_interested') derivedCallStatus = 'cancelled';
      else if (
        callOutcome === 'No Answer' ||
        callOutcome === 'Switched Off' ||
        callOutcome === 'no_answer' ||
        callOutcome === 'switched_off'
      )
        derivedCallStatus = 'no_answer';

      const updated = await api.callCenter.updateCall(activeTaskModal.id, {
        callStatus: derivedCallStatus,
        smsStatus,
        callNotes: callNotes.trim(),
        callOutcome,
        patientIntent,
        followupPurpose,
        nextFollowupDate: nextFollowupDate || undefined,
        nextFollowupTime: nextFollowupTime || undefined,
      });

      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      addToast({
        type: 'success',
        title: 'Follow-up Logged Successfully!',
        description: `${updated.patientName} — Outcome: ${callOutcome} (Attempt #${updated.callAttempts})`,
      });
      setActiveTaskModal(null);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to save follow-up',
        description: (err as Error).message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper badge styles for Call Outcome
  const getOutcomeBadge = (outcome?: string) => {
    const o = outcome?.toLowerCase() || '';
    if (o.includes('connected') || o.includes('answered')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (o.includes('callback') || o.includes('call back')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (o.includes('waiting') || o.includes('busy')) {
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    }
    if (o.includes('no answer') || o.includes('no_answer')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (o.includes('switched off') || o.includes('switched') || o.includes('unreachable')) {
      return 'bg-orange-50 text-orange-700 border-orange-200';
    }
    if (o.includes('wrong')) {
      return 'bg-slate-100 text-slate-600 border-slate-300';
    }
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  // Helper badge styles for Patient Intent & Status
  const getIntentBadge = (intent?: string) => {
    const i = intent?.toLowerCase() || '';
    if (i.includes('confirmed')) {
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
    if (i.includes('rescheduled')) {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    }
    if (i.includes('cancelled') || i.includes('not_interested') || i.includes('cancel')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (i.includes('post-care') || i.includes('complete') || i.includes('post_care')) {
      return 'bg-teal-50 text-teal-700 border-teal-200';
    }
    return 'bg-sky-50 text-sky-700 border-sky-200';
  };

  // Filter pipeline tabs
  const filteredTasks = tasks.filter((t) => {
    // 1. Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        t.patientName.toLowerCase().includes(q) ||
        t.patientPhone.includes(q) ||
        t.doctorName.toLowerCase().includes(q) ||
        t.serviceName.toLowerCase().includes(q) ||
        (t.callNotes && t.callNotes.toLowerCase().includes(q));
      if (!match) return false;
    }

    // 2. Tab Filter
    const oLower = (t.callOutcome || '').toLowerCase();
    const iLower = (t.patientIntent || '').toLowerCase();

    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return t.callStatus === 'pending' || t.callAttempts === 0;
    if (activeTab === 'connected') return oLower.includes('connected') || t.callStatus === 'confirmed';
    if (activeTab === 'callback') return oLower.includes('callback') || oLower.includes('call back');
    if (activeTab === 'confirmed') return iLower.includes('confirmed') || t.callStatus === 'confirmed';
    if (activeTab === 'rescheduled') return iLower.includes('rescheduled') || t.callStatus === 'rescheduled';
    return true;
  });

  // KPI Metrics
  const totalTasks = tasks.length;
  const pendingCalls = tasks.filter((t) => t.callAttempts === 0 || t.callStatus === 'pending').length;
  const connectedCalls = tasks.filter((t) => (t.callOutcome || '').toLowerCase().includes('connected') || t.callStatus === 'confirmed').length;
  const confirmedCalls = tasks.filter((t) => (t.patientIntent || '').toLowerCase().includes('confirmed') || t.callStatus === 'confirmed').length;
  const callbackCalls = tasks.filter((t) => (t.callOutcome || '').toLowerCase().includes('callback') || (t.callOutcome || '').toLowerCase().includes('call back') || t.callStatus === 'rescheduled').length;

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            CRM · Follow-up
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Patient follow-up pipeline, call outcome, notes & scheduled callbacks
          </p>
        </div>

        <button
          onClick={fetchTasks}
          className="group inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 rounded-xl transition-all duration-200 shadow-xs hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer self-start sm:self-auto"
          title="Refresh patient follow-up pipeline"
        >
          <div className="w-5 h-5 rounded-lg bg-slate-100 group-hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-200 ${isLoading ? 'animate-spin text-[#0DA54F]' : 'group-hover:rotate-45'}`} />
          </div>
          <span>Refresh Pipeline</span>
        </button>
      </div>

      {/* HubSpot/Zoho Pipeline KPI Cards (Premium Modern Dashboard Style) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Follow-ups */}
        <div className="relative overflow-hidden bg-white/95 rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-md hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-slate-100/60 to-slate-200/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 tracking-wider uppercase">Total Follow-ups</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-slate-200 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <PhoneCall className="w-4 h-4 text-slate-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-1.5 tabular-nums font-mono tracking-tight">{totalTasks}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>All queued calls</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-300 group-hover:h-1 transition-all duration-300" />
        </div>

        {/* Pending / To Call */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white via-amber-50/25 to-white rounded-2xl border border-amber-200/80 p-4 shadow-xs hover:shadow-md hover:border-amber-300 hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-amber-200/25 to-amber-100/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-700 tracking-wider uppercase">Pending / To Call</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100/90 text-amber-700 flex items-center justify-center group-hover:bg-amber-200 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <Clock className="w-4 h-4 text-amber-700" />
            </div>
          </div>
          <p className="text-2xl font-bold text-amber-800 mt-1.5 tabular-nums font-mono tracking-tight">{pendingCalls}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-600/90 font-medium">
            <span>Immediate attention</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 group-hover:h-1 transition-all duration-300" />
        </div>

        {/* Connected */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white via-blue-50/25 to-white rounded-2xl border border-blue-200/80 p-4 shadow-xs hover:shadow-md hover:border-blue-300 hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-200/25 to-blue-100/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-blue-700 tracking-wider uppercase">Connected</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100/90 text-blue-700 flex items-center justify-center group-hover:bg-blue-200 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <PhoneIncoming className="w-4 h-4 text-blue-700" />
            </div>
          </div>
          <p className="text-2xl font-bold text-blue-800 mt-1.5 tabular-nums font-mono tracking-tight">{connectedCalls}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-blue-600/90 font-medium">
            <span>Spoke with patient</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 group-hover:h-1 transition-all duration-300" />
        </div>

        {/* Callback / Rescheduled */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white via-purple-50/25 to-white rounded-2xl border border-purple-200/80 p-4 shadow-xs hover:shadow-md hover:border-purple-300 hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-200/25 to-purple-100/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-purple-700 tracking-wider uppercase">Callback / Rescheduled</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100/90 text-purple-700 flex items-center justify-center group-hover:bg-purple-200 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <RotateCcw className="w-4 h-4 text-purple-700" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-800 mt-1.5 tabular-nums font-mono tracking-tight">{callbackCalls}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-purple-600/90 font-medium">
            <span>Next follow-up queued</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 group-hover:h-1 transition-all duration-300" />
        </div>

        {/* Confirmed */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white via-emerald-50/30 to-white rounded-2xl border border-emerald-200/80 p-4 shadow-xs hover:shadow-md hover:border-emerald-300 hover:-translate-y-1 transition-all duration-300 group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-emerald-200/25 to-emerald-100/10 rounded-full blur-xl -mr-4 -mt-4 pointer-events-none group-hover:scale-125 transition-transform duration-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-700 tracking-wider uppercase">Confirmed</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100/90 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-200 group-hover:scale-110 transition-all duration-300 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-800 mt-1.5 tabular-nums font-mono tracking-tight">{confirmedCalls}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-600/90 font-medium">
            <span>Arriving for treatment</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 group-hover:h-1 transition-all duration-300" />
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {[
            { id: 'all', label: 'All Follow-ups' },
            { id: 'pending', label: 'Pending Calls' },
            { id: 'connected', label: 'Connected' },
            { id: 'callback', label: 'Call Back Requested' },
            { id: 'confirmed', label: 'Confirmed' },
            { id: 'rescheduled', label: 'Rescheduled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-[#0DA54F] to-[#0a8740] text-white font-semibold shadow-xs shadow-emerald-600/20 scale-[1.02]'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-slate-200/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient, phone, doctor..."
            className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0DA54F]"
          />
        </div>
      </div>

      {/* Followup Table */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={10} />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          title="No follow-up calls found"
          description="There are currently no patient follow-up calls matching your active filter."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs w-full">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 text-center w-12">SL. NO.</th>
                  <th className="py-3 px-3.5">Patient Name</th>
                  <th className="py-3 px-3.5">Phone Number</th>
                  <th className="py-3 px-3.5">Follow-up Purpose</th>
                  <th className="py-3 px-3.5">Doctor & Service</th>
                  <th className="py-3 px-3.5">Call Outcome</th>
                  <th className="py-3 px-3.5">Patient Intent & Status</th>
                  <th className="py-3 px-3 text-center">Attempts</th>
                  <th className="py-3 px-3.5">Next Follow-up</th>
                  <th className="py-3 px-3.5">Agent / Last Call</th>
                  <th className="py-3 px-3.5">Conversation Note</th>
                  <th className="py-3 px-3.5 text-right sticky right-0 bg-slate-50 border-l border-slate-200/80">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task, index) => {
                  const outcomeBadge = getOutcomeBadge(task.callOutcome || task.callStatus);
                  const intentBadge = getIntentBadge(task.patientIntent);

                  const purpose = task.followupPurpose || 'New Booking Confirmation';
                  const outcomeDisplay = task.callOutcome
                    ? task.callOutcome.replaceAll('_', ' ')
                    : (task.callStatus || 'Pending').replaceAll('_', ' ');
                  const intentDisplay = task.patientIntent
                    ? task.patientIntent.replaceAll('_', ' ')
                    : 'Follow-up Later';

                  const waText = encodeURIComponent(
                    `Hello ${task.patientName}, this is SUOXI Skin Care & Aesthetic Center. Regarding your upcoming appointment with ${task.doctorName} for ${task.serviceName}. Please let us know if you need any assistance.`
                  );
                  const waLink = `https://wa.me/${task.patientPhone.replace(/\D/g, '')}?text=${waText}`;

                  return (
                    <tr
                      key={`task-row-${task.id || ''}-${index}`}
                      className="h-12 hover:bg-slate-50/80 transition-colors"
                    >
                      {/* SL. NO. */}
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500 font-semibold text-[11px]">
                        {(index + 1).toString().padStart(2, '0')}
                      </td>

                      {/* Patient Name */}
                      <td className="py-2.5 px-3.5 font-bold text-slate-900">
                        {task.patientName}
                      </td>

                      {/* Phone Number */}
                      <td className="py-2.5 px-3.5 font-mono font-medium text-slate-700">
                        {task.patientPhone}
                      </td>

                      {/* Follow-up Purpose */}
                      <td className="py-2.5 px-3.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <Tag className="w-3 h-3 text-slate-400" />
                          <span>{purpose}</span>
                        </span>
                      </td>

                      {/* Doctor & Service */}
                      <td className="py-2.5 px-3.5">
                        <div className="font-medium text-slate-800">{task.serviceName}</div>
                        <div className="text-[11px] text-[#0DA54F]">{task.doctorName}</div>
                      </td>

                      {/* Call Outcome */}
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${outcomeBadge}`}
                        >
                          {outcomeDisplay}
                        </span>
                      </td>

                      {/* Patient Intent & Status */}
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${intentBadge}`}
                        >
                          {intentDisplay}
                        </span>
                      </td>

                      {/* Attempts */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                            task.callAttempts === 0
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : task.callAttempts <= 2
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-300'
                          }`}
                        >
                          {task.callAttempts} {task.callAttempts === 1 ? 'call' : 'calls'}
                        </span>
                      </td>

                      {/* Next Follow-up */}
                      <td className="py-2.5 px-3.5 text-slate-700">
                        {task.nextFollowupDate ? (
                          <div className="font-semibold text-slate-900 text-[11px] flex items-center gap-1">
                            <CalendarCheck className="w-3.5 h-3.5 text-[#0DA54F]" />
                            <span>
                              {formatDateDhaka(task.nextFollowupDate)}{' '}
                              {task.nextFollowupTime ? `(${task.nextFollowupTime})` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Not scheduled</span>
                        )}
                      </td>

                      {/* Agent / Last Call */}
                      <td className="py-2.5 px-3.5 text-slate-600 text-[11px]">
                        <div>{task.agentName || 'Tania Khan'}</div>
                        <div className="text-[10px] text-slate-400">
                          {task.lastCalledAt ? formatDateDhaka(task.lastCalledAt.substring(0, 10)) : 'Pending'}
                        </div>
                      </td>

                      {/* Conversation Note */}
                      <td className="py-2.5 px-3.5 text-slate-500 max-w-[180px] truncate" title={task.callNotes}>
                        {task.callNotes || '—'}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3.5 text-right sticky right-0 bg-white border-l border-slate-200/80">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/wa p-2 text-emerald-600 hover:text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/90 rounded-xl transition-all duration-200 border border-emerald-200/80 hover:border-emerald-300 shadow-2xs hover:shadow-xs hover:scale-105 active:scale-95 cursor-pointer"
                            title="Send WhatsApp Follow-up Message"
                          >
                            <MessageCircle className="w-3.5 h-3.5 transition-transform duration-200 group-hover/wa:rotate-6" />
                          </a>

                          <button
                            onClick={() => openLogModal(task)}
                            className="group/btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-[#0DA54F] via-emerald-600 to-[#0a8740] hover:from-[#0c9547] hover:to-[#087337] rounded-xl transition-all duration-200 shadow-xs hover:shadow-md hover:shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer"
                            title="Log Follow-up Call Outcome"
                          >
                            <div className="w-4 h-4 rounded-md bg-white/20 flex items-center justify-center transition-transform duration-200 group-hover/btn:scale-110">
                              <PhoneCall className="w-2.5 h-2.5" />
                            </div>
                            <span>Log Call</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* HubSpot & Zoho CRM Style: Log Follow-up Call Modal             */}
      {/* ============================================================== */}
      {activeTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center">
                  <PhoneCall className="w-5 h-5 text-[#0DA54F]" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">
                    Log Follow-up Call
                  </h2>
                  <p className="text-xs text-slate-500">
                    Record patient interaction, intent, and schedule next follow-up
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveTaskModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Patient Mini Banner */}
            <div className="mx-6 mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-slate-900 text-sm">{activeTaskModal.patientName}</p>
                <p className="text-slate-500 font-mono mt-0.5">{activeTaskModal.patientPhone}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-[#0DA54F]">{activeTaskModal.serviceName}</p>
                <p className="text-slate-500 text-[11px]">{activeTaskModal.doctorName}</p>
              </div>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveFollowup} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
              {/* 1. Call Outcome & Patient Intent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Call Outcome <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  >
                    <option value="Connected">Connected</option>
                    <option value="Call Waiting">Call Waiting</option>
                    <option value="No Answer">No Answer</option>
                    <option value="Switched Off">Switched Off</option>
                    <option value="Call Back Requested">Call Back Requested</option>
                    <option value="Wrong Number">Wrong Number</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Patient Intent & Status <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={patientIntent}
                    onChange={(e) => setPatientIntent(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  >
                    <option value="Appointment Confirmed">Appointment Confirmed</option>
                    <option value="Rescheduled">Rescheduled</option>
                    <option value="Follow-up Later">Follow-up Later</option>
                    <option value="Cancelled">Cancelled</option>
                    <option value="Post-Care Follow-up Complete">Post-Care Follow-up Complete</option>
                  </select>
                </div>
              </div>

              {/* 2. Follow-up Purpose */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Follow-up Purpose
                </label>
                <select
                  value={followupPurpose}
                  onChange={(e) => setFollowupPurpose(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                >
                  <option value="New Booking Confirmation">New Booking Confirmation</option>
                  <option value="Treatment Post-Care Follow-up">Treatment Post-Care Follow-up</option>
                  <option value="Package Session Reminder">Package Session Reminder</option>
                  <option value="Overdue Re-engagement">Overdue Re-engagement</option>
                  <option value="General Clinical Followup">General Clinical Followup</option>
                </select>
              </div>

              {/* 3. Next Follow-up Date & Time (HubSpot & Zoho Core Feature) */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                    <CalendarCheck className="w-3.5 h-3.5 text-[#0DA54F]" />
                    <span>Next Scheduled Follow-up</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium">Automatic Agent Reminder</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-medium text-slate-700 text-[11px] mb-1">
                      Next Follow-up Date
                    </label>
                    <input
                      type="date"
                      value={nextFollowupDate}
                      onChange={(e) => setNextFollowupDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 text-[11px] mb-1">
                      Time Slot
                    </label>
                    <input
                      type="time"
                      value={nextFollowupTime}
                      onChange={(e) => setNextFollowupTime(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Conversation Notes / Remarks */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Conversation Notes & Remarks</span>
                  <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="e.g. Patient confirmed arrival at 4:30 PM with driver. Reminded about pre-treatment sunscreen precautions."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                />
              </div>

              {/* 5. SMS & WhatsApp Communication Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    <span>SMS Gateway Status</span>
                  </label>
                  <select
                    value={smsStatus}
                    onChange={(e) => setSmsStatus(e.target.value as SmsStatus)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  >
                    <option value="gateway_accepted">Gateway Accepted</option>
                    <option value="sent">Delivered (Sent)</option>
                    <option value="pending">Pending Queue</option>
                    <option value="failed">Delivery Failed</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <a
                    href={`https://wa.me/${activeTaskModal.patientPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `Hello ${activeTaskModal.patientName}, this is SUOXI Skin Care & Aesthetic Center. Regarding your upcoming appointment with ${activeTaskModal.doctorName} for ${activeTaskModal.serviceName}. Please let us know if you have any questions.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold text-xs hover:bg-emerald-100 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <span>Send WhatsApp Confirmation</span>
                  </a>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTaskModal(null)}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#0DA54F] hover:bg-[#0a8740] active:bg-[#086c33] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'Saving Record...' : 'Save Follow-up Record'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
