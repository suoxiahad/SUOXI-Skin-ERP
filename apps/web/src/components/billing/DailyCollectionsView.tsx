import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Calendar,
  Download,
  Building2,
  RefreshCw,
  AlertCircle,
  CreditCard,
  RotateCcw,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import { billingApi } from '../../api/billing.js';
import type { DailyCollectionReportDto } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

export const DailyCollectionsView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [branchId, setBranchId] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<DailyCollectionReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await billingApi.getDailyCollections(
        date,
        branchId === 'all' ? undefined : branchId
      );
      setReport(data);
    } catch (err: any) {
      console.error('Failed to load collections report:', err);
      setError(err.message || 'Failed to load collections report');
    } finally {
      setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCSV = () => {
    if (!report || report.items.length === 0) return;

    const headers = [
      'Date',
      'Branch',
      'Payment Method',
      'Transactions',
      'Total Received (BDT)',
      'Total Refunded (BDT)',
      'Net Collected (BDT)',
    ];

    const rows = report.items.map((it) => [
      it.collectionDate,
      it.branchName,
      it.paymentMethodName,
      String(it.paymentCount),
      it.totalReceived,
      it.totalRefunded,
      it.netCollected,
    ]);

    // Summary row
    rows.push([
      'TOTAL',
      'All Selected',
      'All Methods',
      String(report.items.reduce((sum, it) => sum + it.paymentCount, 0)),
      report.grandTotalReceived,
      report.grandTotalRefunded,
      report.grandNetCollected,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `daily_collections_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isBn ? 'দৈনিক আদায় রিপোর্ট' : 'Daily Collection Report'}
          </h1>
          <p className="text-sm text-slate-500 font-bengali">
            {isBn
              ? 'পেমেন্ট মেথড ভিত্তিক প্রতিদিনের আয়, রিফান্ড ও নেট ক্যাশ হিসাব'
              : 'End-of-day revenue reconciliation by payment method and branch'}
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={!report || report.items.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition"
        >
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          <span>{isBn ? 'সিএসভি ডাউনলোড' : 'Export CSV (Audited)'}</span>
        </button>
      </div>

      {/* Date & Branch Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">All Branches</option>
            <option value="br-dhk-01">Dhanmondi Main Clinic</option>
            <option value="br-dhk-02">Uttara Branch</option>
          </select>
        </div>

        <button
          onClick={loadReport}
          className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-600 transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isBn ? 'মোট আদায়কৃত' : 'Gross Received'}
            </span>
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-emerald-700 tabular-nums">
            ৳ {Number(report?.grandTotalReceived || 0).toLocaleString()}
          </p>
          <span className="text-xs text-emerald-600 mt-0.5 block">Total payments received</span>
        </div>

        <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/50 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-rose-800">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isBn ? 'মোট রিফান্ড' : 'Total Refunded'}
            </span>
            <RotateCcw className="h-5 w-5 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-rose-700 tabular-nums">
            - ৳ {Number(report?.grandTotalRefunded || 0).toLocaleString()}
          </p>
          <span className="text-xs text-rose-600 mt-0.5 block">Negative payout rows</span>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isBn ? 'নিট সংগ্রহ' : 'Net Collected'}
            </span>
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-emerald-400 tabular-nums">
            ৳ {Number(report?.grandNetCollected || 0).toLocaleString()}
          </p>
          <span className="text-xs text-slate-400 mt-0.5 block">Gross received minus refunds</span>
        </div>
      </div>

      {/* Method Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 text-sm">
            {isBn ? 'পদ্ধতি ভিত্তিক হিসাব' : 'Payment Method Breakdown'}
          </h3>
          <span className="text-xs text-slate-500">Date: {date}</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-emerald-600 border-t-transparent mb-2"></div>
            <p>Computing daily collection totals...</p>
          </div>
        ) : !report || report.items.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CreditCard className="h-10 w-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No collections recorded for this date</p>
            <p className="text-xs text-slate-500">Payments recorded on {date} will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-6">Payment Method</th>
                  <th className="py-3 px-4 text-center">Transactions</th>
                  <th className="py-3 px-4 text-right">Received</th>
                  <th className="py-3 px-4 text-right">Refunds (Negative)</th>
                  <th className="py-3 px-6 text-right">Net Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.items.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-3.5 px-6 font-semibold text-slate-900">
                      {it.paymentMethodName}
                      <span className="text-xs font-mono text-slate-400 ml-2">({it.paymentMethodCode})</span>
                    </td>
                    <td className="py-3.5 px-4 text-center tabular-nums text-slate-600">
                      {it.paymentCount}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-700 font-medium tabular-nums">
                      ৳ {Number(it.totalReceived).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-rose-600 font-medium tabular-nums">
                      {Number(it.totalRefunded) > 0 ? `- ৳ ${Number(it.totalRefunded).toLocaleString()}` : '৳ 0.00'}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-bold text-slate-900 tabular-nums">
                      ৳ {Number(it.netCollected).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                <tr>
                  <td className="py-3.5 px-6">Grand Total</td>
                  <td className="py-3.5 px-4 text-center">
                    {report.items.reduce((sum, it) => sum + it.paymentCount, 0)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-emerald-700">
                    ৳ {Number(report.grandTotalReceived).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-rose-600">
                    - ৳ {Number(report.grandTotalRefunded).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-6 text-right font-mono text-emerald-600 text-base">
                    ৳ {Number(report.grandNetCollected).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
