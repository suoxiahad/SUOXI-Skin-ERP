import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sliders,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import type { FollowUpRuleDto, FollowUpTaskPriority } from '@suoxi/shared-types';
import { callCenterApi } from '../../api/callCenter.js';
import { useI18n } from '../../i18n/I18nContext.js';

interface FollowUpRuleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export const FollowUpRuleSettingsModal: React.FC<FollowUpRuleSettingsModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
}) => {
  const { lang } = useI18n();
  const [rules, setRules] = useState<FollowUpRuleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRules();
    }
  }, [isOpen]);

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callCenterApi.listRules();
      setRules(data);
    } catch (err: any) {
      console.error('Failed to load rules:', err);
      setError(err.message || 'Failed to fetch follow-up automation rules');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (rule: FollowUpRuleDto) => {
    setSavingId(rule.id);
    const activeState = rule.is_active ?? rule.is_enabled;
    const ruleName = rule.rule_name || rule.rule_type.replace('_', ' ');
    try {
      const updated = await callCenterApi.updateRule(rule.id, {
        is_active: !activeState,
        is_enabled: !activeState,
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
      setSuccessMsg(
        lang === 'bn'
          ? `নিয়ম "${ruleName}" হালনাগাদ করা হয়েছে।`
          : `Rule "${ruleName}" updated successfully.`
      );
      setTimeout(() => setSuccessMsg(null), 3000);
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update rule status');
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdateConfig = async (
    ruleId: string,
    field: 'trigger_window_days' | 'trigger_window_hours' | 'default_priority',
    value: any
  ) => {
    setSavingId(ruleId);
    try {
      const payload: any = {};
      if (field === 'trigger_window_days') payload.trigger_window_days = Number(value);
      if (field === 'trigger_window_hours') payload.trigger_window_hours = Number(value);
      if (field === 'default_priority') payload.default_priority = value;

      const updated = await callCenterApi.updateRule(ruleId, payload);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
      setSuccessMsg(lang === 'bn' ? 'কনফিগারেশন সংরক্ষিত হয়েছে।' : 'Configuration saved.');
      setTimeout(() => setSuccessMsg(null), 2500);
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSavingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <Sliders className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {lang === 'bn' ? 'ফলো-আপ অটোমেশন রুলস সেটিংস' : 'Follow-up Task Automation Rules'}
              </h2>
              <p className="text-xs text-slate-500">
                {lang === 'bn'
                  ? 'স্বয়ংক্রিয় ফলো-আপ টাস্ক তৈরির নিয়ম ও সময়সীমা কনফিগার করুন'
                  : 'Configure automated queue generators, thresholds, and priority levels'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content list */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <span>{lang === 'bn' ? 'নিয়মাবলী লোড হচ্ছে...' : 'Loading rules...'}</span>
            </div>
          ) : rules.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <span>{lang === 'bn' ? 'কোনো নিয়ম কনফিগার করা নেই।' : 'No rules configured.'}</span>
            </div>
          ) : (
            rules.map((rule) => {
              const isSaving = savingId === rule.id;
              const isActive = rule.is_active ?? rule.is_enabled;
              const ruleName = rule.rule_name || rule.rule_type.replace('_', ' ');
              const taskType = rule.task_type || rule.rule_type;
              const priority = rule.default_priority || rule.priority;
              const windowHours = rule.trigger_window_hours;
              const windowDays = rule.trigger_window_days ?? rule.trigger_days;

              return (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-50 border-slate-200/80 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{ruleName}</span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {taskType}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{rule.description || `Automated ${taskType} trigger rule`}</p>
                    </div>

                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleToggleActive(rule)}
                      className="p-1 text-slate-600 hover:text-emerald-700 transition-colors shrink-0"
                      title={isActive ? 'Disable rule' : 'Enable rule'}
                    >
                      {isActive ? (
                        <ToggleRight className="w-8 h-8 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-slate-300" />
                      )}
                    </button>
                  </div>

                  {/* Inline controls */}
                  <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {windowHours !== null && windowHours !== undefined && (
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">
                          {lang === 'bn' ? 'ট্রিগার উইন্ডো (ঘণ্টা)' : 'Trigger Window (Hours)'}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="168"
                          defaultValue={windowHours}
                          onBlur={(e) =>
                            handleUpdateConfig(rule.id, 'trigger_window_hours', e.target.value)
                          }
                          className="w-full h-8 px-2.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}

                    {windowDays !== null && windowDays !== undefined && (
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">
                          {lang === 'bn' ? 'ট্রিগার থ্রেশহোল্ড (দিন)' : 'Threshold (Days)'}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          defaultValue={windowDays}
                          onBlur={(e) =>
                            handleUpdateConfig(rule.id, 'trigger_window_days', e.target.value)
                          }
                          className="w-full h-8 px-2.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-600 font-medium mb-1">
                        {lang === 'bn' ? 'ডিফল্ট প্রায়োরিটি' : 'Default Priority'}
                      </label>
                      <select
                        defaultValue={priority}
                        onChange={(e) =>
                          handleUpdateConfig(rule.id, 'default_priority', e.target.value)
                        }
                        className="w-full h-8 px-2 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              {lang === 'bn'
                ? 'অনন্য ডিডুপ্লিকেট কিউ প্রয়োগ করে নকল টাস্ক প্রতিরোধ করা হয়'
                : 'Enforces dedupe_key uniqueness across runs'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            {lang === 'bn' ? 'সম্পন্ন' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
