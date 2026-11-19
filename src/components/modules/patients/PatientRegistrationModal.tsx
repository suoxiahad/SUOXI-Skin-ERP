import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  UserPlus,
  AlertCircle,
  AlertTriangle,
  FileText,
  User,
  Mail,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Patient } from '../../../types/index.ts';

interface PatientRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (patient: Patient) => void;
}

export const PatientRegistrationModal: React.FC<PatientRegistrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useApp();

  // Form State - strictly requested fields:
  // Patient Name, Phone Number, Email (optional), Gender, Age, Blood Group, Address, Past Medical History
  // Clinic branch is NOT set at registration because a registered patient can book appointments at any clinic branch
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'other' | ''>('');
  const [age, setAge] = useState<number | ''>('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [address, setAddress] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  // Validation & Duplicate State
  const [existingPatients, setExistingPatients] = useState<Patient[]>([]);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setDuplicateWarning(null);
      setName('');
      setPhone('');
      setEmail('');
      setGender('');
      setAge('');
      setBloodGroup('');
      setAddress('');
      setMedicalHistory('');

      // Fetch existing patients for instant duplicate phone checking
      api.patients
        .list()
        .then((list) => {
          setExistingPatients(list);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Check duplicate phone on change
  useEffect(() => {
    const clean = phone.trim().replace(/\s+/g, '');
    if (clean.length >= 10) {
      const match = existingPatients.find((p) => {
        const pClean = p.phone.replace(/[\s+-]/g, '');
        const currClean = clean.replace(/[\s+-]/g, '');
        return pClean.endsWith(currClean.slice(-10)) || currClean.endsWith(pClean.slice(-10));
      });
      if (match) {
        setDuplicateWarning(
          `Warning: This mobile matches existing patient (${match.name} - ${match.patientIdCode}).`
        );
      } else {
        setDuplicateWarning(null);
      }
    } else {
      setDuplicateWarning(null);
    }
  }, [phone, existingPatients]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic Validation
    if (!name.trim()) {
      setError('Patient name is required.');
      return;
    }

    let cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone) {
      setError('Phone number is required.');
      return;
    }

    // Auto-normalize if typed without country code: 01XXXXXXXXX -> +8801XXXXXXXXX
    if (/^01[3-9]\d{8}$/.test(cleanPhone)) {
      cleanPhone = `+88${cleanPhone}`;
    }

    if (!/^\+?8801[3-9]\d{8}$/.test(cleanPhone)) {
      setError('Please enter a valid Bangladesh mobile number (+8801XXXXXXXXX or 01XXXXXXXXX).');
      return;
    }

    if (!cleanPhone.startsWith('+')) {
      cleanPhone = `+${cleanPhone}`;
    }

    const cleanEmail = email.trim();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!gender) {
      setError('Please select a gender.');
      return;
    }

    if (age === '' || typeof age !== 'number' || age < 1 || age > 120) {
      setError('Please enter a valid age between 1 and 120.');
      return;
    }

    try {
      setIsSubmitting(true);

      const newPatientData: Partial<Patient> = {
        name: name.trim(),
        phone: cleanPhone,
        email: cleanEmail || undefined,
        gender: gender as 'female' | 'male' | 'other',
        age: typeof age === 'number' ? age : undefined,
        bloodGroup: bloodGroup || undefined,
        address: address.trim() || undefined,
        city: 'Dhaka',
        medicalHistory: medicalHistory.trim() || undefined,
      };

      const createdPatient = await api.patients.create(newPatientData);

      addToast({
        type: 'success',
        title: 'Patient Registered Successfully!',
        description: `${createdPatient.name} (${createdPatient.patientIdCode}) has been registered into clinic records.`,
      });

      // Reset form
      setName('');
      setPhone('');
      setEmail('');
      setGender('');
      setAge('');
      setBloodGroup('');
      setAddress('');
      setMedicalHistory('');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('patients-updated', { detail: createdPatient }));
      }

      onSuccess?.(createdPatient);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to register patient');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-[#0DA54F]" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                Patient Registration
              </h2>
              <p className="text-xs text-slate-500">
                Register a new patient profile into clinic records
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {duplicateWarning && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{duplicateWarning}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-xs">
          {/* 1. Patient Name */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Patient Name</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Farzana Rahman"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* 2. Phone Number (Clinic Branch removed: one registration is valid across all branches) */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>Phone Number</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +88017XXXXXXXX or 017XXXXXXXX"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Format: +88017XXXXXXXX, +88018XXXXXXXX, or 017XXXXXXXX
            </p>
          </div>

          {/* Email Address (Optional) */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              <span>Email Address</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. farzana.rahman@example.com"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* 3. Gender, Age, Blood Group */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Gender <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="">Select Gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Age <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={120}
                required
                value={age}
                onChange={(e) => setAge(e.target.value ? parseInt(e.target.value, 10) : '')}
                placeholder="e.g. 28"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Blood Group
              </label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
              >
                <option value="">Select Blood Group</option>
                {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Address */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. House 12, Road 9/A, Dhanmondi, Dhaka"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#0DA54F]/20 focus:border-[#0DA54F]"
            />
          </div>

          {/* 5. Past Medical History */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Past Medical History</span>
            </label>
            <textarea
              rows={3}
              value={medicalHistory}
              onChange={(e) => setMedicalHistory(e.target.value)}
              placeholder="e.g. Mild melasma, hormonal acne, allergies to penicillin, previous chemical peel treatments"
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
              <UserPlus className="w-4 h-4" />
              <span>{isSubmitting ? 'Registering...' : 'Register Patient'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
