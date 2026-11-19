import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  CheckCircle,
  AlertCircle,
  Search,
  Stethoscope,
  Building2,
  Activity,
  PhoneCall,
  FileText,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Patient } from '../../../types/index.ts';

interface QuickBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (apt?: any) => void;
  initialPatientId?: string;
}

export const QuickBookModal: React.FC<QuickBookModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialPatientId,
}) => {
  const { branches, activeBranchId, addToast } = useApp();

  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId || '');

  // Requested fields - Doctor defaults to Duty Doctor:
  const [branchId, setBranchId] = useState('');
  const [doctorId, setDoctorId] = useState('usr-duty');
  const [doctorName, setDoctorName] = useState('Duty Doctor');
  const [diseaseName, setDiseaseName] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [bookingMethod, setBookingMethod] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 60-second stopwatch for speed measurement
  const [timerSeconds, setTimerSeconds] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setTimerSeconds(0);
      setPatientSearch('');
      setError('');
      if (!initialPatientId) {
        setSelectedPatientId('');
      }
      setBranchId('');
      setDoctorId('usr-duty');
      setDoctorName('Duty Doctor');
      setDiseaseName('');
      setAppointmentDate('');
      setAppointmentTime('');
      setBookingMethod('');
      setNotes('');
      return;
    }

    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);

    // Fetch patients list
    api.patients.list().then((list) => {
      setPatientsList(list);
      if (initialPatientId) {
        setSelectedPatientId(initialPatientId);
      }
      // Never auto-select default patient: keep blank per user requirement
    });

    return () => clearInterval(interval);
  }, [isOpen, initialPatientId]);

  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patientsList;
    const q = patientSearch.toLowerCase().trim();
    return patientsList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.patientIdCode.toLowerCase().includes(q)
    );
  }, [patientsList, patientSearch]);

  const selectedPatient = useMemo(() => {
    return patientsList.find((p) => p.id === selectedPatientId) || null;
  }, [patientsList, selectedPatientId]);

  const handleSelectPatientOnEnter = () => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) {
      setError('Please type patient name, phone number, or ID, then press Enter.');
      return;
    }

    // 1. Check exact match on phone, clean phone, patient code, or name
    const exactMatch = patientsList.find(
      (p) =>
        p.phone.trim().toLowerCase() === q ||
        p.phone.replace(/[\s\-\+]/g, '') === q.replace(/[\s\-\+]/g, '') ||
        p.patientIdCode.trim().toLowerCase() === q ||
        p.name.trim().toLowerCase() === q
    );

    if (exactMatch) {
      setSelectedPatientId(exactMatch.id);
      setPatientSearch('');
      setError('');
      return;
    }

    // 2. Check partial matches in filteredPatients
    if (filteredPatients.length > 0) {
      setSelectedPatientId(filteredPatients[0].id);
      setPatientSearch('');
      setError('');
    } else {
      setError(`No registered patient found matching "${patientSearch.trim()}". Please verify phone or name.`);
    }
  };

  const handlePatientSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSelectPatientOnEnter();
    }
  };

  if (!isOpen) return null;

  const doctorsList = [
    { id: 'usr-duty', name: 'Duty Doctor', title: 'On-Duty Medical Officer' },
    { id: 'usr-101', name: 'Dr. Nusrat Jahan', title: 'Consultant Aesthetic Dermatologist' },
    { id: 'usr-102', name: 'Dr. Tanvir Ahmed', title: 'Consultant Cosmetologist & Laser Specialist' },
    { id: 'usr-103', name: 'Dr. Farhana Khan', title: 'Aesthetic Physician' },
  ];

  const bookingMethods = [
    'IP Call',
    'Phone GP',
    'WhatsApp',
    'Facebook Messenger',
    'Instagram DM',
    'Website',
    'Walk-in',
    'Referral Other',
  ] as const;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let effectivePatientId = selectedPatientId;
    let effectivePatient = selectedPatient;

    if (!effectivePatientId) {
      if (patientSearch.trim()) {
        const q = patientSearch.trim().toLowerCase();
        const found = patientsList.find(
          (p) =>
            p.phone.trim().toLowerCase() === q ||
            p.phone.replace(/[\s\-\+]/g, '') === q.replace(/[\s\-\+]/g, '') ||
            p.patientIdCode.trim().toLowerCase() === q ||
            p.name.trim().toLowerCase() === q ||
            p.name.toLowerCase().includes(q) ||
            p.phone.includes(q)
        );
        if (found) {
          effectivePatientId = found.id;
          effectivePatient = found;
          setSelectedPatientId(found.id);
          setPatientSearch('');
        } else {
          setError(`No registered patient found matching "${patientSearch.trim()}". Please check phone or name.`);
          return;
        }
      } else {
        setError('Please search and select a registered patient by pressing Enter.');
        return;
      }
    }

    if (!branchId) {
      setError('Please select a clinic branch.');
      return;
    }

    if (!doctorId) {
      setError('Please select a doctor.');
      return;
    }

    if (!diseaseName.trim()) {
      setError('Please provide a Disease Name / Clinical Concern.');
      return;
    }

    if (!appointmentDate) {
      setError('Please select appointment date.');
      return;
    }

    if (!appointmentTime) {
      setError('Please select appointment time.');
      return;
    }

    if (!bookingMethod) {
      setError('Please select a booking method.');
      return;
    }

    try {
      setIsSubmitting(true);

      const apt = await api.appointments.create({
        patientId: effectivePatientId,
        patientName: effectivePatient?.name,
        patientPhone: effectivePatient?.phone,
        patientCode: effectivePatient?.patientIdCode,
        branchId,
        doctorId,
        doctorName: doctorName || 'Assigned Doctor',
        diseaseName: diseaseName.trim(),
        bookingMethod,
        serviceName: `Consultation: ${diseaseName.trim()}`,
        appointmentDate,
        appointmentTime,
        durationMinutes: 30,
        callReference: bookingMethod,
        notes: notes.trim() || undefined,
      });

      const branchObj = branches.find((b) => b.id === branchId);
      const enhancedApt = {
        ...apt,
        patientName: apt.patientName || effectivePatient?.name || 'Registered Patient',
        patientPhone: apt.patientPhone || effectivePatient?.phone || '',
        patientAge: effectivePatient?.age || 28,
        patientGender: effectivePatient?.gender || 'female',
        patientAddress: effectivePatient?.address || effectivePatient?.city || 'Dhaka',
        patientBloodGroup: effectivePatient?.bloodGroup || 'B+',
        diseaseName: diseaseName.trim(),
        bookingMethod,
        branchId,
        branchName: branchObj?.name || 'Dhanmondi Main Center',
        doctorId,
        doctorName: doctorName || 'Assigned Doctor',
        appointmentDate,
        appointmentTime,
        status: apt.status || 'booked',
      };

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('appointment-created', { detail: enhancedApt }));
        window.dispatchEvent(new CustomEvent('appointments-updated', { detail: enhancedApt }));
      }

      addToast({
        type: 'success',
        title: 'Appointment Booked Successfully!',
        description: `${enhancedApt.patientName} — ${enhancedApt.appointmentDate} (${enhancedApt.appointmentTime}) [${timerSeconds}s]`,
      });

      // Reset form
      if (!initialPatientId) {
        setSelectedPatientId('');
      }
      setBranchId('');
      setDoctorId('usr-duty');
      setDoctorName('Duty Doctor');
      setDiseaseName('');
      setAppointmentDate('');
      setAppointmentTime('');
      setBookingMethod('');
      setNotes('');

      onSuccess?.(enhancedApt);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to book appointment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#0DA54F]" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                Book Appointment
              </h2>
              <p className="text-xs text-slate-500">
                Schedule an appointment for an existing registered patient
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 60s target stopwatch */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border ${
                timerSeconds <= 60
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title="Time elapsed since opening booking modal"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{timerSeconds}s</span>
              <span className="text-[10px] text-slate-400 font-normal">/ 60s target</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body - STRICTLY BOOKING AN APPOINTMENT */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
          {/* 1. Patient Selection */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>Patient Selection</span>
                <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                {patientsList.length} registered patients
              </span>
            </div>

            {/* Selected Patient Banner if chosen */}
            {selectedPatient ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{selectedPatient.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 font-semibold">
                        {selectedPatient.patientIdCode}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                      {selectedPatient.phone} · <span className="capitalize">{selectedPatient.gender}, {selectedPatient.age || 28}y</span> · {selectedPatient.city || 'Dhaka'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatientId('');
                    setPatientSearch('');
                  }}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline px-2 py-1 rounded cursor-pointer"
                  title="Choose a different patient"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => {
                    setPatientSearch(e.target.value);
                    if (error) setError('');
                  }}
                  onKeyDown={handlePatientSearchKeyDown}
                  placeholder="Search patient by name, +880 phone, or SX ID... (Type & press Enter ↵)"
                  className="w-full pl-9 pr-24 py-2.5 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
                  autoFocus
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {patientSearch && (
                    <button
                      type="button"
                      onClick={() => setPatientSearch('')}
                      className="text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSelectPatientOnEnter}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-semibold font-mono transition-colors cursor-pointer"
                    title="Press Enter to select"
                  >
                    <span>Enter ↵</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Clinic Branch & Doctor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Clinic Branch</span>
                <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="">Select Clinic Branch...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>Doctor</span>
                <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={doctorId}
                onChange={(e) => {
                  setDoctorId(e.target.value);
                  const doc = doctorsList.find((d) => d.id === e.target.value);
                  if (doc) setDoctorName(doc.name);
                  else setDoctorName('Duty Doctor');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                {doctorsList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Disease Name (Clean text input without drop-down or suggestions) */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-rose-500" />
              <span>Disease Name</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={diseaseName}
              onChange={(e) => setDiseaseName(e.target.value)}
              placeholder="e.g. Acne Vulgaris, Melasma, Alopecia"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* 4. Date, Time & Booking Method */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Date</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Time</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                required
                value={appointmentTime}
                onChange={(e) => setAppointmentTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <PhoneCall className="w-3.5 h-3.5 text-[#0DA54F]" />
                <span>Booking Method</span>
                <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={bookingMethod}
                onChange={(e) => setBookingMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="">Select Booking Method...</option>
                {bookingMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 5. Appointment Notes */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Appointment Notes</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. VIP patient, requested specific consultation room, referred by partner clinic"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#0DA54F] hover:bg-[#0a8740] active:bg-[#086c33] rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Calendar className="w-4 h-4" />
              <span>{isSubmitting ? 'Booking...' : 'Book Appointment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
