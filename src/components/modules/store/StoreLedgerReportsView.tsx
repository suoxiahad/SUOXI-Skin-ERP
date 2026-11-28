import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Search,
  RefreshCw,
  Download,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import { formatBDT, formatDateDhaka } from '../../../utils/format.ts';
import type { StoreLedgerEntry, StoreLedgerSummary, StoreMovementType } from '../../../types/index.ts';

const MOVEMENT_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Movements' },
  { value: 'stock_in', label: 'Stock-In (Purchase)' },
  { value: 'internal_issue', label: 'Internal Issue' },
  { value: 'instrument_assign', label: 'Instrument Assign' },
  { value: 'instrument_return', label: 'Instrument Return' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'wastage', label: 'Wastage' },
  { value: 'audit_correction', label: 'Audit Correction' },
];

export const StoreLedgerReportsView: React.FC = () => {
  const { activeBranchId, addToast } = useApp();

  const [entries, setEntries] = useState<StoreLedgerEntry[]>([]);
  const [summary, setSummary] = useState<StoreLedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.store.getLedger({
        branchId: activeBranchId || undefined,
        movementType: movementType !== 'all' ? movementType : undefined,
        search: search.trim() || undefined,
      });
      setEntries(data.entries);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Clinic Store ledger');
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, movementType, search]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const escapeCsvCell = (val: unknown): string => {
    const raw = String(val ?? '');
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Movement Type',
      'Item Code',
      'Item Name',
      'Category',
      'Qty Delta',
      'Balance After',
      'Unit Cost (BDT)',
      'Total Value (BDT)',
      'Department',
      'Room',
      'Reference',
      'Reason',
      'Performed By',
    ];
    const rows = entries.map((e) => [
      formatDateDhaka(e.createdAt),
      e.movementType,
      e.itemCode || '',
      e.itemName,
      e.category,
      e.quantityDelta,
      e.balanceAfter,
      e.unitCostBDT,
      e.totalValueBDT,
      e.department || '',
      e.roomNumber || '',
      e.referenceNo || '',
      e.reason,
      e.performedByName,
    ]);
    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clinic-store-opex-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast({ type: 'success', title: 'CSV Exported', description: `Exported ${entries.length} ledger rows.` });
  };

  const renderMovementBadge = (type: StoreMovementType) => {
    switch (type) {
      case 'stock_in':
      case 'instrument_return':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
            <ArrowDownLeft className="w-3 h-3" />
            {type.replace('_', ' ')}
          </span>
        );
      case 'internal_issue':
      case 'instrument_assign':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[11px] font-semibold">
            <ArrowUpRight className="w-3 h-3" />
            {type.replace('_', ' ')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
            <AlertTriangle className="w-3 h-3" />
            {type.replace('_', ' ')}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Store Ledger &amp; OPEX Reports
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Dedicated operational expenditure (OPEX) ledger, department supply consumption, and stock movement audit trail.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadLedger()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={entries.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Row */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Store Stock Valuation</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
              {formatBDT(summary.totalStockValuationBDT)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {summary.totalItemsCount} SKUs • {summary.lowStockCount + summary.outOfStockCount} alert(s)
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Consumption OPEX</p>
            <p className="text-2xl font-bold text-teal-700 mt-1 tabular-nums">
              {formatBDT(summary.monthlyConsumptionBDT)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Issued supplies this month</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Monthly Store Stock-In</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
              {formatBDT(summary.monthlyStockInBDT)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Purchases received this month</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Instruments in Custody</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
              {summary.instrumentsAssignedCount} / {summary.instrumentsTotalCount}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {summary.instrumentsUnderRepairCount} under maintenance
            </p>
          </div>
        </div>
      )}

      {/* Department & Category Cost Breakdown */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
                Department Consumption OPEX
              </h2>
              <span className="text-[11px] text-slate-400">Issued cost by desk/room</span>
            </div>
            {summary.departmentCosts.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No departmental issues logged yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.departmentCosts.map((dept) => (
                  <div
                    key={dept.department}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{dept.department}</span>
                      <span className="text-[11px] text-slate-400 ml-2">({dept.issueCount} issues)</span>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-teal-700">
                      {formatBDT(dept.costBDT)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Category Stock &amp; Spend Breakdown
              </h2>
              <span className="text-[11px] text-slate-400">Stock on hand vs. monthly issue</span>
            </div>
            {summary.categoryCosts.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No category breakdown available.</p>
            ) : (
              <div className="space-y-2">
                {summary.categoryCosts.map((cat) => (
                  <div
                    key={cat.category}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                  >
                    <span className="font-semibold text-slate-800">{cat.category}</span>
                    <div className="text-right font-mono tabular-nums">
                      <span className="font-bold text-slate-900">{formatBDT(cat.stockValueBDT)}</span>
                      <span className="text-[11px] text-teal-700 ml-2">
                        (Issued: {formatBDT(cat.monthlyIssueBDT)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ledger Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter ledger by item, department, reference no., or reason..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
          />
        </div>
        <select
          value={movementType}
          onChange={(e) => setMovementType(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-teal-500"
        >
          {MOVEMENT_FILTERS.map((mf) => (
            <option key={mf.value} value={mf.value}>
              {mf.label}
            </option>
          ))}
        </select>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-xs text-rose-600">{error}</div>
        ) : loading ? (
          <div className="p-10 text-center text-xs text-slate-500">Loading OPEX ledger...</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">No store ledger movements match your filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Movement</th>
                  <th className="py-3 px-4">Item / Asset</th>
                  <th className="py-3 px-4 text-right">Qty Delta</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4 text-right">Value (BDT)</th>
                  <th className="py-3 px-4">Department / Reference</th>
                  <th className="py-3 px-4">Performed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {formatDateDhaka(entry.createdAt)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{renderMovementBadge(entry.movementType)}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{entry.itemName}</div>
                      <div className="text-[11px] text-slate-400">
                        {entry.itemCode ? `${entry.itemCode} • ` : ''}
                        {entry.reason}
                      </div>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                        entry.quantityDelta > 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {entry.quantityDelta > 0 ? `+${entry.quantityDelta}` : entry.quantityDelta}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {entry.balanceAfter}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatBDT(entry.totalValueBDT)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{entry.department || '—'}</div>
                      <div className="text-[11px] text-slate-400">
                        {entry.roomNumber ? `${entry.roomNumber} • ` : ''}
                        {entry.referenceNo || ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{entry.performedByName}</td>
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
