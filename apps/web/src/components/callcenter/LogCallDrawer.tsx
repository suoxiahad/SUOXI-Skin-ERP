import React, { useState } from 'react';
import {
  X,
  PhoneCall,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  Stethoscope,
  Copy,
  Check,
  Send,
  ShieldAlert,
} from 'lucide-react';
import type {
  CallCenterAppointmentDto,
  CallOutcome,
  LogCallRequest,
  FollowUpTaskDto,
} from '@suoxi/shared-types';
import { callCenterApi } from '../../api/callCenter.js';
import { useI18n } from '../../i18n/I18nContext.js';

interface LogCallDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  appointment?: CallCenterAppointmentDto | null;
  task?: FollowUpTaskDto | null;
  onSuccess: () => void;
}

export const LogCallDrawer: React.FC<LogCallDrawerProps> = ({
  isOpen,
  onClose,
  appointment,
  task,
  onSuccess,
}) => {
  const { lang } = useI18n();

  // Form states
  const [outcome, setOutcome] = useState<CallOutcome>('reached');
  const [notes, setNotes] = useState('');
  const [callReference, setCallReference] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number | ''>('');
  const [nextAction, setNextAction] = useState<'call_again' | 'send_sms' | 'escalate_doctor' | 'none'>('none');
  const [nextActionDue, setNextActionDue] = useState('');

  // Reschedule specific fields
  const [requestedRescheduleDate, setRequestedRescheduleDate] = useState('');
  const [requestedRescheduleTime, setRequestedRescheduleTime] = useState('');

  // Loading & error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedMobile, setCopiedMobile] = useState(false);

  if (!isOpen) return null;

  const patientName = appointment?.patient_name || task?.patient_name || 'Unknown Patient';
  const patientCode = appointment?.patient_code || task?.patient_code || task?.patient_id || '';
  const mobile = appointment?.patient_mobile || appointment?.mobile || task?.patient_mobile || '';
  const doctorName = appointment?.doctor_name || '';
  const serviceName = appointment?.service_name || '';
  const appointmentTime = appointment ? `${appointment.appointment_date} ${appointment.start_time}` : '';

  const handleCopyMobile = () => {
    if (!mobile) return;
    navigator.clipboard.writeText(mobile);
    setCopiedMobile(true);
    setTimeout(() => setCopiedMobile(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!notes.trim()) {
      setErrorMessage(lang === 'bn' ? 'কলের নোট বা বিবরণ লেখা আবশ্যক।' : 'Call notes/summary is required.');
      return;
    }

    if (outcome === 'reschedule_requested' && !requestedRescheduleDate) {
      setErrorMessage(
        lang === 'bn'
          ? 'পুনর্নির্ধারণের জন্য প্রত্যাশিত তারিখ নির্বাচন করুন।'
          : 'Please select requested reschedule date.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: LogCallRequest = {
        appointment_id: appointment?.appointment_id || appointment?.id || task?.appointment_id,
        task_id: task?.id || appointment?.follow_up_task_id,
        patient_id: appointment?.patient_id || task?.patient_id || '',
        outcome,
        notes: notes.trim(),
        call_reference: callReference.trim() || undefined,
        duration_seconds: durationSeconds ? Number(durationSeconds) : undefined,
        next_action: nextAction !== 'none' ? nextAction : undefined,
        next_action_due: nextActionDue || undefined,
        requested_reschedule_date: outcome === 'reschedule_requested' ? requestedRescheduleDate : undefined,
        requested_reschedule_time: outcome === 'reschedule_requested' ? requestedRescheduleTime : undefined,
      };

      await callCenterApi.logCall(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to log call outcome:', err);
      setErrorMessage(err.message || 'Failed to record call log. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-slide-left">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <PhoneCall className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {lang === 'bn' ? 'কল লগ রেকর্ড করুন' : 'Log Call Outcome'}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === 'bn'
                  ? 'বহিরাগত ডায়লার থেকে কল করে তথ্য পূরণ করুন (K1 হার্ড রুল)'
                  : 'Dial manually via softphone, then record disposition outcome'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Patient Card Preview */}
          <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-sm text-slate-900">{patientName}</span>
                {patientCode && (
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-semibold">
                    {patientCode}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleCopyMobile}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50 transition-colors shadow-xs"
              >
                {copiedMobile ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{mobile || 'No Mobile'}</span>
              </button>
            </div>

            {(doctorName || serviceName || appointmentTime) && (
              <div className="pt-2 border-t border-emerald-200/60 grid grid-cols-2 gap-2 text-xs text-slate-600">
                {doctorName && (
                  <div className="flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                    <span>{doctorName}</span>
                  </div>
                )}
                {serviceName && (
                  <div className="truncate font-medium text-slate-700">
                    {serviceName}
                  </div>
                )}
                {appointmentTime && (
                  <div className="col-span-2 flex items-center gap-1.5 text-slate-500 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{appointmentTime} (Asia/Dhaka)</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs font-medium text-red-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form id="log-call-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Outcome Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                {lang === 'bn' ? 'কলের ফলাফল' : 'Call Outcome'} *
              </label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as CallOutcome)}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="reached">{lang === 'bn' ? 'Reached (কথোপকথন হয়েছে)' : 'Reached (Spoke with patient)'}</option>
                <option value="reschedule_requested">
                  {lang === 'bn' ? 'Reschedule Requested (পুনর্নির্ধারণের অনুরোধ)' : 'Reschedule Requested'}
                </option>
                <option value="cancel_requested">
                  {lang === 'bn' ? 'Cancel Requested (বাতিলকরণের অনুরোধ)' : 'Cancel Requested'}
                </option>
                <option value="no_answer">{lang === 'bn' ? 'No Answer (রিসিভ করেনি)' : 'No Answer'}</option>
                <option value="busy">{lang === 'bn' ? 'Busy (ব্যস্ত)' : 'Busy Line'}</option>
                <option value="switched_off">{lang === 'bn' ? 'Switched Off (বন্ধ)' : 'Switched Off / Network unreachable'}</option>
                <option value="wrong_number">{lang === 'bn' ? 'Wrong Number (ভুল নম্বর)' : 'Wrong Number'}</option>
                <option value="completed">{lang === 'bn' ? 'Completed (সম্পন্ন)' : 'Completed'}</option>
                <option value="declined">{lang === 'bn' ? 'Declined (অনিচ্ছুক)' : 'Declined Follow-up'}</option>
                <option value="other">{lang === 'bn' ? 'Other (অন্যান্য)' : 'Other'}</option>
              </select>
            </div>

            {/* Hard Rule 2 Routing Banner for Reschedule Requested */}
            {outcome === 'reschedule_requested' && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <p className="font-bold text-amber-950">
                      {lang === 'bn'
                        ? 'ক্লিনিক্যাল পলিসি সতর্কতা (K1 হার্ড রুল ২)'
                        : 'Doctor & Reception Approval Policy (Hard Rule 2)'}
                    </p>
                    <p className="mt-1">
                      {lang === 'bn'
                        ? 'কল সেন্টার সরাসরি অ্যাপয়েন্টমেন্ট পরিবর্তন করতে পারে না। এই ফর্মটি সাবমিট করলে ডক্টর ও রিসেপশন টিমের জন্য তাৎক্ষণিক স্টাফ অ্যালার্ট ও নোটিফিকেশন তৈরি হবে।'
                        : 'Call center staff cannot alter schedules directly. Submitting this log will create an urgent staff alert for the doctor and reception team to reschedule.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-200">
                  <div>
                    <label className="block text-xs font-semibold text-amber-950 mb-1">
                      {lang === 'bn' ? 'প্রত্যাশিত নতুন তারিখ' : 'Requested Date'} *
                    </label>
                    <input
                      type="date"
                      value={requestedRescheduleDate}
                      onChange={(e) => setRequestedRescheduleDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full h-9 px-2 text-xs border border-amber-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-amber-950 mb-1">
                      {lang === 'bn' ? 'প্রত্যাশিত সময় / শিফট' : 'Preferred Slot/Time'}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 15:30 or Afternoon"
                      value={requestedRescheduleTime}
                      onChange={(e) => setRequestedRescheduleTime(e.target.value)}
                      className="w-full h-9 px-2 text-xs border border-amber-300 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notes / Conversation Log */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                {lang === 'bn' ? 'কল নোট ও বিবরণ' : 'Call Notes & Conversation Log'} *
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  lang === 'bn'
                    ? 'রোগীর সাথে আলোচনার মূল বিষয়, প্রস্তুতি নির্দেশনা জানিয়েছেন কিনা তা লিখুন...'
                    : 'Summarize patient response, attendance confirmation, or reasons...'
                }
                className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            {/* Optional Telephony Call Reference & Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {lang === 'bn' ? 'কল রেফারেন্স আইডি' : 'Call Reference / PBX ID'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. REC-99214"
                  value={callReference}
                  onChange={(e) => setCallReference(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {lang === 'bn' ? 'সময়কাল (সেকেন্ড)' : 'Duration (Seconds)'}
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 75"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Next Action Selection */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {lang === 'bn' ? 'পরবর্তী পদক্ষেপ' : 'Follow-Up Action'}
                </label>
                <select
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value as any)}
                  className="w-full h-9 px-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="none">{lang === 'bn' ? 'কোনোটি নয়' : 'None / Completed'}</option>
                  <option value="call_again">{lang === 'bn' ? 'পুনরায় কল করুন' : 'Call Again'}</option>
                  <option value="send_sms">{lang === 'bn' ? 'এসএমএস পাঠান' : 'Send Reminder SMS'}</option>
                  <option value="escalate_doctor">{lang === 'bn' ? 'ডাক্তারকে জানান' : 'Escalate to Doctor'}</option>
                </select>
              </div>

              {nextAction !== 'none' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {lang === 'bn' ? 'পদক্ষেপের নির্ধারিত সময়' : 'Action Due Time'}
                  </label>
                  <input
                    type="datetime-local"
                    value={nextActionDue}
                    onChange={(e) => setNextActionDue(e.target.value)}
                    className="w-full h-9 px-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 transition-colors"
          >
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>
          <button
            type="submit"
            form="log-call-form"
            disabled={isSubmitting}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>{lang === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving Log...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{lang === 'bn' ? 'লগ নিশ্চিত করুন' : 'Save Call Log'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
