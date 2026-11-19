import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  MapPin,
  Heart,
  ShieldAlert,
  Calendar,
  AlertCircle,
  Clock,
  Edit2,
  Save,
  CheckCircle2,
  Copy,
  Check,
  Stethoscope,
  FileText,
  AlertTriangle,
  Lock,
  Package,
} from 'lucide-react';
import { PatientPackagesView } from '../packages/PatientPackagesView.js';
import { patientsApi } from '../../api/patients.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { StatusBadge } from '../common/StatusBadge.js';
import type {
  PatientDto,
  RestrictedCallCenterPatientDto,
  PatientMedicalHistoryDto,
} from '@suoxi/shared-types';

interface PatientDetailDrawerProps {
  patientId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onPatientUpdated?: () => void;
  onQuickBookAppointment?: (patient: PatientDto | RestrictedCallCenterPatientDto) => void;
}

export const PatientDetailDrawer: React.FC<PatientDetailDrawerProps> = ({
  patientId,
  isOpen,
  onClose,
  onPatientUpdated,
  onQuickBookAppointment,
}) => {
  const { lang, t } = useI18n();
  const { user } = useAuth();
  const { has } = usePermissions();

  const [patient, setPatient] = useState<PatientDto | RestrictedCallCenterPatientDto | null>(null);
  const [medicalHistory, setMedicalHistory] = useState<PatientMedicalHistoryDto | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'medical' | 'packages'>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Medical History Edit State
  const [isEditingMedical, setIsEditingMedical] = useState(false);
  const [medicalForm, setMedicalForm] = useState({
    allergies: '',
    skinType: '',
    currentMedications: '',
    chronicConditions: '',
    pastAestheticProcedures: '',
    contraindications: '',
  });
  const [isSavingMedical, setIsSavingMedical] = useState(false);
  const [medicalSaveSuccess, setMedicalSaveSuccess] = useState(false);

  // Phone copied state
  const [copiedPhone, setCopiedPhone] = useState(false);

  const isFullDto = (p: any): p is PatientDto => {
    return p && 'district' in p;
  };

  const isCallCenterRestricted = !isFullDto(patient);

  useEffect(() => {
    if (!isOpen || !patientId) {
      setPatient(null);
      setMedicalHistory(null);
      setIsEditingMedical(false);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const p = await patientsApi.get(patientId);
        setPatient(p);

        // Only fetch medical history if user has clinical or full access
        if (isFullDto(p) && has('patient.view')) {
          try {
            const med = await patientsApi.getMedicalHistory(patientId);
            setMedicalHistory(med);
            setMedicalForm({
              allergies: med.allergies || '',
              skinType: med.skinType || '',
              currentMedications: med.currentMedications || '',
              chronicConditions: med.chronicConditions || '',
              pastAestheticProcedures: med.pastAestheticProcedures || '',
              contraindications: med.contraindications || '',
            });
          } catch {
            // No medical history yet or restricted
            setMedicalHistory(null);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load patient records');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isOpen, patientId, has]);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const handleSaveMedicalHistory = async () => {
    if (!patientId) return;
    setIsSavingMedical(true);
    try {
      const updated = await patientsApi.updateMedicalHistory(patientId, medicalForm);
      setMedicalHistory(updated);
      setIsEditingMedical(false);
      setMedicalSaveSuccess(true);
      setTimeout(() => setMedicalSaveSuccess(false), 3000);
      if (onPatientUpdated) onPatientUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update clinical medical history');
    } finally {
      setIsSavingMedical(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end animate-fade-in">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
        {/* Drawer Header */}
        <div className="p-5 border-b border-brand-border bg-slate-50/80 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary font-bold text-lg">
              {patient?.fullName ? patient.fullName.charAt(0).toUpperCase() : <User className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-brand-primary bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  {patient?.patientCode || 'SX-PATIENT'}
                </span>
                {patient && (
                  <StatusBadge
                    status={
                      patient.status === 'active'
                        ? 'CONFIRMED'
                        : patient.status === 'merged'
                        ? 'MERGED'
                        : 'CANCELLED'
                    }
                    size="sm"
                  />
                )}
                {isFullDto(patient) && patient.dueAmount && patient.dueAmount > 0 ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    ৳{patient.dueAmount.toLocaleString()} Due
                  </span>
                ) : null}
              </div>

              <h2 className="text-lg font-bold text-brand-text mt-1 flex items-center gap-2">
                <span>{patient?.fullName || 'Patient Details'}</span>
                {patient?.fullNameBn && (
                  <span className="text-sm font-normal text-slate-500 font-bengali">
                    ({patient.fullNameBn})
                  </span>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {patient && onQuickBookAppointment && (
              <button
                type="button"
                onClick={() => onQuickBookAppointment(patient)}
                className="px-3 py-1.5 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Book Appointment</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-brand-border bg-slate-50 px-5 text-xs font-semibold text-slate-600 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Overview & Contact
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('medical')}
            className={`py-3 px-4 border-b-2 font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'medical'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Clinical History & Allergies</span>
            {medicalHistory?.allergies && (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('packages')}
            className={`py-3 px-4 border-b-2 font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'packages'
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Packages & Ledger</span>
          </button>
        </div>

        {/* Notification / Error / Merged Alerts */}
        {patient?.status === 'merged' && (
          <div className="m-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Merged Profile (Hard Rule 9):</span>
              <p className="mt-0.5">
                This patient record was merged into active profile #{isFullDto(patient) && patient.mergedIntoPatientId ? patient.mergedIntoPatientId : 'N/A'}. 
                All historical appointments and prescriptions are preserved.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="m-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {medicalSaveSuccess && (
          <div className="m-5 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Clinical medical history saved successfully.</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-32 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          ) : patient ? (
            activeTab === 'overview' ? (
              <div className="space-y-6">
                {/* Demographics Card */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Demographic Details
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block">Gender</span>
                      <span className="font-semibold text-slate-800 capitalize">
                        {patient.gender}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Age</span>
                      <span className="font-semibold text-slate-800">
                        {patient.approximateAge ? `${patient.approximateAge} yrs` : 'Not specified'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Blood Group</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {isFullDto(patient) && patient.bloodGroup ? patient.bloodGroup : 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Language</span>
                      <span className="font-semibold text-slate-800">
                        {patient.preferredLanguage === 'bn' ? 'বাংলা (Bengali)' : 'English'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Contact Channels
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <Phone className="w-4 h-4 text-brand-primary" />
                        <div>
                          <span className="text-[10px] text-slate-400 block">Primary Mobile</span>
                          <span className="font-mono font-bold text-slate-800 text-sm">
                            {patient.primaryMobile}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyPhone(patient.primaryMobile)}
                        className="px-2.5 py-1 text-slate-600 hover:text-brand-primary hover:bg-white rounded border border-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPhone ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    {isFullDto(patient) && patient.secondaryMobile && (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block">Secondary Mobile</span>
                          <span className="font-mono text-slate-700">{patient.secondaryMobile}</span>
                        </div>
                      </div>
                    )}

                    {isFullDto(patient) && patient.email && (
                      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block">Email Address</span>
                          <span className="text-slate-700">{patient.email}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Residential Address & Area */}
                {isCallCenterRestricted ? (
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-slate-400" />
                    <span>
                      Detailed address, emergency contacts, and clinical records are masked for Call Center role (Bilingual Privacy Rule).
                    </span>
                  </div>
                ) : isFullDto(patient) ? (
                  <>
                    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Residential Address
                      </h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-start gap-2 text-slate-700">
                          <MapPin className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">{patient.address || 'No street address recorded'}</span>
                            <div className="text-slate-400 text-[11px] mt-0.5">
                              {[patient.area, patient.city, patient.district].filter(Boolean).join(', ')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Emergency Contact */}
                    {patient.emergencyContactName && (
                      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Heart className="w-3.5 h-3.5 text-rose-500" />
                          <span>Emergency Contact</span>
                        </h3>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-slate-400 block">Name</span>
                            <span className="font-semibold text-slate-800">{patient.emergencyContactName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Phone</span>
                            <span className="font-mono text-slate-800 font-semibold">{patient.emergencyContactPhone || '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Relation</span>
                            <span className="text-slate-800">{patient.emergencyContactRelation || '—'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            ) : activeTab === 'medical' ? (
              /* Medical History Tab */
              <div className="space-y-5">
                {isCallCenterRestricted ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    <Lock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                    <span>Clinical records and medical histories are strictly restricted to clinical and administrative roles.</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Clinical Aesthetic Profile
                        </h3>
                        <p className="text-xs text-slate-500">
                          Confidential patient skin profile, documented contraindications, and known allergies.
                        </p>
                      </div>

                      {!isEditingMedical ? (
                        <button
                          type="button"
                          onClick={() => setIsEditingMedical(true)}
                          className="px-3 py-1.5 text-xs font-semibold text-brand-primary border border-brand-primary/30 hover:bg-emerald-50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit History</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsEditingMedical(false)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveMedicalHistory}
                            disabled={isSavingMedical}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary-hover rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{isSavingMedical ? 'Saving...' : 'Save Changes'}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Allergies & Contraindications Warning Box */}
                    <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/60 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                        <ShieldAlert className="w-4 h-4 text-rose-600" />
                        <span>Allergies & Known Contraindications</span>
                      </div>

                      {isEditingMedical ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-[11px] font-semibold text-rose-900 mb-1">
                              Allergies (e.g. Lidocaine, Latex, Hyaluronic)
                            </label>
                            <textarea
                              rows={2}
                              value={medicalForm.allergies}
                              onChange={(e) => setMedicalForm({ ...medicalForm, allergies: e.target.value })}
                              className="w-full p-2 text-xs rounded-lg border border-rose-300 bg-white focus-ring"
                              placeholder="Type allergies or 'None known'..."
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-rose-900 mb-1">
                              Contraindications (e.g. Keloid, Pregnancy, Retinoids)
                            </label>
                            <textarea
                              rows={2}
                              value={medicalForm.contraindications}
                              onChange={(e) => setMedicalForm({ ...medicalForm, contraindications: e.target.value })}
                              className="w-full p-2 text-xs rounded-lg border border-rose-300 bg-white focus-ring"
                              placeholder="Clinical contraindications..."
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                          <div>
                            <span className="text-[11px] text-rose-600 block font-semibold">Documented Allergies:</span>
                            <span className="font-medium text-rose-950">
                              {medicalHistory?.allergies || 'None recorded'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-rose-600 block font-semibold">Contraindications:</span>
                            <span className="font-medium text-rose-950">
                              {medicalHistory?.contraindications || 'None recorded'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Aesthetic Details Grid */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Skin Type</label>
                          {isEditingMedical ? (
                            <select
                              value={medicalForm.skinType}
                              onChange={(e) => setMedicalForm({ ...medicalForm, skinType: e.target.value })}
                              className="w-full p-2 rounded-lg border border-slate-300 text-xs focus-ring bg-white"
                            >
                              <option value="">Select Skin Type</option>
                              <option value="Normal">Normal</option>
                              <option value="Dry">Dry (শুষ্ক)</option>
                              <option value="Oily">Oily (তৈলাক্ত)</option>
                              <option value="Combination">Combination (মিশ্র)</option>
                              <option value="Sensitive">Sensitive (সংবেদনশীল)</option>
                              <option value="Fitzpatrick III">Fitzpatrick Type III</option>
                              <option value="Fitzpatrick IV">Fitzpatrick Type IV</option>
                            </select>
                          ) : (
                            <span className="font-medium text-slate-900 block p-1.5 bg-slate-50 rounded border border-slate-100">
                              {medicalHistory?.skinType || 'Not evaluated'}
                            </span>
                          )}
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Current Medications</label>
                          {isEditingMedical ? (
                            <input
                              type="text"
                              value={medicalForm.currentMedications}
                              onChange={(e) => setMedicalForm({ ...medicalForm, currentMedications: e.target.value })}
                              className="w-full p-2 rounded-lg border border-slate-300 text-xs focus-ring"
                              placeholder="e.g. Isotretinoin, Blood thinners"
                            />
                          ) : (
                            <span className="font-medium text-slate-900 block p-1.5 bg-slate-50 rounded border border-slate-100">
                              {medicalHistory?.currentMedications || 'None'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Chronic Conditions</label>
                        {isEditingMedical ? (
                          <textarea
                            rows={2}
                            value={medicalForm.chronicConditions}
                            onChange={(e) => setMedicalForm({ ...medicalForm, chronicConditions: e.target.value })}
                            className="w-full p-2 rounded-lg border border-slate-300 text-xs focus-ring"
                            placeholder="e.g. Diabetes, Hypertension, Thyroid"
                          />
                        ) : (
                          <span className="font-medium text-slate-900 block p-1.5 bg-slate-50 rounded border border-slate-100">
                            {medicalHistory?.chronicConditions || 'None reported'}
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Past Aesthetic Procedures</label>
                        {isEditingMedical ? (
                          <textarea
                            rows={2}
                            value={medicalForm.pastAestheticProcedures}
                            onChange={(e) => setMedicalForm({ ...medicalForm, pastAestheticProcedures: e.target.value })}
                            className="w-full p-2 rounded-lg border border-slate-300 text-xs focus-ring"
                            placeholder="e.g. Chemical peels (2025), Botox (6 months ago)"
                          />
                        ) : (
                          <span className="font-medium text-slate-900 block p-1.5 bg-slate-50 rounded border border-slate-100">
                            {medicalHistory?.pastAestheticProcedures || 'None'}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : activeTab === 'packages' ? (
              <div className="p-5">
                <PatientPackagesView
                  patientId={patient.id}
                  patientName={patient.fullName}
                />
              </div>
            ) : null
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              No patient data found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
