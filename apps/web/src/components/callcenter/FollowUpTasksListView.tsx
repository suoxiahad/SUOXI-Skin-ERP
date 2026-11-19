import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Search,
  Filter,
  Copy,
  Check,
  User,
  UserCheck,
  PhoneCall,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CheckSquare,
  X,
} from 'lucide-react';
import { callCenterApi } from '../../api/callCenter.js';
import type {
  FollowUpTaskDto,
  FollowUpTaskStatus,
  FollowUpTaskType,
  FollowUpTaskPriority,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { LogCallDrawer } from './LogCallDrawer.js';

export const FollowUpTasksListView: React.FC = () => {
  const { lang } = useI18n();
  const { user } = useAuth();

  // State
  const [tasks, setTasks] = useState<FollowUpTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  // Modals & Actions
  const [selectedTaskForCall, setSelectedTaskForCall] = useState<FollowUpTaskDto | null>(null);
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);

  // Complete task modal
  const [completingTask, setCompletingTask] = useState<FollowUpTaskDto | null>(null);
  const [completeNotes, setCompleteNotes] = useState('');
  const [isSubmittingComplete, setIsSubmittingComplete] = useState(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedMobileId, setCopiedMobileId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callCenterApi.listFollowUpTasks({
        status: statusFilter !== 'all' ? (statusFilter as FollowUpTaskStatus) : undefined,
        task_type: typeFilter !== 'all' ? (typeFilter as FollowUpTaskType) : undefined,
        priority: priorityFilter !== 'all' ? (priorityFilter as FollowUpTaskPriority) : undefined,
        search: searchQuery || undefined,
      });
      setTasks(data);
    } catch (err: any) {
      console.error('Failed to load follow-up tasks:', err);
      setError(err.message || 'Failed to load follow-up tasks');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, priorityFilter, searchQuery]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCopyMobile = (id: string, mobile?: string) => {
    if (!mobile) return;
    navigator.clipboard.writeText(mobile);
    setCopiedMobileId(id);
    setToastMessage(lang === 'bn' ? `মোবাইল নম্বর কপি করা হয়েছে: ${mobile}` : `Copied phone: ${mobile}`);
    setTimeout(() => {
      setCopiedMobileId(null);
      setToastMessage(null);
    }, 2500);
  };

  const handleAssignToMe = async (taskId: string) => {
    try {
      const currentUserId = user?.id || 'usr-call-01';
      await callCenterApi.assignTask(taskId, currentUserId);
      setToastMessage(lang === 'bn' ? 'টাস্কটি আপনার দায়িত্বে নেওয়া হয়েছে।' : 'Task assigned to you.');
      setTimeout(() => setToastMessage(null), 3000);
      fetchTasks();
    } catch (err: any) {
      setToastMessage(err.message || 'Failed to assign task');
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTask) return;
    if (!completeNotes.trim()) {
      alert(lang === 'bn' ? 'অনুগ্রহ করে সমাপ্তির বিবরণ লিখুন।' : 'Please enter completion notes.');
      return;
    }

    setIsSubmittingComplete(true);
    try {
      await callCenterApi.completeTask(completingTask.id, completeNotes.trim());
      setToastMessage(lang === 'bn' ? 'টাস্কটি সফলভাবে সম্পন্ন হয়েছে।' : 'Task marked as completed.');
      setCompletingTask(null);
      setCompleteNotes('');
      setTimeout(() => setToastMessage(null), 3000);
      fetchTasks();
    } catch (err: any) {
      alert(err.message || 'Failed to complete task');
    } finally {
      setIsSubmittingComplete(false);
    }
  };

  // Filter for overdue
  const displayedTasks = tasks.filter((task) => {
    if (onlyOverdue && !task.is_overdue) return false;
    return true;
  });

  const overdueCount = tasks.filter((t) => t.is_overdue && t.status !== 'completed' && t.status !== 'cancelled').length;
  const pendingCount = tasks.filter((t) => t.status === 'open' || (t.status as any) === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const renderPriorityBadge = (priority: FollowUpTaskPriority) => {
    switch (priority) {
      case 'critical':
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
            <AlertCircle className="w-3 h-3 text-red-600" />
            <span>Urgent</span>
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>High</span>
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <span>Medium</span>
          </span>
        );
      case 'low':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <span>Low</span>
          </span>
        );
    }
  };

  const renderStatusBadge = (status: FollowUpTaskStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>{lang === 'bn' ? 'সম্পন্ন' : 'Completed'}</span>
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-700" />
            <span>{lang === 'bn' ? 'চলমান' : 'In Progress'}</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300">
            <span>{lang === 'bn' ? 'বাতিল' : 'Cancelled'}</span>
          </span>
        );
      case 'open':
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

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-18 right-6 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {lang === 'bn' ? 'ফলো-আপ ও কেয়ার টাস্ক ওয়ার্কস্পেস' : 'Follow-Up & Care Tasks'}
              </h1>
              <p className="text-xs text-slate-500">
                {lang === 'bn'
                  ? 'স্বয়ংক্রিয়ভাবে তৈরি ফলো-আপ কিউ: মিসড কল, প্যাকেজ সমাপ্তি, দীর্ঘ অনুপস্থিত রোগী ও পেমেন্ট কিউ'
                  : 'Automated care queues: missed visits, package expirations, inactive patients & payment dues'}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setOnlyOverdue((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-semibold transition-colors shadow-xs ${
              onlyOverdue
                ? 'bg-red-50 border-red-300 text-red-800'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Clock className={`w-3.5 h-3.5 ${onlyOverdue ? 'text-red-600' : 'text-slate-400'}`} />
            <span>
              {lang === 'bn'
                ? `মেয়াদোত্তীর্ণ টাস্ক (${overdueCount})`
                : `Overdue Only (${overdueCount})`}
            </span>
          </button>

          <button
            onClick={fetchTasks}
            disabled={loading}
            className="p-2 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors shadow-xs disabled:opacity-50"
            title="Refresh"
          >
            <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">{lang === 'bn' ? 'অপেক্ষমাণ' : 'Pending'}</span>
          <p className="text-2xl font-bold text-slate-800 mt-1">{pendingCount}</p>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-xs font-semibold text-blue-700 uppercase">{lang === 'bn' ? 'চলমান' : 'In Progress'}</span>
          <p className="text-2xl font-bold text-blue-700 mt-1">{inProgressCount}</p>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-xs font-semibold text-red-700 uppercase">{lang === 'bn' ? 'মেয়াদোত্তীর্ণ' : 'Overdue'}</span>
          <p className="text-2xl font-bold text-red-700 mt-1">{overdueCount}</p>
        </div>
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-xs font-semibold text-emerald-700 uppercase">{lang === 'bn' ? 'সম্পন্ন' : 'Completed'}</span>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{completedCount}</p>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder={lang === 'bn' ? 'টাস্ক শিরোনাম বা রোগী খুঁজুন...' : 'Search task title or patient...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3 text-xs border border-slate-300 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">{lang === 'bn' ? 'সকল স্ট্যাটাস' : 'All Statuses'}</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 px-3 text-xs border border-slate-300 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">{lang === 'bn' ? 'সকল প্রকার' : 'All Task Types'}</option>
              <option value="next_day_call">Next Day Call</option>
              <option value="missed_appointment">Missed Visit</option>
              <option value="cancelled_appointment">Cancelled Visit</option>
              <option value="inactive_patient">Inactive Patient</option>
              <option value="package_expiry">Package Expiry</option>
              <option value="pending_payment">Pending Payment</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="h-10 px-3 text-xs border border-slate-300 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">{lang === 'bn' ? 'সকল অগ্রাধিকার' : 'All Priorities'}</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <Clock className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
            <p className="text-sm font-medium text-slate-600">
              {lang === 'bn' ? 'টাস্ক কিউ লোড হচ্ছে...' : 'Loading follow-up queue...'}
            </p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-600 space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
            <p className="text-sm font-semibold">{error}</p>
            <button
              onClick={fetchTasks}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              {lang === 'bn' ? 'আবার চেষ্টা করুন' : 'Retry'}
            </button>
          </div>
        ) : displayedTasks.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <CheckSquare className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">
              {lang === 'bn' ? 'কোনো টাস্ক পাওয়া যায়নি' : 'No follow-up tasks in queue'}
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {lang === 'bn'
                ? 'আপনার বাছাইকৃত ফিল্টারে কোনো টাস্ক নেই অথবা সব টাস্ক সম্পন্ন হয়েছে।'
                : 'All follow-ups in this queue have been completed or no triggers match.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold tracking-wider uppercase text-[11px]">
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'অগ্রাধিকার ও ধরন' : 'Priority & Type'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'টাস্ক শিরোনাম' : 'Task Details'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'রোগী ও যোগাযোগ' : 'Patient Contact'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'নির্ধারিত সময়' : 'Due Time'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'দায়িত্বপ্রাপ্ত' : 'Assignee'}</th>
                  <th className="py-3.5 px-4">{lang === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                  <th className="py-3.5 px-4 text-right">{lang === 'bn' ? 'পদক্ষেপ' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {displayedTasks.map((task) => {
                  const isCopied = copiedMobileId === task.id;
                  const isOverdue = task.is_overdue && task.status !== 'completed' && task.status !== 'cancelled';

                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-slate-50/70 transition-colors h-14"
                    >
                      {/* Priority & Type */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-start">
                          {renderPriorityBadge(task.priority)}
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {task.task_type.replace('_', ' ')}
                          </span>
                        </div>
                      </td>

                      {/* Title & Notes */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-bold text-slate-900 truncate">
                          {task.title || task.task_type.replace('_', ' ')}
                        </div>
                        {(task.notes || task.resolution_notes) && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {task.notes || task.resolution_notes}
                          </div>
                        )}
                      </td>

                      {/* Patient & Mobile */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">
                          {task.patient_name || 'Anonymous Patient'}
                        </div>
                        {task.patient_mobile && (
                          <button
                            type="button"
                            onClick={() => handleCopyMobile(task.id, task.patient_mobile)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-emerald-700 mt-0.5"
                            title="Click to copy phone"
                          >
                            {isCopied ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-400" />
                            )}
                            <span className={isCopied ? 'text-emerald-700 font-bold' : ''}>
                              {task.patient_mobile}
                            </span>
                          </button>
                        )}
                      </td>

                      {/* Due Time + Overdue Flag (Accessibility: Icon + Explicit Text) */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                        <div className="text-slate-700">{task.due_date ? task.due_date.slice(0, 16).replace('T', ' ') : '—'}</div>
                        {isOverdue && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300 font-bold text-[10px] mt-1">
                            <Clock className="w-3 h-3 text-red-700" />
                            <span>Overdue</span>
                          </div>
                        )}
                      </td>

                      {/* Assignee */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {(task.assigned_name || task.assigned_to_name) ? (
                          <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{task.assigned_name || task.assigned_to_name}</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAssignToMe(task.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <User className="w-3 h-3" />
                            <span>{lang === 'bn' ? 'দায়িত্ব নিন' : 'Assign to Me'}</span>
                          </button>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderStatusBadge(task.status)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {task.patient_mobile && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTaskForCall(task);
                                setIsLogDrawerOpen(true);
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                              title="Log Call Outcome"
                            >
                              <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                            </button>
                          )}

                          {task.status !== 'completed' && task.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => setCompletingTask(task)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{lang === 'bn' ? 'সম্পন্ন' : 'Complete'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Call Drawer for this task */}
      <LogCallDrawer
        isOpen={isLogDrawerOpen}
        onClose={() => {
          setIsLogDrawerOpen(false);
          setSelectedTaskForCall(null);
        }}
        task={selectedTaskForCall}
        onSuccess={() => {
          fetchTasks();
          setToastMessage(lang === 'bn' ? 'কল লগ রেকর্ড সম্পন্ন হয়েছে।' : 'Call outcome logged.');
          setTimeout(() => setToastMessage(null), 3000);
        }}
      />

      {/* Complete Task Modal */}
      {completingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">
                {lang === 'bn' ? 'টাস্ক সম্পন্ন করুন' : 'Mark Follow-up Task as Completed'}
              </h3>
              <button
                onClick={() => setCompletingTask(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCompleteSubmit} className="p-5 space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase">{completingTask.task_type}</span>
                <p className="font-bold text-slate-800 text-sm">
                  {completingTask.title || completingTask.task_type.replace('_', ' ')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  {lang === 'bn' ? 'সমাপ্তির বিবরণ / ফলাফল' : 'Resolution Summary / Notes'} *
                </label>
                <textarea
                  rows={3}
                  required
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  placeholder={
                    lang === 'bn'
                      ? 'টাস্কের সমাধান বা রোগীর সাথে কী সিদ্ধান্ত হলো তা লিখুন...'
                      : 'Describe what action was taken or patient agreement...'
                  }
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCompletingTask(null)}
                  disabled={isSubmittingComplete}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100"
                >
                  {lang === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingComplete}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSubmittingComplete ? 'Saving...' : lang === 'bn' ? 'নিশ্চিত করুন' : 'Confirm Complete'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
