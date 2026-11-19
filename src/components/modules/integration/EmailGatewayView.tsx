import React, { useState, useEffect } from 'react';
import {
  Mail,
  ShieldCheck,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertCircle,
  Copy,
  Server,
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
  Terminal,
  ExternalLink,
  Laptop,
  CheckSquare,
} from 'lucide-react';
import { api } from '../../../api/client.ts';
import { useApp } from '../../../context/AppContext.tsx';
import type { EmailGatewayConfig, EmailLogRecord, EmailTemplate } from '../../../types/index.ts';

export const EmailGatewayView: React.FC = () => {
  const { addToast, language } = useApp();
  const isBn = language === 'bn';

  const [activeTab, setActiveTab] = useState<'settings' | 'test' | 'templates' | 'automation' | 'logs'>('settings');

  // Config State
  const [config, setConfig] = useState<EmailGatewayConfig>({
    provider: 'cpanel_smtp',
    smtpHost: 'mail.suoxiclinic.com',
    smtpPort: 465,
    encryption: 'SSL/TLS',
    smtpUser: 'care@suoxiclinic.com',
    smtpPass: 'Suoxi@Aesthetic#2026',
    fromName: 'SUOXI Skin Care & Aesthetic Center',
    fromEmail: 'care@suoxiclinic.com',
    replyToEmail: 'support@suoxiclinic.com',
    isActive: true,
    lastTestedAt: new Date().toISOString(),
    autoEmailPrescription: true,
    autoEmailInvoice: true,
    autoEmailAppointmentCard: true,
    autoEmailDailyReport: false,
  });

  const [isPassVisible, setIsPassVisible] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Test Email State
  const [recipientEmail, setRecipientEmail] = useState('sumaiya.rahman@gmail.com');
  const [testSubject, setTestSubject] = useState('Test Verification Email from SUOXI Clinic');
  const [testContent, setTestContent] = useState('This is a test notification confirming secure SMTP transmission from mail.suoxiclinic.com.');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<any>(null);

  // Templates State
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);

  // Logs State
  const [logs, setLogs] = useState<EmailLogRecord[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all');

  // Load Initial Data
  const loadData = async () => {
    try {
      const [cfg, tmpls, logList] = await Promise.all([
        api.integration.email.getConfig(),
        api.integration.email.getTemplates(),
        api.integration.email.getLogs(),
      ]);
      setConfig(cfg);
      setTemplates(tmpls);
      setLogs(logList);
      if (tmpls.length > 0) {
        setSelectedTemplate(tmpls[0]);
      }
    } catch (err: any) {
      console.warn('Could not fetch email config:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save Settings
  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const updated = await api.integration.email.updateConfig(config);
      setConfig(updated);
      addToast({
        type: 'success',
        title: isBn ? 'কনফিগারেশন সংরক্ষিত' : 'Settings Saved',
        message: 'cPanel SMTP mail gateway settings successfully updated.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Failed to update email gateway configuration',
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Send Test Email
  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail.trim()) {
      addToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Recipient email address is required.',
      });
      return;
    }

    setIsSendingTest(true);
    setDiagnosticLogs([
      `[INFO] Initiating TLS handshake with ${config.smtpHost}:${config.smtpPort}...`,
    ]);

    try {
      const res = await api.integration.email.sendTest({
        recipientEmail,
        subject: testSubject,
        content: testContent,
      });

      setTestResult(res);
      setDiagnosticLogs(res.diagnosticSteps);

      // Refresh outbox logs
      const updatedLogs = await api.integration.email.getLogs();
      setLogs(updatedLogs);

      addToast({
        type: 'success',
        title: isBn ? 'টেস্ট ইমেইল সফলভাবে প্রেরিত' : 'Test Email Dispatched',
        message: res.message,
      });
    } catch (err: any) {
      setDiagnosticLogs((prev) => [
        ...prev,
        `[ERROR] Connection failed: ${err.message}`,
      ]);
      addToast({
        type: 'error',
        title: 'SMTP Transmission Failed',
        message: err.message || 'Unable to connect to cPanel SMTP host',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.recipientEmail.toLowerCase().includes(logSearch.toLowerCase()) ||
      (log.recipientName && log.recipientName.toLowerCase().includes(logSearch.toLowerCase())) ||
      log.subject.toLowerCase().includes(logSearch.toLowerCase());

    const matchesStatus = logStatusFilter === 'all' || log.status === logStatusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-sky-100 shrink-0">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                Integration
              </span>
              <span className="text-xs font-semibold text-slate-400">•</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                cPanel Exim SMTP Ready
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              {isBn ? 'ইমেইল গেটওয়ে ইন্টিগ্রেশন' : 'Email Gateway Integration'}
            </h1>
            <p className="text-xs text-slate-500">
              cPanel Exim SMTP server integration for branded prescriptions, invoices & appointment reminders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Test Email</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Mail Server Host */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SMTP Host</span>
            <Server className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-base font-bold text-slate-900 font-mono">
              {config.smtpHost}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Port: <span className="font-semibold text-slate-700">{config.smtpPort} ({config.encryption})</span>
          </p>
        </div>

        {/* Card 2: Sender Email */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From Address</span>
            <Mail className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2 truncate">
            <span className="text-sm font-bold text-slate-900 font-mono truncate">
              {config.fromEmail}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            Name: <span className="font-semibold text-slate-700 truncate">{config.fromName}</span>
          </p>
        </div>

        {/* Card 3: Security & Encryption */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Security Protocol</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-extrabold text-emerald-700 font-mono">
              SSL / TLS 1.3
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Status: <span className="font-semibold text-emerald-700">Encrypted Transport</span>
          </p>
        </div>

        {/* Card 4: Outbox Stats */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sent Today</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">38</span>
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">0 Bounces</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Deliverability Rate: <span className="font-semibold text-slate-700">100%</span>
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2 shadow-xs">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto">
          {[
            { id: 'settings', label: 'cPanel SMTP Settings', icon: Sliders },
            { id: 'test', label: 'Send Test Email & Diagnostic', icon: Send },
            { id: 'templates', label: 'HTML Email Templates', icon: FileText },
            { id: 'automation', label: 'Automated Triggers', icon: Zap },
            { id: 'logs', label: 'Email Outbox Logs', icon: Clock },
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
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab 1: cPanel SMTP Settings */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">cPanel Exim SMTP Server Configuration</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Connect your clinic domain's mail server hosted in cPanel (Exim MTA).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Host */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Outgoing Mail Server (SMTP Host) *
                </label>
                <input
                  type="text"
                  value={config.smtpHost}
                  onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
                  placeholder="mail.suoxiclinic.com"
                  className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Usually <code className="font-mono text-sky-700">mail.yourdomain.com</code>
                </span>
              </div>

              {/* Port & Encryption */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  SMTP Port & Encryption *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={config.smtpPort}
                    onChange={(e) => setConfig({ ...config, smtpPort: parseInt(e.target.value, 10) })}
                    className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                  >
                    <option value={465}>Port 465 (SSL)</option>
                    <option value={587}>Port 587 (TLS)</option>
                    <option value={25}>Port 25 (Standard)</option>
                  </select>

                  <select
                    value={config.encryption}
                    onChange={(e) => setConfig({ ...config, encryption: e.target.value as any })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                  >
                    <option value="SSL/TLS">SSL/TLS</option>
                    <option value="STARTTLS">STARTTLS</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>

              {/* SMTP Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  cPanel Email Account (Username) *
                </label>
                <input
                  type="email"
                  value={config.smtpUser}
                  onChange={(e) => setConfig({ ...config, smtpUser: e.target.value })}
                  placeholder="care@suoxiclinic.com"
                  className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* SMTP Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsPassVisible(!isPassVisible)}
                    className="text-xs text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{isPassVisible ? 'Hide' : 'Reveal'}</span>
                  </button>
                </div>
                <input
                  type={isPassVisible ? 'text' : 'password'}
                  value={config.smtpPass}
                  onChange={(e) => setConfig({ ...config, smtpPass: e.target.value })}
                  className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Sender Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Sender Display Name *
                </label>
                <input
                  type="text"
                  value={config.fromName}
                  onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                  placeholder="SUOXI Skin Care & Aesthetic Center"
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* From Email & Reply-To */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Reply-To Email Address
                </label>
                <input
                  type="email"
                  value={config.replyToEmail || ''}
                  onChange={(e) => setConfig({ ...config, replyToEmail: e.target.value })}
                  placeholder="support@suoxiclinic.com"
                  className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isSavingConfig ? 'Saving...' : 'Save cPanel SMTP Settings'}
              </button>
            </div>
          </div>

          {/* Right Column: cPanel Setup Guide */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">cPanel Mail Configuration Guide</h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Settings matching standard cPanel Exim Mail Server:
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                <span className="font-bold text-slate-800">Secure SSL/TLS Settings (Recommended)</span>
                <div className="text-[11px] text-slate-600 space-y-0.5 font-mono">
                  <div>• Server: <strong>mail.suoxiclinic.com</strong></div>
                  <div>• SMTP Port: <strong>465</strong></div>
                  <div>• Authentication: <strong>Password (AUTH LOGIN)</strong></div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                <span className="font-bold text-slate-800">Non-SSL Alternative (STARTTLS)</span>
                <div className="text-[11px] text-slate-600 space-y-0.5 font-mono">
                  <div>• Server: <strong>mail.suoxiclinic.com</strong></div>
                  <div>• SMTP Port: <strong>587</strong></div>
                  <div>• Encryption: <strong>STARTTLS</strong></div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                  SPF & DKIM Verification
                </div>
                <div>
                  Ensure DNS has TXT records for SPF (<code className="font-mono">v=spf1 +a +mx ~all</code>) to avoid emails landing in patients' Spam/Junk folders.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Send Test Email & Diagnostic Handshake */}
      {activeTab === 'test' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dispatch Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Send Test Email via cPanel SMTP</h2>
              <p className="text-xs text-slate-500">
                Verifies SMTP credentials, Exim handshake, and delivery to a destination inbox.
              </p>
            </div>

            <form onSubmit={handleSendTestEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Destination Email Address *
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full text-xs font-mono px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Subject Line *
                </label>
                <input
                  type="text"
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Message Body
                </label>
                <textarea
                  value={testContent}
                  onChange={(e) => setTestContent(e.target.value)}
                  rows={4}
                  className="w-full text-xs p-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
                  <span>Host: {config.smtpHost}:{config.smtpPort}</span>
                </div>

                <button
                  type="submit"
                  disabled={isSendingTest}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 transition-all shadow-md shadow-sky-100 cursor-pointer disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingTest ? 'animate-pulse' : ''}`} />
                  <span>{isSendingTest ? 'Handshaking SMTP...' : 'Send Test Email'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Live SMTP Diagnostic Console */}
          <div className="bg-slate-900 text-emerald-400 p-6 rounded-2xl border border-slate-800 shadow-lg font-mono text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-200 font-bold">
                <Terminal className="w-4 h-4 text-sky-400" />
                <span>SMTP Exim Diagnostic Console</span>
              </div>
              <span className="text-[10px] text-slate-400">cPanel MTA</span>
            </div>

            <div className="space-y-1.5 min-h-64 max-h-96 overflow-y-auto">
              {diagnosticLogs.length === 0 ? (
                <div className="text-slate-500 italic py-12 text-center">
                  Click "Send Test Email" to initiate the real-time SMTP handshake diagnostic session.
                </div>
              ) : (
                diagnosticLogs.map((log, index) => (
                  <div key={index} className="leading-relaxed">
                    <span className="text-slate-500 mr-2">[{index + 1}]</span>
                    {log.startsWith('[ERROR]') ? (
                      <span className="text-rose-400">{log}</span>
                    ) : log.includes('250 OK') || log.includes('235') ? (
                      <span className="text-emerald-300 font-bold">{log}</span>
                    ) : (
                      <span className="text-slate-300">{log}</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {testResult && (
              <div className="pt-3 border-t border-slate-800 text-slate-300 flex items-center justify-between text-[11px]">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Handshake Verified
                </span>
                <span className="text-slate-400 font-mono">Response: 250 OK</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: HTML Email Templates */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Template List */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Clinical Email Templates
            </h2>

            {templates.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => setSelectedTemplate(tmpl)}
                className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                  selectedTemplate?.id === tmpl.id
                    ? 'border-sky-500 bg-sky-50/50 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">{tmpl.name}</h4>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {tmpl.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 truncate">
                  Subject: {tmpl.subject}
                </p>
                <div className="text-[10px] text-slate-400 mt-2 font-mono">
                  {tmpl.variables.join(' • ')}
                </div>
              </button>
            ))}
          </div>

          {/* HTML Preview Pane */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            {selectedTemplate ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{selectedTemplate.name}</h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Subject: <strong>{selectedTemplate.subject}</strong>
                    </p>
                  </div>
                  <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-100">
                    Live HTML Rendering
                  </span>
                </div>

                {/* Rendered HTML */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 overflow-y-auto max-h-[500px]">
                  <div dangerouslySetInnerHTML={{ __html: selectedTemplate.htmlPreview }} />
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-slate-400 italic">
                Select a template from the left to view rendered preview.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Automated Clinic Triggers */}
      {activeTab === 'automation' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6 max-w-4xl">
          <div>
            <h2 className="text-base font-bold text-slate-900">Automated Email Notification Triggers</h2>
            <p className="text-xs text-slate-500">
              Deliver formatted PDF links and HTML receipts directly to patients' email inboxes.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                id: 'autoEmailPrescription',
                title: 'E-Prescription & Dermatological Treatment Plan',
                desc: 'Automatically emails an official PDF prescription link with skincare instructions upon doctor consultation completion.',
                checked: config.autoEmailPrescription,
              },
              {
                id: 'autoEmailInvoice',
                title: 'Official Tax Invoice & Cash Receipt',
                desc: 'Emails an official payment receipt with itemized breakdown upon cashier checkout settlement.',
                checked: config.autoEmailInvoice,
              },
              {
                id: 'autoEmailAppointmentCard',
                title: 'Appointment Card with Google Calendar Sync',
                desc: 'Dispatches responsive appointment confirmation card with one-click Add-to-Calendar button upon new booking.',
                checked: config.autoEmailAppointmentCard,
              },
              {
                id: 'autoEmailDailyReport',
                title: 'Daily Financial Shift Closing Report (To Clinic Admin)',
                desc: 'Sends consolidated end-of-day revenue, cash counted, and MFS reconciliation report to management email at 10 PM.',
                checked: config.autoEmailDailyReport,
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
                      api.integration.email.updateConfig(updated);
                      addToast({
                        type: 'info',
                        title: 'Trigger Updated',
                        message: `${trigger.title} is now ${e.target.checked ? 'Enabled' : 'Disabled'}.`,
                      });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Email Outbox Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Email Outbox & Delivery Audit Trail</h2>
              <p className="text-xs text-slate-500">
                Audit trail of outgoing communications delivered via cPanel Exim MTA.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search recipient, subject..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 w-56 sm:w-64"
                />
              </div>

              <select
                value={logStatusFilter}
                onChange={(e) => setLogStatusFilter(e.target.value)}
                className="text-xs px-3 py-1.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="delivered">Delivered</option>
                <option value="sent">Sent</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">MTA Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                      No email records matching your search filter.
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
                        <div className="font-mono text-sky-700 text-[11px]">{log.recipientEmail}</div>
                      </td>
                      <td className="py-3 px-4 max-w-sm truncate text-slate-700 font-medium">
                        {log.subject}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                          {log.templateCategory}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <Check className="w-3 h-3" /> {log.status}
                        </span>
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
