import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { appointmentsApi } from '../../api/appointments.js';
import type { AppointmentDto, TimeSlotDto } from '@suoxi/shared-types';

interface RescheduleAppointmentModalProps {
  isOpen: boolean;
  appointment: AppointmentDto | null;
  onClose: () => void;
  onSuccess: (oldApt: AppointmentDto, newApt: AppointmentDto) => void;
}

export const RescheduleAppointmentModal: React.FC<RescheduleAppointmentModalProps> = ({
  isOpen,
  appointment,
  onClose,
  onSuccess,
}) => {
  const [newDate, setNewDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [reason, setReason] = useState('');
  const [availableSlots, setAvailableSlots] = useState<TimeSlotDto[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appointment && isOpen) {
      // Default to tomorrow or next day
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const defaultDate = d.toISOString().substring(0, 10);
      setNewDate(defaultDate);
      setSelectedTime(appointment.start_time || '11:00');
      setReason('');
      setError(null);
    }
  }, [appointment, isOpen]);

  useEffect(() => {
    if (appointment && newDate) {
      setIsLoadingSlots(true);
      appointmentsApi
        .getAvailability(appointment.provider_id, newDate, appointment.duration_minutes)
        .then((res) => {
          setAvailableSlots(res.slots || []);
        })
        .catch(() => {
          setAvailableSlots([]);
        })
        .finally(() => {
          setIsLoadingSlots(false);
        });
    }
  }, [appointment, newDate]);

  if (!isOpen || !appointment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a mandatory rescheduling reason.');
      return;
    }
    if (!newDate || !selectedTime) {
      setError('Please choose a valid new date and time slot.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await appointmentsApi.reschedule(appointment.id, {
        appointment_date: newDate,
        start_time: selectedTime,
        duration_minutes: appointment.duration_minutes,
        resource_id: appointment.resource_id,
        reason: reason.trim(),
      });
      onSuccess(res.oldAppointment, res.newAppointment);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">Reschedule Appointment</h3>
              <p className="text-xs text-amber-700 font-mono">Current: {appointment.appointment_code} ({appointment.appointment_date} at {appointment.start_time})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-1">
            <p><span className="font-medium text-slate-800">Patient:</span> {appointment.patient_name} ({appointment.patient_code})</p>
            <p><span className="font-medium text-slate-800">Doctor:</span> {appointment.provider_name}</p>
            <p><span className="font-medium text-slate-800">Service:</span> {appointment.service_name}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                New Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={newDate}
                min={new Date().toISOString().substring(0, 10)}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                New Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Available Provider Slots
              </label>
              {isLoadingSlots && <span className="text-xs text-slate-400">Loading slots...</span>}
            </div>

            <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1 border border-slate-200 rounded-xl bg-slate-50/50">
              {availableSlots.length === 0 ? (
                <div className="col-span-4 py-4 text-center text-xs text-slate-400">
                  {isLoadingSlots ? 'Checking doctor availability...' : 'No predefined slot schedule found for this date. Enter time manually.'}
                </div>
              ) : (
                availableSlots.map((s) => (
                  <button
                    key={s.start_time}
                    type="button"
                    disabled={!s.is_available}
                    onClick={() => setSelectedTime(s.start_time)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-center transition-all ${
                      selectedTime === s.start_time
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                        : s.is_available
                        ? 'bg-white hover:bg-emerald-50 text-slate-700 border border-slate-200'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed line-through'
                    }`}
                  >
                    {s.start_time}
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason for Reschedule <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Patient requested morning slot; provider unavailable on original date..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder-slate-400"
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim() || !newDate || !selectedTime}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rescheduling...
                </>
              ) : (
                'Confirm Reschedule'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
