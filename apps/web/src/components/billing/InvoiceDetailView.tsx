import React, { useState, useEffect } from 'react';
import {
  FileText,
  DollarSign,
  Printer,
  Ban,
  ArrowLeft,
  Calendar,
  Building2,
  User,
  ShieldCheck,
  CreditCard,
  Plus,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { billingApi } from '../../api/billing.js';
import type { InvoiceDto, PaymentDto, ReceiptDto } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { RecordPaymentModal } from './RecordPaymentModal.js';
import { ReceiptModal } from './ReceiptModal.js';

interface InvoiceDetailViewProps {
  invoiceId: string;
  onBack: () => void;
  onInvoiceUpdated?: () => void;
}

export const InvoiceDetailView: React.FC<InvoiceDetailViewProps> = ({
  invoiceId,
  onBack,
  onInvoiceUpdated,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';

  const [loading, setLoading] = useState<boolean>(true);
  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showRecordPayment, setShowRecordPayment] = useState<boolean>(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptDto | null>(null);
  const [showVoidDialog, setShowVoidDialog] = useState<boolean>(false);
  const [voidReason, setVoidReason] = useState<string>('');
  const [voiding, setVoiding] = useState<boolean>(false);

  // Refund Modal State
  const [showRefundDialog, setShowRefundDialog] = useState<boolean>(false);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [refunding, setRefunding] = useState<boolean>(false);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingApi.getInvoice(invoiceId);
      setInvoice(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const handleIssue = async () => {
    if (!invoice) return;
    try {
      setLoading(true);
      const updated = await billingApi.issueInvoice(invoice.id);
      setInvoice(updated);
      onInvoiceUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to issue invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice || !voidReason.trim()) return;
    try {
      setVoiding(true);
      const updated = await billingApi.voidInvoice(invoice.id, { voidReason });
      setInvoice(updated);
      setShowVoidDialog(false);
      onInvoiceUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to void invoice');
    } finally {
      setVoiding(false);
    }
  };

  const handleRequestRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoice || !refundReason.trim()) return;
    try {
      setRefunding(true);
      // Fetch payments for this invoice to get sourcePaymentId
      const allPayments = await billingApi.listPayments({ patientId: invoice.patientId });
      const sourcePayment = allPayments.find((p) =>
        p.allocations?.some((a) => a.invoiceId === invoice.id)
      );

      if (!sourcePayment) {
        setError('No active payment allocation found for this invoice to refund');
        return;
      }

      await billingApi.requestRefund({
        sourcePaymentId: sourcePayment.id,
        invoiceId: invoice.id,
        amount: refundAmount || invoice.paidAmount,
        reason: refundReason,
      });

      setShowRefundDialog(false);
      setRefundReason('');
      setRefundAmount('');
      loadInvoice();
      onInvoiceUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to request refund');
    } finally {
      setRefunding(false);
    }
  };

  const handleOpenReceiptForPayment = async (paymentId: string) => {
    try {
      const r = await billingApi.getReceipt(paymentId);
      setSelectedReceipt(r);
    } catch (err: any) {
      setError(err.message || 'Failed to load receipt');
    }
  };

  if (loading && !invoice) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mb-2"></div>
        <p>Loading invoice details...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-8 text-center text-sm text-rose-600">
        <p>Invoice not found or could not be loaded.</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
        >
          Go Back
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    partially_paid: 'bg-amber-50 text-amber-700 border-amber-200',
    unpaid: 'bg-rose-50 text-rose-700 border-rose-200',
    draft: 'bg-slate-100 text-slate-700 border-slate-300',
    void: 'bg-slate-200 text-slate-500 border-slate-300 line-through',
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-mono text-slate-900">{invoice.invoiceNo}</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  statusColors[invoice.status] || 'bg-slate-100 text-slate-700'
                }`}
              >
                {invoice.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {invoice.patientName} ({invoice.patientCode}) • {invoice.branchName}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {invoice.status === 'draft' && (
            <button
              onClick={handleIssue}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition shadow-sm"
            >
              <ShieldCheck className="h-4 w-4" />
              {isBn ? 'ইনভয়েস ইস্যু করুন' : 'Issue Invoice'}
            </button>
          )}

          {invoice.status !== 'void' && invoice.status !== 'draft' && Number(invoice.dueAmount) > 0 && (
            <button
              onClick={() => setShowRecordPayment(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition shadow-sm"
            >
              <DollarSign className="h-4 w-4" />
              {isBn ? 'পেমেন্ট জমা নিন' : 'Record Payment'}
            </button>
          )}

          {Number(invoice.paidAmount) > 0 && (
            <button
              onClick={() => {
                setRefundAmount(invoice.paidAmount);
                setShowRefundDialog(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition"
            >
              <RotateCcw className="h-4 w-4" />
              {isBn ? 'রিফান্ড আবেদন' : 'Request Refund'}
            </button>
          )}

          {invoice.status !== 'void' && Number(invoice.paidAmount) === 0 && (
            <button
              onClick={() => setShowVoidDialog(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-300 text-rose-700 text-sm font-medium hover:bg-rose-50 transition"
            >
              <Ban className="h-4 w-4" />
              {isBn ? 'ইনভয়েস বাতিল' : 'Void Invoice'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Balance Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {isBn ? 'মোট মূল্য' : 'Total Invoiced'}
          </p>
          <p className="text-xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            ৳ {Number(invoice.totalAmount).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Subtotal: ৳{Number(invoice.subtotal).toLocaleString()}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-sm">
          <p className="text-xs font-medium text-emerald-800 uppercase tracking-wider">
            {isBn ? 'পরিশোধিত অর্থ' : 'Received / Paid'}
          </p>
          <p className="text-xl font-bold font-mono text-emerald-700 mt-1 tabular-nums">
            ৳ {Number(invoice.paidAmount).toLocaleString()}
          </p>
          <p className="text-[11px] text-emerald-600 mt-0.5">
            {invoice.status === 'paid' ? 'Fully Paid' : 'Allocated payments'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 shadow-sm">
          <p className="text-xs font-medium text-amber-800 uppercase tracking-wider">
            {isBn ? 'বকেয়া' : 'Remaining Due'}
          </p>
          <p className="text-xl font-bold font-mono text-amber-700 mt-1 tabular-nums">
            ৳ {Number(invoice.dueAmount).toLocaleString()}
          </p>
          <p className="text-[11px] text-amber-600 mt-0.5">
            Due date: {invoice.dueDate || 'N/A'}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {isBn ? 'ছাড় ও ট্যাক্স' : 'Discount / Tax'}
          </p>
          <p className="text-sm font-semibold font-mono text-slate-800 mt-1 tabular-nums">
            Disc: ৳{Number(invoice.discountAmount).toLocaleString()} ({invoice.discountPercent}%)
          </p>
          <p className="text-xs text-slate-500">
            Tax: ৳{Number(invoice.taxAmount).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Invoice Void Notice (if void) */}
      {invoice.status === 'void' && (
        <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 text-sm text-slate-700 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-rose-700">
            <Ban className="h-4 w-4" />
            <span>This invoice was VOIDED and is no longer payable.</span>
          </div>
          <p className="text-xs text-slate-600">
            <span className="font-semibold">Reason:</span> {invoice.voidReason}
          </p>
          <p className="text-xs text-slate-500">
            Voided by {invoice.voidedByName} on {new Date(invoice.voidedAt!).toLocaleString()}
          </p>
        </div>
      )}

      {/* Line Items Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">
            {isBn ? 'ইনভয়েস আইটেম বিস্তারিত' : 'Itemized Services & Packages'}
          </h3>
          <span className="text-xs text-slate-500">
            {invoice.items?.length || 0} line {invoice.items?.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/60 text-xs font-medium text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-6">Description</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4 text-right">Unit Price</th>
                <th className="py-3 px-4 text-right">Line Disc</th>
                <th className="py-3 px-6 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items?.map((it, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-3.5 px-6 font-medium text-slate-900">{it.description}</td>
                  <td className="py-3.5 px-4 text-xs font-semibold capitalize text-slate-600">
                    <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                      {it.itemType}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-mono">
                    ৳ {Number(it.unitPrice).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-mono text-slate-500">
                    ৳ {Number(it.discountAmount).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-6 text-right tabular-nums font-mono font-bold text-slate-900">
                    ৳ {Number(it.lineTotal).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showRecordPayment && (
        <RecordPaymentModal
          patientId={invoice.patientId}
          patientName={invoice.patientName || 'Patient'}
          preselectedInvoiceId={invoice.id}
          onClose={() => setShowRecordPayment(false)}
          onSuccess={(p) => {
            setShowRecordPayment(false);
            loadInvoice();
            onInvoiceUpdated?.();
            handleOpenReceiptForPayment(p.id);
          }}
        />
      )}

      {selectedReceipt && (
        <ReceiptModal
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
        />
      )}

      {/* Void Dialog */}
      {showVoidDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-semibold">
              <Ban className="h-5 w-5" />
              <h3>{isBn ? 'ইনভয়েস বাতিল নিশ্চিতকরণ' : 'Confirm Void Invoice'}</h3>
            </div>
            <p className="text-xs text-slate-600">
              Financial Rule 3 & 6: Invoices cannot be deleted. Voiding will permanently lock this invoice and require an audit reason.
            </p>
            <form onSubmit={handleVoid} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Voiding <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="e.g. Patient changed service before treatment started, corrected invoice issued"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowVoidDialog(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voiding}
                  className="px-4 py-2 rounded-lg bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {voiding ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Refund Dialog */}
      {showRefundDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
              <h3>{isBn ? 'রিফান্ড আবেদন' : 'Request Payment Refund'}</h3>
            </div>
            <p className="text-xs text-slate-600">
              Submit a refund request for supervisor approval. Maximum refundable: ৳{Number(invoice.paidAmount).toLocaleString()}.
            </p>
            <form onSubmit={handleRequestRefund} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Refund Amount (৳) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={invoice.paidAmount}
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm font-mono text-right focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Refund Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Treatment discontinued due to medical advice"
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRefundDialog(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={refunding}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {refunding ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
