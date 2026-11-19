import React, { useState, useEffect } from 'react';
import {
  Package,
  Calendar,
  Clock,
  Sparkles,
  X,
  Check,
  AlertCircle,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { packagesApi } from '../../api/packages.js';
import type { PackageDto, PatientPackageDto } from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';

interface AssignPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
  initialPackageId?: string;
  onAssigned?: (pkg: PatientPackageDto) => void;
}

export const AssignPackageModal: React.FC<AssignPackageModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  initialPackageId,
  onAssigned,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';

  const [loading, setLoading] = useState<boolean>(true);
  const [packages, setPackages] = useState<PackageDto[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>(initialPackageId || '');
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [priceSold, setPriceSold] = useState<string>('');
  const [saleTerms, setSaleTerms] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchPackages = async () => {
      try {
        setLoading(true);
        const list = await packagesApi.listPackages({ activeOnly: true });
        setPackages(list);
        if (list.length > 0 && !selectedPackageId) {
          const first = initialPackageId
            ? list.find((p) => p.id === initialPackageId) || list[0]
            : list[0];
          setSelectedPackageId(first.id);
          setPriceSold(first.price);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load packages');
      } finally {
        setLoading(false);
      }
    };

    fetchPackages();
  }, [isOpen, initialPackageId]);

  const selectedPkg = packages.find((p) => p.id === selectedPackageId);

  // Auto-calculate expiry date
  let calculatedExpiry = '';
  if (selectedPkg && startDate) {
    const sDate = new Date(startDate);
    sDate.setDate(sDate.getDate() + selectedPkg.validityDays);
    calculatedExpiry = sDate.toISOString().split('T')[0];
  }

  const handleSelectPackage = (pkgId: string) => {
    setSelectedPackageId(pkgId);
    const p = packages.find((x) => x.id === pkgId);
    if (p) {
      setPriceSold(p.price);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackageId) return;

    try {
      setSubmitting(true);
      setError(null);
      const assigned = await packagesApi.assignPackage({
        patientId,
        packageId: selectedPackageId,
        purchaseDate,
        startDate,
        priceSold: priceSold ? parseFloat(priceSold) : undefined,
        saleTerms: saleTerms.trim() || undefined,
      });

      onAssigned?.(assigned);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to assign package to patient');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white border border-brand-border rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-brand-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-brand-text flex items-center gap-2">
              <Package className="w-5 h-5 text-brand-primary" />
              {isBn ? 'রোগীর জন্য প্যাকেজ বরাদ্দ করুন' : 'Assign Treatment Package'}
            </h3>
            <p className="text-xs text-brand-muted mt-0.5">
              {patientName ? `${patientName} (${patientId})` : patientId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-brand-muted hover:text-brand-text hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Select Package */}
          <div>
            <label className="block text-xs font-semibold text-brand-text mb-1">
              {isBn ? 'প্যাকেজ নির্বাচন করুন' : 'Select Treatment Package'} *
            </label>
            {loading ? (
              <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ) : (
              <select
                value={selectedPackageId}
                onChange={(e) => handleSelectPackage(e.target.value)}
                className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm text-brand-text focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
              >
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.packageCode}) — ৳ {Number(p.price).toLocaleString()} ({p.validityDays} days)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Included treatments summary snapshot */}
          {selectedPkg && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                {isBn ? 'অন্তর্ভুক্ত সেবা (স্ন্যাপশট তৈরি হবে)' : 'Included Entitlements (Snapshot)'}:
              </span>
              <div className="space-y-1">
                {selectedPkg.items.map((it) => (
                  <div key={it.id} className="flex justify-between text-slate-600">
                    <span>{it.serviceName}</span>
                    <strong className="text-brand-primary font-mono">{it.sessionCount} sessions</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dates Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-brand-text mb-1">
                {isBn ? 'ক্রয়ের তারিখ' : 'Purchase Date'} *
              </label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text mb-1">
                {isBn ? 'শুরুর তারিখ' : 'Start Date'} *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
              />
            </div>
          </div>

          {/* Auto-calculated Expiry Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-800">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>
                {isBn ? 'স্বয়ংক্রিয় মেয়াদ শেষ:' : 'Auto-Calculated Expiry:'}{' '}
                <strong className="font-mono">{calculatedExpiry || '—'}</strong>
              </span>
            </div>
            <span className="text-emerald-700 font-medium">
              ({selectedPkg?.validityDays || 0} days)
            </span>
          </div>

          {/* Price Sold & Terms */}
          <div>
            <label className="block text-xs font-semibold text-brand-text mb-1">
              {isBn ? 'বিক্রয়কৃত মূল্য (টাকা ৳)' : 'Price Sold (BDT ৳)'} *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={priceSold}
              onChange={(e) => setPriceSold(e.target.value)}
              className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-text mb-1">
              {isBn ? 'বিক্রয় শর্তাবলী / প্রচার নোট' : 'Sale Terms / Campaign Notes'}
            </label>
            <input
              type="text"
              value={saleTerms}
              onChange={(e) => setSaleTerms(e.target.value)}
              placeholder="e.g. Summer promotion, non-refundable"
              className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:ring-2 focus:ring-brand-primary focus:outline-hidden"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-brand-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-brand-border rounded-lg text-xs font-semibold text-brand-text hover:bg-slate-50"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand-primary hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              {submitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {isBn ? 'বরাদ্দ নিশ্চিত করুন' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
