import React, { useState, useEffect } from 'react';
import {
  FileText,
  Sliders,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  ShieldCheck,
  Building2,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  User,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { StockAdjustment, InventoryItem } from '../../../types/index.ts';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

export const StockMovementLogsView: React.FC = () => {
  const { addToast, language, navigate } = useApp();
  const isBn = language === 'bn';

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Physical Audit Tool State
  const [showAuditTool, setShowAuditTool] = useState(false);
  const [auditItemId, setAuditItemId] = useState('');
  const [physicalCount, setPhysicalCount] = useState<number>(0);
  const [auditNotes, setAuditNotes] = useState('');
  const [isSubmittingAudit, setIsSubmittingAudit] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const [logs, invs] = await Promise.all([
        api.inventory.listAdjustments(),
        api.inventory.list(),
      ]);
      setAdjustments(logs);
      setInventoryList(invs);
      if (invs.length > 0 && !auditItemId) {
        setAuditItemId(invs[0].id);
        setPhysicalCount(invs[0].currentStock);
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'লগ লোড ব্যর্থ' : 'Failed to load stock logs',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = adjustments.filter((adj) => {
    if (typeFilter !== 'all' && adj.adjustmentType !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        adj.itemName.toLowerCase().includes(q) ||
        adj.batchNumber.toLowerCase().includes(q) ||
        adj.adjustedBy.toLowerCase().includes(q) ||
        adj.reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Physical Audit calculations
  const selectedAuditItem = inventoryList.find((i) => i.id === auditItemId);
  const systemStock = selectedAuditItem ? selectedAuditItem.currentStock : 0;
  const auditDelta = physicalCount - systemStock;

  const handleAuditReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAuditItem) return;

    if (auditDelta === 0) {
      addToast({
        type: 'info',
        title: 'Zero Discrepancy',
        description: 'Physical count matches system stock perfectly. No adjustment needed.',
      });
      setShowAuditTool(false);
      return;
    }

    if (!auditNotes.trim()) {
      addToast({
        type: 'error',
        title: 'Notes Required',
        description: 'Please describe discrepancy investigation reason.',
      });
      return;
    }

    setIsSubmittingAudit(true);
    try {
      const res = await api.inventory.adjust({
        itemId: selectedAuditItem.id,
        adjustmentType: 'audit_correction',
        quantityDelta: auditDelta,
        reason: `Physical Audit Reconciliation: System ${systemStock} -> Physical ${physicalCount}. ${auditNotes.trim()}`,
        batchNumber: selectedAuditItem.batchNumber,
      });

      setAdjustments([res.adjustment, ...adjustments]);
      setInventoryList((prev) => prev.map((it) => (it.id === res.item.id ? res.item : it)));

      addToast({
        type: 'success',
        title: isBn ? 'অডিট সমন্বয় সম্পন্ন হয়েছে' : 'Audit Reconciled',
        description: `${selectedAuditItem.name} balanced to physical count ${physicalCount} ${selectedAuditItem.unit}.`,
      });

      setShowAuditTool(false);
      setAuditNotes('');
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: isBn ? 'অডিট সমন্বয় ব্যর্থ' : 'Audit Reconciliation Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsSubmittingAudit(false);
    }
  };

  const getBadgeForType = (type: string) => {
    switch (type) {
      case 'clinic_use':
        return { label: 'In-Clinic Usage', badge: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'restock':
        return { label: 'Stock In / GRN', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      case 'tester':
        return { label: 'Sample / Tester', badge: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'damaged':
        return { label: 'Damaged / Leak', badge: 'bg-rose-50 text-rose-800 border-rose-200' };
      case 'expired':
        return { label: 'Expired Write-off', badge: 'bg-red-50 text-red-800 border-red-200' };
      case 'audit_correction':
        return { label: 'Physical Audit', badge: 'bg-amber-50 text-amber-800 border-amber-200' };
      default:
        return { label: type, badge: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0DA54F]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#0DA54F]">
              {isBn ? 'স্টক মুভমেন্ট ও ক্লিনিক্যাল অডিট' : 'Stock Movements & Audit Trail'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {isBn ? 'ইনভেনটরি লেজার ও ট্র্যাকিং' : 'Inventory Movements & Audit Ledger'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {isBn
              ? 'ক্লিনিক্যাল ট্রিটমেন্টে ব্যবহার, ক্ষতি, মেয়াদোত্তীর্ণ ও ফিজিক্যাল স্টক রিকনসিলিয়েশন অডিট ট্রেইল'
              : 'Tamper-evident audit trail of all procedure consumptions, wastage, testers, and physical count corrections.'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/inventory/stock')}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Layers className="w-4 h-4 text-slate-600" />
            <span>{isBn ? 'স্টক ব্যালেন্স' : 'Stock Balances'}</span>
          </button>
          <button
            onClick={() => setShowAuditTool(!showAuditTool)}
            className="px-3.5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            <span>{showAuditTool ? (isBn ? 'টুল বন্ধ করুন' : 'Close Audit Tool') : (isBn ? 'ফিজিক্যাল স্টক অডিট' : 'Physical Stock Audit')}</span>
          </button>
        </div>
      </div>

      {/* Physical Audit Reconciliation Calculator Tool (Inline Standalone UX) */}
      {showAuditTool && (
        <div className="bg-white rounded-2xl border border-emerald-300 shadow-md p-6 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0DA54F] flex items-center justify-center font-bold">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {isBn ? 'ফিজিক্যাল স্টক অডিট ও কাউন্ট সমন্বয়' : 'Physical Count Reconciliation'}
                </h3>
                <span className="text-[11px] text-slate-400">
                  {isBn ? 'আলমারির বাস্তব সংখ্যা গণনা করে সিস্টেম ব্যালেন্সের সাথে ম্যাচ করুন' : 'Match physical shelf count against live ERP stock'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowAuditTool(false)}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleAuditReconcile} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Product Select */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">{isBn ? 'পণ্য নির্বাচন করুন *' : 'Select Product *'}</label>
                <select
                  required
                  value={auditItemId}
                  onChange={(e) => {
                    setAuditItemId(e.target.value);
                    const it = inventoryList.find((i) => i.id === e.target.value);
                    if (it) setPhysicalCount(it.currentStock);
                  }}
                  className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
                >
                  {inventoryList.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.itemCode}) [System: {inv.currentStock} {inv.unit}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Physical Count Entered */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'ফিজিক্যাল গোনা সংখ্যা (Physical Shelf Count) *' : 'Physical Shelf Count (Units) *'}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={physicalCount}
                  onChange={(e) => setPhysicalCount(parseInt(e.target.value, 10) || 0)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg font-mono font-bold text-sm"
                />
              </div>

              {/* Discrepancy Card */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  auditDelta === 0
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                    : auditDelta < 0
                    ? 'bg-rose-50/70 border-rose-200 text-rose-800'
                    : 'bg-blue-50/70 border-blue-200 text-blue-800'
                }`}
              >
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider">Discrepancy</span>
                  <div className="text-base font-mono font-bold">
                    {auditDelta > 0 ? `+${auditDelta}` : auditDelta} units
                  </div>
                </div>
                <div className="text-[11px] text-right font-medium">
                  {auditDelta === 0
                    ? 'Perfect Balance'
                    : auditDelta < 0
                    ? `Shortage of ${Math.abs(auditDelta)}`
                    : `Surplus of ${auditDelta}`}
                </div>
              </div>

              {/* Investigation Remarks */}
              <div className="md:col-span-3 space-y-1">
                <label className="font-semibold text-slate-700">
                  {isBn ? 'অডিট নোট ও তদন্তের কারণ *' : 'Audit Findings & Investigation Remarks *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly stock take completed by lead aesthetician. Discrepancy noted."
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAuditTool(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isSubmittingAudit}
                className="px-5 py-2 rounded-xl bg-[#0DA54F] hover:bg-[#0a8740] text-white font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmittingAudit ? 'Balancing...' : isBn ? 'সমন্বয় সংরক্ষণ করুন' : 'Confirm & Balance Ledger'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Movement Type Tabs */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {[
              { id: 'all', label: isBn ? 'সকল মুভমেন্ট' : 'All Logs' },
              { id: 'clinic_use', label: isBn ? 'ট্রিটমেন্টে ব্যবহার' : 'In-Clinic Use' },
              { id: 'restock', label: isBn ? 'স্টক ইন / GRN' : 'Stock In / GRN' },
              { id: 'tester', label: isBn ? 'টেস্টার / ডিসপ্লে' : 'Testers' },
              { id: 'damaged', label: isBn ? 'নষ্ট / ড্যামেজ' : 'Damaged' },
              { id: 'audit_correction', label: isBn ? 'ফিজিক্যাল অডিট' : 'Audit Balancing' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                  typeFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={isBn ? 'পণ্য, ব্যাচ বা স্টাফ দিয়ে খুঁজুন...' : 'Search logs by item, batch, staff...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0DA54F] focus:bg-white w-64"
              />
            </div>
            <button
              onClick={fetchLogs}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Refresh logs"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Movement Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton cols={6} rows={6} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            title={isBn ? 'কোনো মুভমেন্ট লগ পাওয়া যায়নি' : 'No Movement Logs Recorded'}
            description={
              isBn
                ? 'ফিল্টার পরিবর্তন করুন অথবা স্টক অ্যাডজাস্টমেন্ট রেকর্ড করুন'
                : 'Adjust stock or record procedural consumption to populate audit entries.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Timestamp & Staff</th>
                  <th className="py-3 px-4">Item & Batch</th>
                  <th className="py-3 px-4">Movement Type</th>
                  <th className="py-3 px-4">Delta Units</th>
                  <th className="py-3 px-4">Balance After</th>
                  <th className="py-3 px-4">Audit Reason & Justification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => {
                  const typeInfo = getBadgeForType(log.adjustmentType);
                  const isPositive = log.quantityDelta > 0;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {formatDateDhaka(log.adjustedAt)}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{log.adjustedBy}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{log.itemName}</div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          Batch: {log.batchNumber}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${typeInfo.badge}`}
                        >
                          {typeInfo.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-sm">
                        <div className="flex items-center gap-1">
                          {isPositive ? (
                            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-rose-600" />
                          )}
                          <span className={isPositive ? 'text-emerald-700' : 'text-rose-700'}>
                            {isPositive ? `+${log.quantityDelta}` : log.quantityDelta}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {log.balanceAfter} units
                      </td>

                      <td className="py-3 px-4 max-w-xs text-slate-600 text-[11px] leading-relaxed">
                        {log.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
