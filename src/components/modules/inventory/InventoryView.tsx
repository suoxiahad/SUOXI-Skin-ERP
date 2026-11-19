import React, { useState, useEffect } from 'react';
import {
  Boxes,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  FileText,
  Sliders,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { InventoryItem } from '../../../types/index.ts';
import { formatBDT, formatDateDhaka, getStatusBadgeClass } from '../../../utils/format.ts';
import { TableSkeleton } from '../../common/Skeleton.tsx';
import { EmptyState } from '../../common/EmptyState.tsx';

export const InventoryView: React.FC = () => {
  const { addToast, branches, activeBranchId } = useApp();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Stock Adjustment Modal
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'damaged' | 'expired' | 'clinic_use' | 'restock' | 'audit_correction'>('clinic_use');
  const [deltaQuantity, setDeltaQuantity] = useState<number>(-1);
  const [adjustReason, setAdjustReason] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const fetchInventory = async () => {
    setIsLoading(true);
    try {
      const list = await api.inventory.list({
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
      });
      setItems(list);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Failed to load inventory',
        description: (err as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [categoryFilter]);

  const openAdjustModal = (item: InventoryItem) => {
    setAdjustingItem(item);
    setAdjustmentType('clinic_use');
    setDeltaQuantity(-1);
    setAdjustReason('Consumed during aesthetic clinical treatments at center.');
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem) return;

    if (deltaQuantity === 0) {
      addToast({ type: 'error', title: 'Invalid Delta', description: 'Delta quantity cannot be 0' });
      return;
    }

    if (!adjustReason.trim() || adjustReason.trim().length < 5) {
      addToast({ type: 'error', title: 'Mandatory Reason', description: 'Please provide a clinical audit reason of at least 5 characters' });
      return;
    }

    setIsAdjusting(true);
    try {
      // Hard Rule 3 & 6: Non-destructive stock adjustments
      const res = await api.inventory.adjust({
        itemId: adjustingItem.id,
        adjustmentType,
        quantityDelta: deltaQuantity,
        reason: adjustReason.trim(),
      });

      setItems((prev) => prev.map((it) => (it.id === res.item.id ? res.item : it)));

      addToast({
        type: 'success',
        title: 'Stock Adjustment Logged',
        description: `Adjusted by ${deltaQuantity > 0 ? '+' : ''}${deltaQuantity} ${res.item.unit}. New balance: ${res.item.currentStock}. Audit logged.`,
      });
      setAdjustingItem(null);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Adjustment Failed',
        description: (err as Error).message,
      });
    } finally {
      setIsAdjusting(false);
    }
  };

  const filteredItems = items.filter((it) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      it.name.toLowerCase().includes(q) ||
      it.itemCode.toLowerCase().includes(q) ||
      it.batchNumber.toLowerCase().includes(q) ||
      it.brand.toLowerCase().includes(q)
    );
  });

  const lowStockCount = items.filter((it) => it.currentStock <= it.reorderLevel).length;

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clinical Inventory & Stock</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Non-destructive stock balance management, batches, and reorder levels
          </p>
        </div>

        <button
          onClick={fetchInventory}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0DA54F]' : ''}`} />
          Refresh Stock
        </button>
      </div>

      {/* Compliance Banner */}
      <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900">
          <span className="font-bold">Hard Rule #3 & #6: Append-Only Stock Adjustments: </span>
          Stock balances are never overwritten or deleted directly. Every alteration creates an audited delta row with mandatory clinical justification.
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card-kpi p-4 rounded-xl border border-white/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500">Tracked SKU Products</span>
          <p className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{items.length}</p>
          <span className="text-[10px] text-slate-400">Serums, peels, and lasers</span>
        </div>

        <div className="glass-card-kpi p-4 rounded-xl border border-white/80 shadow-xs">
          <span className="text-xs font-medium text-amber-600">Low Stock Reorder Alerts</span>
          <p className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">{lowStockCount}</p>
          <span className="text-[10px] text-amber-600">At or below reorder threshold</span>
        </div>

        <div className="glass-card-kpi p-4 rounded-xl border border-white/80 shadow-xs">
          <span className="text-xs font-medium text-[#0DA54F]">Active Batches in Dhaka</span>
          <p className="text-2xl font-bold text-[#0DA54F] mt-1 tabular-nums">
            {new Set(items.map((i) => i.batchNumber)).size}
          </p>
          <span className="text-[10px] text-slate-400">Strict expiry monitoring</span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700"
          >
            <option value="all">All Categories</option>
            <option value="Serums & Peels">Serums & Peels</option>
            <option value="Laser Consumables">Laser Consumables</option>
            <option value="Injectables">Injectables</option>
            <option value="Post-Care Creams">Post-Care Creams</option>
            <option value="Disposables">Disposables</option>
          </select>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search SKU code, name, batch..."
            className="pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0DA54F] w-48 sm:w-64"
          />
        </div>
      </div>

      {/* Inventory Table */}
      {isLoading ? (
        <TableSkeleton rows={4} cols={7} />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No inventory items found"
          description="No stock items matched your search query."
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/90 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Item Code & Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Batch # & Expiry</th>
                  <th className="py-3 px-4 text-center">Stock Level</th>
                  <th className="py-3 px-4 text-right">Unit Cost</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const badge = getStatusBadgeClass(item.status);
                  const isLow = item.currentStock <= item.reorderLevel;

                  return (
                    <tr key={item.id} className="h-12 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {item.itemCode} • {item.brand}
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-slate-600">
                        {item.category}
                      </td>

                      <td className="py-2.5 px-4">
                        <span className="font-mono text-[11px] text-slate-700 font-semibold">
                          {item.batchNumber}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          Exp: {formatDateDhaka(item.expiryDate)}
                        </span>
                      </td>

                      {/* Stock Level with Reorder Level */}
                      <td className="py-2.5 px-4 text-center">
                        <span className={`font-bold tabular-nums ${isLow ? 'text-amber-700 text-sm' : 'text-slate-800'}`}>
                          {item.currentStock} {item.unit}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          Reorder at: {item.reorderLevel}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 text-right font-medium text-slate-700 tabular-nums">
                        {formatBDT(item.unitCostBDT)}
                      </td>

                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          <span className="capitalize">{item.status.replace('_', ' ')}</span>
                        </span>
                      </td>

                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => openAdjustModal(item)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#0DA54F] bg-[#0DA54F]/10 hover:bg-[#0DA54F]/20 rounded-md transition-colors"
                        >
                          Adjust Stock
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Adjust Clinical Stock ({adjustingItem.itemCode})
                </h3>
                <p className="text-[11px] text-slate-500">{adjustingItem.name}</p>
              </div>
              <button
                onClick={() => setAdjustingItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="p-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Current On-Hand Balance:</span>
                  <span className="font-bold text-slate-900">
                    {adjustingItem.currentStock} {adjustingItem.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Batch Number:</span>
                  <span className="font-mono">{adjustingItem.batchNumber}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-[#0DA54F]">
                  <span>Projected Balance After:</span>
                  <span>
                    {adjustingItem.currentStock + deltaQuantity} {adjustingItem.unit}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Adjustment Category
                </label>
                <select
                  value={adjustmentType}
                  onChange={(e) => {
                    const type = e.target.value as any;
                    setAdjustmentType(type);
                    if (type === 'restock' && deltaQuantity < 0) {
                      setDeltaQuantity(Math.abs(deltaQuantity));
                    } else if (type !== 'restock' && deltaQuantity > 0) {
                      setDeltaQuantity(-Math.abs(deltaQuantity));
                    }
                  }}
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white font-medium"
                >
                  <option value="clinic_use">Clinical Procedure Consumption (-)</option>
                  <option value="damaged">Damaged / Broken Vial (-)</option>
                  <option value="expired">Expired Material (-)</option>
                  <option value="restock">New Batch Restock (+)</option>
                  <option value="audit_correction">Physical Audit Correction</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Quantity Delta (+ or -) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={deltaQuantity}
                  onChange={(e) => setDeltaQuantity(parseInt(e.target.value, 10) || 0)}
                  className="w-full text-sm font-bold text-slate-800 rounded-lg border border-slate-300 p-2 focus:border-[#0DA54F]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Audit & Clinical Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="State exact procedure, incident, or supplier invoice number..."
                  className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:border-[#0DA54F]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0a8740] rounded-lg transition-colors shadow-xs"
                >
                  {isAdjusting ? 'Recording...' : 'Commit Stock Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
