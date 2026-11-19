import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Stethoscope,
  Building,
  RotateCcw,
  UserCheck,
  FileText,
  History,
  PhoneCall,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { appointmentsApi } from '../../api/appointments.js';
import type { AppointmentDetailDto, AppointmentStatus } from '@suoxi/shared-types';

interface AppointmentDetailDrawerProps {
  isOpen: boolean;
  appointmentId: string | null;
  onClose: () => void;
  onStatusChange: (updated: AppointmentDetailDto) => void;
  onOpenReschedule: (apt: AppointmentDetailDto) => void;
  onOpenCancel: (apt: AppointmentDetailDto) => void;
}

export const AppointmentDetailDrawer: React.FC<AppointmentDetailDrawerProps> = ({
  isOpen,
  appointmentId,
  onClose,
  onStatusChange,
  onOpenReschedule,
  onOpenCancel,
}) => {
  const [detail, setDetail] = useState<AppointmentDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  useEffect(() => {
    if (appointmentId && isOpen) {
      setIsLoading(true);
      setError(null);
      appointmentsApi
        .get(appointmentId)
        .then((res) => {
          setDetail(res);
        })
        .catch((err) => {
          setError(err.message || 'Failed to load appointment details');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setDetail(null);
    }
  }, [appointmentId, isOpen]);

  if (!isOpen) return null;

  const handleQuickStatus = async (newStatus: AppointmentStatus, reason?: string) => {
    if (!detail) return;
    try {
      setIsChangingStatus(true);
      setError(null);
      await appointmentsApi.changeStatus(detail.id, newStatus, reason);
      const updatedDetail = await appointmentsApi.get(detail.id);
      setDetail(updatedDetail);
      onStatusChange(updatedDetail);
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    } finally {
      setIsChangingStatus(false);
    }
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Confirmed
          </span>
        );
      case 'visited':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
            <UserCheck className="w-3.5 h-3.5" />
            Visited / Checked In
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <XCircle className="w-3.5 h-3.5" />
            Cancelled
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5" />
            No-Show
          </span>
        );
      case 'rescheduled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <RotateCcw className="w-3.5 h-3.5" />
            Rescheduled
          </span>
        );
      case 'booked':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Calendar className="w-3.5 h-3.5" />
            Booked
          </span>
        );
    }
  };

  const isTerminal = detail && ['visited', 'cancelled', 'no_show', 'rescheduled'].includes(detail.status);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-xs">
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/60">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200/80 text-slate-700">
                {detail?.appointment_code || 'APT-LOADING'}
              </span>
              {detail && getStatusBadge(detail.status)}
              {detail?.set_by_clinician && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100/70 text-emerald-800 border border-emerald-200/80" title="Set by doctor (Clinical Protection)">
                  <Stethoscope className="w-3 h-3 text-emerald-600" />
                  Set by Doctor
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-900">{detail?.service_name || 'Appointment Details'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {detail?.appointment_date} · {detail?.start_time} - {detail?.end_time} ({detail?.duration_minutes} min)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm">Loading appointment details...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          ) : detail ? (
            <>
              {/* Quick Status Action Bar */}
              {!isTerminal && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider mr-1">
                    Actions:
                  </span>
                  {detail.status === 'booked' && (
                    <button
                      type="button"
                      disabled={isChangingStatus}
                      onClick={() => handleQuickStatus('confirmed', 'Confirmed by front desk')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Confirm
                    </button>
                  )}
                  {(detail.status === 'booked' || detail.status === 'confirmed') && (
                    <button
                      type="button"
                      disabled={isChangingStatus}
                      onClick={() => handleQuickStatus('visited', 'Patient arrived at clinic and checked in')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-700 hover:bg-green-800 active:bg-green-900 transition-colors shadow-xs"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Check-in (Visited)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenReschedule(detail)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reschedule
                  </button>
                  <button
                    type="button"
                    disabled={isChangingStatus}
                    onClick={() => handleQuickStatus('no_show', 'Patient did not arrive for scheduled slot')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    No-Show
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenCancel(detail)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              )}

              {/* Checked-in confirmation notice if visited */}
              {detail.status === 'visited' && detail.checked_in_at && (
                <div className="p-3.5 rounded-xl bg-green-50 border border-green-200 flex items-center gap-2.5 text-xs text-green-800">
                  <UserCheck className="w-4 h-4 text-green-600 shrink-0" />
                  <span>
                    Checked-in on <strong>{new Date(detail.checked_in_at).toLocaleDateString()}</strong> at <strong>{new Date(detail.checked_in_at).toLocaleTimeString()}</strong>.
                  </span>
                </div>
              )}

              {/* Rescheduled link notices */}
              {detail.rescheduled_to_appointment_id && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2 text-xs text-amber-800">
                  <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Rescheduled to linked appointment #{detail.rescheduled_to_appointment_id}</span>
                </div>
              )}
              {detail.rescheduled_from_appointment_id && (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2 text-xs text-blue-800">
                  <RotateCcw className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Created via reschedule from previous appointment #{detail.rescheduled_from_appointment_id}</span>
                </div>
              )}

              {/* Patient Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Patient Details</h3>
                  </div>
                  <span className="font-mono text-xs text-slate-500 font-medium">{detail.patient_code}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="font-semibold text-slate-900">{detail.patient_name}</p>
                    {detail.patient_name_bn && <p className="text-xs text-slate-500">{detail.patient_name_bn}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono">{detail.patient_mobile}</span>
                  </div>
                </div>

                {detail.patient_summary && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block">Gender / Age</span>
                      <span className="font-medium text-slate-700 capitalize">
                        {detail.patient_summary.gender} · {detail.patient_summary.approximate_age || 'N/A'} yrs
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Blood Group</span>
                      <span className="font-medium text-slate-700">{detail.patient_summary.blood_group || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Outstanding Due</span>
                      <span className={`font-semibold ${detail.patient_summary.due_amount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        ৳ {detail.patient_summary.due_amount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Appointment Specifics */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Booking Specifications</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Assigned Clinician</span>
                    <p className="font-semibold text-slate-900">{detail.provider_name}</p>
                    <p className="text-slate-500 text-[11px]">{detail.provider_role}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Physical Resource</span>
                    <p className="font-medium text-slate-800">{detail.resource_name || 'General Consultation Room'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Source Channel</span>
                    <p className="font-medium text-slate-800">{detail.source_name}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Call Reference Code</span>
                    <p className="font-mono text-slate-700">{detail.call_reference || 'N/A'}</p>
                  </div>
                </div>

                {detail.notes && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-slate-400 text-xs block mb-1">Clinical / Reception Notes</span>
                    <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 leading-relaxed">
                      {detail.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Status Audit History Timeline */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                  <History className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Status Audit History</h3>
                </div>

                <div className="space-y-3">
                  {detail.status_history.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">No previous history entries recorded.</p>
                  ) : (
                    detail.status_history.map((h) => (
                      <div key={h.id} className="relative pl-5 border-l-2 border-emerald-300 pb-2 text-xs">
                        <div className="absolute -left-[5px] top-0.5 w-2 h-2 rounded-full bg-emerald-600" />
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 capitalize">
                            {h.to_status}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(h.created_at).toLocaleString()}
                          </span>
                        </div>
                        {h.reason && <p className="text-slate-600 mt-0.5">{h.reason}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">By {h.changer_name || h.changed_by}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
