import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  Search,
  UserPlus,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Sparkles,
  Stethoscope,
  Building,
} from 'lucide-react';
import { appointmentsApi } from '../../api/appointments.js';
import { patientsApi } from '../../api/patients.js';
import { RegisterPatientDrawer } from '../patients/RegisterPatientDrawer.js';
import type {
  AppointmentDto,
  AppointmentType,
  AppointmentSourceDto,
  ResourceDto,
  TimeSlotDto,
  PatientDto,
  RestrictedCallCenterPatientDto,
} from '@suoxi/shared-types';

interface NewAppointmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (appointment: AppointmentDto) => void;
  preselectedPatient?: PatientDto | null;
  initialDoctorId?: string;
  initialDate?: string;
  initialTime?: string;
}

const SERVICE_CATALOG = [
  { name: 'HydraFacial Treatment', category: 'Skin Care', duration: 45, defaultResourceType: 'device', allowedResourceNames: ['HydraFacial Device', 'Room 1'] },
  { name: 'Laser Carbon Peel', category: 'Laser & Aesthetic', duration: 30, defaultResourceType: 'room', allowedResourceNames: ['Laser Room'] },
  { name: 'Melasma Laser Toning', category: 'Laser & Aesthetic', duration: 45, defaultResourceType: 'room', allowedResourceNames: ['Laser Room'] },
  { name: 'General Dermatology Consultation', category: 'General Consultation', duration: 30, defaultResourceType: 'room', allowedResourceNames: ['Room 1', 'Room 2'] },
  { name: 'Acne Scar Revision Consultation', category: 'General Consultation', duration: 30, defaultResourceType: 'room', allowedResourceNames: ['Room 1', 'Room 2'] },
  { name: 'Chemical Peel (Glycolic / Salicylic)', category: 'Skin Care', duration: 30, defaultResourceType: 'room', allowedResourceNames: ['Room 1', 'Room 2'] },
  { name: 'PRP Hair Rejuvenation Therapy', category: 'Hair Therapy', duration: 60, defaultResourceType: 'room', allowedResourceNames: ['Room 2'] },
  { name: 'Anti-Aging Botox Assessment', category: 'Anti-Aging', duration: 30, defaultResourceType: 'room', allowedResourceNames: ['Room 1'] },
];

export const NewAppointmentDrawer: React.FC<NewAppointmentDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedPatient,
  initialDoctorId,
  initialDate,
  initialTime,
}) => {
  // 1. Patient State
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSearchResults, setPatientSearchResults] = useState<Array<PatientDto | RestrictedCallCenterPatientDto>>([]);
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientDto | RestrictedCallCenterPatientDto | null>(preselectedPatient || null);
  const [isRegisterDrawerOpen, setIsRegisterDrawerOpen] = useState(false);

  // 2. Appointment Type
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('consultation');

  // 3. Provider
  const [providerId, setProviderId] = useState('usr-101');

  // 4. Treatment / Service
  const [serviceName, setServiceName] = useState('HydraFacial Treatment');
  const [serviceCategory, setServiceCategory] = useState('Skin Care');
  const [durationMinutes, setDurationMinutes] = useState(45);

  // 5. Room / Device Resource
  const [resources, setResources] = useState<ResourceDto[]>([]);
  const [resourceId, setResourceId] = useState<string>('');

  // 6. Date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [appointmentDate, setAppointmentDate] = useState(tomorrow.toISOString().substring(0, 10));

  // 7. Start Time & Slots
  const [startTime, setStartTime] = useState('11:00');
  const [availableSlots, setAvailableSlots] = useState<TimeSlotDto[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // 8. Source
  const [sources, setSources] = useState<AppointmentSourceDto[]>([]);
  const [sourceId, setSourceId] = useState('src-1');

  // 9. Call Reference Number
  const [callReference, setCallReference] = useState('');

  // 10. Walk-in Toggle
  const [isWalkIn, setIsWalkIn] = useState(false);

  // 11. Notes
  const [notes, setNotes] = useState('');

  // Conflict state
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [isCheckingConflict, setIsCheckingConflict] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (preselectedPatient) {
      setSelectedPatient(preselectedPatient);
    }
  }, [preselectedPatient]);

  useEffect(() => {
    if (isOpen) {
      if (initialDoctorId) setProviderId(initialDoctorId);
      if (initialDate) setAppointmentDate(initialDate);
      if (initialTime) setStartTime(initialTime);
    }
  }, [isOpen, initialDoctorId, initialDate, initialTime]);

  // Load sources & resources on open
  useEffect(() => {
    if (isOpen) {
      appointmentsApi.getSources().then((res) => {
        setSources(res);
        if (res.length > 0 && !sourceId) {
          setSourceId(res[0].id);
        }
      }).catch(() => {});

      appointmentsApi.getResources('br-dhanmondi').then((res) => {
        setResources(res);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Handle service change: auto-fills duration and sets suitable resource
  const handleServiceSelect = (svcName: string) => {
    const svc = SERVICE_CATALOG.find((s) => s.name === svcName);
    if (svc) {
      setServiceName(svc.name);
      setServiceCategory(svc.category);
      setDurationMinutes(svc.duration);

      // Filter compatible resource
      const compatibleRes = resources.find((r) => svc.allowedResourceNames.includes(r.name));
      if (compatibleRes) {
        setResourceId(compatibleRes.id);
      }
    }
  };

  // Search patients debounced
  useEffect(() => {
    if (!patientSearch.trim() || selectedPatient) {
      setPatientSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setIsSearchingPatient(true);
      patientsApi
        .list({ q: patientSearch.trim(), limit: 5 })
        .then((res) => {
          setPatientSearchResults(res);
        })
        .catch(() => {
          setPatientSearchResults([]);
        })
        .finally(() => {
          setIsSearchingPatient(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [patientSearch, selectedPatient]);

  // Load slot availability when provider, date, or duration changes
  useEffect(() => {
    if (isOpen && providerId && appointmentDate) {
      setIsLoadingSlots(true);
      appointmentsApi
        .getAvailability(providerId, appointmentDate, durationMinutes)
        .then((res) => {
          setAvailableSlots(res.slots || []);
          // Check conflict for currently chosen slot
          const chosenSlot = res.slots?.find((s) => s.start_time === startTime);
          if (chosenSlot && !chosenSlot.is_available) {
            setConflictWarning(chosenSlot.conflict_reason || `Slot ${startTime} is already occupied`);
          } else {
            setConflictWarning(null);
          }
        })
        .catch(() => {
          setAvailableSlots([]);
        })
        .finally(() => {
          setIsLoadingSlots(false);
        });
    }
  }, [isOpen, providerId, appointmentDate, durationMinutes, startTime]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPatient) {
      setSubmitError('Please select or register a patient first.');
      return;
    }
    if (!appointmentDate || !startTime) {
      setSubmitError('Please choose appointment date and start time.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        patient_id: selectedPatient.id,
        branch_id: 'br-dhanmondi',
        provider_id: providerId,
        resource_id: resourceId || null,
        source_id: sourceId || 'src-1',
        service_category: serviceCategory,
        service_name: serviceName,
        appointment_date: appointmentDate,
        start_time: startTime,
        duration_minutes: durationMinutes,
        appointment_type: appointmentType,
        set_by_clinician: false,
        is_walk_in: isWalkIn,
        call_reference: callReference.trim() || null,
        notes: notes.trim() || null,
      };

      const res = await appointmentsApi.create(payload);
      onSuccess(res);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to book appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-xs">
        <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                  <Calendar className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">New Appointment</h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Rapid booking · Sub-60s workflow · Asia/Dhaka wall-clock</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Fields in Required Order */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* 1. Patient Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  1. Patient <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsRegisterDrawerOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  + Register New Patient
                </button>
              </div>

              {selectedPatient ? (
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/60 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                      {selectedPatient.fullName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{selectedPatient.fullName}</p>
                      <p className="text-xs text-slate-600 font-mono">
                        {selectedPatient.patientCode} · {selectedPatient.primaryMobile}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPatient(null);
                      setPatientSearch('');
                    }}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-white/60"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="Search patient by mobile (+8801...), name, or code..."
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    {isSearchingPatient && (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-2.5" />
                    )}
                  </div>

                  {patientSearchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 divide-y divide-slate-100 z-10 max-h-48 overflow-y-auto">
                      {patientSearchResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatientSearchResults([]);
                          }}
                          className="w-full p-2.5 text-left hover:bg-slate-50 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-900">{p.fullName}</span>
                            <span className="text-slate-400 ml-2 font-mono">({p.patientCode})</span>
                          </div>
                          <span className="font-mono text-slate-600">{p.primaryMobile}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Appointment Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                2. Appointment Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(['consultation', 'treatment_session', 'follow_up', 'other'] as AppointmentType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAppointmentType(type)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold capitalize border text-center transition-all ${
                      appointmentType === type
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Doctor / Consultant / Therapist */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                3. Clinician / Consultant <span className="text-red-500">*</span>
              </label>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
              >
                <option value="usr-101">Dr. Nusrat Jahan (Dermatologist & Aesthetic Consultant)</option>
                <option value="usr-102">Dr. Farhana Khan (Laser Specialist)</option>
                <option value="usr-103">Sabrina Mostafa (Senior Aesthetic Therapist)</option>
              </select>
            </div>

            {/* 4. Treatment / Service */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                4. Treatment / Service <span className="text-red-500">*</span>
              </label>
              <select
                value={serviceName}
                onChange={(e) => handleServiceSelect(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
              >
                {SERVICE_CATALOG.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.duration} min) · {s.category}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Room or Device (Filtered for Selected Service) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                5. Room or Device (Compatible Resources)
              </label>
              <select
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
              >
                <option value="">No specific room / auto-assign at reception</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.resource_type === 'room' ? 'Clinical Room' : 'Aesthetic Device'})
                  </option>
                ))}
              </select>
            </div>

            {/* 6 & 7. Date and Start Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  6. Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={appointmentDate}
                  min={new Date().toISOString().substring(0, 10)}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  7. Start Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Slot grid from provider schedule */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Provider Working Hours Slots (Duration: {durationMinutes}m)
                </span>
                {isLoadingSlots && <span className="text-[11px] text-slate-400">Checking availability...</span>}
              </div>
              <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto p-1.5 border border-slate-200 rounded-xl bg-slate-50/50">
                {availableSlots.length === 0 ? (
                  <div className="col-span-5 py-3 text-center text-xs text-slate-400">
                    No scheduled slots for this date. Enter time directly.
                  </div>
                ) : (
                  availableSlots.map((slot) => (
                    <button
                      key={slot.start_time}
                      type="button"
                      disabled={!slot.is_available}
                      onClick={() => setStartTime(slot.start_time)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium text-center transition-all ${
                        startTime === slot.start_time
                          ? 'bg-emerald-600 text-white font-bold shadow-xs'
                          : slot.is_available
                          ? 'bg-white hover:bg-emerald-50 text-slate-700 border border-slate-200'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed line-through'
                      }`}
                    >
                      {slot.start_time}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* LIVE CONFLICT WARNING */}
            {conflictWarning && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800">Booking Conflict Detected</p>
                  <p className="mt-0.5">{conflictWarning}</p>
                  <p className="text-[11px] text-red-600 mt-1">Please pick an alternate time slot or provider.</p>
                </div>
              </div>
            )}

            {/* 8. Source */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                8. Acquisition Source <span className="text-red-500">*</span>
              </label>
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.bn_name ? `(${s.bn_name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 9. Call Reference Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                9. Reference from Call Software <span className="text-slate-400 text-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={callReference}
                onChange={(e) => setCallReference(e.target.value)}
                placeholder="e.g. CALL-20261019-9812 or Vicidial ticket ID"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
              />
              <span className="text-[11px] text-slate-400 block mt-1">
                CRM never dials or records calls. Reference is typed manually from telephony software.
              </span>
            </div>

            {/* 10. Walk-in Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
              <div>
                <span className="text-xs font-semibold text-slate-800 block">10. Walk-in Patient</span>
                <span className="text-[11px] text-slate-500 block">Patient physically present at front desk without prior booking</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWalkIn}
                  onChange={(e) => setIsWalkIn(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* 11. Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                11. Notes & Clinical Guidance
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Patient concerns, skin sensitivity warnings, special instructions..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder-slate-400"
              />
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {submitError}
              </div>
            )}
          </form>

          {/* Footer Submit */}
          <div className="p-6 border-t border-slate-100 bg-white flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Discard Draft
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedPatient || !appointmentDate || !startTime}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Booking Appointment...
                </>
              ) : (
                'Create Appointment (< 60s)'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Inline Register Patient Drawer (Draft preserved without loss) */}
      <RegisterPatientDrawer
        isOpen={isRegisterDrawerOpen}
        onClose={() => setIsRegisterDrawerOpen(false)}
        onSuccess={(newPatient) => {
          setSelectedPatient(newPatient);
          setIsRegisterDrawerOpen(false);
        }}
      />
    </>
  );
};
