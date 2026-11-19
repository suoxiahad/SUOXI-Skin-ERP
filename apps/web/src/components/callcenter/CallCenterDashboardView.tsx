import React, { useState, useEffect, useCallback } from 'react';
import {
  PhoneCall,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Search,
  Filter,
  Copy,
  Check,
  Calendar,
  User,
  Stethoscope,
  Sparkles,
  Sliders,
  Send,
  MessageSquare,
  PhoneOff,
  PhoneForwarded,
  ShieldAlert,
} from 'lucide-react';
import { callCenterApi } from '../../api/callCenter.js';
import type {
  CallCenterAppointmentDto,
  CallCenterDashboardSummaryDto,
} from '@suoxi/shared-types';

type CallTaskStatus = CallCenterAppointmentDto['call_task_status'];
import { useI18n } from '../../i18n/I18nContext.js';
import { LogCallDrawer } from './LogCallDrawer.js';
import { FollowUpRuleSettingsModal } from './FollowUpRuleSettingsModal.js';
import { FollowUpTasksListView } from './FollowUpTasksListView.js';

export const CallCenterDashboardView: React.FC = () => {
  const { lang } = useI18n();

  // Sub-tab selection: Tomorrow's sessions vs All follow-up tasks
  const [activeSubTab, setActiveSubTab] = useState<'tomorrow' | 'tasks'>('tomorrow');

  // Data states
  const [summary, setSummary] = useState<CallCenterDashboardSummaryDto | null>(null);
  const [appointments, setAppointments] = useState<CallCenterAppointmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [callStatusFilter, setCallStatusFilter] = useState('all');

  // Modals & Drawers
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<CallCenterAppointmentDto | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, apptRes] = await Promise.all([
        callCenterApi.getSummary(),
        callCenterApi.getTomorrowSessions(),
      ]);
      setSummary(sumRes);
      setAppointments(apptRes);
    } catch (err: any) {
      console.error('Failed to load call center data:', err);
      setError(err.message || 'Failed to load call center dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopyMobile = (id: string, mobile: string) => {
    navigator.clipboard.writeText(mobile);
    setCopiedId(id);
    setToastMessage(lang === 'bn' ? `মোবাইল নম্বর কপি করা হয়েছে: ${mobile}` : `Copied phone: ${mobile}`);
    setTimeout(() => {
      setCopiedId(null);
      setToastMessage(null);
    }, 2500);
  };

  const handleOpenLogCall = (appt: CallCenterAppointmentDto) => {
    setSelectedAppointment(appt);
    setIsLogDrawerOpen(true);
  };

  const handleTriggerGenerateTasks = async () => {
    setIsGeneratingTasks(true);
    try {
      const res = await callCenterApi.generateFollowUpTasks();
      setToastMessage(
        lang === 'bn'
          ? `সফলভাবে ${res.generated}টি নতুন টাস্ক তৈরি হয়েছে (${res.skippedDuplicates}টি ডুপ্লিকেট এড়ানো হয়েছে)`
          : `Generated ${res.generated} new follow-up tasks (${res.skippedDuplicates} skipped as duplicates)`
      );
      setTimeout(() => setToastMessage(null), 4000);
      await fetchData();
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to generate tasks');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  // Filtered appointments
  const filteredAppointments = appointments.filter((appt) => {
    const phone = appt.patient_mobile || appt.mobile || '';
    const matchesSearch =
      searchQuery === '' ||
      appt.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      appt.patient_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      phone.includes(searchQuery);

    const matchesDoctor = doctorFilter === 'all' || appt.doctor_name === doctorFilter;
    const matchesCallStatus = callStatusFilter === 'all' || appt.call_task_status === callStatusFilter;

    return matchesSearch && matchesDoctor && matchesCallStatus;
  });

  const doctorsList = Array.from(new Set(appointments.map((a) => a.doctor_name))).filter(Boolean);

  // Status helper badges (Icon + text label, WCAG AA compliant)
  const renderCallStatusBadge = (status: CallTaskStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>{lang === 'bn' ? 'কল সম্পন্ন' : 'Called'}</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-700" />
            <span>{lang === 'bn' ? 'চলমান' : 'In Progress'}</span>
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
            <Clock className="w-3.5 h-3.5 text-red-700" />
            <span>{lang === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Overdue'}</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <Clock className="w-3.5 h-3.5 text-amber-700" />
            <span>{lang === 'bn' ? 'অপেক্ষমাণ' : 'Pending'}</span>
          </span>
        );
    }
  };

  const renderSmsStatusBadge = (status?: string | null) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Delivered</span>
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            <Send className="w-3 h-3 text-blue-600" />
            <span>Sent (Gateway)</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-800 border border-red-200">
            <AlertCircle className="w-3 h-3 text-red-600" />
            <span>Failed</span>
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
            <Clock className="w-3 h-3 text-purple-600" />
            <span>Queued</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
            <span>None</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-18 right-6 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {lang === 'bn' ? "CRM · Followup / পেশেন্ট ফলো-আপ ও কল সেন্টার" : "CRM · Followup / Patient Follow-up & Call Center"}
              </h1>
              <p className="text-xs text-slate-500">
                {lang === 'bn'
                  ? 'ঢাকা সময়ানুসারে প্রতিটি রোগীর ফলো-আপ কল, কনফার্মেশন ও পরিচর্যা পর্যবেক্ষণ (K1 রুল)'
                  : 'Asia/Dhaka wall-clock call worklist for patient follow-ups, confirmations & recovery care.'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsRulesModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors shadow-xs"
            title="Configure follow-up automation rules"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-600" />
            <span>{lang === 'bn' ? 'অটোমেশন রুলস' : 'Rules Settings'}</span>
          </button>

          <button
            onClick={handleTriggerGenerateTasks}
            disabled={isGeneratingTasks}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-emerald-300 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition-colors shadow-xs disabled:opacity-50"
            title="Generate follow-up tasks from appointment triggers"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              {isGeneratingTasks
                ? lang === 'bn' ? 'টাস্ক তৈরি হচ্ছে...' : 'Generating...'
                : lang === 'bn' ? 'টাস্ক জেনারেট করুন' : 'Generate Tasks'}
            </span>
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            title="Refresh"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub-Tabs: Tomorrow's Confirmation vs All Patient Follow-up Tasks */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1 text-xs font-semibold text-slate-600 gap-1 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('tomorrow')}
          className={`py-2 px-4 rounded-lg font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'tomorrow'
              ? 'bg-emerald-600 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          <span>{lang === 'bn' ? 'আগামীকালের সেশন কল' : "Tomorrow's Calls"}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            activeSubTab === 'tomorrow' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {summary ? (summary.tomorrow_pending_count ?? summary.pending) : appointments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('tasks')}
          className={`py-2 px-4 rounded-lg font-medium transition-colors flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'tasks'
              ? 'bg-emerald-600 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{lang === 'bn' ? 'সকল রোগী ফলো-আপ ও কেয়ার টাস্ক' : 'Patient Follow-up Tasks & Reminders'}</span>
        </button>
      </div>

      {activeSubTab === 'tasks' ? (
        <FollowUpTasksListView />
      ) : (
        <>
          {/* 4 Summary Counter Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sessions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {lang === 'bn' ? 'মোট আগামীকালের সেশন' : 'Total Sessions'}
            </p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              {summary ? (summary.tomorrow_total_sessions ?? summary.total) : '—'}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {summary ? `Tomorrow: ${summary.tomorrow_date || 'Dhaka Wall-Clock'}` : 'Calculating...'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        {/* Already Called */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
              {lang === 'bn' ? 'কল সম্পন্ন হয়েছে' : 'Already Called'}
            </p>
            <h3 className="text-2xl font-black text-emerald-700 mt-1">
              {summary ? (summary.tomorrow_called_count ?? summary.called) : '—'}
            </h3>
            <p className="text-[11px] text-emerald-600 mt-0.5">
              {summary && (summary.tomorrow_total_sessions ?? summary.total)
                ? `${Math.round(
                    ((summary.tomorrow_called_count ?? summary.called) /
                      (summary.tomorrow_total_sessions ?? summary.total)) *
                      100
                  )}% completed`
                : '0% completed'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Pending Calls */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
              {lang === 'bn' ? 'কল অপেক্ষমাণ' : 'Pending Calls'}
            </p>
            <h3 className="text-2xl font-black text-amber-700 mt-1">
              {summary ? (summary.tomorrow_pending_count ?? summary.pending) : '—'}
            </h3>
            <p className="text-[11px] text-amber-600 mt-0.5">
              {lang === 'bn' ? 'অবিলম্বে ডায়াল করতে হবে' : 'Immediate queue'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Unreachable / Follow-Up Needed */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider">
              {lang === 'bn' ? 'অপ্রাপ্য / পুনঃকল' : 'Unreachable / Retry'}
            </p>
            <h3 className="text-2xl font-black text-red-700 mt-1">
              {summary ? (summary.tomorrow_unreachable_count ?? summary.unreachable) : '—'}
            </h3>
            <p className="text-[11px] text-red-600 mt-0.5">
              {lang === 'bn' ? 'নো-অ্যানসার বা ব্যস্ত' : 'No answer / busy'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-red-50 text-red-700 flex items-center justify-center">
            <PhoneOff className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder={lang === 'bn' ? 'রোগীর নাম, আইডি বা মোবাইল খুঁজুন...' : 'Search patient name, ID, or phone...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center gap-2">
            <select
              value={doctorFilter}
              onChange={(e) => setDoctorFilter(e.target.value)}
              className="h-10 px-3 text-xs border border-slate-300 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">{lang === 'bn' ? 'সকল চিকিৎসক' : 'All Doctors'}</option>
              {doctorsList.map((doc) => (
                <option key={doc} value={doc}>
                  {doc}
                </option>
              ))}
            </select>

            <select
              value={callStatusFilter}
              onChange={(e) => setCallStatusFilter(e.target.value)}
              className="h-10 px-3 text-xs border border-slate-300 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">{lang === 'bn' ? 'সকল কল স্ট্যাটাস' : 'All Call Statuses'}</option>
              <option value="pending">{lang === 'bn' ? 'Pending (অপেক্ষমাণ)' : 'Pending'}</option>
              <option value="in_progress">{lang === 'bn' ? 'In Progress (চলমান)' : 'In Progress'}</option>
              <option value="completed">{lang === 'bn' ? 'Completed (সম্পন্ন)' : 'Completed'}</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <Clock className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
            <p className="text-sm font-medium text-slate-600">
              {lang === 'bn' ? 'আগামীকালের সেশন তালিকা লোড হচ্ছে...' : "Loading tomorrow's session queue..."}
            </p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-600 space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
            <p className="text-sm font-semibold">{error}</p>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              {lang === 'bn' ? 'আবার চেষ্টা করুন' : 'Retry'}
            </button>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <PhoneCall className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">
              {lang === 'bn' ? 'কোনো সেশন পাওয়া যায়নি' : 'No sessions found'}
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || doctorFilter !== 'all' || callStatusFilter !== 'all'
                ? lang === 'bn' ? 'ফিল্টার পরিবর্তন করে পুনরায় চেষ্টা করুন।' : 'Try clearing active filters.'
                : lang === 'bn' ? 'আগামীকালের জন্য কোনো অ্যাপয়েন্টমেন্ট শিডিউল করা নেই।' : 'No appointments scheduled for tomorrow.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold tracking-wider uppercase text-[11px]">
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'সময় (ঢাকা)' : 'Time'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'রোগী' : 'Patient'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'মোবাইল' : 'Mobile'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'ডাক্তার ও সেবা' : 'Doctor & Service'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'অ্যাপয়েন্টমেন্ট স্ট্যাটাস' : 'Appointment Status'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'কল টাস্ক' : 'Call Status'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'এসএমএস স্ট্যাটাস' : 'SMS Status'}</th>
                  <th className="py-3.5 px-4 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAppointments.map((appt) => {
                  const rowId = appt.appointment_id || appt.id || 'apt-row';
                  const isCopied = copiedId === rowId;
                  const mobileNumber = appt.patient_mobile || appt.mobile || '';
                  return (
                    <tr
                      key={rowId}
                      className="hover:bg-slate-50/70 transition-colors h-14"
                    >
                      {/* Time */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{appt.start_time.slice(0, 5)}</span>
                        </div>
                      </td>

                      {/* Patient */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{appt.patient_name}</div>
                        <div className="text-[11px] font-mono text-slate-500 font-medium">
                          {appt.patient_code}
                        </div>
                      </td>

                      {/* Mobile with tap-to-copy */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCopyMobile(rowId, mobileNumber)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-slate-800 font-mono text-xs shadow-2xs group"
                          title="Click to copy phone number"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
                          )}
                          <span className={isCopied ? 'text-emerald-800 font-semibold' : ''}>
                            {mobileNumber}
                          </span>
                        </button>
                      </td>

                      {/* Doctor & Service */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 flex items-center gap-1.5">
                          <Stethoscope className="w-3 h-3 text-slate-400" />
                          <span>{appt.doctor_name || 'Staff Doctor'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          {appt.service_name || 'Consultation / Session'}
                        </div>
                      </td>

                      {/* Appointment Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="capitalize text-slate-700 font-medium">
                          {appt.appointment_status}
                        </span>
                      </td>

                      {/* Call Task Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderCallStatusBadge(appt.call_task_status)}
                        {appt.last_call_outcome && (
                          <div className="text-[10px] text-slate-400 mt-0.5 capitalize">
                            Last: {appt.last_call_outcome.replace('_', ' ')}
                          </div>
                        )}
                      </td>

                      {/* SMS Status badge (Strictly independent per Hard Rule 7) */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderSmsStatusBadge(appt.sms_delivery_status || appt.sms_status)}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenLogCall(appt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'কল রেকর্ড' : 'Log Call'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* Log Call Slide-Out Drawer */}
      <LogCallDrawer
        isOpen={isLogDrawerOpen}
        onClose={() => {
          setIsLogDrawerOpen(false);
          setSelectedAppointment(null);
        }}
        appointment={selectedAppointment}
        onSuccess={() => {
          fetchData();
          setToastMessage(lang === 'bn' ? 'কল আউটকাম সংরক্ষিত হয়েছে।' : 'Call outcome logged successfully.');
          setTimeout(() => setToastMessage(null), 3000);
        }}
      />

      {/* Follow-up Rules Settings Modal */}
      <FollowUpRuleSettingsModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        onUpdated={() => {
          fetchData();
        }}
      />
    </div>
  );
};
