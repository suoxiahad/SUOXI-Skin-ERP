import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  AlertCircle,
  AlertTriangle,
  FileText,
  Save,
  CheckCircle2,
  MapPin,
  HeartPulse,
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
  const { addToast, language } = useApp();
  const isBn = language === 'bn';

  const [name, setName] = useState('');
  const [nameBn, setNameBn] = useState('');
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
      setNameBn(patient.nameBn || '');
      setPhone(patient.phone || '');
      setEmail(patient.email || '');
      setGender((patient.gender as any) || 'female');
      setAge(patient.age ?? '');
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
      setError(isBn ? 'রোগীর নাম অবশ্যই দিতে হবে' : 'Patient name is required.');
      return;
    }

    let cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!cleanPhone) {
      setError(isBn ? 'মোবাইল নম্বর আবশ্যক' : 'Phone number is required.');
      return;
    }

    if (/^01[3-9]\d{8}$/.test(cleanPhone)) {
      cleanPhone = `+88${cleanPhone}`;
    }

    if (!/^\+?8801[3-9]\d{8}$/.test(cleanPhone)) {
      setError(
        isBn
          ? 'সঠিক বাংলাদেশী মোবাইল নম্বর দিন (+8801XXXXXXXXX)'
          : 'Please enter a valid Bangladesh mobile (+8801XXXXXXXXX or 01XXXXXXXXX).'
      );
      return;
    }

    if (!cleanPhone.startsWith('+')) {
      cleanPhone = `+${cleanPhone}`;
    }

    if (age !== '' && (typeof age !== 'number' || age < 1 || age > 120)) {
      setError(isBn ? 'সঠিক বয়স (১ - ১২০) উল্লেখ করুন' : 'Please enter a valid age between 1 and 120.');
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
        nameBn: nameBn.trim() || undefined,
        phone: cleanPhone,
        email: email.trim() || undefined,
        gender: gender as any,
        age: typeof age === 'number' ? age : undefined,
        bloodGroup: bloodGroup || undefined,
        address: address.trim() || undefined,
        city: city.trim() || 'Dhaka',
        skinType: skinType as any,
        allergies: parsedAllergies,
        medicalHistory: medicalHistory.trim() || undefined,
      };

      const updated = await api.patients.update(patient.id, updatePayload);

      addToast({
        type: 'success',
        title: isBn ? 'তথ্য সফলভাবে সংরক্ষিত হয়েছে' : 'Patient Updated Successfully!',
        description: isBn
          ? `${updated.name} (${updated.patientIdCode})-এর তথ্য স্থায়ীভাবে সেভ করা হয়েছে।`
          : `Permanent record updated for ${updated.name} (${updated.patientIdCode}).`,
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
                  {isBn ? 'রোগীর তথ্য পরিবর্তন ও আপডেট' : 'Edit Patient Profile'}
                </h2>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {patient.patientIdCode}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isBn
                  ? 'পরিবর্তনসমূহ স্বয়ংক্রিয়ভাবে স্থায়ীভাবে সেভ থাকবে'
                  : 'Changes are permanently stored on server disk storage'}
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
                {isBn ? 'রোগীর পুরো নাম' : 'Patient Full Name'} <span className="text-rose-500">*</span>
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

            {/* Bengali Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isBn ? 'নাম (বাংলায়)' : 'Name (Bangla)'}
              </label>
              <input
                type="text"
                value={nameBn}
                onChange={(e) => setNameBn(e.target.value)}
                placeholder="e.g. সুমাইয়া রহমান"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isBn ? 'মোবাইল নম্বর' : 'Phone Number'} <span className="text-rose-500">*</span>
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
                {isBn ? 'ইমেইল অ্যাড্রেস' : 'Email Address'}
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
                {isBn ? 'লিঙ্গ' : 'Gender'} <span className="text-rose-500">*</span>
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
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
                {isBn ? 'বয়স (বছর)' : 'Age (Years)'}
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value ? parseInt(e.target.value, 10) : '')}
                placeholder="e.g. 28"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
              />
            </div>

            {/* Blood Group */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isBn ? 'রক্তের গ্রুপ' : 'Blood Group'}
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
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isBn ? 'স্কিন টাইপ' : 'Skin Type'}
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
                {isBn ? 'ঠিকানা ও এলাকা' : 'Street Address / Area'}
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House 42, Road 7, Dhanmondi"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-[#0DA54F] focus:ring-1 focus:ring-[#0DA54F]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isBn ? 'শহর' : 'City'}
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
              {isBn ? 'এলার্জি সংক্রান্ত তথ্য (কমা দিয়ে আলাদা করুন)' : 'Known Allergies (Comma separated)'}
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
              {isBn ? 'ক্লিনিক্যাল হিস্ট্রি ও চিকিৎসা ইতিহাস' : 'Clinical History & Medical Notes'}
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
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
            >
              {isBn ? 'বাতিল' : 'Cancel'}
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[#0DA54F] hover:bg-[#0b8841] rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? (isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...') : (isBn ? 'স্থায়ীভাবে সেভ করুন' : 'Save Changes')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
