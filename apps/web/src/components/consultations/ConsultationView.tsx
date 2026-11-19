import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  User,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Save,
  Pill,
  RefreshCw,
  Plus,
  Stethoscope,
} from 'lucide-react';
import { consultationsApi } from '../../api/consultations.js';
import { catalogApi } from '../../api/catalog.js';
import type {
  ConsultationDto,
  TreatmentServiceDto,
  TreatmentPlanDto,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';

interface ConsultationViewProps {
  consultationId?: string;
  onOpenPrescription?: (consultationId: string, patientId: string) => void;
}

export const ConsultationView: React.FC<ConsultationViewProps> = ({
  consultationId = 'cns-sample-01',
  onOpenPrescription,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';

  const [loading, setLoading] = useState<boolean>(true);
  const [consultation, setConsultation] = useState<ConsultationDto | null>(null);
  const [services, setServices] = useState<TreatmentServiceDto[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');

  // Form states
  const [chiefComplaint, setChiefComplaint] = useState<string>('');
  const [assessment, setAssessment] = useState<string>('');
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [recommendedServiceId, setRecommendedServiceId] = useState<string>('');
  const [status, setStatus] = useState<'draft' | 'completed'>('draft');

  // Treatment plan inline creator state
  const [showPlanModal, setShowPlanModal] = useState<boolean>(false);
  const [planSessions, setPlanSessions] = useState<number>(4);
  const [planStartDate, setPlanStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [planEndDate, setPlanEndDate] = useState<string>('');
  const [planNotes, setPlanNotes] = useState<string>('');
  const [planSaving, setPlanSaving] = useState<boolean>(false);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef = useRef<boolean>(true);

  // Load initial consultation data and treatment services
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cns, srvList] = await Promise.all([
        consultationsApi.getConsultation(consultationId),
        catalogApi.listTreatments({ activeOnly: true }),
      ]);

      if (cns) {
        setConsultation(cns);
        setChiefComplaint(cns.chiefComplaint || '');
        setAssessment(cns.assessment || '');
        setClinicalNotes(cns.clinicalNotes || '');
        setRecommendedServiceId(cns.recommendedServiceId || '');
        setStatus(cns.status);
      }
      if (srvList) {
        setServices(srvList);
      }
    } catch (err) {
      console.error('Failed to load consultation:', err);
    } finally {
      setLoading(false);
      isFirstRenderRef.current = false;
    }
  }, [consultationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Debounced auto-save (2-second debounce with version check)
  const triggerAutoSave = useCallback(() => {
    if (isFirstRenderRef.current || !consultation || consultation.status === 'completed') return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    setAutoSaveStatus('saving');
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const res = await consultationsApi.patchConsultation(consultation.id, {
          version: consultation.version,
          chiefComplaint,
          assessment,
          clinicalNotes,
          recommendedServiceId: recommendedServiceId || undefined,
          status,
        });

        if (res) {
          setConsultation(res);
          setAutoSaveStatus('saved');
          const now = new Date();
          setLastSavedTime(
            now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          );
        }
      } catch (err: any) {
        console.error('Auto-save error:', err);
        setAutoSaveStatus('error');
      }
    }, 2000);
  }, [consultation, chiefComplaint, assessment, clinicalNotes, recommendedServiceId, status]);

  useEffect(() => {
    if (!loading && consultation) {
      triggerAutoSave();
    }
  }, [chiefComplaint, assessment, clinicalNotes, recommendedServiceId, status, triggerAutoSave, loading]);

  const handleManualSave = async () => {
    if (!consultation) return;
    try {
      setAutoSaveStatus('saving');
      const res = await consultationsApi.patchConsultation(consultation.id, {
        version: consultation.version,
        chiefComplaint,
        assessment,
        clinicalNotes,
        recommendedServiceId: recommendedServiceId || undefined,
        status,
      });
      if (res) {
        setConsultation(res);
        setAutoSaveStatus('saved');
        setLastSavedTime(
          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      }
    } catch (err) {
      setAutoSaveStatus('error');
    }
  };

  const handleCreateTreatmentPlan = async () => {
    if (!consultation || !recommendedServiceId) return;
    try {
      setPlanSaving(true);
      await consultationsApi.createTreatmentPlan(consultation.id, {
        serviceId: recommendedServiceId,
        plannedSessions: planSessions,
        startDate: planStartDate,
        expectedEndDate: planEndDate || undefined,
        notes: planNotes || undefined,
      });
      setShowPlanModal(false);
      await loadData();
    } catch (err) {
      console.error('Failed to create treatment plan:', err);
    } finally {
      setPlanSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto animate-pulse space-y-6">
        <div className="h-8 bg-slate-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-96 bg-slate-100 rounded-xl"></div>
          <div className="lg:col-span-2 h-96 bg-slate-100 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center bg-white rounded-xl border border-slate-200">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Consultation record not found</h3>
        <p className="text-slate-500 text-sm mt-1">Please select an existing appointment or patient consultation.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Auto-Save Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">
                {isBn ? 'ক্লিনিক্যাল কনসালটেশন' : 'Clinical Consultation'}
              </h1>
              <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                {consultation.consultationCode}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  status === 'completed'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {status === 'completed' ? (isBn ? 'সম্পন্ন' : 'Completed') : isBn ? 'খসড়া' : 'Draft'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Doctor: <strong>{consultation.doctorName}</strong> (BMDC: {consultation.doctorBmdcReg || 'A-84920'}) · {consultation.branchName}
            </p>
          </div>
        </div>

        {/* Action Controls & Auto-save status */}
        <div className="flex items-center gap-3">
          <div className="text-xs flex items-center gap-1.5 text-slate-500">
            {autoSaveStatus === 'saving' && (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>{isBn ? 'সংরক্ষণ করা হচ্ছে...' : 'Auto-saving...'}</span>
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {isBn ? 'সংরক্ষিত:' : 'Saved:'} {lastSavedTime}
                </span>
              </>
            )}
            {autoSaveStatus === 'error' && (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span className="text-rose-600 font-medium">Save conflict, reload</span>
              </>
            )}
          </div>

          <button
            onClick={handleManualSave}
            disabled={status === 'completed'}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isBn ? 'সংরক্ষণ' : 'Save Draft'}</span>
          </button>

          {onOpenPrescription && (
            <button
              onClick={() => onOpenPrescription(consultation.id, consultation.patientId)}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-1.5"
            >
              <Pill className="w-3.5 h-3.5" />
              <span>{isBn ? 'প্রেসক্রিপশন তৈরি করুন' : 'Write Prescription'}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Clinical Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Patient Clinical Summary Card (340px) */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-lg">
                <User className="w-6 h-6 text-slate-500" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">
                  {consultation.patientName}
                </h3>
                {consultation.patientNameBn && (
                  <p className="text-xs text-slate-500">{consultation.patientNameBn}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                  <span className="font-mono font-medium">{consultation.patientCode}</span>
                  <span>·</span>
                  <span>{consultation.patientAge}y</span>
                  <span>·</span>
                  <span>{consultation.patientGender}</span>
                  <span>·</span>
                  <span className="font-semibold text-slate-700">{consultation.patientBloodGroup}</span>
                </div>
              </div>
            </div>

            {/* Red Chip Exception: Allergies (Clinical Safety) */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 mb-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>{isBn ? 'ড্রাগ / অ্যালার্জি সতর্কতা' : 'Allergies & Clinical Alerts'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(consultation.patientAllergies || ['None reported']).map((alg, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-md text-xs font-semibold"
                  >
                    <span>⚠</span> {alg}
                  </span>
                ))}
              </div>
            </div>

            {/* Active Medications */}
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs font-semibold text-slate-600 mb-2">
                {isBn ? 'চলমান ওষুধ' : 'Active Medications'}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(consultation.patientActiveMeds || ['None']).map((med, idx) => (
                  <span
                    key={idx}
                    className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-xs"
                  >
                    {med}
                  </span>
                ))}
              </div>
            </div>

            {/* Visit Details */}
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-600 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">{isBn ? 'শেষ ভিজিট:' : 'Last Visited:'}</span>
                <span className="font-medium text-slate-800">
                  {consultation.lastVisitedAt
                    ? new Date(consultation.lastVisitedAt).toLocaleDateString()
                    : '15 Oct 2026'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isBn ? 'শাখা:' : 'Branch Center:'}</span>
                <span className="font-medium text-slate-800">{consultation.branchName}</span>
              </div>
            </div>
          </div>

          {/* Treatment Plans Attached to Consultation */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                {isBn ? 'ট্রিটমেন্ট প্ল্যান' : 'Active Treatment Plans'}
              </span>
              <button
                onClick={() => setShowPlanModal(true)}
                className="text-xs text-emerald-700 font-semibold hover:text-emerald-800 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isBn ? 'নতুন প্ল্যান' : 'Add Plan'}</span>
              </button>
            </div>

            {(!consultation.treatmentPlans || consultation.treatmentPlans.length === 0) ? (
              <p className="text-xs text-slate-500 italic py-2">
                {isBn ? 'কোনো প্ল্যান নেই।' : 'No active treatment plan created yet.'}
              </p>
            ) : (
              <div className="space-y-2">
                {consultation.treatmentPlans.map((tp) => (
                  <div
                    key={tp.id}
                    className="p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs"
                  >
                    <div className="font-bold text-slate-800">{tp.serviceName}</div>
                    <div className="flex justify-between text-slate-600 mt-1">
                      <span>
                        Sessions: {tp.completedSessions}/{tp.plannedSessions}
                      </span>
                      <span className="font-mono text-emerald-700">{tp.planCode}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Consultation Form */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
            {/* Chief Complaint */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                {isBn ? 'প্রধান সমস্যা (Chief Complaint)' : 'Chief Complaint'}
              </label>
              <textarea
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                rows={3}
                placeholder="e.g. Adult acne breakout along the jawline with persistent red and dark marks..."
                className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all outline-none"
              />
            </div>

            {/* Clinical Assessment */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                {isBn ? 'ক্লিনিক্যাল অ্যাসেসমেন্ট (Assessment)' : 'Clinical Assessment & Skin Analysis'}
              </label>
              <textarea
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                rows={3}
                placeholder="e.g. Fitzpatrick Skin Type IV, inflammatory papules, post-inflammatory erythema..."
                className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all outline-none"
              />
            </div>

            {/* Recommended Treatment Service Picker */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                {isBn ? 'সুপারিশকৃত প্রসিডিউর / সার্ভিস' : 'Recommended Aesthetic Treatment Service'}
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={recommendedServiceId}
                  onChange={(e) => setRecommendedServiceId(e.target.value)}
                  className="w-full text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
                >
                  <option value="">-- {isBn ? 'সার্ভিস নির্বাচন করুন' : 'Select Recommended Service'} --</option>
                  {services.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} (৳ {Number(srv.base_price).toLocaleString()})
                    </option>
                  ))}
                </select>

                {recommendedServiceId && (
                  <button
                    onClick={() => setShowPlanModal(true)}
                    className="px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{isBn ? 'এই সার্ভিসের প্ল্যান তৈরি করুন' : 'Generate Treatment Plan from Service'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Doctor Internal Clinical Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                {isBn ? 'ডাক্তারের অভ্যন্তরীণ নোট' : 'Doctor Internal Clinical Notes'}
              </label>
              <textarea
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                rows={2}
                placeholder="Doctor's private observations, follow-up timeline, patient compliance notes..."
                className="w-full text-sm p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none"
              />
            </div>

            {/* Consultation Status Toggle */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-xs font-semibold text-slate-600">
                {isBn ? 'কনসালটেশন স্ট্যাটাস:' : 'Consultation Status:'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('draft')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    status === 'draft'
                      ? 'bg-amber-100 text-amber-800 font-bold border border-amber-300'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isBn ? 'খসড়া (Draft)' : 'Draft'}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('completed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    status === 'completed'
                      ? 'bg-emerald-600 text-white font-bold shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {isBn ? 'সম্পন্ন (Completed)' : 'Completed'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inline Treatment Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {isBn ? 'ট্রিটমেন্ট প্ল্যান তৈরি করুন' : 'Generate Treatment Plan'}
            </h3>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {isBn ? 'সার্ভিস' : 'Service'}
                </label>
                <select
                  value={recommendedServiceId}
                  onChange={(e) => setRecommendedServiceId(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {isBn ? 'পরিকল্পিত সেশন' : 'Planned Sessions'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={planSessions}
                    onChange={(e) => setPlanSessions(parseInt(e.target.value, 10) || 1)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {isBn ? 'শুরুর তারিখ' : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    value={planStartDate}
                    onChange={(e) => setPlanStartDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {isBn ? 'সমাপ্তির সম্ভাব্য তারিখ' : 'Expected End Date'}
                </label>
                <input
                  type="date"
                  value={planEndDate}
                  onChange={(e) => setPlanEndDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {isBn ? 'প্ল্যান নোট' : 'Plan Notes'}
                </label>
                <textarea
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  rows={2}
                  placeholder="Intervals (e.g. 2 weeks apart), prep care..."
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={() => setShowPlanModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                onClick={handleCreateTreatmentPlan}
                disabled={planSaving}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                {planSaving ? 'Creating...' : isBn ? 'প্ল্যান সংরক্ষণ' : 'Save Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
