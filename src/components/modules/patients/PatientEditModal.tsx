import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  AlertCircle,
  Save,
} from 'lucide-react';
import { useApp } from '../../../context/AppContext.tsx';
import { api } from '../../../api/client.ts';
import type { Patient } from '../../../types/index.ts';

interface PatientEditModalProps {
  isOpen: boolean;
  patient: Patient | null;
  onClose: () => void;
  onSuccess?: (updated: Patient) => void;
}

export const PatientEditModal: React.FC<PatientEditModalProps> = ({
  isOpen,
  patient,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useApp();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'other' | 'prefer_not_to_say'>('female');
  const [age, setAge] = useState<number | ''>('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Dhaka');
  const [skinType, setSkinType] = useState<string>('combination');
  const [allergiesText, setAllergiesText] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && patient) {
      setError(null);
      setName(patient.name || '');
      setPhone(patient.phone || '');
      setEmail(patient.email || '');
      const normalizedGender = String(patient.gender || 'female').toLowerCase();
      setGender(
        normalizedGender === 'male' ||
          normalizedGender === 'female' ||
          normalizedGender === 'other' ||
          normalizedGender === 'prefer_not_to_say'
          ? (normalizedGender as 'female' | 'male' | 'other' | 'prefer_not_to_say')
          : 'female'
      );
      const parsedAge =
        patient.age !== undefined && patient.age !== null && String(patient.age) !== ''
          ? Number(patient.age)
          : NaN;
      setAge(!Number.isNaN(parsedAge) && parsedAge > 0 ? parsedAge : '');
      setBloodGroup(patient.bloodGroup || '');
      setAddress(patient.address || '');
      setCity(patient.city || 'Dhaka');
      setSkinType(patient.skinType || 'combination');
      setAllergiesText(Array.isArray(patient.allergies) ? patient.allergies.join(', ') : '');
      setMedicalHistory(patient.medicalHistory || '');
    }
  }, [isOpen, patient]);

  if (!isOpen || !patient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Patient name is required.');
      return;
    }

    let cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone) {
      setError('Phone number is required.');
      return;
    }

    if (/^01[3-9]\d{8}$/.test(cleanPhone)) {
      cleanPhone = `+88${cleanPhone}`;
    }

    if (!/^\+?8801[3-9]\d{8}$/.test(cleanPhone)) {
      setError('Please enter a valid Bangladesh mobile (+8801XXXXXXXXX or 01XXXXXXXXX).');
      return;
    }

    if (!cleanPhone.startsWith('+')) {
      cleanPhone = `+${cleanPhone}`;
    }

    const numericAge = age === '' ? undefined : Number(age);
    if (numericAge !== undefined && (Number.isNaN(numericAge) || numericAge < 1 || numericAge > 120)) {
      setError('Please enter a valid age between 1 and 120.');
      return;
    }

    try {
      setIsSubmitting(true);

      const parsedAllergies = allergiesText
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const updatePayload: Partial<Patient> = {
        name: name.trim(),
        phone: cleanPhone,
        email: email.trim() || undefined,
        gender: gender as Patient['gender'],
        age: numericAge,
        bloodGroup: bloodGroup || undefined,
        address: address.trim() || undefined,
        city: city.trim() || 'Dhaka',
        skinType: skinType as Patient['skinType'],
        allergies: parsedAllergies,
        medicalHistory: medicalHistory.trim() || undefined,
      };

      const updated = await api.patients.update(patient.id, updatePayload);

      addToast({
        type: 'success',
        title: 'Patient Updated Successfully',
        description: `Permanent record updated for ${updated.name} (${updated.patientIdCode}).`,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('patients-updated', { detail: updated }));
      }

      onSuccess?.(updated);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to update patient details');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#0DA54F] flex items-center justify-center font-bold text-lg">
              <User className="w-5 h-5 text-[#0DA54F]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900 text-base">
                  Edit Patient Profile
                </h2>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {patient.patientIdCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Changes are permanently saved to the patient clinical record
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Patient Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sumaiya Rahman"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+8801XXXXXXXXX"
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="patient@example.com"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Gender <span className="text-rose-500">*</span>
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'female' | 'male' | 'other' | 'prefer_not_to_say')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F] bg-white capitalize"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            {/* Age */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Age (Years)
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={age}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setAge('');
                    return;
                  }
                  const num = Number.parseInt(val, 10);
                  setAge(Number.isNaN(num) ? '' : num);
                }}
                placeholder="e.g. 28"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
              />
            </div>

            {/* Blood Group */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Blood Group
              </label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F] bg-white"
              >
                <option value="">Not Specified</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>

            {/* Skin Type */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Skin Type
              </label>
              <select
                value={skinType}
                onChange={(e) => setSkinType(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F] bg-white capitalize"
              >
                <option value="normal">Normal</option>
                <option value="dry">Dry</option>
                <option value="oily">Oily</option>
                <option value="combination">Combination</option>
                <option value="sensitive">Sensitive</option>
              </select>
            </div>
          </div>

          {/* Address & City */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Street Address / Area
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House 42, Road 7, Shantinagar"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Dhaka"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
              />
            </div>
          </div>

          {/* Allergies */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Known Allergies (Comma separated)
            </label>
            <input
              type="text"
              value={allergiesText}
              onChange={(e) => setAllergiesText(e.target.value)}
              placeholder="e.g. Dust, Sunscreens with oxybenzone, Penicillin"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
            />
          </div>

          {/* Medical History */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical History &amp; Medical Notes
            </label>
            <textarea
              rows={3}
              value={medicalHistory}
              onChange={(e) => setMedicalHistory(e.target.value)}
              placeholder="Mild adult hormonal acne, hyperpigmentation on malar cheeks..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F] resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0b8841] rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
