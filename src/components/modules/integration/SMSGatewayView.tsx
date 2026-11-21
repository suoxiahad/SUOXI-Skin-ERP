import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Key,
  Smartphone,
  Eye,
  EyeOff,
  Clock,
  Sparkles,
  Zap,
  Sliders,
  FileText,
  Search,
  Check,
  HelpCircle,
  Hash,
  Database,
  Building2,
} from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import type { SmsGatewayConfig, SmsLogRecord, SmsTemplate } from '../../../types/index.ts';

export const SMSGatewayView: React.FC = () => {
  const { addToast, language } = useApp();
  const isBn = language === 'bn';

  const [activeTab, setActiveTab] = useState<'settings' | 'send' | 'templates' | 'automation' | 'logs'>('settings');

  // Gateway Config state (loaded from PostgreSQL via /api/v1/integration/sms/config)
  const [config, setConfig] = useState<SmsGatewayConfig>({
    provider: 'msg_mram',
    apiUrl: 'https://msg.mram.com.bd/smsapi',
    apiKey: '',
    senderId: 'SUOXI',
    defaultType: 'text',
    defaultLabel: 'transactional',
    isActive: false,
    balanceBDT: 0,
    balanceCredits: 0,
    lastCheckedAt: new Date().toISOString(),
    autoSendOnBooking: true,
    autoSendOnPayment: true,
    autoSendOnPrescription: true,
    autoSendReminder24h: true,
  });

  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Send Test SMS state
  const [recipientPhone, setRecipientPhone] = useState('+8801712345678');
  const [recipientName, setRecipientName] = useState('Sumaiya Rahman');
  const [messageType, setMessageType] = useState<'text' | 'unicode'>('text');
  const [messageLabel, setMessageLabel] = useState<'transactional' | 'promotional'>('transactional');
  const [smsContent, setSmsContent] = useState(
    'Dear Sumaiya Rahman, your appointment with Dr. Nusrat Jahan is confirmed on 21 Oct 2026 at 4:30 PM (Dhanmondi Main Center). Token #01. Helpline: +8801711223344. - SUOXI Skin Care'
  );
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [lastShootResult, setLastShootResult] = useState<any>(null);

  // Templates state
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SmsTemplate | null>(null);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [editTmplContent, setEditTmplContent] = useState('');

  const [serverIp, setServerIp] = useState<string>('34.34.254.57');

  // Logs state
  const [logs, setLogs] = useState<SmsLogRecord[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all');

  // Load Initial Data
  const loadData = async () => {
    try {
      const [cfgData, tmpls, logsData, ipData] = await Promise.all([
        api.integration.sms.getConfig(),
        api.integration.sms.getTemplates(),
        api.integration.sms.getLogs(),
        api.integration.sms.getServerIp().catch(() => ({ serverIp: '34.34.254.57' })),
      ]);
      setConfig(cfgData);
      setTemplates(tmpls);
      setLogs(logsData);
      if (ipData?.serverIp) setServerIp(ipData.serverIp);
    } catch (err: any) {
      console.warn('Could not fetch SMS config:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Balance Check
  const handleCheckBalance = async () => {
    setIsLoadingBalance(true);
    try {
      const res = await api.integration.sms.checkBalance();
      setConfig((prev) => ({
        ...prev,
        balanceBDT: res.balanceBDT,
        balanceCredits: res.balanceCredits,
        lastCheckedAt: res.lastCheckedAt,
      }));
      addToast({
        type: 'success',
        title: isBn ? 'ব্যালেন্স আপডেট সফল' : 'Balance Updated',
        description: `Current Balance: ৳ ${res.balanceBDT.toLocaleString()} (${res.balanceCredits.toLocaleString()} SMS credits)`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Balance Check Failed',
        description: err.message || 'Unable to fetch balance from msg.mram.com.bd',
      });
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // Save Settings
  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const updated = await api.integration.sms.updateConfig(config);
      setConfig(updated);
      addToast({
        type: 'success',
        title: isBn ? 'কনফিগারেশন সংরক্ষিত' : 'Settings Saved',
        description: 'msg.mram.com.bd SMS Gateway settings successfully updated.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        description: err.message || 'Failed to update SMS Gateway configuration',
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Replace curly brace variables with sample data
  const handleReplaceWithSampleData = () => {
    let sample = smsContent;
    sample = sample.replace(/\{\{patient_name\}\}/g, recipientName || 'Ahad');
    sample = sample.replace(/\{\{doctor_name\}\}/g, 'Dr. Nusrat Jahan');
    sample = sample.replace(/\{\{appointment_date\}\}/g, '04 Nov 2026');
    sample = sample.replace(/\{\{appointment_time\}\}/g, '10:04 AM');
    sample = sample.replace(/\{\{branch_name\}\}/g, 'Dhanmondi Main Center');
    sample = sample.replace(/\{\{token\}\}/g, '#08');
    sample = sample.replace(/\{\{amount\}\}/g, '3,500');
    sample = sample.replace(/\{\{invoice_number\}\}/g, 'INV-2026-0042');
    sample = sample.replace(/\{\{invoice_url\}\}/g, 'https://suoxiclinic.com/r/0042');
    sample = sample.replace(/\{\{portal_url\}\}/g, 'https://suoxiclinic.com/portal');
    setSmsContent(sample);
    addToast({
      type: 'info',
      title: 'Sample Data Injected',
      description: 'Dynamic tags replaced with real preview values.',
    });
  };

  // Calculate Characters & SMS count
  const calculateSmsParts = (text: string, type: 'text' | 'unicode') => {
    const chars = text.length;
    if (type === 'unicode') {
      const parts = chars <= 70 ? 1 : Math.ceil(chars / 67);
      return { chars, parts, maxSingle: 70, perPartMulti: 67 };
    } else {
      const parts = chars <= 160 ? 1 : Math.ceil(chars / 153);
      return { chars, parts, maxSingle: 160, perPartMulti: 153 };
    }
  };

  const smsMetrics = calculateSmsParts(smsContent, messageType);

  // Send Test SMS
  const handleSendTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientPhone.trim() || !smsContent.trim()) {
      addToast({
        type: 'error',
        title: 'Validation Error',
        description: 'Phone number and SMS content cannot be empty.',
      });
      return;
    }

    setIsSendingSms(true);
    setLastShootResult(null);

    try {
      const res = await api.integration.sms.send({
        recipientPhone,
        recipientName,
        messageContent: smsContent,
        messageType,
        label: messageLabel,
        senderId: config.senderId,
      });

      setLastShootResult(res);
      setConfig((prev) => ({
        ...prev,
        balanceCredits: res.remainingCredits,
        balanceBDT: res.remainingBDT,
      }));

      // Refresh logs
      const updatedLogs = await api.integration.sms.getLogs();
      setLogs(updatedLogs);

      if (res.success) {
        addToast({
          type: 'success',
          title: isBn ? 'এসএমএস সফলভাবে প্রেরিত' : 'SMS Sent Successfully',
          description: `Shoot ID: ${res.shootId} (${res.smsCount} part(s), ৳ ${res.costBDT})`,
        });
      } else {
        addToast({
          type: 'error',
          title: `Gateway Error ${res.errorCode}: ${res.errorTitle || 'Dispatch Blocked'}`,
          description: res.errorMessage || res.gatewayResponse,
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'SMS Dispatch Failed',
        description: err.message || 'Error communicating with msg.mram.com.bd API',
      });
    } finally {
      setIsSendingSms(false);
    }
  };

  // Quick fill preset template
  const handleFillTemplate = (tmpl: SmsTemplate) => {
    setSmsContent(tmpl.content);
    setMessageType(tmpl.type);
    setMessageLabel(tmpl.label);
    addToast({
      type: 'info',
      title: 'Template Loaded',
      message: `Loaded "${tmpl.name}" into test message box.`,
    });
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.recipientPhone.toLowerCase().includes(logSearch.toLowerCase()) ||
      (log.recipientName && log.recipientName.toLowerCase().includes(logSearch.toLowerCase())) ||
      (log.shootId && log.shootId.toLowerCase().includes(logSearch.toLowerCase())) ||
      log.messageContent.toLowerCase().includes(logSearch.toLowerCase());

    const matchesStatus = logStatusFilter === 'all' || log.status === logStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-100 shrink-0">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                Integration
              </span>
              <span className="text-xs font-semibold text-slate-400">•</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                msg.mram.com.bd Connected
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              {isBn ? 'এসএমএস গেটওয়ে ইন্টিগ্রেশন' : 'SMS Gateway Integration'}
            </h1>
            <p className="text-xs text-slate-500">
              Direct API integration with <code className="text-indigo-600 font-mono">https://msg.mram.com.bd/</code> for transactional notices & reminders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCheckBalance}
            disabled={isLoadingBalance}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBalance ? 'animate-spin' : ''}`} />
            <span>{isLoadingBalance ? 'Checking...' : 'Check Balance'}</span>
          </button>

          <a
            href="https://msg.mram.com.bd/Developers"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition-all shadow-2xs"
          >
            <span>Developer Docs</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Provider & Status */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SMS Provider</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-50"></span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-900">msg.mram.com.bd</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Gateway Status: <span className="font-semibold text-emerald-700">Active</span>
          </p>
        </div>

        {/* Card 2: Balance Credits */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Available Credits</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {config.balanceCredits.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-500">SMS</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Account Balance:</span>
            <span className="font-bold text-indigo-700">৳ {config.balanceBDT.toLocaleString()}</span>
          </p>
        </div>

        {/* Card 3: Masking Sender ID */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved Sender ID</span>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-extrabold text-indigo-700 font-mono tracking-wider">
              {config.senderId}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
              BTRC Approved
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Masking Brand: <span className="font-semibold text-slate-700">SUOXI Skin Care</span>
          </p>
        </div>

        {/* Card 4: Sent Count & Delivery */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sent Today</span>
            <Smartphone className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">142</span>
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">99.3% Delivered</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Avg. Delivery Latency: <span className="font-semibold text-slate-700">&lt; 3.2s</span>
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2 shadow-xs">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto">
          {[
            { id: 'settings', label: 'Gateway Settings (msg.mram)', icon: Sliders },
            { id: 'send', label: 'Send Test SMS', icon: Send },
            { id: 'templates', label: 'Clinical Templates', icon: FileText },
            { id: 'automation', label: 'Automated Triggers', icon: Zap },
            { id: 'logs', label: 'SMS Delivery Logs (DLR)', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-3 border-b-2 text-xs font-bold tracking-tight whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 1: Gateway Settings (msg.mram.com.bd) */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">msg.mram.com.bd Credentials & Configuration</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure your API key and approved sender masking ID from your msg.mram.com.bd developer dashboard.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* API Provider URL */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  API Endpoint (GET & POST)
                </label>
                <input
                  type="text"
                  value={config.apiUrl}
                  onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                  className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Official endpoint specified in Developer Documentation: <code className="text-indigo-600 font-mono">https://msg.mram.com.bd/smsapi</code>
                </span>
              </div>

              {/* API Key */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    API Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {isApiKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{isApiKeyVisible ? 'Hide Key' : 'Reveal Key'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={isApiKeyVisible ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="Enter your msg.mram.com.bd API Key"
                    className="w-full text-xs font-mono px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(config.apiKey);
                      addToast({ type: 'info', title: 'Copied', message: 'API Key copied to clipboard' });
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Copy API Key"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Approved Sender ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Approved Sender ID (Masking)
                </label>
                <input
                  type="text"
                  value={config.senderId}
                  onChange={(e) => setConfig({ ...config, senderId: e.target.value })}
                  placeholder="e.g. SUOXI"
                  className="w-full text-xs font-mono font-bold px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Must be approved by BTRC in your msg.mram dashboard.
                </span>
              </div>

              {/* Default Label */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Default Purpose Label
                </label>
                <select
                  value={config.defaultLabel}
                  onChange={(e) => setConfig({ ...config, defaultLabel: e.target.value as any })}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="transactional">transactional (Appointments, Invoices, OTP)</option>
                  <option value="promotional">promotional (Seasonal offers, Discounts)</option>
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Affects DND routing & telco priority.
                </span>
              </div>

              {/* Default Message Type */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Default Message Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    config.defaultType === 'text' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="defaultType"
                      checked={config.defaultType === 'text'}
                      onChange={() => setConfig({ ...config, defaultType: 'text' })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">text (English GSM)</div>
                      <div className="text-[11px] text-slate-500">160 characters / SMS</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    config.defaultType === 'unicode' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      name="defaultType"
                      checked={config.defaultType === 'unicode'}
                      onChange={() => setConfig({ ...config, defaultType: 'unicode' })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-800">unicode (বাংলা / Bengali)</div>
                      <div className="text-[11px] text-slate-500">70 characters / SMS</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSavingConfig ? 'Saving...' : 'Save SMS Gateway Settings'}
              </button>
            </div>
          </div>

          {/* Right Column: Server IP Whitelist Guidance & Error Codes Reference */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            {/* Server IP Whitelist Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-extrabold text-slate-900">msg.mram.com.bd IP Whitelist</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-600 text-white">
                  Live API
                </span>
              </div>

              <p className="text-[11px] text-slate-600 leading-relaxed">
                msg.mram.com.bd এ সিকিউরিটি বাটন বা IP Whitelist অন থাকলে নিচের সার্ভার আইপিটি তাদের পোর্টালে যুক্ত (Whitelist) করতে হবে (অন্যথায় এরর কোড <strong>1016</strong> আসবে):
              </p>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-indigo-200 font-mono text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Server Public IP</span>
                  <span className="font-bold text-slate-900 text-sm text-indigo-700">{serverIp}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(serverIp);
                    addToast({ type: 'info', title: 'Copied', description: `Server IP ${serverIp} copied to clipboard` });
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-sans font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy IP</span>
                </button>
              </div>

              <p className="text-[10px] text-slate-500">
                👉 <a href="https://msg.mram.com.bd/Developers" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold underline inline-flex items-center gap-0.5">msg.mram.com.bd Developers <ExternalLink className="w-3 h-3" /></a> পোর্টালে এই IP যুক্ত করুন অথবা তাদের সেটিংস থেকে <strong>IP Restriction</strong> বন্ধ করুন।
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <HelpCircle className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">msg.mram.com.bd API Specification</h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Reference error codes as documented in the official msg.mram.com.bd Developer API guide:
            </p>

            <div className="space-y-2 max-h-96 overflow-y-auto text-xs">
              {[
                { code: '1002', name: 'Sender Id / Masking Not Found', desc: 'Approved Sender ID does not match account credentials.' },
                { code: '1003', name: 'API Not Found', desc: 'Invalid API endpoint route or requested action.' },
                { code: '1004', name: 'SPAM Detected', desc: 'SMS content flagged by automated carrier filters.' },
                { code: '1007', name: 'Balance Insufficient', desc: 'SMS credit balance exhausted. Recharge needed.' },
                { code: '1008', name: 'Message is empty', desc: 'The msg query parameter was omitted or blank.' },
                { code: '1009', name: 'Message Type Not Set', desc: 'Must specify type=text or type=unicode.' },
                { code: '1010', name: 'Invalid User & Password', desc: 'API authorization credentials rejected.' },
                { code: '1012', name: 'Invalid Number', desc: 'Mobile number must match 8801XXXXXXXXX.' },
                { code: '1014', name: 'No Matching Template', desc: 'Strict template approval mismatch.' },
                { code: '1015', name: 'SMS Content Validation Fails', desc: 'Illegal characters or unencoded URI symbols.' },
                { code: '1016', name: 'IP Address Not Allowed!!', desc: 'IP whitelist restriction triggered on portal.' },
                { code: '1019', name: 'SMS Purpose Missing', desc: 'Transactional vs promotional label missing.' },
              ].map((item) => (
                <div key={item.code} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/70">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                      Code {item.code}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-800">{item.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Send Test SMS */}
      {activeTab === 'send' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Direct Test Dispatcher</h2>
                <p className="text-xs text-slate-500">
                  Test SMS delivery directly via msg.mram.com.bd with live character counting & part breakdown.
                </p>
              </div>

              {/* Template quick-picker dropdown & Sample Replacer */}
              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => {
                    const tmpl = templates.find((t) => t.id === e.target.value);
                    if (tmpl) handleFillTemplate(tmpl);
                  }}
                  defaultValue=""
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                >
                  <option value="" disabled>Load Clinic Template...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.type})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleReplaceWithSampleData}
                  title="Replace {{variables}} with actual patient and doctor names"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Fill Sample Data</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSendTestSms} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Recipient Mobile Number *
                  </label>
                  <input
                    type="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="+88017XXXXXXXX"
                    className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Format: +8801XXXXXXXXX or 01XXXXXXXXX
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Recipient Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="e.g. Farzana Rahman"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Message Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMessageType('text')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        messageType === 'text'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      text (English GSM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMessageType('unicode')}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        messageType === 'unicode'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      unicode (বাংলা)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Label
                  </label>
                  <select
                    value={messageLabel}
                    onChange={(e) => setMessageLabel(e.target.value as any)}
                    className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="transactional">transactional</option>
                    <option value="promotional">promotional</option>
                  </select>
                </div>
              </div>

              {/* Message Content with live character stats */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Message Body *
                  </label>
                  <div className="text-xs font-mono">
                    <span className="font-bold text-slate-800">{smsMetrics.chars}</span> characters •{' '}
                    <span className="font-bold text-indigo-600">{smsMetrics.parts} SMS {smsMetrics.parts > 1 ? 'Parts' : 'Part'}</span>
                    {' '}(~৳ {(smsMetrics.parts * 0.35).toFixed(2)})
                  </div>
                </div>

                <textarea
                  value={smsContent}
                  onChange={(e) => setSmsContent(e.target.value)}
                  rows={4}
                  className="w-full text-xs font-sans p-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter message text here..."
                  required
                />

                {/* Variable helpers */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Insert:</span>
                  {[
                    '{{patient_name}}',
                    '{{doctor_name}}',
                    '{{appointment_date}}',
                    '{{appointment_time}}',
                    '{{branch_name}}',
                    '{{token}}',
                    '{{amount}}',
                    '{{invoice_url}}',
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSmsContent((prev) => prev + ' ' + v)}
                      className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[11px] font-mono border border-slate-200 transition-colors cursor-pointer"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Sender Masking: <strong className="font-mono text-slate-800">{config.senderId}</strong></span>
                </div>

                <button
                  type="submit"
                  disabled={isSendingSms}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 cursor-pointer disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingSms ? 'animate-pulse' : ''}`} />
                  <span>{isSendingSms ? 'Transmitting via msg.mram...' : 'Send Test SMS'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Live Mobile Device Simulator & Last Result */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-lg border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                  <span className="text-xs font-bold tracking-tight text-slate-200">Phone Simulator</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Carrier: Grameenphone</span>
              </div>

              {/* Message bubble */}
              <div className="space-y-2">
                <div className="text-center">
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2.5 py-0.5 rounded-full font-semibold">
                    Sender: {config.senderId}
                  </span>
                </div>

                <div className="bg-indigo-600 text-white p-3.5 rounded-2xl rounded-tl-sm text-xs leading-relaxed shadow-sm">
                  {smsContent || <span className="italic text-indigo-300">Type a message to preview...</span>}
                </div>

                <div className="text-[10px] text-slate-400 text-right">
                  Just now • Delivered
                </div>
              </div>
            </div>

            {/* Last Shoot Result Card */}
            {lastShootResult && (
              lastShootResult.success ? (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-xs space-y-2 animate-fadeIn">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Gateway Submission Confirmed</span>
                  </div>
                  <div className="font-mono text-slate-700 text-[11px] space-y-1 bg-white p-2.5 rounded-xl border border-emerald-100">
                    <div><strong>Shoot ID:</strong> {lastShootResult.shootId}</div>
                    <div><strong>SMS Count:</strong> {lastShootResult.smsCount} part(s)</div>
                    <div><strong>Cost:</strong> ৳ {lastShootResult.costBDT}</div>
                    <div><strong>Remaining Credits:</strong> {lastShootResult.remainingCredits}</div>
                    <div><strong>API Gateway Response:</strong> {lastShootResult.gatewayResponse}</div>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50 border-2 border-rose-300 p-4 rounded-2xl text-xs space-y-3 animate-fadeIn">
                  <div className="flex items-start gap-2 text-rose-900">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-extrabold text-xs sm:text-sm text-rose-900 leading-tight">
                        Gateway Rejected: Error {lastShootResult.errorCode}
                      </h4>
                      <p className="font-bold text-rose-700 text-xs mt-0.5">
                        {lastShootResult.errorTitle || 'API Request Rejected'}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-rose-200 space-y-2 text-slate-700 text-[11px] leading-relaxed">
                    <p className="font-semibold text-rose-800">
                      {lastShootResult.errorMessage}
                    </p>

                    {lastShootResult.errorCode === '1016' && (
                      <div className="pt-2 border-t border-rose-100 space-y-2">
                        <div className="font-bold text-slate-800">
                          📌 সমস্যা সমাধানের উপায় (How to Fix):
                        </div>
                        <p className="text-slate-600">
                          আপনার <a href="https://msg.mram.com.bd/Developers" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold underline inline-flex items-center gap-0.5">msg.mram.com.bd <ExternalLink className="w-3 h-3" /></a> একাউন্টে <strong>IP Whitelist</strong> অন আছে। এই সার্ভার থেকে এসএমএস পাঠাতে নিচের সার্ভার আইপিটি তাদের পোর্টালে Whitelist করুন:
                        </p>

                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 text-white font-mono text-xs">
                          <span className="text-emerald-400 font-bold">{lastShootResult.serverIp || serverIp}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(lastShootResult.serverIp || serverIp);
                              addToast({ type: 'info', title: 'Copied', description: 'Server IP copied to clipboard' });
                            }}
                            className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-sans font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" /> Copy Server IP
                          </button>
                        </div>

                        <p className="text-[10px] text-slate-500 italic">
                          * অথবা msg.mram পোর্টালে "IP Restriction" ফিচারটি নিষ্ক্রিয় (Disable) করতে পারেন।
                        </p>
                      </div>
                    )}

                    {lastShootResult.errorCode === '1002' && (
                      <div className="pt-2 border-t border-rose-100 text-slate-600 space-y-1">
                        <div className="font-bold text-slate-800">
                          📌 প্রেরক আইডি (Sender ID) পরীক্ষা করুন:
                        </div>
                        <p>
                          নিশ্চিত করুন আপনার msg.mram পোর্টালে অনুমোদিত Sender ID টি সঠিক বানানে লিখেছেন (যেমন: <strong>SUOXI</strong> নাকি <strong>SUOXI SKIN</strong>)। ডট বা স্পেস খেয়াল করুন।
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-rose-700 font-mono">
                    <span>Shoot ID: {lastShootResult.shootId}</span>
                    <span className="font-bold text-slate-600">No credits deducted</span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Clinical Templates */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Standard Clinical SMS Templates</h2>
              <p className="text-xs text-slate-500">
                Pre-approved templates for patient lifecycle, appointments, and billing.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tmpl) => {
              const metrics = calculateSmsParts(tmpl.content, tmpl.type);
              return (
                <div
                  key={tmpl.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-indigo-300 transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{tmpl.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {tmpl.category}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                          {tmpl.type}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                          {tmpl.label}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        handleFillTemplate(tmpl);
                        setActiveTab('send');
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      Use in Send
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs text-slate-700 font-sans leading-relaxed">
                    {tmpl.content}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span className="font-mono">
                      {metrics.chars} chars • {metrics.parts} SMS {metrics.parts > 1 ? 'parts' : 'part'} (~৳ {(metrics.parts * 0.35).toFixed(2)})
                    </span>
                    <span className="text-slate-400">
                      Variables: {tmpl.variables.length}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 4: Automated Clinic Triggers */}
      {activeTab === 'automation' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6 max-w-4xl">
          <div>
            <h2 className="text-base font-bold text-slate-900">Automated SMS Notification Triggers</h2>
            <p className="text-xs text-slate-500">
              When enabled, the system automatically transmits transactional SMS via msg.mram.com.bd upon clinic events.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                id: 'autoSendOnBooking',
                title: 'New Appointment Booking Confirmation',
                desc: 'Dispatches instant SMS with doctor name, scheduled time, token, and clinic branch address once booking is created.',
                checked: config.autoSendOnBooking,
              },
              {
                id: 'autoSendReminder24h',
                title: '24-Hour Treatment Session Reminder',
                desc: 'Automatically sends reminder 24 hours prior to scheduled laser, HydraFacial, or aesthetic procedure.',
                checked: config.autoSendReminder24h,
              },
              {
                id: 'autoSendOnPayment',
                title: 'POS Billing Payment Receipt',
                desc: 'Sends instant payment receipt confirmation with invoice number, amount received in BDT, and e-bill link.',
                checked: config.autoSendOnPayment,
              },
              {
                id: 'autoSendOnPrescription',
                title: 'Prescription & Post-Care Regimen Finalization',
                desc: 'Sends notification link to patient when aesthetic dermatologist writes the clinical skincare prescription.',
                checked: config.autoSendOnPrescription,
              },
            ].map((trigger) => (
              <div
                key={trigger.id}
                className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-all"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-800">{trigger.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{trigger.desc}</p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={trigger.checked}
                    onChange={(e) => {
                      const updated = { ...config, [trigger.id]: e.target.checked };
                      setConfig(updated);
                      api.integration.sms.updateConfig(updated);
                      addToast({
                        type: 'info',
                        title: 'Trigger Updated',
                        message: `${trigger.title} is now ${e.target.checked ? 'Enabled' : 'Disabled'}.`,
                      });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: SMS Delivery Logs (DLR) */}
      {activeTab === 'logs' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">SMS Outbox & Delivery Reports (DLR)</h2>
              <p className="text-xs text-slate-500">
                Audit trail of all SMS messages dispatched through msg.mram.com.bd.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search phone, shoot ID, or text..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56 sm:w-64"
                />
              </div>

              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="delivered">Delivered</option>
                <option value="gateway_accepted">Gateway Accepted</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Message Snippet</th>
                  <th className="py-3 px-4">Type / Label</th>
                  <th className="py-3 px-4">Shoot ID</th>
                  <th className="py-3 px-4">Parts & Cost</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                      No SMS logs matching your search filter.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {new Date(log.sentAt).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{log.recipientName || 'Direct'}</div>
                        <div className="font-mono text-indigo-700 text-[11px]">{log.recipientPhone}</div>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-600" title={log.messageContent}>
                        {log.messageContent}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                          {log.messageType}
                        </span>
                        <span className="ml-1 text-[10px] text-slate-400">
                          {log.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-700">
                        {log.shootId || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-800">{log.smsCount} SMS</span>{' '}
                        <span className="text-slate-400">({log.charsCount} ch)</span>
                        <div className="text-[10px] text-emerald-700 font-bold">
                          ৳ {log.costBDT ? log.costBDT.toFixed(2) : '0.35'}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.status === 'delivered' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <Check className="w-3 h-3" /> Delivered
                          </span>
                        ) : log.status === 'gateway_accepted' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            <Clock className="w-3 h-3" /> Accepted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            <AlertCircle className="w-3 h-3" /> Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
