import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileCode,
  MessageSquare,
  Mail,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Check,
  Clock,
  Eye,
  Sliders,
  Sparkles,
  HelpCircle,
  X,
  Layers,
  Calendar,
  Shield,
  FileCheck,
} from 'lucide-react';
import { integrationsApi } from '../../api/integrations.js';
import type {
  NotificationTemplateDto,
  SaveTemplateRequest,
  TemplatePreviewRequest,
  TemplatePreviewResultDto,
  NotificationEventRuleDto,
  SaveEventRuleRequest,
  NotificationChannel,
  NotificationLanguage,
  NotificationEventType,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

const ALLOWED_VARIABLES = [
  'patient_name',
  'appointment_date',
  'appointment_time',
  'doctor_name',
  'clinic_phone',
];

const EVENT_TYPE_LABELS: Record<NotificationEventType, { en: string; bn: string }> = {
  appointment_confirmed: { en: 'Appointment Confirmed', bn: 'অ্যাপয়েন্টমেন্ট নিশ্চিত' },
  appointment_upcoming: { en: 'Upcoming Appointment Reminder', bn: 'আসন্ন অ্যাপয়েন্টমেন্ট স্মারক' },
  appointment_rescheduled: { en: 'Appointment Rescheduled', bn: 'অ্যাপয়েন্টমেন্ট পুনর্বিন্যাস' },
  appointment_cancelled: { en: 'Appointment Cancelled', bn: 'অ্যাপয়েন্টমেন্ট বাতিল' },
  session_reminder: { en: 'Tomorrow’s Treatment Session Reminder', bn: 'আগামীকালের ট্রিটমেন্ট সেশন স্মারক' },
  package_expiry: { en: 'Package Session Expiry Warning', bn: 'প্যাকেজের মেয়াদ উত্তীর্ণ সতর্কতা' },
  payment_due: { en: 'Payment Due Follow-up', bn: 'বকেয়া বিল পরিশোধ অনুরোধ' },
  followup_reminder: { en: 'Post-Procedure Follow-up Check', bn: 'প্রসিডিউর পরবর্তী ফলো-আপ' },
  portal_credentials: { en: 'Patient Portal Login Credentials', bn: 'রোগী পোর্টাল লগইন তথ্য' },
};

export const TemplatesView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'templates' | 'rules'>('templates');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<NotificationTemplateDto[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Event Rules
  const [rules, setRules] = useState<NotificationEventRuleDto[]>([]);

  // Modals & Drawers
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<NotificationTemplateDto | null>(null);
  const [selectedRuleForEdit, setSelectedRuleForEdit] = useState<NotificationEventRuleDto | null>(null);

  // Template Form State
  const [formCode, setFormCode] = useState('');
  const [formChannel, setFormChannel] = useState<NotificationChannel>('sms');
  const [formLanguage, setFormLanguage] = useState<NotificationLanguage>('bn');
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview & UCS-2 Calculator
  const [previewResult, setPreviewResult] = useState<TemplatePreviewResultDto | null>(null);

  // Event Rule Form State
  const [ruleTemplateId, setRuleTemplateId] = useState('');
  const [ruleOffsetMinutes, setRuleOffsetMinutes] = useState(0);
  const [ruleQuietHoursStart, setRuleQuietHoursStart] = useState('21:00:00');
  const [ruleQuietHoursEnd, setRuleQuietHoursEnd] = useState('08:00:00');
  const [ruleRequiresConsent, setRuleRequiresConsent] = useState(true);
  const [ruleIsEnabled, setRuleIsEnabled] = useState(true);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [tList, rList] = await Promise.all([
        integrationsApi.getTemplates({
          channel: channelFilter === 'all' ? undefined : channelFilter,
          language: languageFilter === 'all' ? undefined : languageFilter,
        }),
        integrationsApi.getEventRules(),
      ]);
      setTemplates(tList);
      setRules(rList);
    } catch (err: any) {
      console.error('Failed to load templates/rules:', err);
      setError(err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [channelFilter, languageFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time Live Preview & UCS-2 computation
  useEffect(() => {
    if (!formBody.trim()) {
      setPreviewResult(null);
      return;
    }
    const sample = {
      patient_name: formLanguage === 'bn' ? 'সুমাইয়া রহমান' : 'Sumaiya Rahman',
      appointment_date: formLanguage === 'bn' ? '২৩ অক্টোবর ২০২৬' : '23 Oct 2026',
      appointment_time: formLanguage === 'bn' ? 'সকাল ১১:৩০' : '11:30 AM',
      doctor_name: formLanguage === 'bn' ? 'ডাঃ ফারহানা খান' : 'Dr. Farhana Khan',
      clinic_phone: '+8801711223344',
    };

    let renderedBody = formBody;
    for (const [key, val] of Object.entries(sample)) {
      renderedBody = renderedBody.split(`{{${key}}}`).join(val);
    }

    let renderedSubject = formSubject;
    if (renderedSubject) {
      for (const [key, val] of Object.entries(sample)) {
        renderedSubject = renderedSubject.split(`{{${key}}}`).join(val);
      }
    }

    const hasUnicode = /[^\u0020-\u007E\r\n]/.test(renderedBody);
    const charCount = renderedBody.length;
    let segmentCount = 1;

    if (hasUnicode) {
      // UCS-2: 70 chars for single, 67 for concatenated
      segmentCount = charCount <= 70 ? 1 : Math.ceil(charCount / 67);
    } else {
      // GSM-7: 160 chars for single, 153 for concatenated
      segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);
    }

    setPreviewResult({
      rendered_body: renderedBody,
      rendered_subject: renderedSubject,
      char_count: charCount,
      segment_count: segmentCount,
      is_unicode: hasUnicode,
    });
  }, [formBody, formSubject, formLanguage]);

  // Validation: Check for invalid placeholders
  const invalidPlaceholders = useMemo(() => {
    const varPattern = /\{\{([^}]+)\}\}/g;
    const found: string[] = [];
    let match;
    while ((match = varPattern.exec(formBody)) !== null) {
      const varName = match[1].trim();
      if (!ALLOWED_VARIABLES.includes(varName) && !found.includes(varName)) {
        found.push(varName);
      }
    }
    return found;
  }, [formBody]);

  const handleOpenAdd = () => {
    setSelectedTemplateForEdit(null);
    setFormCode('SMS_CUSTOM_REMINDER');
    setFormChannel('sms');
    setFormLanguage('bn');
    setFormName(isBn ? 'কাস্টম সেশন স্মারক' : 'Custom Session Reminder');
    setFormSubject('');
    setFormBody('প্রিয় {{patient_name}}, আপনার সেশন {{appointment_date}} তারিখে। SUOXI: {{clinic_phone}}');
    setFormError(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (t: NotificationTemplateDto) => {
    setSelectedTemplateForEdit(t);
    setFormCode(t.template_code);
    setFormChannel(t.channel);
    setFormLanguage(t.language);
    setFormName(t.name);
    setFormSubject(t.subject || '');
    setFormBody(t.body);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const handleInsertVariable = (varName: string) => {
    setFormBody((prev) => `${prev}{{${varName}}}`);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalidPlaceholders.length > 0) {
      setFormError(`Unknown tokens: ${invalidPlaceholders.map((v) => `{{${v}}}`).join(', ')}. Please remove them.`);
      return;
    }

    setSavingTemplate(true);
    setFormError(null);

    try {
      const payload: SaveTemplateRequest = {
        template_code: formCode.trim().toUpperCase(),
        channel: formChannel,
        language: formLanguage,
        name: formName.trim(),
        subject: formChannel === 'email' ? formSubject.trim() : undefined,
        body: formBody.trim(),
        allowed_variables: ALLOWED_VARIABLES,
      };

      if (selectedTemplateForEdit) {
        await integrationsApi.updateTemplate(selectedTemplateForEdit.id, payload);
      } else {
        await integrationsApi.createTemplate(payload);
      }

      setIsEditorOpen(false);
      setSelectedTemplateForEdit(null);
      await loadData();
    } catch (err: any) {
      console.error('Failed to save template:', err);
      setFormError(err.message || 'Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleApproveTemplate = async (id: string) => {
    try {
      await integrationsApi.approveTemplate(id);
      await loadData();
    } catch (err: any) {
      alert(`Approval failed: ${err.message}`);
    }
  };

  const handleOpenEditRule = (rule: NotificationEventRuleDto) => {
    setSelectedRuleForEdit(rule);
    setRuleTemplateId(rule.template_id);
    setRuleOffsetMinutes(rule.offset_minutes);
    setRuleQuietHoursStart(rule.quiet_hours_start || '21:00:00');
    setRuleQuietHoursEnd(rule.quiet_hours_end || '08:00:00');
    setRuleRequiresConsent(rule.requires_patient_consent);
    setRuleIsEnabled(rule.is_enabled);
    setRuleError(null);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRuleForEdit) return;

    setSavingRule(true);
    setRuleError(null);

    try {
      const payload: SaveEventRuleRequest = {
        event_type: selectedRuleForEdit.event_type,
        channel: selectedRuleForEdit.channel,
        template_id: ruleTemplateId,
        offset_minutes: Number(ruleOffsetMinutes),
        quiet_hours_start: ruleQuietHoursStart,
        quiet_hours_end: ruleQuietHoursEnd,
        requires_patient_consent: ruleRequiresConsent,
        is_enabled: ruleIsEnabled,
      };

      await integrationsApi.updateEventRule(selectedRuleForEdit.id, payload);
      setSelectedRuleForEdit(null);
      await loadData();
    } catch (err: any) {
      console.error('Failed to update event rule:', err);
      setRuleError(err.message || 'Failed to update rule');
    } finally {
      setSavingRule(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = t.template_code.toLowerCase().includes(q);
        const matchName = t.name.toLowerCase().includes(q);
        const matchBody = t.body.toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchBody) return false;
      }
      return true;
    });
  }, [templates, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl">
            <FileCode className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {isBn ? 'নোটিফিকেশন টেমপ্লেট ও অটোমেশন রুলস' : 'Notification Templates & Event Rules'}
            </h1>
            <p className="text-sm text-slate-500">
              {isBn
                ? 'দ্বিভাষিক (বাংলা/ইংরেজি) এসএমএস ও ইমেইল ফরম্যাট, UCS-2 সেগমেন্ট কাউন্টার ও কুয়েট আওয়ারস'
                : 'Bilingual (Bangla/English) SMS & Email templates, live UCS-2 segment math & quiet hours'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {isBn ? 'রিফ্রেশ' : 'Refresh'}
          </button>
          <button
            onClick={handleOpenAdd}
            className="px-3.5 py-2 text-sm font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {isBn ? 'নতুন টেমপ্লেট তৈরি' : 'Create Template'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2">
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'templates'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          {isBn ? 'মেসেজ টেমপ্লেট সমূহ' : 'Message Templates'}
          <span className="ml-1.5 px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full font-medium">
            {templates.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'rules'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          {isBn ? 'অটোমেশন ইভেন্ট রুলস (৯টি ইভেন্ট)' : 'Automated Event Rules'}
          <span className="ml-1.5 px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full font-medium">
            {rules.length}
          </span>
        </button>
      </div>

      {/* TAB 1: TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder={isBn ? 'টেমপ্লেট কোড বা নাম খুঁজুন...' : 'Search template code or name...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
              >
                <option value="all">{isBn ? 'সকল চ্যানেল' : 'All Channels'}</option>
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>

              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
              >
                <option value="all">{isBn ? 'সকল ভাষা' : 'All Languages'}</option>
                <option value="bn">{isBn ? 'বাংলা (Bengali)' : 'Bangla (BN)'}</option>
                <option value="en">{isBn ? 'ইংরেজি (English)' : 'English (EN)'}</option>
              </select>
            </div>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTemplates.length === 0 ? (
              <div className="col-span-2 p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
                <FileCode className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold">{isBn ? 'কোন টেমপ্লেট পাওয়া যায়নি' : 'No templates match your filters'}</p>
              </div>
            ) : (
              filteredTemplates.map((t) => {
                const isSms = t.channel === 'sms';
                const isBengali = t.language === 'bn';

                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      {/* Badges & Status */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                              isSms ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isSms ? 'SMS' : 'Email'}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 rounded-full">
                            {isBengali ? 'বাংলা (BN)' : 'English (EN)'}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                              t.status === 'approved'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {t.status.toUpperCase()}
                          </span>
                        </div>

                        <span className="font-mono text-[11px] font-bold text-slate-500">{t.template_code}</span>
                      </div>

                      <h3 className="font-bold text-slate-800 text-sm mb-1">{t.name}</h3>

                      {t.subject && (
                        <p className="text-xs text-slate-500 mb-2 font-medium">
                          Subject: <span className="text-slate-700">{t.subject}</span>
                        </p>
                      )}

                      {/* Message Body snippet */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 mb-4 font-mono leading-relaxed">
                        {t.body}
                      </div>

                      {/* Variables list */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-4">
                        <span className="text-[11px] font-semibold text-slate-400">Tokens:</span>
                        {t.allowed_variables.map((v) => (
                          <span
                            key={v}
                            className="text-[10px] bg-slate-200/70 text-slate-700 px-1.5 py-0.5 rounded font-mono"
                          >
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div className="text-[11px] text-slate-400">
                        {t.approved_by_name ? `Approved by ${t.approved_by_name}` : 'Draft version'}
                      </div>

                      <div className="flex items-center gap-2">
                        {t.status === 'draft' && (
                          <button
                            onClick={() => handleApproveTemplate(t.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                          >
                            <FileCheck className="w-3.5 h-3.5" />
                            {isBn ? 'অনুমোদন দিন' : 'Approve'}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className="px-2.5 py-1 text-xs font-semibold text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          {isBn ? 'সম্পাদনা' : 'Edit'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AUTOMATED EVENT RULES */}
      {activeTab === 'rules' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                {isBn ? 'ক্লিনিক্যাল ও অপারেশনাল নোটিফিকেশন ইভেন্ট রুলস' : 'Clinic Notification Automation Rules'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isBn
                  ? 'রাত ৯টা থেকে সকাল ৮টা পর্যন্ত মেসেজ পাঠানো স্থগিত থাকে (Quiet Hours)। রোগীর অনুমতি আবশ্যক।'
                  : 'Enforces Quiet Hours (21:00 to 08:00 Asia/Dhaka) & patient consent toggles.'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4">{isBn ? 'ইভেন্ট ধরন' : 'Clinic Event'}</th>
                  <th className="py-3 px-4">{isBn ? 'চ্যানেল' : 'Channel'}</th>
                  <th className="py-3 px-4">{isBn ? 'সংযুক্ত টেমপ্লেট' : 'Assigned Template'}</th>
                  <th className="py-3 px-4">{isBn ? 'টাইমিং অফসেট' : 'Timing Offset'}</th>
                  <th className="py-3 px-4">{isBn ? 'কুয়েট আওয়ারস' : 'Quiet Hours'}</th>
                  <th className="py-3 px-4">{isBn ? 'রোগীর সম্মতি' : 'Patient Consent'}</th>
                  <th className="py-3 px-4">{isBn ? 'স্ট্যাটাস' : 'Status'}</th>
                  <th className="py-3 px-4 text-right">{isBn ? 'অ্যাকশন' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rules.map((rule) => {
                  const eventMeta = EVENT_TYPE_LABELS[rule.event_type] || { en: rule.event_type, bn: rule.event_type };

                  return (
                    <tr key={rule.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {isBn ? eventMeta.bn : eventMeta.en}
                        <span className="block text-[10px] font-mono text-slate-400 font-normal">
                          {rule.event_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            rule.channel === 'sms' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {rule.channel.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {rule.template_name || rule.template_code || rule.template_id}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {rule.offset_minutes === 0
                          ? 'Immediate (0m)'
                          : rule.offset_minutes < 0
                          ? `${Math.abs(rule.offset_minutes)}m before`
                          : `+${rule.offset_minutes}m after`}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {rule.quiet_hours_start ? `${rule.quiet_hours_start.slice(0, 5)} - ${rule.quiet_hours_end?.slice(0, 5)}` : 'None'}
                      </td>
                      <td className="py-3 px-4">
                        {rule.requires_patient_consent ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            {isBn ? 'বাধ্যতামূলক' : 'Required'}
                          </span>
                        ) : (
                          <span className="text-slate-400">{isBn ? 'ঐচ্ছিক' : 'Exempt'}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            rule.is_enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {rule.is_enabled ? (isBn ? 'সক্রিয়' : 'Enabled') : isBn ? 'নিষ্ক্রিয়' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenEditRule(rule)}
                          className="px-2.5 py-1 text-slate-700 hover:text-brand-primary hover:bg-slate-100 rounded transition-colors font-semibold"
                        >
                          {isBn ? 'সম্পাদনা' : 'Configure'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: TEMPLATE EDITOR WITH LIVE PREVIEW & UCS-2 CALCULATOR */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveTemplate}
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 border border-slate-200 my-8 animate-scale-in"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-brand-primary" />
                <h3 className="font-bold text-slate-800 text-base">
                  {selectedTemplateForEdit
                    ? isBn
                      ? 'টেমপ্লেট সম্পাদনা'
                      : `Edit Template (${selectedTemplateForEdit.template_code})`
                    : isBn
                    ? 'নতুন নোটিফিকেশন টেমপ্লেট'
                    : 'Create Notification Template'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 mb-4 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Left Column: Form Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Channel</label>
                    <select
                      value={formChannel}
                      onChange={(e) => setFormChannel(e.target.value as any)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                    >
                      <option value="sms">SMS</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Language</label>
                    <select
                      value={formLanguage}
                      onChange={(e) => setFormLanguage(e.target.value as any)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                    >
                      <option value="bn">বাংলা (Bengali)</option>
                      <option value="en">English (EN)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Template Code</label>
                    <input
                      type="text"
                      required
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      placeholder="e.g. SMS_REMINDER_BN"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Template Name</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. সেশন স্মারক"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>

                {formChannel === 'email' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Email Subject</label>
                    <input
                      type="text"
                      required
                      value={formSubject}
                      onChange={(e) => setFormSubject(e.target.value)}
                      placeholder="e.g. Your Upcoming Session at SUOXI Clinic"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                )}

                {/* Variable chips */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>{isBn ? 'অনুমোদিত ভেরিয়েবল টোকেন:' : 'Whitelisted Merge Tokens (Click to insert):'}</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALLOWED_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleInsertVariable(v)}
                        className="px-2 py-1 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary rounded-lg font-mono text-[11px] font-semibold transition-colors"
                      >
                        +{`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template Body */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isBn ? 'মেসেজ বডি (বাংলা/ইংরেজি)' : 'Template Message Body'}
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    placeholder="Type template message..."
                    className="w-full border border-slate-300 rounded-xl p-3 text-slate-800 font-mono text-xs focus:ring-2 focus:ring-brand-primary leading-relaxed"
                  />
                  {invalidPlaceholders.length > 0 && (
                    <div className="mt-1.5 p-2 bg-red-50 text-red-700 rounded-lg border border-red-200 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Unknown tokens: {invalidPlaceholders.map((v) => `{{${v}}}`).join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Live Simulated Preview & UCS-2 Engine */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-700 font-bold mb-3">
                    <Eye className="w-4 h-4 text-brand-primary" />
                    <span>{isBn ? 'রিয়েল-টাইম লাইভ প্রিভিউ' : 'Live Rendered Simulation'}</span>
                  </div>

                  {previewResult ? (
                    <div className="space-y-4">
                      {/* Simulated SMS Bubble */}
                      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-2">
                        <div className="flex justify-between items-center text-[10px] text-slate-400 border-b border-slate-100 pb-1.5">
                          <span>SUOXI AESTH</span>
                          <span>Today 11:30 AM</span>
                        </div>
                        {previewResult.rendered_subject && (
                          <div className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1">
                            {previewResult.rendered_subject}
                          </div>
                        )}
                        <div className="text-slate-800 text-xs whitespace-pre-wrap leading-relaxed font-sans">
                          {previewResult.rendered_body}
                        </div>
                      </div>

                      {/* UCS-2 / GSM-7 Segment Math Box */}
                      <div className="bg-white rounded-xl p-3.5 border border-slate-200 space-y-2.5">
                        <h4 className="font-bold text-slate-800 text-[11px] flex items-center justify-between">
                          <span>{isBn ? 'টেলিকম সেগমেন্ট অ্যানালাইসিস' : 'Telecom Segment Analysis'}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              previewResult.is_unicode
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {previewResult.is_unicode ? 'UCS-2 (Unicode / বাংলা)' : 'GSM-7 (Standard English)'}
                          </span>
                        </h4>

                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="bg-slate-50 p-2 rounded-lg">
                            <span className="text-slate-500 block">{isBn ? 'মোট বর্ণ (Characters)' : 'Character Count'}:</span>
                            <span className="text-base font-bold font-mono text-slate-800">
                              {previewResult.char_count}
                            </span>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg">
                            <span className="text-slate-500 block">{isBn ? 'এসএমএস সেগমেন্ট' : 'SMS Segments'}:</span>
                            <span className="text-base font-bold font-mono text-brand-primary">
                              {previewResult.segment_count}
                            </span>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-500 leading-tight">
                          {previewResult.is_unicode
                            ? isBn
                              ? 'বাংলা বা ইউনিকোড ব্যবহারের কারণে প্রতি এসএমএস সেগমেন্টে প্রথম ৭০ অক্ষর এবং পরবর্তীগুলোতে ৬৭ অক্ষর লিমিট প্রযোজ্য।'
                              : 'UCS-2 encoding active: 70 chars for single segment; 67 chars/part for concatenated multipart SMS.'
                            : isBn
                              ? 'স্ট্যান্ডার্ড জিএসএম-৭ এনকোডিং: সর্বোচ্চ ১৬০ অক্ষর (মাল্টিপার্ট হলে ১৫৩ অক্ষর/পার্ট)।'
                              : 'Standard GSM-7: 160 chars for single segment; 153 chars/part for multipart.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400">
                      <span>{isBn ? 'প্রিভিউ দেখতে বডিতে মেসেজ টাইপ করুন' : 'Type message body to see live preview'}</span>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 pt-3 border-t border-slate-200">
                  {isBn
                    ? 'নিয়ম: নতুন বা সংশোধিত টেমপ্লেট ড্রাফট অবস্থায় থাকে এবং অ্যাডমিন কর্তৃক অনুমোদিত হতে হয়।'
                    : 'Security Rule: New templates start in draft state and require admin approval.'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 mt-6">
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={savingTemplate || invalidPlaceholders.length > 0}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingTemplate ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {isBn ? 'টেমপ্লেট সংরক্ষণ' : 'Save Template'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EVENT RULE CONFIGURATOR */}
      {selectedRuleForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveRule}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-scale-in"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand-primary" />
                <h3 className="font-bold text-slate-800 text-base">
                  {isBn ? 'ইভেন্ট রুল কনফিগারেশন' : 'Configure Event Rule'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRuleForEdit(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {ruleError && (
              <div className="p-3 mb-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{ruleError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">{isBn ? 'ইভেন্ট' : 'Event'}:</span>
                <p className="font-bold text-slate-800 text-sm">
                  {EVENT_TYPE_LABELS[selectedRuleForEdit.event_type]?.en || selectedRuleForEdit.event_type}
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isBn ? 'সংযুক্ত টেমপ্লেট' : 'Assigned Template'}
                </label>
                <select
                  value={ruleTemplateId}
                  onChange={(e) => setRuleTemplateId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                >
                  {templates
                    .filter((t) => t.channel === selectedRuleForEdit.channel)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.template_code}) [{t.status}]
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isBn ? 'টাইমিং অফসেট (মিনিট)' : 'Offset (Minutes)'}
                  </label>
                  <input
                    type="number"
                    value={ruleOffsetMinutes}
                    onChange={(e) => setRuleOffsetMinutes(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                    placeholder="e.g. -1440 for 24h prior"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">-1440 = 24h before</span>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isBn ? 'কুয়েট আওয়ারস শুরু' : 'Quiet Hours Start'}
                  </label>
                  <input
                    type="text"
                    value={ruleQuietHoursStart}
                    onChange={(e) => setRuleQuietHoursStart(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                    placeholder="21:00:00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isBn ? 'কুয়েট আওয়ারস শেষ' : 'Quiet Hours End'}
                  </label>
                  <input
                    type="text"
                    value={ruleQuietHoursEnd}
                    onChange={(e) => setRuleQuietHoursEnd(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                    placeholder="08:00:00"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={ruleRequiresConsent}
                      onChange={(e) => setRuleRequiresConsent(e.target.checked)}
                      className="rounded text-brand-primary focus:ring-brand-primary"
                    />
                    <span className="font-semibold text-slate-700 text-xs">
                      {isBn ? 'রোগীর সম্মতি আবশ্যক' : 'Patient Consent'}
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ruleIsEnabled}
                    onChange={(e) => setRuleIsEnabled(e.target.checked)}
                    className="rounded text-brand-primary focus:ring-brand-primary"
                  />
                  <span className="font-semibold text-slate-700 text-xs">
                    {isBn ? 'এই নিয়মটি সক্রিয় রাখুন' : 'Enable this notification trigger rule'}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 mt-5">
              <button
                type="button"
                onClick={() => setSelectedRuleForEdit(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={savingRule}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingRule ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {isBn ? 'নিয়ম সংরক্ষণ' : 'Update Rule'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
