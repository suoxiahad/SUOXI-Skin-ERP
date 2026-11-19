import React, { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { appointmentsApi } from '../../api/appointments.js';
import type { AppointmentDto } from '@suoxi/shared-types';

interface CancelAppointmentModalProps {
  isOpen: boolean;
  appointment: AppointmentDto | null;
  onClose: () => void;
  onSuccess: (updated: AppointmentDto) => void;
}

export const CancelAppointmentModal: React.FC<CancelAppointmentModalProps> = ({
  isOpen,
  appointment,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !appointment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a mandatory cancellation reason.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await appointmentsApi.cancel(appointment.id, reason.trim());
      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 bg-red-50/70 border-b border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-100 text-red-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">Cancel Appointment</h3>
              <p className="text-xs text-red-700 font-mono">{appointment.appointment_code}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-1">
            <p><span className="font-medium text-slate-800">Patient:</span> {appointment.patient_name} ({appointment.patient_code})</p>
            <p><span className="font-medium text-slate-800">Doctor:</span> {appointment.provider_name}</p>
            <p><span className="font-medium text-slate-800">Schedule:</span> {appointment.appointment_date} at {appointment.start_time}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason for Cancellation <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Patient called to cancel due to family emergency; doctor requested emergency leave reschedule..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 placeholder-slate-400"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Keep Appointment
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Confirm Cancellation'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
