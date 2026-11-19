import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  DollarSign,
  Calendar,
  CheckCircle2,
  Clock,
  Ban,
  ArrowRight,
  Eye,
} from 'lucide-react';
import { billingApi } from '../../api/billing.js';
import type { InvoiceDto } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { NewInvoiceModal } from './NewInvoiceModal.js';
import { InvoiceDetailView } from './InvoiceDetailView.js';

export const InvoicesListView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';

  const [loading, setLoading] = useState<boolean>(true);
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  // Modals & Active Views
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await billingApi.listInvoices({
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        branchId: selectedBranch === 'all' ? undefined : selectedBranch,
      });
      setInvoices(list);
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
      setError(err.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedBranch]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // Client search filter
  const filteredInvoices = invoices.filter((inv) => {
    const q = searchQuery.toLowerCase();
    const matchNo = inv.invoiceNo.toLowerCase().includes(q);
    const matchName = inv.patientName?.toLowerCase().includes(q) || false;
    const matchCode = inv.patientCode?.toLowerCase().includes(q) || false;
    return matchNo || matchName || matchCode;
  });

  // Derived Financial Metrics
  const totalInvoiced = filteredInvoices
    .filter((i) => i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.totalAmount), 0);

  const totalCollected = filteredInvoices
    .filter((i) => i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.paidAmount), 0);

  const totalDue = filteredInvoices
    .filter((i) => i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.dueAmount), 0);

  const statusBadges: Record<string, { label: string; labelBn: string; color: string }> = {
    paid: { label: 'Paid', labelBn: 'পরিশোধিত', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partially_paid: { label: 'Partially Paid', labelBn: 'আংশিক পরিশোধিত', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    unpaid: { label: 'Unpaid', labelBn: 'অপরিশোধিত', color: 'bg-rose-50 text-rose-700 border-rose-200' },
    draft: { label: 'Draft', labelBn: 'ড্রাফট', color: 'bg-slate-100 text-slate-700 border-slate-300' },
    void: { label: 'Void', labelBn: 'বাতিল', color: 'bg-slate-200 text-slate-500 border-slate-300 line-through' },
  };

  // If viewing detail
  if (selectedInvoiceId) {
    return (
      <InvoiceDetailView
        invoiceId={selectedInvoiceId}
        onBack={() => {
          setSelectedInvoiceId(null);
          loadInvoices();
        }}
        onInvoiceUpdated={loadInvoices}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isBn ? 'ইনভয়েস ও বিলিং' : 'Invoices & Billing'}
          </h1>
          <p className="text-sm text-slate-500 font-bengali">
            {isBn
              ? 'ক্লিনিকের সমস্ত চিকিৎসা ও প্যাকেজ ইনভয়েস, বকেয়া এবং অর্থ প্রাপ্তির হিসাব'
              : 'Patient billing, itemized invoices, derived dues, and revenue records'}
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          <span>{isBn ? 'নতুন ইনভয়েস' : 'New Invoice'}</span>
        </button>
      </div>

      {/* KPI Glass Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isBn ? 'মোট ইনভয়েস মূল্য' : 'Total Invoiced'}
            </span>
            <FileText className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900 tabular-nums">
            ৳ {totalInvoiced.toLocaleString()}
          </p>
          <span className="text-xs text-slate-500 mt-0.5 block">
            {filteredInvoices.filter((i) => i.status !== 'void').length} active invoices
          </span>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isBn ? 'মোট গ্রহণকৃত' : 'Total Collected'}
            </span>
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-emerald-700 tabular-nums">
            ৳ {totalCollected.toLocaleString()}
          </p>
          <span className="text-xs text-emerald-600 mt-0.5 block">Derived from verified receipts</span>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-amber-800">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isBn ? 'মোট বকেয়া' : 'Outstanding Due'}
            </span>
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-amber-700 tabular-nums">
            ৳ {totalDue.toLocaleString()}
          </p>
          <span className="text-xs text-amber-600 mt-0.5 block">Awaiting patient settlement</span>
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
            placeholder={isBn ? 'ইনভয়েস নং বা রোগীর নাম খুঁজুন...' : 'Search invoice no, patient name or code...'}
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">{isBn ? 'সকল স্ট্যাটাস' : 'All Statuses'}</option>
            <option value="unpaid">{isBn ? 'অপরিশোধিত (Unpaid)' : 'Unpaid'}</option>
            <option value="partially_paid">{isBn ? 'আংশিক (Partially Paid)' : 'Partially Paid'}</option>
            <option value="paid">{isBn ? 'পরিশোধিত (Paid)' : 'Paid'}</option>
            <option value="draft">{isBn ? 'ড্রাফট (Draft)' : 'Draft'}</option>
            <option value="void">{isBn ? 'বাতিল (Void)' : 'Void'}</option>
          </select>

          {/* Branch Filter */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">{isBn ? 'সকল শাখা' : 'All Branches'}</option>
            <option value="br-dhk-01">Dhanmondi Main Clinic</option>
            <option value="br-dhk-02">Uttara Branch</option>
          </select>

          <button
            onClick={loadInvoices}
            className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600 transition"
            title="Refresh list"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        {loading && invoices.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mb-2"></div>
            <p>Loading invoices...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileText className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              {isBn ? 'কোনো ইনভয়েস পাওয়া যায়নি' : 'No invoices found'}
            </p>
            <p className="text-xs text-slate-500">
              {searchQuery || selectedStatus !== 'all'
                ? 'Try clearing your search or status filter'
                : 'Create an invoice to start tracking clinic billing'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-5">Invoice No</th>
                  <th className="py-3 px-5">Patient</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Paid</th>
                  <th className="py-3 px-4 text-right">Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const badge = statusBadges[inv.status] || {
                    label: inv.status,
                    labelBn: inv.status,
                    color: 'bg-slate-100 text-slate-700',
                  };
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedInvoiceId(inv.id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition"
                    >
                      <td className="py-3.5 px-5 font-mono font-bold text-slate-900">
                        {inv.invoiceNo}
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-slate-900">{inv.patientName}</p>
                        <p className="text-xs font-mono text-slate-400">{inv.patientCode}</p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 text-xs">
                        {inv.invoiceDate}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        ৳ {Number(inv.totalAmount).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-emerald-600 font-semibold tabular-nums">
                        ৳ {Number(inv.paidAmount).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-600 tabular-nums">
                        ৳ {Number(inv.dueAmount).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.color}`}
                        >
                          {isBn ? badge.labelBn : badge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition"
                          title="View Invoice"
                        >
                          <Eye className="h-4 w-4" />
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

      {/* New Invoice Modal */}
      {showNewModal && (
        <NewInvoiceModal
          onClose={() => setShowNewModal(false)}
          onSuccess={(newInv) => {
            setShowNewModal(false);
            loadInvoices();
            setSelectedInvoiceId(newInv.id);
          }}
        />
      )}
    </div>
  );
};
