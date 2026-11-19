import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  Truck,
  Trash2,
  Calendar,
  X,
  FileText,
} from 'lucide-react';
import { inventoryApi } from '../../api/inventory.js';
import type {
  PurchaseDto,
  SupplierDto,
  ProductDto,
  CreatePurchaseRequest,
  CreatePurchaseItemInput,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

export const PurchasesListView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [purchases, setPurchases] = useState<PurchaseDto[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('br-dhk-01');

  // New Purchase Modal
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [supplierId, setSupplierId] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<CreatePurchaseItemInput[]>([
    { product_id: '', quantity: 10, unit_cost: 1000, batch_no: '', expiry_date: '' },
  ]);
  const [savingPurchase, setSavingPurchase] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Mark Received State
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [purList, supList, prodList] = await Promise.all([
        inventoryApi.getPurchases({
          status: selectedStatus === 'all' ? undefined : selectedStatus,
          branchId: selectedBranch,
        }),
        inventoryApi.getSuppliers(),
        inventoryApi.getProducts({ branchId: selectedBranch }),
      ]);
      setPurchases(purList);
      setSuppliers(supList);
      setProducts(prodList);
      if (supList.length > 0 && !supplierId) {
        setSupplierId(supList[0].id);
      }
      if (prodList.length > 0 && !items[0].product_id) {
        setItems([
          {
            product_id: prodList[0].id,
            quantity: 10,
            unit_cost: parseFloat(prodList[0].cost_price) || 1000,
            batch_no: `LOT-${new Date().getFullYear()}-01`,
            expiry_date: '2028-12-31',
          },
        ]);
      }
    } catch (err: any) {
      console.error('Failed to load purchases:', err);
      setError(err.message || 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedBranch, supplierId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddItem = () => {
    const firstProd = products[0];
    setItems((prev) => [
      ...prev,
      {
        product_id: firstProd?.id || '',
        quantity: 10,
        unit_cost: parseFloat(firstProd?.cost_price || '1000'),
        batch_no: '',
        expiry_date: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof CreatePurchaseItemInput, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      if (field === 'product_id') {
        const p = products.find((prod) => prod.id === val);
        if (p) {
          copy[index].unit_cost = parseFloat(p.cost_price) || 0;
        }
      }
      return copy;
    });
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!supplierId) {
      setModalError(isBn ? 'সরবরাহকারী নির্বাচন আবশ্যক' : 'Supplier is required');
      return;
    }

    try {
      setSavingPurchase(true);
      const payload: CreatePurchaseRequest = {
        supplier_id: supplierId,
        branch_id: selectedBranch,
        purchase_date: purchaseDate,
        supplier_invoice_no: supplierInvoiceNo.trim() || undefined,
        items: items.map((it) => ({
          product_id: it.product_id,
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost),
          batch_no: it.batch_no?.trim() || undefined,
          expiry_date: it.expiry_date?.trim() || undefined,
        })),
        notes: notes.trim() || undefined,
      };

      await inventoryApi.createPurchase(payload);
      setShowNewModal(false);
      loadData();
    } catch (err: any) {
      console.error('Failed to create purchase:', err);
      setModalError(err.message || 'Failed to create purchase order');
    } finally {
      setSavingPurchase(false);
    }
  };

  const handleMarkReceived = async (id: string) => {
    try {
      setReceivingId(id);
      await inventoryApi.markPurchaseReceived(id);
      loadData();
    } catch (err: any) {
      console.error('Failed to mark received:', err);
      alert(err.message || 'Failed to mark purchase received');
    } finally {
      setReceivingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-6 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-1">
            <ShoppingBag className="w-4 h-4" />
            <span>{isBn ? 'ক্রয় ও আগমনী পণ্য' : 'Procurement & Purchase Orders'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isBn ? 'ক্রয় আদেশ ও মাল গ্রহণ' : 'Purchases & Goods Receipts'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isBn
              ? 'সরবরাহকারী চালান এন্ট্রি, ব্যাচ ট্র্যাকিং এবং "Mark received" এর মাধ্যমে তাৎক্ষণিক স্টক বৃদ্ধি।'
              : 'Purchase order lifecycle, supplier invoice verification, and atomic batch/receipt stocking.'}
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isBn ? 'নতুন ক্রয় চালান' : 'New Purchase Order'}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs rounded-lg border border-slate-200 px-3 py-2 bg-white focus:outline-none focus:border-emerald-500"
          >
            <option value="all">{isBn ? 'সকল স্ট্যাটাস' : 'All Statuses'}</option>
            <option value="ordered">{isBn ? 'অপেক্ষমান (Ordered)' : 'Ordered / Pending'}</option>
            <option value="received">{isBn ? 'গৃহীত (Received)' : 'Received'}</option>
          </select>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <button
              onClick={loadData}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
            >
              {isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
            </button>
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {isBn ? 'কোনো ক্রয় রেকর্ড পাওয়া যায়নি' : 'No purchases found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">PO Number</th>
                  <th className="py-3.5 px-4">{isBn ? 'সরবরাহকারী' : 'Supplier'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'তারিখ' : 'Date'}</th>
                  <th className="py-3.5 px-4">{isBn ? 'চালান নম্বর' : 'Supplier Invoice'}</th>
                  <th className="py-3.5 px-4 text-center">{isBn ? 'আইটেম' : 'Items'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'মোট খরচ (৳)' : 'Total Cost (৳)'}</th>
                  <th className="py-3.5 px-4 text-center">{isBn ? 'অবস্থা' : 'Status'}</th>
                  <th className="py-3.5 px-4 text-right">{isBn ? 'অ্যাকশন' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {purchases.map((p) => {
                  const isReceived = p.status === 'received';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors h-14">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{p.purchase_no}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{p.supplier_name}</div>
                        <div className="text-[11px] text-slate-400">{p.branch_name}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{p.purchase_date}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{p.supplier_invoice_no || '—'}</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">{p.items.length}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ৳ {Number(p.total_cost).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isReceived ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Received
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <Clock className="w-3.5 h-3.5" />
                            Ordered
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!isReceived && (
                          <button
                            onClick={() => handleMarkReceived(p.id)}
                            disabled={receivingId === p.id}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors ml-auto disabled:opacity-50"
                          >
                            {receivingId === p.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>{isBn ? 'মাল গ্রহণ করুন' : 'Mark Received'}</span>
                          </button>
                        )}
                        {isReceived && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            {p.received_at ? new Date(p.received_at).toLocaleDateString() : 'Received'}
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

      {/* New Purchase Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-bold text-slate-800">
                  {isBn ? 'নতুন ক্রয় আদেশ তৈরি' : 'Create Purchase Order'}
                </h2>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreatePurchase} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {isBn ? 'সরবরাহকারী' : 'Supplier'} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    required
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.payment_terms})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    {isBn ? 'তারিখ' : 'Date'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'সরবরাহকারী ইনভয়েস / চালান নং' : 'Supplier Invoice Reference No.'}
                </label>
                <input
                  type="text"
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  placeholder="e.g., APEX-INV-99201"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Line Items */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {isBn ? 'পণ্যের তালিকা ও ব্যাচ' : 'Purchased Items & Batches'}
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isBn ? 'আইটেম যোগ' : 'Add Item'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2 relative"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] text-slate-500">Product</label>
                          <select
                            value={item.product_id}
                            onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs bg-white"
                          >
                            {products.map((prod) => (
                              <option key={prod.id} value={prod.id}>
                                {prod.sku} — {prod.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-slate-500">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)
                            }
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs bg-white font-mono"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[10px] text-slate-500">Unit Cost (৳)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_cost}
                            onChange={(e) =>
                              handleItemChange(idx, 'unit_cost', parseFloat(e.target.value) || 0)
                            }
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs bg-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-slate-200/50">
                        <div className="sm:col-span-6">
                          <label className="block text-[10px] text-slate-500">Batch Number (optional)</label>
                          <input
                            type="text"
                            value={item.batch_no || ''}
                            onChange={(e) => handleItemChange(idx, 'batch_no', e.target.value)}
                            placeholder="e.g., LOT-2026-99A"
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white font-mono uppercase"
                          />
                        </div>

                        <div className="sm:col-span-5">
                          <label className="block text-[10px] text-slate-500">Expiry Date</label>
                          <input
                            type="date"
                            value={item.expiry_date || ''}
                            onChange={(e) => handleItemChange(idx, 'expiry_date', e.target.value)}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white"
                          />
                        </div>

                        <div className="sm:col-span-1 flex items-end justify-center pb-0.5">
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-rose-500 hover:text-rose-700 p-1"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'নোট বা পর্যবেক্ষণ' : 'Notes / Remarks'}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional delivery details..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={savingPurchase}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {savingPurchase ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isBn ? 'ক্রয় আদেশ সংরক্ষণ' : 'Save Purchase Order'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
