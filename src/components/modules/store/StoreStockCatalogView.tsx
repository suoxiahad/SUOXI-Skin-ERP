import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Archive,
  Plus,
  Search,
  RefreshCw,
  ArrowDownToLine,
  SlidersHorizontal,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  X,
  ShieldCheck,
  MapPin,
} from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import { formatBDT } from '../../../utils/format.ts';
import { canManageClinicStore, canViewClinicStoreCosts } from '../../../utils/rbac.ts';
import type { StoreItem, StoreItemCategory, StoreItemUnit } from '../../../types/index.ts';

const STORE_CATEGORIES: StoreItemCategory[] = [
  'Clinical & Hygiene Consumables',
  'Clinical Instruments & Tools',
  'Office & Front-Desk Supplies',
];

const STORE_UNITS: StoreItemUnit[] = ['pieces', 'boxes', 'bottles', 'packs', 'reams', 'sets', 'rolls'];

export const StoreStockCatalogView: React.FC = () => {
  const { currentUser, activeBranchId, branches, addToast } = useApp();
  const isManager = canManageClinicStore(currentUser);
  const canSeeCosts = canViewClinicStoreCosts(currentUser);

  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>(activeBranchId || 'all');

  // Modals
  const [itemModalMode, setItemModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
  const [stockInItem, setStockInItem] = useState<StoreItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<StoreItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create/Edit form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<StoreItemCategory>('Clinical & Hygiene Consumables');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formUnit, setFormUnit] = useState<StoreItemUnit>('boxes');
  const [formStock, setFormStock] = useState<number>(0);
  const [formReorder, setFormReorder] = useState<number>(5);
  const [formCost, setFormCost] = useState<number>(0);
  const [formVendor, setFormVendor] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formBranchId, setFormBranchId] = useState(activeBranchId || '');

  // Stock-In form state
  const [inQty, setInQty] = useState<number>(10);
  const [inUnitCost, setInUnitCost] = useState<number>(0);
  const [inVendor, setInVendor] = useState('');
  const [inRefNo, setInRefNo] = useState('');
  const [inNotes, setInNotes] = useState('');

  // Adjust form state
  const [adjType, setAdjType] = useState<'damaged' | 'expired' | 'wastage' | 'audit_correction'>('damaged');
  const [adjDelta, setAdjDelta] = useState<number>(-1);
  const [adjReason, setAdjReason] = useState('');

  useEffect(() => {
    if (activeBranchId && branchFilter === 'all') {
      setBranchFilter(activeBranchId);
    }
  }, [activeBranchId]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.store.listItems({
        branchId: branchFilter !== 'all' ? branchFilter : undefined,
      });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Clinic Store items');
    } finally {
      setLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (q) {
        const match =
          item.name.toLowerCase().includes(q) ||
          item.itemCode.toLowerCase().includes(q) ||
          (item.subCategory && item.subCategory.toLowerCase().includes(q)) ||
          (item.vendorName && item.vendorName.toLowerCase().includes(q)) ||
          (item.storageLocation && item.storageLocation.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [items, search, categoryFilter, statusFilter]);

  const metrics = useMemo(() => {
    const totalSkus = items.length;
    const inStock = items.filter((i) => i.status === 'in_stock').length;
    const alerts = items.filter((i) => i.status === 'low_stock' || i.status === 'out_of_stock').length;
    const totalValuation = items.reduce((sum, i) => sum + i.currentStock * i.unitCostBDT, 0);
    return { totalSkus, inStock, alerts, totalValuation };
  }, [items]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormName('');
    setFormCategory('Clinical & Hygiene Consumables');
    setFormSubCategory('');
    setFormUnit('boxes');
    setFormStock(0);
    setFormReorder(5);
    setFormCost(0);
    setFormVendor('');
    setFormLocation('');
    setFormBranchId(activeBranchId || currentUser?.branchId || branches[0]?.id || '');
    setItemModalMode('create');
  };

  const openEditModal = (item: StoreItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormSubCategory(item.subCategory || '');
    setFormUnit(item.unit);
    setFormStock(item.currentStock);
    setFormReorder(item.reorderLevel);
    setFormCost(item.unitCostBDT);
    setFormVendor(item.vendorName || '');
    setFormLocation(item.storageLocation || '');
    setFormBranchId(item.branchId);
    setItemModalMode('edit');
  };

  const openStockInModal = (item: StoreItem) => {
    setStockInItem(item);
    setInQty(10);
    setInUnitCost(item.unitCostBDT);
    setInVendor(item.vendorName || '');
    setInRefNo('');
    setInNotes('');
  };

  const openAdjustModal = (item: StoreItem) => {
    setAdjustItem(item);
    setAdjType('damaged');
    setAdjDelta(-1);
    setAdjReason('');
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      if (itemModalMode === 'create') {
        await api.store.createItem({
          name: formName.trim(),
          category: formCategory,
          subCategory: formSubCategory.trim() || undefined,
          unit: formUnit,
          currentStock: Math.max(0, Number(formStock) || 0),
          reorderLevel: Math.max(0, Number(formReorder) || 0),
          unitCostBDT: Math.max(0, Number(formCost) || 0),
          vendorName: formVendor.trim() || undefined,
          storageLocation: formLocation.trim() || undefined,
          branchId: formBranchId || undefined,
        });
        addToast({ type: 'success', title: 'Store Item Added', description: `${formName.trim()} added to Clinic Store.` });
      } else if (itemModalMode === 'edit' && editingItem) {
        await api.store.updateItem(editingItem.id, {
          name: formName.trim(),
          category: formCategory,
          subCategory: formSubCategory.trim() || undefined,
          unit: formUnit,
          reorderLevel: Math.max(0, Number(formReorder) || 0),
          unitCostBDT: Math.max(0, Number(formCost) || 0),
          vendorName: formVendor.trim() || undefined,
          storageLocation: formLocation.trim() || undefined,
        });
        addToast({ type: 'success', title: 'Store Item Updated', description: `${formName.trim()} details saved.` });
      }
      setItemModalMode(null);
      await loadItems();
    } catch (err) {
      addToast({ type: 'error', title: 'Action Failed', description: err instanceof Error ? err.message : 'Unable to save item.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockInItem || inQty <= 0) return;
    setSubmitting(true);
    try {
      await api.store.stockIn(stockInItem.id, {
        quantity: Math.floor(inQty),
        unitCostBDT: Number(inUnitCost) >= 0 ? Number(inUnitCost) : undefined,
        vendorName: inVendor.trim() || undefined,
        referenceNo: inRefNo.trim() || undefined,
        notes: inNotes.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Stock Received',
        description: `Added ${inQty} ${stockInItem.unit} to ${stockInItem.name}.`,
      });
      setStockInItem(null);
      await loadItems();
    } catch (err) {
      addToast({ type: 'error', title: 'Stock-In Failed', description: err instanceof Error ? err.message : 'Unable to record stock-in.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem || adjDelta === 0 || adjReason.trim().length < 4) {
      addToast({ type: 'warning', title: 'Validation Required', description: 'Provide a non-zero quantity delta and a brief reason (min 4 chars).' });
      return;
    }
    setSubmitting(true);
    try {
      await api.store.adjustItem(adjustItem.id, {
        adjustmentType: adjType,
        quantityDelta: Math.trunc(adjDelta),
        reason: adjReason.trim(),
      });
      addToast({
        type: 'success',
        title: 'Stock Adjusted',
        description: `Updated ${adjustItem.name} balance.`,
      });
      setAdjustItem(null);
      await loadItems();
    } catch (err) {
      addToast({ type: 'error', title: 'Adjustment Failed', description: err instanceof Error ? err.message : 'Unable to adjust stock.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <Archive className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Clinic Store Stock &amp; Catalog
            </h1>
          </div>
          <p className="text-xs text-slate-500">
            Internal clinical consumables, hygiene supplies, and office stationery—tracked strictly separate from POS retail inventory.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadItems()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {isManager && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Store Item
            </button>
          )}
        </div>
      </div>

      {/* Non-sellable accounting isolation notice */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-teal-200 bg-teal-50/70 text-teal-900 text-xs">
        <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
        <span>
          <strong>Internal Non-Sellable Ledger:</strong> Store items cannot be billed on POS invoices. Consumption is recorded exclusively as Clinic Operational Expense (OPEX).
        </span>
      </div>

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${canSeeCosts ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Store SKUs</p>
          <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{metrics.totalSkus}</p>
          <p className="text-[11px] text-slate-400 mt-1">Active internal supply items</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Healthy Stock</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums">{metrics.inStock}</p>
          <p className="text-[11px] text-slate-400 mt-1">Above reorder threshold</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Low / Out of Stock</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${metrics.alerts > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {metrics.alerts}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Requires store replenishment</p>
        </div>

        {canSeeCosts && (
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Store Stock Valuation</p>
            <p className="text-2xl font-bold text-teal-700 mt-1 tabular-nums">{formatBDT(metrics.totalValuation)}</p>
            <p className="text-[11px] text-slate-400 mt-1">On-hand OPEX asset value</p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item code, name, vendor, or rack location..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-teal-500"
        >
          <option value="all">All Categories</option>
          {STORE_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-teal-500"
        >
          <option value="all">All Statuses</option>
          <option value="in_stock">In Stock</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>

        {branches.length > 1 && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:border-teal-500"
          >
            <option value="all">All Accessible Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {error ? (
          <div className="p-8 text-center space-y-2">
            <AlertTriangle className="w-6 h-6 text-rose-500 mx-auto" />
            <p className="text-xs font-semibold text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => void loadItems()}
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="p-10 text-center text-xs text-slate-500">Loading Clinic Store catalog...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Archive className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">No store items match the active filters.</p>
            <p className="text-[11px] text-slate-400">Try clearing filters or add a new internal supply item.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Item Code</th>
                  <th className="py-3 px-4">Item &amp; Sub-Category</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Storage</th>
                  <th className="py-3 px-4 text-right">Stock &amp; Unit</th>
                  {canSeeCosts && <th className="py-3 px-4 text-right">Unit Cost</th>}
                  {canSeeCosts && <th className="py-3 px-4 text-right">Total Value</th>}
                  <th className="py-3 px-4">Status</th>
                  {isManager && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredItems.map((item) => {
                  const totalValue = item.currentStock * item.unitCostBDT;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700 whitespace-nowrap">
                        {item.itemCode}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          {item.subCategory && <span>{item.subCategory}</span>}
                          {item.vendorName && <span>• {item.vendorName}</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{item.category}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {item.storageLocation ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {item.storageLocation}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                        <span className="font-bold text-slate-900">{item.currentStock}</span>{' '}
                        <span className="text-slate-500">{item.unit}</span>
                        <div className="text-[10px] text-slate-400">Min: {item.reorderLevel}</div>
                      </td>
                      {canSeeCosts && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatBDT(item.unitCostBDT)}
                        </td>
                      )}
                      {canSeeCosts && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatBDT(totalValue)}
                        </td>
                      )}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.status === 'in_stock' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> In Stock
                          </span>
                        )}
                        {item.status === 'low_stock' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                            <AlertTriangle className="w-3 h-3" /> Low Stock
                          </span>
                        )}
                        {item.status === 'out_of_stock' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold">
                            <AlertTriangle className="w-3 h-3" /> Out of Stock
                          </span>
                        )}
                      </td>
                      {isManager && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openStockInModal(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-[11px] font-semibold cursor-pointer"
                              title="Receive New Purchase / Stock-In"
                            >
                              <ArrowDownToLine className="w-3 h-3" />
                              Stock In
                            </button>
                            <button
                              type="button"
                              onClick={() => openAdjustModal(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold cursor-pointer"
                              title="Adjust Damaged, Expired, or Audit Stock"
                            >
                              <SlidersHorizontal className="w-3 h-3" />
                              Adjust
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="p-1.5 rounded-md bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer"
                              title="Edit Item Details"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Item Modal */}
      {itemModalMode && isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">
                {itemModalMode === 'create' ? 'Add Store Supply Item' : `Edit ${editingItem?.itemCode}`}
              </h3>
              <button
                type="button"
                onClick={() => setItemModalMode(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Item Name *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Hexisol Hand Sanitizer 500ml"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category *</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as StoreItemCategory)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                  >
                    {STORE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sub-Category</label>
                  <input
                    type="text"
                    value={formSubCategory}
                    onChange={(e) => setFormSubCategory(e.target.value)}
                    placeholder="e.g., Hygiene & Disinfection"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit *</label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value as StoreItemUnit)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                  >
                    {STORE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                {itemModalMode === 'create' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Opening Stock</label>
                    <input
                      type="number"
                      min={0}
                      value={formStock}
                      onChange={(e) => setFormStock(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500 tabular-nums"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Reorder Alert Level</label>
                  <input
                    type="number"
                    min={0}
                    value={formReorder}
                    onChange={(e) => setFormReorder(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500 tabular-nums"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit Cost (BDT)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formCost}
                    onChange={(e) => setFormCost(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500 tabular-nums"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Preferred Vendor</label>
                  <input
                    type="text"
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value)}
                    placeholder="e.g., ACI Healthcare / Local Stationery"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Storage Location / Rack</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g., Store Rack B2"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                  />
                </div>

                {itemModalMode === 'create' && branches.length > 0 && (
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">Branch</label>
                    <select
                      value={formBranchId}
                      onChange={(e) => setFormBranchId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setItemModalMode(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Saving...' : itemModalMode === 'create' ? 'Create Item' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock-In Modal */}
      {stockInItem && isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Record Store Stock-In</h3>
                <p className="text-[11px] text-slate-500">
                  {stockInItem.itemCode} — {stockInItem.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStockInItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleStockInSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Quantity ({stockInItem.unit}) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={inQty}
                    onChange={(e) => setInQty(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit Cost (BDT)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={inUnitCost}
                    onChange={(e) => setInUnitCost(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Vendor / Supplier</label>
                <input
                  type="text"
                  value={inVendor}
                  onChange={(e) => setInVendor(e.target.value)}
                  placeholder="Supplier name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Challan / Bill Reference No.</label>
                <input
                  type="text"
                  value={inRefNo}
                  onChange={(e) => setInRefNo(e.target.value)}
                  placeholder="e.g., PO-STR-2026-014"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={inNotes}
                  onChange={(e) => setInNotes(e.target.value)}
                  placeholder="Optional batch or delivery notes"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStockInItem(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Recording...' : 'Confirm Stock-In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustItem && isManager && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Adjust Store Stock</h3>
                <p className="text-[11px] text-slate-500">
                  {adjustItem.name} • Current: {adjustItem.currentStock} {adjustItem.unit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Adjustment Type *</label>
                <select
                  value={adjType}
                  onChange={(e) => setAdjType(e.target.value as typeof adjType)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-500"
                >
                  <option value="damaged">Damaged / Broken</option>
                  <option value="expired">Expired Supply</option>
                  <option value="wastage">Operational Wastage</option>
                  <option value="audit_correction">Physical Audit Correction</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Quantity Delta ({adjustItem.unit}) *
                </label>
                <input
                  type="number"
                  required
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-teal-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Use negative values (e.g., -2) for loss/damage, positive values for surplus found on audit.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason / Remarks *</label>
                <textarea
                  rows={2}
                  required
                  minLength={4}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Describe why stock is being adjusted..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustItem(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold cursor-pointer"
                >
                  {submitting ? 'Applying...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
