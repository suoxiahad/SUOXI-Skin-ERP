import React, { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  Ban,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CreditCard,
  DollarSign,
  User,
} from 'lucide-react';
import { billingApi } from '../../api/billing.js';
import type { DbId, RefundDto, PaymentMethodDto } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

export const RefundsListView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [refunds, setRefunds] = useState<RefundDto[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mark Paid Dialog State
  const [selectedRefund, setSelectedRefund] = useState<RefundDto | null>(null);
  const [payoutMethodId, setPayoutMethodId] = useState<DbId>('');
  const [payoutTrxRef, setPayoutTrxRef] = useState<string>('');
  const [payoutNotes, setPayoutNotes] = useState<string>('');
  const [markingPaid, setMarkingPaid] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [rList, mList] = await Promise.all([
        billingApi.listRefunds({
          status: selectedStatus === 'all' ? undefined : selectedStatus,
        }),
        billingApi.getPaymentMethods(),
      ]);
      setRefunds(rList);
      setPaymentMethods(mList);
      if (mList.length > 0) {
        const defaultMethod = mList.find((m) => m.code === 'CASH') || mList[0];
        setPayoutMethodId((prev) => prev || defaultMethod.id);
      }
    } catch (err: any) {
      console.error('Failed to load refunds:', err);
      setError(err.message || 'Failed to load refunds');
    } finally {
      setLoading(false);
    }
  }, [selectedStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApprove = async (refundId: string) => {
    try {
      setLoading(true);
      await billingApi.approveRefund(refundId, { notes: 'Approved via refunds management console' });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to approve refund');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRefund) return;
    try {
      setMarkingPaid(true);
      await billingApi.markRefundPaid(selectedRefund.id, {
        refundMethodId: payoutMethodId || undefined,
        transactionReference: payoutTrxRef.trim() || undefined,
        notes: payoutNotes.trim() || undefined,
      });
      setSelectedRefund(null);
      setPayoutTrxRef('');
      setPayoutNotes('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to mark refund as paid');
    } finally {
      setMarkingPaid(false);
    }
  };

  const filteredRefunds = refunds.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchNo = r.refundNo.toLowerCase().includes(q);
    const matchPatient = r.patientName?.toLowerCase().includes(q) || false;
    const matchPay = r.sourcePaymentNo?.toLowerCase().includes(q) || false;
    return matchNo || matchPatient || matchPay;
  });

  const statusBadges: Record<string, { label: string; color: string }> = {
    requested: { label: 'Requested', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    approved: { label: 'Approved', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    paid: { label: 'Disbursed / Paid', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    rejected: { label: 'Rejected', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isBn ? 'পেমেন্ট রিফান্ড ব্যবস্থাপনা' : 'Refunds Management'}
          </h1>
          <p className="text-sm text-slate-500 font-bengali">
            {isBn
              ? '৩-ধাপের রিফান্ড চক্র: আবেদন -> অনুমোদন -> অর্থ প্রদান (অননুমোদিত রিফান্ড সম্পূর্ণ নিষিদ্ধ)'
              : '3-stage clinical refund cycle: Request -> Approve -> Payout with transaction audit'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-600 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isBn ? 'রিফান্ড নং বা রোগীর নাম খুঁজুন...' : 'Search refund no, patient or payment...'}
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="requested">Requested</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Refunds Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {loading && refunds.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mb-2"></div>
            <p>Loading refunds...</p>
          </div>
        ) : filteredRefunds.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <RotateCcw className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No refunds recorded</p>
            <p className="text-xs text-slate-500">Refund requests appear here for supervisor approval and cashier payout.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-5">Refund No</th>
                  <th className="py-3 px-5">Patient</th>
                  <th className="py-3 px-4">Source Payment</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRefunds.map((r) => {
                  const badge = statusBadges[r.status] || { label: r.status, color: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-5 font-mono font-bold text-slate-900">{r.refundNo}</td>
                      <td className="py-3.5 px-5 font-medium text-slate-800">{r.patientName}</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600">{r.sourcePaymentNo}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-600 tabular-nums">
                        ৳ {Number(r.amount).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        {r.status === 'requested' && (
                          <button
                            onClick={() => handleApprove(r.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                        )}
                        {r.status === 'approved' && (
                          <button
                            onClick={() => setSelectedRefund(r)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                          >
                            <DollarSign className="h-3.5 w-3.5" />
                            Mark Paid
                          </button>
                        )}
                        {r.status === 'paid' && (
                          <span className="text-xs text-emerald-700 font-medium">
                            Paid via {r.refundMethodName || 'bKash'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mark Paid Modal */}
      {selectedRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-semibold text-slate-800">
                Disburse Refund: {selectedRefund.refundNo}
              </h3>
              <button onClick={() => setSelectedRefund(null)} className="text-slate-400 hover:text-slate-600">
                ×
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Disbursing ৳ {Number(selectedRefund.amount).toLocaleString()} to {selectedRefund.patientName}.
            </p>

            <form onSubmit={handleMarkPaidSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Disbursement Method
                </label>
                <select
                  value={String(payoutMethodId)}
                  onChange={(e) => setPayoutMethodId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  {paymentMethods.map((m) => (
                    <option key={String(m.id)} value={String(m.id)}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Transaction Reference / TrxID
                </label>
                <input
                  type="text"
                  placeholder="e.g. REF-BKASH-9988 or Bank Slip"
                  value={payoutTrxRef}
                  onChange={(e) => setPayoutTrxRef(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Disbursement Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Handed cash to patient with signature"
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedRefund(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={markingPaid}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {markingPaid ? 'Recording...' : 'Confirm Disbursed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
