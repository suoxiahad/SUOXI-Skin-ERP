import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  FileText,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  User,
  Sparkles,
} from 'lucide-react';
import { billingApi } from '../../api/billing.js';
import { patientsApi } from '../../api/patients.js';
import { catalogApi } from '../../api/catalog.js';
import { packagesApi } from '../../api/packages.js';
import type {
  PatientDto,
  TreatmentServiceDto,
  PackageDto,
  CreateInvoiceInput,
  CreateInvoiceItemInput,
  InvoiceDto,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface NewInvoiceModalProps {
  preselectedPatientId?: string;
  onClose: () => void;
  onSuccess: (invoice: InvoiceDto) => void;
}

export const NewInvoiceModal: React.FC<NewInvoiceModalProps> = ({
  preselectedPatientId,
  onClose,
  onSuccess,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reference data
  const [patients, setPatients] = useState<PatientDto[]>([]);
  const [treatments, setTreatments] = useState<TreatmentServiceDto[]>([]);
  const [packages, setPackages] = useState<PackageDto[]>([]);

  // Form State
  const [patientId, setPatientId] = useState<string>(preselectedPatientId || '');
  const [branchId, setBranchId] = useState<string>('br-dhk-01');
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState<string>('');

  // Discount & Tax State
  const [discountPercent, setDiscountPercent] = useState<string>('0');
  const [discountReason, setDiscountReason] = useState<string>('');
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState<string>('');
  const [taxPercent, setTaxPercent] = useState<string>('0');

  // Items State
  const [items, setItems] = useState<CreateInvoiceItemInput[]>([
    {
      itemType: 'treatment',
      serviceId: '',
      description: 'HydraFacial Treatment Session',
      quantity: 1,
      unitPrice: '4500',
      discountAmount: '0',
    },
  ]);

  // Max discount for role
  const userRole = user?.roles?.[0] || 'receptionist';
  const maxDiscountMap: Record<string, number> = {
    super_admin: 100,
    admin: 50,
    doctor: 25,
    cashier: 10,
    receptionist: 5,
  };
  const roleLimit = maxDiscountMap[userRole] ?? 5;
  const isOverLimit = Number(discountPercent) > roleLimit;

  useEffect(() => {
    async function loadData() {
      try {
        setLoadingInitial(true);
        const [pList, tList, pkgList] = await Promise.all([
          patientsApi.list(),
          catalogApi.listTreatments({ activeOnly: true }),
          packagesApi.listPackages({ activeOnly: true }),
        ]);
        setPatients(pList as any);
        setTreatments(tList);
        setPackages(pkgList);

        if (!patientId && pList.length > 0) {
          setPatientId(pList[0].id);
        }
      } catch (err: any) {
        console.error('Failed to load initial data:', err);
      } finally {
        setLoadingInitial(false);
      }
    }
    loadData();
  }, [patientId]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        itemType: 'treatment',
        serviceId: treatments[0]?.id || '',
        description: treatments[0]?.name || 'Treatment Item',
        quantity: 1,
        unitPrice: String(treatments[0]?.base_price || '3500'),
        discountAmount: '0',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof CreateInvoiceItemInput, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };

      // If user changed itemType or serviceId/packageId, auto-fill description & price
      if (field === 'serviceId') {
        const s = treatments.find((t) => t.id === value);
        if (s) {
          copy[index].description = s.name;
          copy[index].unitPrice = String(s.base_price);
        }
      } else if (field === 'packageId') {
        const p = packages.find((pkg) => pkg.id === value);
        if (p) {
          copy[index].description = p.name;
          copy[index].unitPrice = String(p.price);
        }
      }
      return copy;
    });
  };

  // Client display totals calculation
  const subtotalDisplay = items.reduce((sum, it) => {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.unitPrice) || 0;
    const lineDiscount = Number(it.discountAmount) || 0;
    return sum + (qty * price - lineDiscount);
  }, 0);

  const discountAmountDisplay = (subtotalDisplay * Number(discountPercent || 0)) / 100;
  const taxableBase = Math.max(0, subtotalDisplay - discountAmountDisplay);
  const taxAmountDisplay = (taxableBase * Number(taxPercent || 0)) / 100;
  const totalDisplay = taxableBase + taxAmountDisplay;

  const handleSubmit = async (issueImmediately: boolean) => {
    setError(null);
    if (!patientId) {
      setError(isBn ? 'অনুগ্রহ করে রোগী নির্বাচন করুন' : 'Please select a patient');
      return;
    }

    if (items.length === 0) {
      setError(isBn ? 'কমপক্ষে একটি আইটেম যোগ করুন' : 'Please add at least one line item');
      return;
    }

    if (isOverLimit && !discountAuthorizedBy.trim()) {
      setError(
        isBn
          ? `ছাড়ের পরিমাণ (${discountPercent}%) আপনার পদবির সীমা (${roleLimit}%) অতিক্রম করেছে। সুপারভাইজারের অনুমোদন আবশ্যক।`
          : `Discount of ${discountPercent}% exceeds your role limit (${roleLimit}%). Supervisor authorization required.`
      );
      return;
    }

    try {
      setSubmitting(true);
      const payload: CreateInvoiceInput = {
        patientId,
        branchId,
        invoiceDate,
        dueDate,
        discountPercent,
        discountReason: isOverLimit ? discountReason : undefined,
        discountAuthorizedBy: isOverLimit ? discountAuthorizedBy : undefined,
        taxPercent,
        notes: notes.trim() || undefined,
        items,
        issueImmediately,
      };

      const created = await billingApi.createInvoice(payload);
      onSuccess(created);
    } catch (err: any) {
      console.error('Create invoice error:', err);
      setError(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-semibold text-slate-800">
                {isBn ? 'নতুন ইনভয়েস তৈরি' : 'Generate New Invoice'}
              </h3>
              <p className="text-xs text-slate-500">
                SUOXI Skin Care & Aesthetic Center • Financial Billing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="m-6 mb-0 p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-sm text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Patient & Branch Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {isBn ? 'রোগী নির্বাচন' : 'Patient'} <span className="text-rose-500">*</span>
              </label>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.patientCode}) • {(p as any).primaryMobile || ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {isBn ? 'শাখা' : 'Branch'}
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="br-dhk-01">Dhanmondi Main Clinic</option>
                <option value="br-dhk-02">Uttara Branch</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {isBn ? 'ইনভয়েস তারিখ' : 'Invoice Date'}
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                {isBn ? 'পরিশোধের শেষ তারিখ' : 'Payment Due Date'}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                {isBn ? 'ইনভয়েস আইটেম সমূহ' : 'Line Items'}
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                <Plus className="h-4 w-4" />
                {isBn ? 'আইটেম যোগ করুন' : 'Add Item'}
              </button>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-500 mb-1">Item Type</label>
                      <select
                        value={it.itemType}
                        onChange={(e) => handleItemChange(idx, 'itemType', e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                      >
                        <option value="treatment">Treatment</option>
                        <option value="package">Package</option>
                        <option value="product">Product / Cream</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="sm:col-span-9">
                      <label className="block text-[11px] text-slate-500 mb-1">Description / Catalog</label>
                      {it.itemType === 'treatment' ? (
                        <select
                          value={it.serviceId || ''}
                          onChange={(e) => handleItemChange(idx, 'serviceId', e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="">Select Treatment...</option>
                          {treatments.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} (৳ {Number(t.base_price).toLocaleString()})
                            </option>
                          ))}
                        </select>
                      ) : it.itemType === 'package' ? (
                        <select
                          value={it.packageId || ''}
                          onChange={(e) => handleItemChange(idx, 'packageId', e.target.value)}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="">Select Package...</option>
                          {packages.map((pkg) => (
                            <option key={pkg.id} value={pkg.id}>
                              {pkg.name} (৳ {Number(pkg.price).toLocaleString()})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={it.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          placeholder="e.g. Skin Soothing Hydrogel 50ml"
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
                        />
                      )}
                    </div>
                  </div>

                  {/* Quantity, Unit Price, Line Discount, Line Total */}
                  <div className="grid grid-cols-4 gap-3 pt-1 border-t border-slate-200/60 items-center">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-right font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Unit Price (৳)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={it.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-right font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Discount (৳)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={it.discountAmount || '0'}
                        onChange={(e) => handleItemChange(idx, 'discountAmount', e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-right font-mono"
                      />
                    </div>

                    <div className="flex items-center justify-between pl-2">
                      <div>
                        <span className="block text-[10px] text-slate-400">Total</span>
                        <span className="text-xs font-bold text-slate-800 font-mono tabular-nums">
                          ৳{' '}
                          {(
                            (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0) -
                            (Number(it.discountAmount) || 0)
                          ).toLocaleString()}
                        </span>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Discount & Tax Section */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Overall Discount (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono text-right"
                  />
                  <span className="text-xs text-slate-500">
                    Max for your role: <span className="font-semibold text-slate-700">{roleLimit}%</span>
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Tax / VAT (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono text-right"
                />
              </div>
            </div>

            {/* Over-Limit Supervisor Authorization Fields */}
            {isOverLimit && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>
                    Discount exceeds {roleLimit}% role threshold. Supervisor authorization is required.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-amber-900 font-medium mb-1">
                      Authorized By User ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. usr-admin-01"
                      value={discountAuthorizedBy}
                      onChange={(e) => setDiscountAuthorizedBy(e.target.value)}
                      className="w-full rounded border border-amber-300 px-2.5 py-1 text-xs bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-amber-900 font-medium mb-1">
                      Concession Reason <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Returning VIP patient campaign"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="w-full rounded border border-amber-300 px-2.5 py-1 text-xs bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Display Totals Summary */}
          <div className="p-4 rounded-xl bg-slate-900 text-white flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Calculated Total (Server verified)</p>
              <p className="text-xs text-slate-400">
                Subtotal: ৳{subtotalDisplay.toLocaleString()} • Discount: ৳{discountAmountDisplay.toLocaleString()} • Tax: ৳{taxAmountDisplay.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                ৳ {totalDisplay.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Internal Notes / Terms
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid in full before session procedure"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* Footer Actions: Save Draft & Issue Invoice */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(false)}
              className="rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition"
            >
              {isBn ? 'ড্রাফট সংরক্ষণ' : 'Save as Draft'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isBn ? 'ইনভয়েস ইস্যু করুন' : 'Issue Invoice'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
