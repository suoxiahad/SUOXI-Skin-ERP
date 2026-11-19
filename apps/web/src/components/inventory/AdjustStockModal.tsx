import React, { useState } from 'react';
import { X, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { inventoryApi } from '../../api/inventory.js';
import type { ProductDto } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface AdjustStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products: ProductDto[];
  preselectedProduct?: ProductDto | null;
}

export const AdjustStockModal: React.FC<AdjustStockModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  products,
  preselectedProduct,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [productId, setProductId] = useState<string>(preselectedProduct?.id || products[0]?.id || '');
  const [movementType, setMovementType] = useState<'adjustment' | 'wastage'>('adjustment');
  const [quantity, setQuantity] = useState<string>('1');
  const [direction, setDirection] = useState<'add' | 'subtract'>('subtract');
  const [reason, setReason] = useState<string>('');
  const [approverId, setApproverId] = useState<string>('usr-101'); // Superadmin or Manager
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === productId) || preselectedProduct;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError(isBn ? 'সঠিক পরিমাণ লিখুন (০ এর বেশি)' : 'Please enter a valid quantity greater than zero');
      return;
    }

    if (!reason.trim()) {
      setError(isBn ? 'স্টক সমন্বয়ের কারণ উল্লেখ করা আবশ্যক' : 'A valid audited reason is required');
      return;
    }

    if (!approverId) {
      setError(isBn ? 'অনুমোদনকারী নির্বাচন আবশ্যক' : 'Approver selection is required');
      return;
    }

    // AS-2 client check
    if (user?.id === approverId) {
      setError(
        isBn
          ? 'নিয়ম AS-2: অনুরোধকারী নিজে অনুমোদনকারী হতে পারবেন না'
          : 'Rule AS-2 Violation: Approver cannot be the same staff user as the requester'
      );
      return;
    }

    try {
      setLoading(true);
      const signedChange =
        movementType === 'wastage'
          ? -Math.abs(qtyNum)
          : direction === 'subtract'
          ? -Math.abs(qtyNum)
          : Math.abs(qtyNum);

      await inventoryApi.recordMovement({
        product_id: productId,
        movement_type: movementType,
        quantity_change: signedChange,
        branch_id: (user as any)?.branchId || 'br-dhk-01',
        reason: reason.trim(),
        approved_by: approverId,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to adjust stock:', err);
      setError(err.message || 'Failed to record stock adjustment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {isBn ? 'স্টক সমন্বয় / অপচয় লিপিবদ্ধকরণ' : 'Adjust Stock / Record Wastage'}
              </h2>
              <p className="text-xs text-slate-500">
                {isBn ? 'অনুমোদন আবশ্যক ও অডিট রেকর্ডভুক্ত' : 'Supervised adjustment with mandatory rationale'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Product Select */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {isBn ? 'পণ্য' : 'Product'} <span className="text-rose-500">*</span>
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name} (Stock: {p.stock_on_hand} {p.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Action Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {isBn ? 'প্রকার' : 'Adjustment Type'}
              </label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as any)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="adjustment">{isBn ? 'সমন্বয় (Adjustment)' : 'Correction / Count'}</option>
                <option value="wastage">{isBn ? 'অপচয় / বিনষ্ট (Wastage)' : 'Damage / Spoilage'}</option>
              </select>
            </div>

            {movementType === 'adjustment' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {isBn ? 'দিক' : 'Direction'}
                </label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                >
                  <option value="subtract">{isBn ? 'হ্রাস (-) Deduction' : 'Deduct (-)'}</option>
                  <option value="add">{isBn ? 'বৃদ্ধি (+) Addition' : 'Add (+)'}</option>
                </select>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {isBn ? 'পরিমাণ' : 'Quantity'} ({selectedProduct?.unit || 'units'}) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              required
            />
          </div>

          {/* Mandatory Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {isBn ? 'সমন্বয় বা বিনষ্টের কারণ' : 'Audited Reason / Rationale'}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isBn
                  ? 'যেমন: বোতল ভাঙা, ফিজিক্যাল অডিটে পার্থক্য, ড্রপার নষ্ট...'
                  : 'E.g., Broken dropper during procedure, physical inventory count variance...'
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              required
            />
          </div>

          {/* Approver Selection (Rule AS-2) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>
                {isBn ? 'অনুমোদনকারী (ম্যানেজার / সুপার অ্যাডমিন)' : 'Authorized Supervisor / Approver'}{' '}
                <span className="text-rose-500">*</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Rule AS-2 Enforced</span>
            </label>
            <select
              value={approverId}
              onChange={(e) => setApproverId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none bg-slate-50"
            >
              <option value="usr-101">Super Admin (System Authority)</option>
              <option value="usr-102">Branch Manager (Clinical Operations)</option>
              <option value="usr-doc-01">Dr. Farhana Khan (Lead Consultant)</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              {isBn
                ? 'অনুরোধকারী নিজে অনুমোদন করতে পারবেন না (স্বার্থ সংঘাত রোধ নীতি)'
                : 'The requesting staff member cannot approve their own inventory adjustments'}
            </p>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>{isBn ? 'লিপিবদ্ধ করুন' : 'Confirm & Record'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
