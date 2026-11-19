import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmReasonModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isDestructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export const ConfirmReasonModal: React.FC<ConfirmReasonModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm Action',
  isDestructive = true,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Please provide a mandatory reason of at least 5 characters for this clinical/financial audit log.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isDestructive ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-slate-600">{description}</p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Audit Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Patient requested appointment cancellation / Incorrect billing item entered / Damaged vial during procedure"
              className="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
            {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-3 py-1.5 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-1.5 ${
                isDestructive
                  ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300'
                  : 'bg-[#0DA54F] hover:bg-[#0a8740] disabled:bg-[#0DA54F]/50'
              }`}
            >
              {isSubmitting ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
