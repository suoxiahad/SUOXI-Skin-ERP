import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  X,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  Phone,
  User,
  MapPin,
  Heart,
  Globe,
  Share2,
  Calendar,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { patientsApi } from '../../api/patients.js';
import { useI18n } from '../../i18n/I18nContext.js';
import type {
  CreatePatientRequest,
  PatientDto,
  Gender,
  BloodGroup,
  AcquisitionSource,
} from '@suoxi/shared-types';

interface RegisterPatientDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (patient: PatientDto) => void;
  onOpenExisting?: (patientId: string) => void;
}

export const RegisterPatientDrawer: React.FC<RegisterPatientDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenExisting,
}) => {
  const { lang, t } = useI18n();

  // Form State
  const [fullName, setFullName] = useState('');
  const [fullNameBn, setFullNameBn] = useState('');
  const [gender, setGender] = useState<Gender>('female');
  const [ageMode, setAgeMode] = useState<'dob' | 'age'>('age');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [approximateAge, setApproximateAge] = useState<number | ''>(28);
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>('');
  const [primaryMobile, setPrimaryMobile] = useState('');
  const [secondaryMobile, setSecondaryMobile] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('Dhaka');
  const [district, setDistrict] = useState('Dhaka');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'bn' | 'en'>('bn');
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource>('walk_in');

  // Duplicate warning state
  const [duplicateMatch, setDuplicateMatch] = useState<{
    id: string;
    patientCode: string;
    fullName: string;
    primaryMobile: string;
  } | null>(null);
  const [proceedWithDuplicate, setProceedWithDuplicate] = useState(false);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  // Status & Validation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Idempotency key per drawer session
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setIdempotencyKey(crypto.randomUUID());
      setErrorMessage(null);
      setDuplicateMatch(null);
      setProceedWithDuplicate(false);
    }
  }, [isOpen]);

  // Debounced live duplicate check while typing mobile number
  useEffect(() => {
    if (!primaryMobile || primaryMobile.trim().length < 8) {
      setDuplicateMatch(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDuplicate(true);
      try {
        const res = await patientsApi.checkDuplicateMobile(primaryMobile);
        if (res.hasDuplicate && res.match) {
          setDuplicateMatch(res.match);
        } else {
          setDuplicateMatch(null);
        }
      } catch {
        // Ignore check failure
      } finally {
        setIsCheckingDuplicate(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [primaryMobile]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim()) {
      setErrorMessage(lang === 'bn' ? 'রোগীর পুরো নাম প্রদান করুন।' : 'Full name is required.');
      return;
    }

    if (!primaryMobile.trim()) {
      setErrorMessage(lang === 'bn' ? 'প্রাথমিক মোবাইল নম্বর প্রদান করুন।' : 'Primary mobile number is required.');
      return;
    }

    if (duplicateMatch && !proceedWithDuplicate) {
      setErrorMessage(
        lang === 'bn'
          ? 'এই নম্বরে ইতোমধ্যে রোগী নিবন্ধিত রয়েছে। অনুগ্রহ করে "এটি অন্য ব্যক্তি" নিশ্চিত করুন।'
          : 'A patient with this mobile number already exists. Please confirm if this is a different person.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreatePatientRequest = {
        fullName: fullName.trim(),
        fullNameBn: fullNameBn.trim() || undefined,
        gender,
        dateOfBirth: ageMode === 'dob' && dateOfBirth ? dateOfBirth : undefined,
        approximateAge: ageMode === 'age' && approximateAge !== '' ? Number(approximateAge) : undefined,
        bloodGroup: bloodGroup || undefined,
        primaryMobile: primaryMobile.trim(),
        secondaryMobile: secondaryMobile.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        area: area.trim() || undefined,
        city: city.trim() || 'Dhaka',
        district: district.trim() || 'Dhaka',
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.trim() || undefined,
        emergencyContactRelation: emergencyRelation.trim() || undefined,
        preferredLanguage,
        acquisitionSource,
        proceedWithDuplicate,
      };

      const result = await patientsApi.create(payload, idempotencyKey);
      onSuccess(result.patient);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register patient. Please verify the entered details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-brand-border animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-5 border-b border-brand-border flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-[#0DA54F] flex items-center justify-center font-bold">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {lang === 'bn' ? 'নতুন রোগী নিবন্ধন' : 'Register Patient'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {lang === 'bn'
                  ? 'রোগীর মৌলিক ও যোগাযোগের বিবরণ (৬০ সেকেন্ডের রেজিস্ট্রেশন)'
                  : 'Fast clinic registration with real-time duplicate check'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold">{errorMessage}</div>
            </div>
          )}

          {/* DUPLICATE WARNING AMBER BANNER */}
          {duplicateMatch && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-3 animate-in fade-in duration-200"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-amber-900 text-sm">
                    {lang === 'bn' ? 'সতর্কতা: সম্ভাব্য দ্বৈত রোগী' : 'Duplicate Mobile Alert'}
                  </div>
                  <p className="mt-1 leading-relaxed">
                    A patient with this mobile number already exists:{' '}
                    <span className="font-bold text-slate-900">{duplicateMatch.fullName}</span>{' '}
                    <span className="font-mono font-semibold text-emerald-700">
                      ({duplicateMatch.patientCode})
                    </span>.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 border-t border-amber-200/80">
                <button
                  type="button"
                  onClick={() => {
                    onOpenExisting?.(duplicateMatch.id);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-100/60 rounded-lg font-bold text-xs text-amber-900 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open existing profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProceedWithDuplicate(!proceedWithDuplicate)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    proceedWithDuplicate
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                  }`}
                >
                  {proceedWithDuplicate ? '✓ Confirmed: Different Person' : 'This is a different person'}
                </button>
              </div>
            </div>
          )}

          {/* 1. Basic Demographic Identity */}
          <div className="space-y-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{lang === 'bn' ? 'মৌলিক পরিচয়' : 'Identity & Names'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name (English) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                  placeholder="e.g. Sumaiya Rahman"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  পুরো নাম (বাংলায়)
                </label>
                <input
                  type="text"
                  value={fullNameBn}
                  onChange={(e) => setFullNameBn(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                  placeholder="উদাঃ সুমাইয়া রহমান"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gender <span className="text-red-500">*</span>
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus-ring bg-white"
                >
                  <option value="female">Female (মহিলা)</option>
                  <option value="male">Male (পুরুষ)</option>
                  <option value="other">Other (অন্যান্য)</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    {ageMode === 'dob' ? 'Date of Birth' : 'Age (Years)'}
                  </label>
                  <button
                    type="button"
                    onClick={() => setAgeMode(ageMode === 'dob' ? 'age' : 'dob')}
                    className="text-[11px] text-[#0DA54F] font-semibold hover:underline cursor-pointer"
                  >
                    {ageMode === 'dob' ? 'Use approximate age' : 'Use exact DOB'}
                  </button>
                </div>

                {ageMode === 'dob' ? (
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                  />
                ) : (
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={approximateAge}
                    onChange={(e) => setApproximateAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                    placeholder="e.g. 28"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Blood Group
                </label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value as BloodGroup)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus-ring bg-white"
                >
                  <option value="">Unknown / Select</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Contact & Telecom Identifiers */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{lang === 'bn' ? 'যোগাযোগ ও মোবাইল' : 'Contact & Phone Verification'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Primary Mobile <span className="text-red-500">*</span>
                  <span className="text-slate-400 font-normal ml-1">(+8801XXXXXXXXX)</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    value={primaryMobile}
                    onChange={(e) => setPrimaryMobile(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus-ring"
                    placeholder="+8801712345678"
                  />
                  {isCheckingDuplicate && (
                    <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-[#0DA54F] border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Secondary Mobile (Optional)
                </label>
                <input
                  type="tel"
                  value={secondaryMobile}
                  onChange={(e) => setSecondaryMobile(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus-ring"
                  placeholder="+8801911000000"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                placeholder="patient@example.com"
              />
            </div>
          </div>

          {/* 3. Address & Location */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{lang === 'bn' ? 'ঠিকানা ও এলাকা' : 'Location & Address'}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Street Address / House & Road
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                placeholder="e.g. Road 7A, House 34"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Area / Thana
                </label>
                <input
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                  placeholder="e.g. Dhanmondi, Uttara"
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
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  District
                </label>
                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                />
              </div>
            </div>
          </div>

          {/* 4. Emergency Contact */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span>{lang === 'bn' ? 'জরুরি যোগাযোগ' : 'Emergency Contact'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                  placeholder="e.g. Kamrul Rahman"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono focus-ring"
                  placeholder="+8801711000000"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Relationship
                </label>
                <input
                  type="text"
                  value={emergencyRelation}
                  onChange={(e) => setEmergencyRelation(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus-ring"
                  placeholder="e.g. Spouse, Brother"
                />
              </div>
            </div>
          </div>

          {/* 5. Preferences & Acquisition */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-[#0DA54F]" />
              <span>{lang === 'bn' ? 'পছন্দ ও পরিচিতি' : 'Preferences & Acquisition'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Preferred Language
                </label>
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value as 'bn' | 'en')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus-ring bg-white"
                >
                  <option value="bn">বাংলা (Bengali)</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  How did they find us?
                </label>
                <select
                  value={acquisitionSource}
                  onChange={(e) => setAcquisitionSource(e.target.value as AcquisitionSource)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus-ring bg-white"
                >
                  <option value="walk_in">Walk-in (সরাসরি আগমন)</option>
                  <option value="call">Phone Call (ফোন কল)</option>
                  <option value="referral">Doctor / Partner Referral</option>
                  <option value="social_media">Social Media (FB / Instagram)</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>Referrer Picker</span>
                </label>
                <input
                  type="text"
                  disabled
                  value="Enabled in Prompt 19"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-xs italic"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-brand-border bg-slate-50/70 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-[#0DA54F] hover:bg-[#0A8740] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>{lang === 'bn' ? 'নিবন্ধন সম্পন্ন করুন' : 'Complete Registration'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
