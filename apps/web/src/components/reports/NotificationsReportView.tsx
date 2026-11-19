import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  RefreshCw,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  RotateCcw,
  Search,
  Filter,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { notificationsApi } from '../../api/notifications.js';
import type {
  NotificationDto,
  NotificationStatus,
  NotificationChannel,
  NotificationReportSummaryDto,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';

export const NotificationsReportView: React.FC = () => {
  const { lang } = useI18n();

  // State
  const [summary, setSummary] = useState<NotificationReportSummaryDto | null>(null);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Action states
  const [isGenerating, setIsGenerating] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [cancellingNotifId, setCancellingNotifId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedNotif, setSelectedNotif] = useState<NotificationDto | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, listRes] = await Promise.all([
        notificationsApi.getSummary(),
        notificationsApi.list({
          status: statusFilter !== 'all' ? (statusFilter as NotificationStatus) : undefined,
          channel: channelFilter !== 'all' ? (channelFilter as NotificationChannel) : undefined,
          search: searchQuery.trim() || undefined,
          page,
          limit: 15,
        }),
      ]);

      if (sumRes) setSummary(sumRes);
      if (Array.isArray(listRes)) {
        setItems(listRes);
        setTotalCount(listRes.length);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load notifications queue');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, channelFilter, searchQuery, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Generate Tomorrow Reminders
  const handleGenerateReminders = async () => {
    setIsGenerating(true);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    try {
      const res = await notificationsApi.generateReminders();
      if (res) {
        const { generated, skipped } = res;
        setActionSuccessMsg(
          `Reminder generation complete: ${generated} queued, ${skipped} skipped (quiet hours, no consent, or invalid phone).`
        );
        fetchData();
      }
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to generate reminders');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Retry
  const handleRetry = async (id: string) => {
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    try {
      await notificationsApi.retry(id);
      setActionSuccessMsg('Notification re-queued for immediate dispatch.');
      fetchData();
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to retry notification');
    }
  };

  // Handle Cancel
  const handleConfirmCancel = async () => {
    if (!cancellingNotifId) return;
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    try {
      await notificationsApi.cancel(cancellingNotifId, cancelReason || 'Cancelled by staff');
      setCancellingNotifId(null);
      setCancelReason('');
      setActionSuccessMsg('Notification cancelled successfully.');
      fetchData();
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to cancel notification');
    }
  };

  // Helper Status Badge
  const renderStatusBadge = (status: NotificationStatus) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Carrier Confirmed
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Send className="w-3 h-3 text-blue-600" />
            Gateway Accepted
          </span>
        );
      case 'sending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 animate-pulse">
            <Clock className="w-3 h-3 text-purple-600" />
            In-Flight
          </span>
        );
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Queued
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Ban className="w-3 h-3 text-slate-500" />
            Cancelled
          </span>
        );
      case 'skipped':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Skipped
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-brand-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-brand-text">
              {lang === 'bn' ? 'বার্তা ও নোটিফিকেশন কিউ' : 'Notification Queue & Delivery Ledger'}
            </h1>
            <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-100 text-emerald-800">
              Prompt 16
            </span>
          </div>
          <p className="text-xs sm:text-sm text-brand-muted mt-1">
            {lang === 'bn'
              ? 'নিয়ম ৭: গেটওয়ে গ্রহণ করলে Status = "Sent", ক্যারিয়ার ডেলিভারি রসিদ আসলে "Delivered"।'
              : 'Hard Rule 7 Compliant: "Sent" = Gateway Accepted. "Delivered" = Carrier Webhook Confirmed.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateReminders}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-primary text-white text-xs font-semibold hover:bg-brand-primary/90 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isGenerating ? 'Generating...' : 'Generate 24h Reminders'}</span>
          </button>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl border border-brand-border bg-white text-brand-muted hover:text-brand-text hover:bg-slate-50 transition-colors cursor-pointer"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications Toast Banner */}
      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {actionErrorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>{actionErrorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionErrorMsg(null)}
            className="text-rose-700 hover:text-rose-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metric Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 bg-white rounded-xl border border-brand-border shadow-2xs">
            <div className="text-[11px] font-semibold text-brand-muted">Total Enqueued</div>
            <div className="text-xl font-bold text-brand-text mt-1">{summary.total}</div>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-amber-200 shadow-2xs bg-amber-50/20">
            <div className="text-[11px] font-semibold text-amber-700">Queued / In-Flight</div>
            <div className="text-xl font-bold text-amber-800 mt-1">
              {summary.queued + summary.sending}
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-blue-200 shadow-2xs bg-blue-50/20">
            <div className="text-[11px] font-semibold text-blue-700">Accepted by Gateway</div>
            <div className="text-xl font-bold text-blue-800 mt-1">{summary.sent}</div>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
            <div className="text-[11px] font-semibold text-emerald-700">Carrier Delivered</div>
            <div className="text-xl font-bold text-emerald-800 mt-1">{summary.delivered}</div>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-brand-border shadow-2xs">
            <div className="text-[11px] font-semibold text-brand-muted">Delivery Rate</div>
            <div className="text-xl font-bold text-brand-primary mt-1">
              {summary.delivery_rate_percent}%
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-rose-200 shadow-2xs bg-rose-50/20">
            <div className="text-[11px] font-semibold text-rose-700">Failed / Retries Exhausted</div>
            <div className="text-xl font-bold text-rose-800 mt-1">{summary.failed}</div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-brand-border shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
            {['all', 'queued', 'sent', 'delivered', 'failed', 'cancelled', 'skipped'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold capitalize whitespace-nowrap transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-brand-primary text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search phone, patient, message ID..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
            />
          </div>
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-xl border border-brand-border shadow-2xs overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-8 text-center text-sm text-brand-muted">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-primary" />
            Loading notification ledger...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-600">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
            {error}
            <div className="mt-3">
              <button
                type="button"
                onClick={fetchData}
                className="px-3 py-1.5 bg-rose-50 text-rose-800 rounded-lg text-xs font-semibold hover:bg-rose-100"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-brand-muted">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            No notifications found matching selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-brand-border text-slate-600 font-semibold">
                  <th className="py-3 px-4">Recipient & Patient</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Status & Rule</th>
                  <th className="py-3 px-4">Message Snippet</th>
                  <th className="py-3 px-4">Gateway Message ID</th>
                  <th className="py-3 px-4">Timestamps</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Recipient */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-brand-text">
                        {item.patient_name || 'Patient'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">{item.recipient}</div>
                    </td>

                    {/* Channel */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {item.channel}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {renderStatusBadge(item.status)}
                      {item.status === 'failed' && item.failure_reason && (
                        <div
                          className="text-[10px] text-rose-600 mt-0.5 truncate max-w-[180px]"
                          title={item.failure_reason}
                        >
                          {item.failure_reason}
                        </div>
                      )}
                      {item.status === 'skipped' && item.skip_reason && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Reason: {item.skip_reason}
                        </div>
                      )}
                    </td>

                    {/* Message Body */}
                    <td className="py-3 px-4 max-w-[260px]">
                      <div
                        className="truncate text-slate-700 cursor-pointer hover:text-brand-primary"
                        onClick={() => setSelectedNotif(item)}
                        title="Click to view full message"
                      >
                        {item.body || '—'}
                      </div>
                    </td>

                    {/* Provider Msg ID */}
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {item.provider_message_id || '—'}
                    </td>

                    {/* Timestamps */}
                    <td className="py-3 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                      {item.delivered_at ? (
                        <div className="text-emerald-700 font-medium">
                          Delivered: {new Date(item.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      ) : item.sent_at ? (
                        <div className="text-blue-700 font-medium">
                          Sent: {new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      ) : (
                        <div>
                          Sched: {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400">
                        {new Date(item.scheduled_at).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {item.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => handleRetry(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-lg text-xs font-semibold border border-amber-200 cursor-pointer transition-colors"
                            title="Retry delivery immediately"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Retry
                          </button>
                        )}

                        {item.status === 'queued' && (
                          <button
                            type="button"
                            onClick={() => setCancellingNotifId(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg text-xs font-semibold border border-rose-200 cursor-pointer transition-colors"
                            title="Cancel queued notification"
                          >
                            <Ban className="w-3 h-3" />
                            Cancel
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedNotif(item)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                          title="View Details"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Message Details Modal */}
      {selectedNotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-brand-border space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-3">
              <h3 className="font-bold text-base text-brand-text">Notification Details</h3>
              <button
                type="button"
                onClick={() => setSelectedNotif(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 font-medium">Recipient:</span>
                  <div className="font-mono text-brand-text">{selectedNotif.recipient}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Patient:</span>
                  <div className="font-medium text-brand-text">
                    {selectedNotif.patient_name || '—'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Channel:</span>
                  <div className="capitalize">{selectedNotif.channel}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Status:</span>
                  <div className="mt-0.5">{renderStatusBadge(selectedNotif.status)}</div>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Message Body:</span>
                <div className="mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {selectedNotif.body}
                </div>
              </div>

              {selectedNotif.failure_reason && (
                <div>
                  <span className="text-rose-500 font-medium">Failure Reason:</span>
                  <div className="mt-1 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
                    {selectedNotif.failure_reason}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-brand-border font-mono text-[11px] text-slate-500">
                <div>ID: {selectedNotif.id}</div>
                <div>Msg ID: {selectedNotif.provider_message_id || 'None'}</div>
                <div>Idempotency: {selectedNotif.idempotency_key}</div>
                <div>Correlation: {selectedNotif.correlation_id}</div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedNotif(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancellingNotifId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-brand-border space-y-4">
            <h3 className="font-bold text-base text-brand-text">Cancel Queued Notification</h3>
            <p className="text-xs text-brand-muted">
              Are you sure you want to cancel this notification? It will not be sent to the patient.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reason for cancellation
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Patient rescheduled by phone"
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingNotifId(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold cursor-pointer"
              >
                Keep Queued
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-3.5 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold cursor-pointer"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
