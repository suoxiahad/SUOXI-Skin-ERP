import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Mail,
  MessageSquare,
  ShieldCheck,
  RefreshCw,
  Send,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Key,
  ExternalLink,
  Sliders,
  Filter,
  Eye,
  X,
  Server,
  Lock,
} from 'lucide-react';
import { integrationsApi } from '../../api/integrations.js';
import type {
  IntegrationConfigDto,
  SaveIntegrationConfigRequest,
  TestIntegrationRequest,
  TestIntegrationResultDto,
  IntegrationLogDto,
  IntegrationType,
  SmtpConfig,
  SmsGatewayConfig,
} from '@suoxi/shared-types';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

export const IntegrationsView: React.FC = () => {
  const { lang } = useI18n();
  const isBn = lang === 'bn';
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'configs' | 'logs'>('configs');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Configurations state
  const [configs, setConfigs] = useState<IntegrationConfigDto[]>([]);
  const [selectedConfigForTest, setSelectedConfigForTest] = useState<IntegrationConfigDto | null>(null);
  const [selectedConfigForEdit, setSelectedConfigForEdit] = useState<IntegrationConfigDto | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Test modal state
  const [testRecipient, setTestRecipient] = useState('');
  const [testSampleMessage, setTestSampleMessage] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestIntegrationResultDto | null>(null);

  // Logs state
  const [logs, setLogs] = useState<IntegrationLogDto[]>([]);
  const [logFilterType, setLogFilterType] = useState<IntegrationType | 'all'>('all');
  const [selectedLogForDetail, setSelectedLogForDetail] = useState<IntegrationLogDto | null>(null);

  // Edit/Add Config Form State
  const [formType, setFormType] = useState<IntegrationType>('email_smtp');
  const [formName, setFormName] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(true);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formCredential, setFormCredential] = useState('');

  // SMTP fields
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpEncryption, setSmtpEncryption] = useState<'none' | 'ssl' | 'tls'>('tls');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpSenderEmail, setSmtpSenderEmail] = useState('');
  const [smtpSenderName, setSmtpSenderName] = useState('');

  // SMS fields
  const [smsProvider, setSmsProvider] = useState<'elitbuzz' | 'generic' | 'mock'>('elitbuzz');
  const [smsApiUrl, setSmsApiUrl] = useState('https://msg.elitbuzz-bd.com/smsapi');
  const [smsAuthMethod, setSmsAuthMethod] = useState<'query_param' | 'header_bearer' | 'header_api_key' | 'basic_auth'>('query_param');
  const [smsSenderId, setSmsSenderId] = useState('SUOXI AESTH');
  const [smsRateLimit, setSmsRateLimit] = useState(120);
  const [smsMaxRetries, setSmsMaxRetries] = useState(3);
  const [smsRetryBackoff, setSmsRetryBackoff] = useState(15);

  const [savingConfig, setSavingConfig] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [cList, lList] = await Promise.all([
        integrationsApi.getConfigs(),
        integrationsApi.getLogs(logFilterType === 'all' ? undefined : logFilterType),
      ]);
      setConfigs(cList);
      setLogs(lList);
    } catch (err: any) {
      console.error('Failed to load integrations:', err);
      setError(err.message || 'Failed to load integration configurations');
    } finally {
      setLoading(false);
    }
  }, [logFilterType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenEdit = (cfg: IntegrationConfigDto) => {
    setSelectedConfigForEdit(cfg);
    setFormType(cfg.integration_type);
    setFormName(cfg.name);
    setFormIsDefault(cfg.is_default);
    setFormIsActive(cfg.is_active);
    setFormCredential(''); // never populate secret (Rule 10)
    setFormError(null);

    if (cfg.integration_type === 'email_smtp') {
      const smtp = cfg.config as SmtpConfig;
      setSmtpHost(smtp.host);
      setSmtpPort(smtp.port);
      setSmtpEncryption(smtp.encryption);
      setSmtpUsername(smtp.username);
      setSmtpSenderEmail(smtp.sender_email);
      setSmtpSenderName(smtp.sender_name);
    } else {
      const sms = cfg.config as SmsGatewayConfig;
      setSmsProvider(sms.provider);
      setSmsApiUrl(sms.api_url);
      setSmsAuthMethod(sms.auth_method);
      setSmsSenderId(sms.sender_id);
      setSmsRateLimit(sms.rate_limit_per_minute);
      setSmsMaxRetries(sms.max_retries);
      setSmsRetryBackoff(sms.retry_backoff_sec);
    }
  };

  const handleOpenAdd = () => {
    setSelectedConfigForEdit(null);
    setFormType('sms_gateway');
    setFormName('Elitbuzz SMS Secondary');
    setFormIsDefault(false);
    setFormIsActive(true);
    setFormCredential('');
    setFormError(null);

    setSmsProvider('elitbuzz');
    setSmsApiUrl('https://msg.elitbuzz-bd.com/smsapi');
    setSmsAuthMethod('query_param');
    setSmsSenderId('SUOXI AESTH');
    setSmsRateLimit(120);
    setSmsMaxRetries(3);
    setSmsRetryBackoff(15);

    setIsAddModalOpen(true);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setFormError(null);

    try {
      let configPayload: SmtpConfig | SmsGatewayConfig;

      if (formType === 'email_smtp') {
        configPayload = {
          host: smtpHost.trim(),
          port: Number(smtpPort),
          encryption: smtpEncryption,
          username: smtpUsername.trim(),
          sender_email: smtpSenderEmail.trim(),
          sender_name: smtpSenderName.trim(),
        };
      } else {
        configPayload = {
          provider: smsProvider,
          api_url: smsApiUrl.trim(),
          auth_method: smsAuthMethod,
          sender_id: smsSenderId.trim(),
          rate_limit_per_minute: Number(smsRateLimit),
          max_retries: Number(smsMaxRetries),
          retry_backoff_sec: Number(smsRetryBackoff),
        };
      }

      const payload: SaveIntegrationConfigRequest = {
        integration_type: formType,
        name: formName.trim(),
        is_default: formIsDefault,
        is_active: formIsActive,
        config: configPayload,
        credential: formCredential.trim() ? formCredential.trim() : undefined,
      };

      if (selectedConfigForEdit) {
        await integrationsApi.updateConfig(selectedConfigForEdit.id, payload);
      } else {
        await integrationsApi.createConfig(payload);
      }

      setSelectedConfigForEdit(null);
      setIsAddModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Failed to save configuration:', err);
      setFormError(err.message || 'Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleOpenTest = (cfg: IntegrationConfigDto) => {
    setSelectedConfigForTest(cfg);
    setTestRecipient(cfg.integration_type === 'email_smtp' ? 'admin@suoxi.com.bd' : '+8801711223344');
    setTestSampleMessage(
      cfg.integration_type === 'email_smtp'
        ? 'Verification test from SUOXI Skin Care & Aesthetic Center.'
        : 'SUOXI: Verification test SMS. Your system is configured correctly.'
    );
    setTestResult(null);
  };

  const handleExecuteTest = async () => {
    if (!selectedConfigForTest) return;
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await integrationsApi.testConfig(selectedConfigForTest.id, {
        recipient: testRecipient.trim(),
        sample_message: testSampleMessage.trim(),
      });
      setTestResult(res);
      await loadData();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Test Failed',
        error: err.message || 'Unknown network error',
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {isBn ? 'ইন্টিগ্রেশন ও গেটওয়ে কনফিগারেশন' : 'Integrations & External Gateways'}
            </h1>
            <p className="text-sm text-slate-500">
              {isBn
                ? 'এসএমএস গেটওয়ে (Elitbuzz), ভিপিএস এসএমটিপি ও সিকিউর ক্রেডেনশিয়ালস (AES-256-GCM)'
                : 'SMS Gateway (Elitbuzz), VPS SMTP & AES-256-GCM authenticated credential vault'}
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
            {isBn ? 'নতুন গেটওয়ে যোগ' : 'Add Integration'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2">
        <button
          onClick={() => setActiveTab('configs')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'configs'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          {isBn ? 'কনফিগারেশন সমূহ' : 'Configurations'}
          <span className="ml-1.5 px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full font-medium">
            {configs.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'logs'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          {isBn ? 'ডেলিভারি ও অডিট লগ' : 'Delivery & Audit Logs'}
          <span className="ml-1.5 px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-full font-medium">
            {logs.length}
          </span>
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-red-800 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData()}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 rounded font-medium text-xs text-red-900"
          >
            {isBn ? 'পুনরায় চেষ্টা' : 'Retry'}
          </button>
        </div>
      )}

      {/* TAB 1: CONFIGURATIONS */}
      {activeTab === 'configs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading && configs.length === 0 ? (
            <div className="col-span-2 p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-brand-primary" />
              <span>{isBn ? 'কনফিগারেশন লোড হচ্ছে...' : 'Loading integration configurations...'}</span>
            </div>
          ) : configs.length === 0 ? (
            <div className="col-span-2 p-12 text-center bg-white rounded-2xl border border-slate-200">
              <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-700">
                {isBn ? 'কোন গেটওয়ে কনফিগার করা নেই' : 'No Integrations Configured'}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {isBn
                  ? 'উপরে "নতুন গেটওয়ে যোগ" বাটনে ক্লিক করে এসএমএস বা এসএমটিপি সেটআপ করুন।'
                  : 'Click "Add Integration" above to configure your SMS Gateway or SMTP provider.'}
              </p>
            </div>
          ) : (
            configs.map((cfg) => {
              const isSmtp = cfg.integration_type === 'email_smtp';
              const smtp = isSmtp ? (cfg.config as SmtpConfig) : null;
              const sms = !isSmtp ? (cfg.config as SmsGatewayConfig) : null;

              return (
                <div
                  key={cfg.id}
                  className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-3 rounded-xl ${
                            isSmtp ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {isSmtp ? <Mail className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800 text-base">{cfg.name}</h3>
                            {cfg.is_default && (
                              <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                                {isBn ? 'ডিফল্ট' : 'Default'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {isSmtp
                              ? isBn
                                ? 'ইমেইল ট্রানজাকশনাল (SMTP)'
                                : 'Transactional Email (VPS SMTP)'
                              : isBn
                              ? `এসএমএস গেটওয়ে (${sms?.provider})`
                              : `SMS Gateway (${sms?.provider})`}
                          </p>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        {cfg.last_test_status === 'passed' ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isBn ? 'যাচাইকৃত (সফল)' : 'Verified'}
                          </span>
                        ) : cfg.last_test_status === 'failed' ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                            <XCircle className="w-3.5 h-3.5" />
                            {isBn ? 'ব্যর্থ' : 'Failed'}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            <HelpCircle className="w-3.5 h-3.5" />
                            {isBn ? 'পরীক্ষা করা হয়নি' : 'Never Tested'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Parameters details */}
                    <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs border border-slate-100 mb-4">
                      {isSmtp && smtp && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isBn ? 'সার্ভার হোস্ট' : 'Host / Port'}:</span>
                            <span className="font-mono font-medium text-slate-800">
                              {smtp.host}:{smtp.port} ({smtp.encryption.toUpperCase()})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isBn ? 'প্রেরক ইমেইল' : 'Sender Email'}:</span>
                            <span className="font-mono font-medium text-slate-800">{smtp.sender_email}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isBn ? 'ব্যবহারকারীর নাম' : 'Username'}:</span>
                            <span className="font-mono font-medium text-slate-800">{smtp.username}</span>
                          </div>
                        </>
                      )}

                      {!isSmtp && sms && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isBn ? 'এপিআই ইউআরএল' : 'API Endpoint'}:</span>
                            <span className="font-mono font-medium text-slate-800 truncate max-w-[220px]" title={sms.api_url}>
                              {sms.api_url}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isBn ? 'প্রেরক আইডি' : 'Sender Mask / ID'}:</span>
                            <span className="font-bold text-slate-800">{sms.sender_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isBn ? 'অথেনটিকেশন' : 'Auth Method'}:</span>
                            <span className="font-medium text-slate-800">{sms.auth_method}</span>
                          </div>
                        </>
                      )}

                      {/* Credential Masking Display (Rule 10) */}
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-slate-400" />
                          {isBn ? 'সিকিউর ক্রেডেনশিয়াল' : 'Auth Secret'}:
                        </span>
                        <span className="font-mono font-semibold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded text-[11px]">
                          {cfg.has_credential ? '•••••••• (AES-256-GCM)' : 'Not set'}
                        </span>
                      </div>
                    </div>

                    {/* Failure details if any */}
                    {cfg.last_test_error && (
                      <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold">{isBn ? 'সর্বশেষ পরীক্ষার ত্রুটি:' : 'Last Test Error:'}</p>
                          <p className="font-mono text-[11px] mt-0.5">{cfg.last_test_error}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => handleOpenTest(cfg)}
                      className="px-3 py-1.5 text-xs font-semibold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {isBn ? 'সংযোগ পরীক্ষা করুন' : 'Test Connection'}
                    </button>
                    <button
                      onClick={() => handleOpenEdit(cfg)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      {isBn ? 'সম্পাদনা' : 'Configure'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: DELIVERY & AUDIT LOGS */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">
                {isBn ? 'গেটওয়ে ফিল্টার:' : 'Filter Type:'}
              </span>
              <select
                value={logFilterType}
                onChange={(e) => setLogFilterType(e.target.value as any)}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
              >
                <option value="all">{isBn ? 'সকল গেটওয়ে (All)' : 'All Channels'}</option>
                <option value="sms_gateway">SMS Gateway</option>
                <option value="email_smtp">Email SMTP</option>
              </select>
            </div>

            <div className="text-xs text-slate-500">
              {isBn
                ? `মোট ${logs.length} টি ডেলিভারি ও যাচাইকরণ রেকর্ড`
                : `Showing ${logs.length} delivery & verification records`}
            </div>
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4">{isBn ? 'সময়' : 'Timestamp'}</th>
                  <th className="py-3 px-4">{isBn ? 'টাইপ' : 'Channel'}</th>
                  <th className="py-3 px-4">{isBn ? 'প্রাপক (মাস্কড)' : 'Recipient (Masked)'}</th>
                  <th className="py-3 px-4">{isBn ? 'স্ট্যাটাস' : 'Status'}</th>
                  <th className="py-3 px-4">{isBn ? 'গেটওয়ে রেফারেন্স' : 'Provider Msg ID'}</th>
                  <th className="py-3 px-4 text-right">{isBn ? 'অ্যাকশন' : 'Details'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      {isBn ? 'কোন ডেলিভারি রেকর্ড নেই' : 'No integration activity logs recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString('en-GB')}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            l.integration_type === 'email_smtp'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {l.integration_type === 'email_smtp' ? 'SMTP Email' : 'SMS Gateway'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">{l.recipient}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {l.status === 'success' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {l.http_status ? `HTTP ${l.http_status}` : 'Delivered'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                            <XCircle className="w-3.5 h-3.5" />
                            {l.http_status ? `HTTP ${l.http_status}` : 'Failed'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 truncate max-w-[160px]">
                        {l.provider_message_id || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedLogForDetail(l)}
                          className="px-2 py-1 text-slate-600 hover:text-brand-primary hover:bg-slate-100 rounded transition-colors inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isBn ? 'পেলোড' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: TEST INTEGRATION MODAL */}
      {selectedConfigForTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-brand-primary" />
                <h3 className="font-bold text-slate-800 text-base">
                  {isBn ? 'সংযোগ ও ডেলিভারি পরীক্ষা' : 'Test Integration Dispatch'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedConfigForTest(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-600">
                {isBn
                  ? `আপনি ${selectedConfigForTest.name} এর মাধ্যমে একটি পরীক্ষামূলক বার্তা পাঠাচ্ছেন।`
                  : `Dispatching a test verification message via ${selectedConfigForTest.name}.`}
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {selectedConfigForTest.integration_type === 'email_smtp'
                    ? isBn
                      ? 'প্রাপক ইমেইল ঠিকানা'
                      : 'Recipient Email'
                    : isBn
                    ? 'প্রাপক মোবাইল নম্বর (বাংলাদেশ)'
                    : 'Recipient Phone (+8801...)'}
                </label>
                <input
                  type="text"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder={
                    selectedConfigForTest.integration_type === 'email_smtp'
                      ? 'e.g. admin@suoxi.com.bd'
                      : '+88017XXXXXXXX'
                  }
                  className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isBn ? 'পরীক্ষামূলক মেসেজ' : 'Sample Payload Message'}
                </label>
                <textarea
                  rows={3}
                  value={testSampleMessage}
                  onChange={(e) => setTestSampleMessage(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs border ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.provider_message_id && (
                    <p className="font-mono text-[11px] text-emerald-700">
                      ID: {testResult.provider_message_id}
                    </p>
                  )}
                  {testResult.error && (
                    <p className="font-mono text-[11px] text-red-700 mt-1">{testResult.error}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 mt-5">
              <button
                type="button"
                onClick={() => setSelectedConfigForTest(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {isBn ? 'বাতিল' : 'Close'}
              </button>
              <button
                type="button"
                onClick={handleExecuteTest}
                disabled={testLoading || !testRecipient.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {testLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {isBn ? 'পাঠানো হচ্ছে...' : 'Testing...'}
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    {isBn ? 'মেসেজ পাঠান' : 'Dispatch Test'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT/ADD CONFIGURATION MODAL */}
      {(selectedConfigForEdit || isAddModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveConfig}
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200 my-8 animate-scale-in"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-brand-primary" />
                <h3 className="font-bold text-slate-800 text-base">
                  {selectedConfigForEdit
                    ? isBn
                      ? 'কনফিগারেশন সম্পাদনা'
                      : `Edit ${selectedConfigForEdit.name}`
                    : isBn
                    ? 'নতুন গেটওয়ে কনফিগারেশন'
                    : 'Add New Integration'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedConfigForEdit(null);
                  setIsAddModalOpen(false);
                }}
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

            <div className="space-y-4 text-xs">
              {/* Type and Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isBn ? 'গেটওয়ে ধরন' : 'Integration Type'}
                  </label>
                  <select
                    value={formType}
                    disabled={!!selectedConfigForEdit}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800 disabled:bg-slate-100"
                  >
                    <option value="sms_gateway">SMS Gateway (Elitbuzz/HTTP)</option>
                    <option value="email_smtp">Email SMTP (VPS/Hosting)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isBn ? 'কনফিগারেশনের নাম' : 'Config Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800"
                  />
                </div>
              </div>

              {/* SMTP Specific Fields */}
              {formType === 'email_smtp' && (
                <div className="space-y-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                  <h4 className="font-bold text-blue-900">{isBn ? 'এসএমটিপি সার্ভার তথ্য' : 'SMTP Server Settings'}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Host (e.g. mail.suoxi.com.bd)</label>
                      <input
                        type="text"
                        required
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Port (e.g. 587)</label>
                      <input
                        type="number"
                        required
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Encryption</label>
                      <select
                        value={smtpEncryption}
                        onChange={(e) => setSmtpEncryption(e.target.value as any)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                      >
                        <option value="tls">STARTTLS / TLS (Port 587)</option>
                        <option value="ssl">SSL (Port 465)</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">SMTP Username</label>
                      <input
                        type="text"
                        required
                        value={smtpUsername}
                        onChange={(e) => setSmtpUsername(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Sender Email</label>
                      <input
                        type="email"
                        required
                        value={smtpSenderEmail}
                        onChange={(e) => setSmtpSenderEmail(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Sender Name</label>
                      <input
                        type="text"
                        required
                        value={smtpSenderName}
                        onChange={(e) => setSmtpSenderName(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SMS Specific Fields */}
              {formType === 'sms_gateway' && (
                <div className="space-y-3 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                  <h4 className="font-bold text-emerald-900">
                    {isBn ? 'এসএমএস গেটওয়ে তথ্য (SSRF সুরক্ষিত)' : 'SMS Gateway Parameters (SSRF Hardened)'}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Provider Preset</label>
                      <select
                        value={smsProvider}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          setSmsProvider(val);
                          if (val === 'elitbuzz') {
                            setSmsApiUrl('https://msg.elitbuzz-bd.com/smsapi');
                            setSmsAuthMethod('query_param');
                          }
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                      >
                        <option value="elitbuzz">Elitbuzz Bangladesh</option>
                        <option value="generic">Generic HTTPS Adapter</option>
                        <option value="mock">Local Mock (Testing)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Sender ID / Mask</label>
                      <input
                        type="text"
                        required
                        value={smsSenderId}
                        onChange={(e) => setSmsSenderId(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      API URL (HTTPS required; RFC 1918 / Loopback blocked)
                    </label>
                    <input
                      type="url"
                      required
                      value={smsApiUrl}
                      onChange={(e) => setSmsApiUrl(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Auth Method</label>
                      <select
                        value={smsAuthMethod}
                        onChange={(e) => setSmsAuthMethod(e.target.value as any)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-[11px]"
                      >
                        <option value="query_param">query_param (Elitbuzz)</option>
                        <option value="header_bearer">Bearer Token</option>
                        <option value="header_api_key">X-API-Key</option>
                        <option value="basic_auth">Basic Auth</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Rate Limit / Min</label>
                      <input
                        type="number"
                        value={smsRateLimit}
                        onChange={(e) => setSmsRateLimit(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Max Retries</label>
                      <input
                        type="number"
                        value={smsMaxRetries}
                        onChange={(e) => setSmsMaxRetries(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Credentials / Secret Field (Rule 10 & AES-256-GCM) */}
              <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200">
                <label className="block font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-amber-700" />
                  {isBn ? 'সিক্রেট কি বা পাসওয়ার্ড' : 'Auth Secret / Password / API Key'}
                </label>
                <p className="text-[11px] text-amber-800 mb-2">
                  {selectedConfigForEdit && selectedConfigForEdit.has_credential
                    ? isBn
                      ? 'বর্তমান পাসওয়ার্ড এনক্রিপ্ট অবস্থায় আছে। অপরিবর্তিত রাখতে এটি ফাঁকা রাখুন।'
                      : 'Credentials currently stored encrypted. Leave blank to keep existing secret unchanged.'
                    : isBn
                    ? 'এটি ডাটাবেজে AES-256-GCM দ্বারা এনক্রিপ্ট হবে এবং কখনো ডিসপ্লেতে দেখানো হবে না।'
                    : 'Encrypted via AES-256-GCM before DB write. Never shown in plain text.'}
                </p>
                <input
                  type="password"
                  placeholder={
                    selectedConfigForEdit && selectedConfigForEdit.has_credential
                      ? '•••••••• (Encrypted, leave blank to keep)'
                      : 'Enter API Key or SMTP Password'
                  }
                  value={formCredential}
                  onChange={(e) => setFormCredential(e.target.value)}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 font-mono text-slate-800 bg-white"
                />
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsDefault}
                    onChange={(e) => setFormIsDefault(e.target.checked)}
                    className="rounded text-brand-primary focus:ring-brand-primary"
                  />
                  <span className="font-semibold text-slate-700">
                    {isBn ? 'এই টাইপের জন্য সক্রিয় ডিফল্ট বানান' : 'Set as active default for this type'}
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded text-brand-primary focus:ring-brand-primary"
                  />
                  <span className="font-semibold text-slate-700">{isBn ? 'সক্রিয়' : 'Is Active'}</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 mt-6">
              <button
                type="button"
                onClick={() => {
                  setSelectedConfigForEdit(null);
                  setIsAddModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={savingConfig}
                className="px-4 py-2 text-xs font-semibold text-white bg-brand-primary hover:bg-brand-primary/90 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingConfig ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {isBn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {isBn ? 'সংরক্ষণ করুন' : 'Save Configuration'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: LOG DETAIL MODAL */}
      {selectedLogForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-brand-primary" />
                <h3 className="font-bold text-slate-800 text-base">
                  {isBn ? 'ডেলিভারি অডিট বিস্তারিত' : 'Integration Log Payload Details'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLogForDetail(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400">Log ID:</span>
                  <p className="font-mono font-medium text-slate-700">{selectedLogForDetail.id}</p>
                </div>
                <div>
                  <span className="text-slate-400">Correlation ID:</span>
                  <p className="font-mono font-medium text-slate-700">{selectedLogForDetail.correlation_id}</p>
                </div>
                <div>
                  <span className="text-slate-400">Recipient:</span>
                  <p className="font-mono font-medium text-slate-700">{selectedLogForDetail.recipient}</p>
                </div>
                <div>
                  <span className="text-slate-400">Status:</span>
                  <p className="font-bold text-slate-800 uppercase">{selectedLogForDetail.status}</p>
                </div>
              </div>

              {selectedLogForDetail.request_redacted && (
                <div>
                  <h4 className="font-bold text-slate-700 mb-1">{isBn ? 'অনুরোধ পেলোড (মাস্কড)' : 'Redacted Request'}:</h4>
                  <pre className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLogForDetail.request_redacted, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLogForDetail.response_redacted && (
                <div>
                  <h4 className="font-bold text-slate-700 mb-1">{isBn ? 'গেটওয়ে রেসপন্স' : 'Gateway Response'}:</h4>
                  <pre className="bg-slate-900 text-sky-400 p-3 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLogForDetail.response_redacted, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLogForDetail.error_text && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200">
                  <span className="font-bold block mb-0.5">Error details:</span>
                  <p className="font-mono text-[11px]">{selectedLogForDetail.error_text}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200 mt-4">
              <button
                onClick={() => setSelectedLogForDetail(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {isBn ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
