import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  Sparkles,
  ArrowLeft,
  Camera,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Package,
  Layers,
  Save,
  Check,
  Send,
  Lock,
  Share2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { sessionsApi } from '../../api/sessions.js';
import type {
  TreatmentSessionDto,
  TreatmentPhotoDto,
  SessionConsumableDto,
  TreatmentPhotoType,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface SessionRecordViewProps {
  sessionId?: string;
  onBack?: () => void;
}

export const SessionRecordView: React.FC<SessionRecordViewProps> = ({
  sessionId = 'ses-sample-01',
  onBack,
}) => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const isClinical =
    user?.roles.includes('doctor') ||
    user?.roles.includes('super_admin') ||
    user?.roles.includes('admin') ||
    user?.roles.includes('therapist');

  const isCallCenter = user?.roles.includes('call_center');

  const [loading, setLoading] = useState<boolean>(true);
  const [session, setSession] = useState<TreatmentSessionDto | null>(null);
  const [photos, setPhotos] = useState<TreatmentPhotoDto[]>([]);
  const [consumables, setConsumables] = useState<SessionConsumableDto[]>([]);
  const [savingNotes, setSavingNotes] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Editable session state
  const [outcomeNotes, setOutcomeNotes] = useState<string>('');
  const [treatmentNotes, setTreatmentNotes] = useState<string>('');
  const [aftercareInstructions, setAftercareInstructions] = useState<string>('');
  const [publishAftercareToPortal, setPublishAftercareToPortal] = useState<boolean>(false);

  // Complete Session Modal
  const [showCompleteConfirm, setShowCompleteConfirm] = useState<boolean>(false);
  const [completing, setCompleting] = useState<boolean>(false);

  // Add Consumable Modal
  const [showAddConsumable, setShowAddConsumable] = useState<boolean>(false);
  const [consumableName, setConsumableName] = useState<string>('');
  const [consumableBatch, setConsumableBatch] = useState<string>('');
  const [consumableQty, setConsumableQty] = useState<number>(1);
  const [consumableUnit, setConsumableUnit] = useState<string>('pcs');
  const [consumableNotes, setConsumableNotes] = useState<string>('');
  const [addingConsumable, setAddingConsumable] = useState<boolean>(false);

  // Photo Upload Modal
  const [showPhotoUpload, setShowPhotoUpload] = useState<boolean>(false);
  const [photoType, setPhotoType] = useState<TreatmentPhotoType>('before');
  const [photoBodySite, setPhotoBodySite] = useState<string>('Treatment area');
  const [photoVisibleToPatient, setPhotoVisibleToPatient] = useState<boolean>(false);
  const [photoNotes, setPhotoNotes] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);

  // Next Session Panel
  const [nextDate, setNextDate] = useState<string>('');
  const [nextTime, setNextTime] = useState<string>('16:30');
  const [nextNotes, setNextNotes] = useState<string>('');
  const [settingNext, setSettingNext] = useState<boolean>(false);
  const [nextConfirmationMsg, setNextConfirmationMsg] = useState<string | null>(null);
  const [nextErrorMsg, setNextErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await sessionsApi.getSession(sessionId);
      if (data) {
        setSession(data);
        setOutcomeNotes(data.outcomeNotes || '');
        setTreatmentNotes(data.treatmentNotes || '');
        setAftercareInstructions(data.aftercareInstructions || '');
        setPublishAftercareToPortal(data.publishAftercareToPortal);
        setConsumables(data.consumables || []);

        if (data.nextSessionDate) {
          setNextDate(data.nextSessionDate);
          setNextTime(data.nextSessionStartTime || '16:30');
        }

        // Fetch photos if clinical
        if (isClinical) {
          try {
            const photoList = await sessionsApi.getPhotos(sessionId);
            setPhotos(photoList);
          } catch (pErr) {
            console.warn('Could not load clinical photos:', pErr);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId, isClinical]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle saving notes / aftercare in-progress
  const handleSaveNotes = async () => {
    if (!session) return;
    try {
      setSavingNotes(true);
      const updated = await sessionsApi.updateSession(session.id, {
        outcomeNotes,
        treatmentNotes,
        aftercareInstructions,
        publishAftercareToPortal,
      });
      setSession(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save session notes');
    } finally {
      setSavingNotes(false);
    }
  };

  // Handle Complete Session
  const handleCompleteSession = async () => {
    if (!session) return;
    try {
      setCompleting(true);
      const completed = await sessionsApi.completeSession(session.id, {
        outcomeNotes,
        treatmentNotes,
        aftercareInstructions,
        publishAftercareToPortal,
      });
      setSession(completed);
      setShowCompleteConfirm(false);
    } catch (err: any) {
      alert(err.message || 'Failed to complete session');
    } finally {
      setCompleting(false);
    }
  };

  // Handle Add Consumable
  const handleAddConsumableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !consumableName.trim()) return;

    try {
      setAddingConsumable(true);
      const item = await sessionsApi.addConsumable(session.id, {
        productName: consumableName.trim(),
        batchNumber: consumableBatch.trim() || undefined,
        quantity: Number(consumableQty),
        unit: consumableUnit,
        notes: consumableNotes.trim() || undefined,
      });
      setConsumables((prev) => [...prev, item]);
      setShowAddConsumable(false);
      setConsumableName('');
      setConsumableBatch('');
      setConsumableQty(1);
      setConsumableNotes('');
    } catch (err: any) {
      alert(err.message || 'Failed to add consumable');
    } finally {
      setAddingConsumable(false);
    }
  };

  // Handle Photo Upload
  const handleUploadPhotoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    try {
      setUploadingPhoto(true);
      const newPhoto = await sessionsApi.addPhoto(session.id, {
        photoType,
        bodySite: photoBodySite,
        isVisibleToPatient: photoVisibleToPatient,
        clinicalNotes: photoNotes,
        fileBuffer: 'FAKE-AESTHETIC-PHOTO-BUFFER-BASE64',
        filename: `photo-${session.sessionCode}-${Date.now()}.png`,
      });
      setPhotos((prev) => [...prev, newPhoto]);
      setShowPhotoUpload(false);
      setPhotoNotes('');
    } catch (err: any) {
      alert(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Handle Set Next Session
  const handleSetNextSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !nextDate || !nextTime) return;

    try {
      setSettingNext(true);
      setNextConfirmationMsg(null);
      setNextErrorMsg(null);

      const res = await sessionsApi.setNextSession(session.id, {
        date: nextDate,
        startTime: nextTime,
        notes: nextNotes,
      });

      setNextConfirmationMsg(res.message);
      // Reload session
      const updated = await sessionsApi.getSession(session.id);
      setSession(updated);
    } catch (err: any) {
      setNextErrorMsg(err.message || 'Failed to set next session');
    } finally {
      setSettingNext(false);
    }
  };

  if (loading || !session) {
    return (
      <div className="p-8 space-y-4 max-w-5xl mx-auto">
        <div className="h-8 bg-slate-200 rounded w-1/3 animate-pulse" />
        <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  const isCompleted = session.status === 'completed';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {session.sessionCode}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isCompleted
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Completed
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-blue-600" />
                    Planned
                  </>
                )}
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              Session {session.sessionNo} of {session.totalSessions} —{' '}
              {session.serviceName}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isCompleted && (
            <>
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {savingNotes ? 'Saving...' : 'Save Draft Notes'}
                  </>
                )}
              </button>

              <button
                onClick={() => setShowCompleteConfirm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Complete Session
              </button>
            </>
          )}

          {isCompleted && (
            <div className="text-xs text-slate-500 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                Completed on {new Date(session.completedAt!).toLocaleDateString()}{' '}
                by {session.completedByName || 'Attending Clinician'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Patient Header Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg border border-emerald-200">
              {session.patientName?.[0] || 'P'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{session.patientName}</h2>
                <span className="font-mono text-xs text-slate-400">{session.patientCode}</span>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-4 mt-0.5">
                <span>Branch: {session.branchName || 'Dhanmondi'}</span>
                <span>•</span>
                <span>Attending Doctor: {session.doctorName}</span>
                {session.therapistName && (
                  <>
                    <span>•</span>
                    <span>Therapist: {session.therapistName}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {session.packageCode && (
            <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg text-xs text-amber-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" />
              <div>
                <span className="font-semibold">Package Linked: {session.packageCode}</span>
                <div className="text-[11px] text-amber-700">
                  {session.packageSessionDeducted
                    ? '1 session deducted from active allowance'
                    : 'Will deduct 1 session upon completion'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Clinical Session Execution + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Notes, Aftercare, Consumables, Photos */}
        <div className="lg:col-span-2 space-y-6">
          {/* Clinical Procedure Notes & Outcome */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              Procedure & Outcome Notes
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Treatment Execution Notes (Laser Parameters, Pass Counts, Energy, Protocol)
              </label>
              <textarea
                rows={3}
                disabled={isCompleted}
                value={treatmentNotes}
                onChange={(e) => setTreatmentNotes(e.target.value)}
                placeholder="e.g. Pass 1: Deep fractional ablation at 15mJ, Pass 2: Superficial tightening..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Immediate Clinical Outcome & Patient Tolerance
              </label>
              <textarea
                rows={2}
                disabled={isCompleted}
                value={outcomeNotes}
                onChange={(e) => setOutcomeNotes(e.target.value)}
                placeholder="e.g. Mild erythema, tolerated well with topical anesthetic..."
                className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-600"
              />
            </div>
          </div>

          {/* Aftercare Instructions & Portal Publication */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Post-Care & Aftercare Instructions
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isCompleted}
                  checked={publishAftercareToPortal}
                  onChange={(e) => setPublishAftercareToPortal(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-emerald-800">
                  Publish aftercare to patient portal
                </span>
              </label>
            </div>

            <textarea
              rows={3}
              disabled={isCompleted}
              value={aftercareInstructions}
              onChange={(e) => setAftercareInstructions(e.target.value)}
              placeholder="e.g. Apply the soothing gel twice daily and avoid sun for 72 hours..."
              className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-600"
            />
            {publishAftercareToPortal && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                ✓ Patient will be able to review these aftercare instructions directly in their portal.
              </p>
            )}
          </div>

          {/* Consumables Used Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  Consumables Used in Session
                </h3>
                <p className="text-xs text-slate-500">
                  Track sterile packs, specialized gels, needles, and anesthetic used.
                </p>
              </div>
              {!isCompleted && (
                <button
                  onClick={() => setShowAddConsumable(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Consumable
                </button>
              )}
            </div>

            {consumables.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-lg text-center text-xs text-slate-400">
                No consumables logged for this session yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2 px-3">Product Name</th>
                      <th className="py-2 px-3">Batch Number</th>
                      <th className="py-2 px-3">Quantity</th>
                      <th className="py-2 px-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {consumables.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{c.productName}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{c.batchNumber || '—'}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {c.quantity} {c.unit}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{c.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Clinical Photos (Private, Signed URLs only) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-600" />
                  Clinical Photography (Before / After / Progress)
                </h3>
                <p className="text-xs text-slate-500">
                  Stored securely with signed access tokens. Restricted to clinical roles.
                </p>
              </div>
              {isClinical && !isCompleted && (
                <button
                  onClick={() => setShowPhotoUpload(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Upload Photo
                </button>
              )}
            </div>

            {!isClinical ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                Non-clinical staff cannot view patient clinical photos.
              </div>
            ) : photos.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-lg text-center text-xs text-slate-400">
                No clinical photos attached to this session yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 group hover:border-slate-300 transition-colors"
                  >
                    <div className="h-32 bg-slate-200 flex items-center justify-center text-slate-400 text-xs font-medium relative">
                      <Camera className="w-8 h-8 opacity-40" />
                      <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded uppercase font-bold">
                        {photo.photoType}
                      </span>
                      {photo.isVisibleToPatient ? (
                        <span className="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                          <Eye className="w-2.5 h-2.5" /> Portal
                        </span>
                      ) : (
                        <span className="absolute top-2 right-2 bg-slate-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                          <EyeOff className="w-2.5 h-2.5" /> Private
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 text-xs space-y-1">
                      <div className="font-semibold text-slate-800 truncate">{photo.bodySite || 'Treatment area'}</div>
                      <div className="text-[11px] text-slate-500">
                        {new Date(photo.takenAt).toLocaleDateString()} by {photo.takenByName}
                      </div>
                      {photo.clinicalNotes && (
                        <div className="text-[11px] text-slate-600 line-clamp-1 italic">
                          "{photo.clinicalNotes}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Doctor-Defined NEXT SESSION Panel */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Doctor-Defined Next Session
                </h3>
                <p className="text-[11px] text-slate-500">
                  Hard Rule 2: Only the doctor sets the next session. Call center is read-only.
                </p>
              </div>
            </div>

            {isCallCenter ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-2">
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <Lock className="w-4 h-4 text-slate-500" />
                  Read-Only for Call Center
                </div>
                <p className="text-[11px] text-slate-500">
                  Call center agents record call outcomes but cannot overwrite doctor clinical schedules.
                </p>
                {session.nextSessionDate ? (
                  <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded font-medium border border-emerald-200">
                    Next Session Scheduled: {session.nextSessionDate} at {session.nextSessionStartTime}
                  </div>
                ) : (
                  <div className="text-slate-400 italic">No next session has been scheduled yet.</div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSetNextSessionSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Next Session Date
                  </label>
                  <input
                    type="date"
                    required
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Scheduled Time
                  </label>
                  <input
                    type="time"
                    required
                    value={nextTime}
                    onChange={(e) => setNextTime(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Clinical Follow-up Notes (for reception & reminders)
                  </label>
                  <textarea
                    rows={2}
                    value={nextNotes}
                    onChange={(e) => setNextNotes(e.target.value)}
                    placeholder="e.g. Check erythema resolution and review sunscreen usage."
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={settingNext}
                  className="w-full py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                >
                  {settingNext ? 'Scheduling Next Session...' : 'Set Next Session'}
                </button>

                {nextConfirmationMsg && (
                  <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg border border-emerald-200 text-xs font-medium space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Confirmation
                    </div>
                    <div>{nextConfirmationMsg}</div>
                  </div>
                )}

                {nextErrorMsg && (
                  <div className="bg-rose-50 text-rose-800 p-3 rounded-lg border border-rose-200 text-xs font-medium space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-rose-900">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      Booking Conflict / Error
                    </div>
                    <div>{nextErrorMsg}</div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Complete Session Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Complete Treatment Session
                </h3>
                <p className="text-xs text-slate-500">
                  Session {session.sessionNo} of {session.totalSessions} — {session.serviceName}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Completing this session will finalize the clinical log and mark the appointment as{' '}
              <span className="font-semibold text-slate-800">Visited</span>.
            </p>

            {/* Package Deduction Information Note */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Info className="w-4 h-4 text-blue-600" />
                Package Deduction Notice
              </div>
              <p className="text-[11px] text-blue-800">
                {session.packageCode ? (
                  <>
                    This will deduct 1 session from package{' '}
                    <span className="font-mono font-bold">{session.packageCode}</span> via the append-only ledger.
                  </>
                ) : (
                  'If the patient has an active package for this treatment service, 1 session will be atomically deducted upon completion.'
                )}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteSession}
                disabled={completing}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                {completing ? 'Completing...' : 'Confirm & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Consumable Modal */}
      {showAddConsumable && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddConsumableSubmit}
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-scale-up"
          >
            <h3 className="text-base font-bold text-slate-900">
              Log Session Consumable
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product / Consumable Name *
                </label>
                <input
                  type="text"
                  required
                  value={consumableName}
                  onChange={(e) => setConsumableName(e.target.value)}
                  placeholder="e.g. Post-Laser Peptide Soothing Gel"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batch Number / LOT
                </label>
                <input
                  type="text"
                  value={consumableBatch}
                  onChange={(e) => setConsumableBatch(e.target.value)}
                  placeholder="e.g. LOT-2026-99B"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    required
                    value={consumableQty}
                    onChange={(e) => setConsumableQty(Number(e.target.value))}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={consumableUnit}
                    onChange={(e) => setConsumableUnit(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Usage Notes
                </label>
                <input
                  type="text"
                  value={consumableNotes}
                  onChange={(e) => setConsumableNotes(e.target.value)}
                  placeholder="e.g. Applied right after laser ablation"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddConsumable(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingConsumable}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                {addingConsumable ? 'Adding...' : 'Add Consumable'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Photo Upload Modal */}
      {showPhotoUpload && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleUploadPhotoSubmit}
            className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4 animate-scale-up"
          >
            <h3 className="text-base font-bold text-slate-900">
              Upload Clinical Photo
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Photo Classification
                </label>
                <select
                  value={photoType}
                  onChange={(e) => setPhotoType(e.target.value as TreatmentPhotoType)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="before">Before Treatment</option>
                  <option value="after">After Treatment</option>
                  <option value="progress">Progress / Mid-Protocol</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Anatomical Body Site
                </label>
                <input
                  type="text"
                  required
                  value={photoBodySite}
                  onChange={(e) => setPhotoBodySite(e.target.value)}
                  placeholder="e.g. Right Cheek, Forehead, Nasolabial fold"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Notes
                </label>
                <input
                  type="text"
                  value={photoNotes}
                  onChange={(e) => setPhotoNotes(e.target.value)}
                  placeholder="e.g. Depth of acne scarring under angled examination light"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={photoVisibleToPatient}
                    onChange={(e) => setPhotoVisibleToPatient(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Visible to patient in their secure portal
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPhotoUpload(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadingPhoto}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                {uploadingPhoto ? 'Uploading...' : 'Save Photo Record'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
