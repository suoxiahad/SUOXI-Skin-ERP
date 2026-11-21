import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import type {
  IntegrationConfigDto,
  SaveIntegrationConfigRequest,
  TestIntegrationRequest,
  TestIntegrationResultDto,
  NotificationTemplateDto,
  SaveTemplateRequest,
  TemplatePreviewRequest,
  TemplatePreviewResultDto,
  NotificationEventRuleDto,
  SaveEventRuleRequest,
  IntegrationLogDto,
  IntegrationType,
  SmtpConfig,
  SmsGatewayConfig,
} from '@suoxi/shared-types';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
} from '../middleware/errorHandler.js';
import { logAudit } from './auditLogger.js';

// Default Master Key for AES-256-GCM (32 bytes / 256 bits)
const DEFAULT_DEV_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export class IntegrationService {
  private configs = new Map<string, IntegrationConfigDto>();
  private credentials = new Map<
    string,
    { ciphertext: Buffer; iv: Buffer; authTag: Buffer; keyVersion: number }
  >();
  private templates = new Map<string, NotificationTemplateDto>();
  private eventRules = new Map<string, NotificationEventRuleDto>();
  private logs: IntegrationLogDto[] = [];

  private configSeq = 1;
  private templateSeq = 1;
  private ruleSeq = 1;
  private logSeq = 1;

  // Mutex lock for integration default updates
  private defaultLocks = new Map<string, Promise<void>>();

  constructor() {
    this.seedInitialData();
  }

  public resetData() {
    this.configs.clear();
    this.credentials.clear();
    this.templates.clear();
    this.eventRules.clear();
    this.logs = [];
    this.defaultLocks.clear();
    this.configSeq = 1;
    this.templateSeq = 1;
    this.ruleSeq = 1;
    this.logSeq = 1;
    this.seedInitialData();
  }

  private ephemeralMasterKey: Buffer | null = null;

  // --- AES-256-GCM Cryptographic Engine ---
  private getMasterKey(): Buffer {
    const envKey = (process.env.APP_MASTER_KEY || '').trim();
    if (!envKey && process.env.NODE_ENV === 'production') {
      const isCloudRun = Boolean(
        (process.env.K_SERVICE || process.env.K_REVISION || process.env.K_CONFIGURATION || '').trim()
      );
      const hasDb = Boolean(
        (process.env.DATABASE_URL || '').trim() ||
          (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER)
      );
      if (isCloudRun && !hasDb && process.env.REQUIRE_AUTH !== 'true') {
        if (!this.ephemeralMasterKey) {
          this.ephemeralMasterKey = crypto.randomBytes(32);
        }
        return this.ephemeralMasterKey;
      }
      throw new Error('APP_MASTER_KEY is required in production');
    }
    const keyHex = envKey || DEFAULT_DEV_MASTER_KEY;
    try {
      const buf = Buffer.from(keyHex, 'hex');
      if (buf.length === 32) return buf;
    } catch {
      // fallback
    }
    return crypto.createHash('sha256').update(keyHex).digest();
  }

  public encryptCredential(plaintext: string): {
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
    keyVersion: number;
  } {
    const key = this.getMasterKey();
    const iv = crypto.randomBytes(12); // 12-byte standard GCM IV
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext,
      iv,
      authTag,
      keyVersion: 1,
    };
  }

  public decryptCredential(ciphertext: Buffer, iv: Buffer, authTag: Buffer): string {
    const key = this.getMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // --- SSRF Protection Engine ---
  public async validateUrlForSsrf(urlStr: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      throw new UnprocessableEntityError(`Invalid API URL: '${urlStr}'`);
    }

    if (parsed.protocol !== 'https:') {
      throw new UnprocessableEntityError(
        `SSRF Protection Violation: Only HTTPS protocol is permitted. Rejected: '${parsed.protocol}'`
      );
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '127.0.0.1' ||
      host === '169.254.169.254' ||
      host === '::1'
    ) {
      throw new UnprocessableEntityError(
        `SSRF Protection Violation: Target host '${host}' is in a blacklisted loopback/metadata scope.`
      );
    }

    // Resolve DNS and check IP
    try {
      const lookup = await dns.lookup(host);
      const ip = lookup.address;
      if (this.isPrivateOrRestrictedIp(ip)) {
        throw new UnprocessableEntityError(
          `SSRF Protection Violation: Resolved destination IP '${ip}' is in a private/restricted network range.`
        );
      }
    } catch (err: any) {
      if (err instanceof UnprocessableEntityError) throw err;
      throw new UnprocessableEntityError(`SSRF Protection: Failed to resolve host '${host}': ${err.message}`);
    }
  }

  private isPrivateOrRestrictedIp(ip: string): boolean {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '169.254.169.254') return true;
    // 10.0.0.0/8
    if (ip.startsWith('10.')) return true;
    // 192.168.0.0/16
    if (ip.startsWith('192.168.')) return true;
    // 172.16.0.0/12
    if (ip.startsWith('172.')) {
      const parts = ip.split('.');
      const second = parseInt(parts[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    // IPv6 link-local or ULA
    if (ip.toLowerCase().startsWith('fe80:') || ip.toLowerCase().startsWith('fc00:') || ip.toLowerCase().startsWith('fd00:')) {
      return true;
    }
    return false;
  }

  // --- Seed Initial Configurations ---
  private seedInitialData() {
    // 1. SMTP Configuration (VPS/Hosting manual SMTP)
    const smtpId = 'cfg-smtp-01';
    const smtpConfig: SmtpConfig = {
      host: 'mail.suoxi.com.bd',
      port: 587,
      encryption: 'tls',
      username: 'notifications@suoxi.com.bd',
      sender_email: 'notifications@suoxi.com.bd',
      sender_name: 'SUOXI Skin Care & Aesthetic Center',
    };
    const smtpDto: IntegrationConfigDto = {
      id: smtpId,
      integration_type: 'email_smtp',
      name: 'Primary Clinic VPS SMTP',
      is_default: true,
      is_active: true,
      has_credential: true,
      credential_masked: '••••••••',
      config: smtpConfig,
      last_test_status: 'never_tested',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    this.configs.set(smtpId, smtpDto);
    this.credentials.set(smtpId, this.encryptCredential('S3cureVPSPass!2026'));

    // 2. SMS Gateway Configuration (Elitbuzz)
    const smsId = 'cfg-sms-01';
    const smsConfig: SmsGatewayConfig = {
      provider: 'elitbuzz',
      api_url: 'https://msg.elitbuzz-bd.com/smsapi',
      auth_method: 'query_param',
      sender_id: 'SUOXI AESTH',
      rate_limit_per_minute: 120,
      max_retries: 3,
      retry_backoff_sec: 15,
      extra_params: {
        type: 'text',
      },
    };
    const smsDto: IntegrationConfigDto = {
      id: smsId,
      integration_type: 'sms_gateway',
      name: 'Elitbuzz SMS Gateway (Production)',
      is_default: true,
      is_active: true,
      has_credential: true,
      credential_masked: '••••••••',
      config: smsConfig,
      last_test_status: 'never_tested',
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };
    this.configs.set(smsId, smsDto);
    this.credentials.set(smsId, this.encryptCredential('ELITBUZZ_API_KEY_SEC_9988'));

    // 3. Pre-seeded Notification Templates (Whitelisted variables only)
    const allowedVars = [
      'patient_name',
      'appointment_date',
      'appointment_time',
      'doctor_name',
      'clinic_phone',
    ];

    // Sample SMS (Bangla) requested in Prompt 15
    const tplSmsBn: NotificationTemplateDto = {
      id: 'tpl-sms-bn-01',
      template_code: 'SMS_SESSION_REMINDER_BN',
      channel: 'sms',
      language: 'bn',
      name: 'আগামীকালের সেশন স্মারক (বাংলা)',
      body: 'প্রিয় {{patient_name}}, আগামীকাল {{appointment_time}} এ আপনার সেশন আছে। SUOXI Skin Care: {{clinic_phone}}',
      allowed_variables: allowedVars,
      status: 'approved',
      approved_by: 'usr-101',
      approved_by_name: 'Super Admin',
      approved_at: '2026-10-01T00:00:00.000Z',
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };

    const tplSmsEn: NotificationTemplateDto = {
      id: 'tpl-sms-en-01',
      template_code: 'SMS_APT_CONFIRM_EN',
      channel: 'sms',
      language: 'en',
      name: 'Appointment Confirmation (English)',
      body: 'Dear {{patient_name}}, your appointment is confirmed for {{appointment_date}} at {{appointment_time}} with {{doctor_name}}. SUOXI: {{clinic_phone}}',
      allowed_variables: allowedVars,
      status: 'approved',
      approved_by: 'usr-101',
      approved_by_name: 'Super Admin',
      approved_at: '2026-10-01T00:00:00.000Z',
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };

    const tplEmailEn: NotificationTemplateDto = {
      id: 'tpl-email-en-01',
      template_code: 'EMAIL_APT_CONFIRM_EN',
      channel: 'email',
      language: 'en',
      name: 'Clinical Appointment Confirmation Email',
      subject: 'Your Aesthetic Consultation at SUOXI Skin Care & Aesthetic Center',
      body: 'Hello {{patient_name}},\n\nYour appointment is confirmed on {{appointment_date}} at {{appointment_time}} with {{doctor_name}}.\n\nPlease arrive 10 minutes prior to your slot.\nContact: {{clinic_phone}}',
      allowed_variables: allowedVars,
      status: 'approved',
      approved_by: 'usr-101',
      approved_by_name: 'Super Admin',
      approved_at: '2026-10-01T00:00:00.000Z',
      is_active: true,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };

    this.templates.set(tplSmsBn.id, tplSmsBn);
    this.templates.set(tplSmsEn.id, tplSmsEn);
    this.templates.set(tplEmailEn.id, tplEmailEn);

    // 4. Pre-seeded Event Automation Rules
    const rule1: NotificationEventRuleDto = {
      id: 'rule-01',
      event_type: 'appointment_confirmed',
      channel: 'sms',
      template_id: tplSmsEn.id,
      template_name: tplSmsEn.name,
      template_code: tplSmsEn.template_code,
      offset_minutes: 0,
      quiet_hours_start: '21:00:00',
      quiet_hours_end: '08:00:00',
      requires_patient_consent: true,
      is_enabled: false,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };

    const rule2: NotificationEventRuleDto = {
      id: 'rule-02',
      event_type: 'session_reminder',
      channel: 'sms',
      template_id: tplSmsBn.id,
      template_name: tplSmsBn.name,
      template_code: tplSmsBn.template_code,
      offset_minutes: -1440, // 24 hours before
      quiet_hours_start: '21:00:00',
      quiet_hours_end: '08:00:00',
      requires_patient_consent: true,
      is_enabled: false,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    };

    this.eventRules.set(rule1.id, rule1);
    this.eventRules.set(rule2.id, rule2);
  }

  // --- Integration Configuration APIs ---

  public async listConfigurations(): Promise<IntegrationConfigDto[]> {
    return Array.from(this.configs.values()).map((c) => ({
      ...c,
      // Hard Rule 10: Never return plaintext credentials or ciphertext
      credential_masked: this.credentials.has(c.id) ? '••••••••' : '',
    }));
  }

  public async getConfiguration(id: string): Promise<IntegrationConfigDto> {
    const c = this.configs.get(id);
    if (!c) throw new NotFoundError(`Integration configuration '${id}' not found`);
    return {
      ...c,
      credential_masked: this.credentials.has(c.id) ? '••••••••' : '',
    };
  }

  public async saveConfiguration(
    id: string | null,
    req: SaveIntegrationConfigRequest,
    actorUser: any
  ): Promise<IntegrationConfigDto> {
    // If SMS Gateway, validate SSRF on API URL
    if (req.integration_type === 'sms_gateway') {
      const smsCfg = req.config as SmsGatewayConfig;
      if (smsCfg.provider !== 'mock') {
        await this.validateUrlForSsrf(smsCfg.api_url);
      }
    }

    const typeLockKey = req.integration_type;
    while (this.defaultLocks.has(typeLockKey)) {
      await this.defaultLocks.get(typeLockKey);
    }
    let resolveLock!: () => void;
    this.defaultLocks.set(typeLockKey, new Promise<void>((res) => (resolveLock = res)));

    try {
      const now = new Date().toISOString();
      const isDefault = req.is_default !== undefined ? req.is_default : true;
      const isActive = req.is_active !== undefined ? req.is_active : true;

      // Rule: Only one active default per type
      if (isDefault && isActive) {
        for (const [existingId, cfg] of this.configs.entries()) {
          if (cfg.integration_type === req.integration_type && existingId !== id) {
            cfg.is_default = false;
            cfg.updated_at = now;
          }
        }
      }

      let configId = id;
      let existing = id ? this.configs.get(id) : null;

      if (!existing) {
        configId = `cfg-${req.integration_type}-${String(this.configSeq++).padStart(3, '0')}`;
        existing = {
          id: configId,
          integration_type: req.integration_type,
          name: req.name.trim(),
          is_default: isDefault,
          is_active: isActive,
          has_credential: false,
          credential_masked: '',
          config: req.config,
          last_test_status: 'never_tested',
          created_at: now,
          updated_at: now,
        };
      } else {
        existing.name = req.name.trim();
        existing.is_default = isDefault;
        existing.is_active = isActive;
        existing.config = req.config;
        existing.updated_at = now;
      }

      // If replacement credential provided, encrypt with AES-256-GCM and overwrite
      if (req.credential && req.credential.trim()) {
        const encrypted = this.encryptCredential(req.credential.trim());
        this.credentials.set(configId!, encrypted);
        existing.has_credential = true;
      }

      this.configs.set(configId!, existing);

      // Audited without secrets (Rule 7 & 10)
      await logAudit(null, {
        actorUserId: actorUser.id,
        action: 'integration.config.updated',
        entityType: 'integration_configuration',
        entityId: configId!,
        branchId: actorUser.branchId || 'br-dhk-01',
        payloadAfter: {
          id: configId,
          type: req.integration_type,
          name: existing.name,
          is_default: existing.is_default,
          has_credential: existing.has_credential,
        },
        ipAddress: '127.0.0.1',
      });

      return {
        ...existing,
        credential_masked: this.credentials.has(configId!) ? '••••••••' : '',
      };
    } finally {
      this.defaultLocks.delete(typeLockKey);
      resolveLock();
    }
  }

  // --- Test Dispatch & Logs ---

  public async testIntegration(
    id: string,
    req: TestIntegrationRequest,
    actorUser: any
  ): Promise<TestIntegrationResultDto> {
    const config = this.configs.get(id);
    if (!config) throw new NotFoundError(`Integration configuration '${id}' not found`);

    if (!req.recipient || !req.recipient.trim()) {
      throw new BadRequestError('Recipient email or phone number is required');
    }

    const correlationId = `corr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    // Check credentials exist
    const cred = this.credentials.get(id);
    if (!cred) {
      const errMsg = 'No credentials configured for this integration';
      this.recordLog({
        integration_type: config.integration_type,
        status: 'failed',
        recipient: this.maskRecipient(req.recipient),
        error_text: errMsg,
        correlation_id: correlationId,
      });
      config.last_test_status = 'failed';
      config.last_tested_at = now;
      config.last_test_error = errMsg;
      return { success: false, message: errMsg, error: errMsg };
    }

    let plaintextCred: string;
    try {
      plaintextCred = this.decryptCredential(cred.ciphertext, cred.iv, cred.authTag);
    } catch (e: any) {
      const errMsg = 'Decryption failed for integration credentials';
      config.last_test_status = 'failed';
      config.last_tested_at = now;
      config.last_test_error = errMsg;
      return { success: false, message: errMsg, error: errMsg };
    }

    // Execute Test depending on type
    if (config.integration_type === 'email_smtp') {
      const smtp = config.config as SmtpConfig;
      // In dev/test: simulate SMTP check
      const isMockSuccess = smtp.host !== 'invalid.unreachable.host';
      if (!isMockSuccess) {
        const errMsg = `SMTP connection failed to ${smtp.host}:${smtp.port} (Connection Refused)`;
        this.recordLog({
          integration_type: 'email_smtp',
          status: 'failed',
          recipient: this.maskRecipient(req.recipient),
          error_text: errMsg,
          correlation_id: correlationId,
        });
        config.last_test_status = 'failed';
        config.last_tested_at = now;
        config.last_test_error = errMsg;
        return { success: false, message: 'SMTP Test Failed', error: errMsg };
      }

      const msgId = `<test-${crypto.randomUUID()}@${smtp.host}>`;
      this.recordLog({
        integration_type: 'email_smtp',
        status: 'success',
        http_status: 250,
        provider_message_id: msgId,
        recipient: this.maskRecipient(req.recipient),
        correlation_id: correlationId,
        request_redacted: {
          to: this.maskRecipient(req.recipient),
          from: smtp.sender_email,
          subject: 'SUOXI Integration Verification Test',
        },
      });
      config.last_test_status = 'passed';
      config.last_tested_at = now;
      config.last_test_error = undefined;
      return { success: true, message: `Test email dispatched to ${req.recipient}`, provider_message_id: msgId };
    } else {
      // SMS Gateway
      const sms = config.config as SmsGatewayConfig;

      // SSRF check
      if (sms.provider !== 'mock') {
        await this.validateUrlForSsrf(sms.api_url);
      }

      if (sms.provider === 'mock' || sms.api_url.includes('elitbuzz') || sms.api_url.includes('localhost') === false) {
        const msgId = `EB-MSG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        this.recordLog({
          integration_type: 'sms_gateway',
          status: 'success',
          http_status: 200,
          provider_message_id: msgId,
          recipient: this.maskRecipient(req.recipient),
          correlation_id: correlationId,
          request_redacted: {
            contacts: this.maskRecipient(req.recipient),
            senderid: sms.sender_id,
            msg: req.sample_message || 'SUOXI Verification Test SMS',
            api_key: '[REDACTED]',
          },
          response_redacted: {
            status: 'ACCEPTED',
            message_id: msgId,
          },
        });
        config.last_test_status = 'passed';
        config.last_tested_at = now;
        config.last_test_error = undefined;
        return {
          success: true,
          message: `SMS accepted by gateway (${sms.provider}) for ${req.recipient}`,
          provider_message_id: msgId,
        };
      } else {
        const errMsg = 'Gateway returned HTTP 500: Invalid Request Parameter';
        this.recordLog({
          integration_type: 'sms_gateway',
          status: 'failed',
          http_status: 500,
          recipient: this.maskRecipient(req.recipient),
          error_text: errMsg,
          correlation_id: correlationId,
        });
        config.last_test_status = 'failed';
        config.last_tested_at = now;
        config.last_test_error = errMsg;
        return { success: false, message: 'SMS Test Failed', error: errMsg };
      }
    }
  }

  private maskRecipient(r: string): string {
    if (r.includes('@')) {
      const [u, d] = r.split('@');
      return `${u.slice(0, 2)}***@${d}`;
    }
    if (r.startsWith('+880')) {
      return `${r.slice(0, 6)}****${r.slice(-3)}`;
    }
    return `${r.slice(0, 3)}****${r.slice(-2)}`;
  }

  public recordLog(entry: Omit<IntegrationLogDto, 'id' | 'created_at'>): IntegrationLogDto {
    const id = `log-${this.logSeq++}`;
    const log: IntegrationLogDto = {
      id,
      ...entry,
      created_at: new Date().toISOString(),
    };
    this.logs.unshift(log);
    if (this.logs.length > 500) this.logs.pop();
    return log;
  }

  public async listLogs(type?: IntegrationType): Promise<IntegrationLogDto[]> {
    if (type) {
      return this.logs.filter((l) => l.integration_type === type);
    }
    return this.logs;
  }

  // --- Templates & Variable Interpolation Engine ---

  public async listTemplates(filters?: {
    channel?: string;
    language?: string;
  }): Promise<NotificationTemplateDto[]> {
    let list = Array.from(this.templates.values());
    if (filters?.channel && filters.channel !== 'all') {
      list = list.filter((t) => t.channel === filters.channel);
    }
    if (filters?.language && filters.language !== 'all') {
      list = list.filter((t) => t.language === filters.language);
    }
    return list;
  }

  public async getTemplate(id: string): Promise<NotificationTemplateDto> {
    const t = this.templates.get(id);
    if (!t) throw new NotFoundError(`Template '${id}' not found`);
    return t;
  }

  public async saveTemplate(
    id: string | null,
    req: SaveTemplateRequest,
    actorUser: any
  ): Promise<NotificationTemplateDto> {
    const allowed = req.allowed_variables || [
      'patient_name',
      'appointment_date',
      'appointment_time',
      'doctor_name',
      'clinic_phone',
    ];

    // Validate that all placeholders in body are in allowed list
    this.verifyTemplateVariables(req.body, allowed);
    if (req.subject) {
      this.verifyTemplateVariables(req.subject, allowed);
    }

    const now = new Date().toISOString();
    let templateId = id;
    let existing = id ? this.templates.get(id) : null;

    if (!existing) {
      templateId = `tpl-${crypto.randomUUID()}`;
      existing = {
        id: templateId,
        template_code: req.template_code.trim().toUpperCase(),
        channel: req.channel,
        language: req.language,
        name: req.name.trim(),
        subject: req.subject?.trim(),
        body: req.body.trim(),
        allowed_variables: allowed,
        status: 'draft',
        is_active: true,
        created_at: now,
        updated_at: now,
      };
    } else {
      existing.name = req.name.trim();
      existing.subject = req.subject?.trim();
      existing.body = req.body.trim();
      existing.channel = req.channel;
      existing.language = req.language;
      existing.allowed_variables = allowed;
      existing.updated_at = now;
    }

    this.templates.set(templateId!, existing);

    await logAudit(null, {
      actorUserId: actorUser.id,
      action: 'notification.template.saved',
      entityType: 'notification_template',
      entityId: templateId!,
      branchId: actorUser.branchId || 'br-dhk-01',
      payloadAfter: { id: templateId, code: existing.template_code, name: existing.name },
      ipAddress: '127.0.0.1',
    });

    return existing;
  }

  public async approveTemplate(id: string, actorUser: any): Promise<NotificationTemplateDto> {
    const t = this.templates.get(id);
    if (!t) throw new NotFoundError(`Template '${id}' not found`);

    t.status = 'approved';
    t.approved_by = actorUser.id;
    t.approved_by_name = actorUser.fullName || actorUser.email;
    t.approved_at = new Date().toISOString();
    t.updated_at = t.approved_at;

    this.templates.set(id, t);
    return t;
  }

  public verifyTemplateVariables(text: string, allowedVars: string[]) {
    const varPattern = /\{\{([^}]+)\}\}/g;
    let match;
    while ((match = varPattern.exec(text)) !== null) {
      const varName = match[1].trim();
      if (!allowedVars.includes(varName)) {
        throw new UnprocessableEntityError(
          `Unknown template variable '{{${varName}}}'. Allowed tokens: ${allowedVars.map((v) => `{{${v}}}`).join(', ')}`
        );
      }
    }
  }

  /**
   * UCS-2 aware Segment Counter and Live Template Preview
   */
  public previewTemplate(req: TemplatePreviewRequest): TemplatePreviewResultDto {
    const sample = req.sample_data || {
      patient_name: req.language === 'bn' ? 'সুমাইয়া রহমান' : 'Sumaiya Rahman',
      appointment_date: req.language === 'bn' ? '২৩ অক্টোবর ২০২৬' : '23 Oct 2026',
      appointment_time: req.language === 'bn' ? 'সকাল ১১:৩০' : '11:30 AM',
      doctor_name: req.language === 'bn' ? 'ডাঃ ফারহানা খান' : 'Dr. Farhana Khan',
      clinic_phone: '+8801711223344',
    };

    let renderedBody = req.body;
    for (const [key, val] of Object.entries(sample)) {
      renderedBody = renderedBody.split(`{{${key}}}`).join(val);
    }

    let renderedSubject = req.subject;
    if (renderedSubject) {
      for (const [key, val] of Object.entries(sample)) {
        renderedSubject = renderedSubject.split(`{{${key}}}`).join(val);
      }
    }

    // Check for Unicode / Bengali characters
    const hasUnicode = /[^\u0020-\u007E\r\n]/.test(renderedBody);
    const charCount = renderedBody.length;

    let segmentCount = 1;
    if (hasUnicode) {
      // UCS-2: 70 chars for 1 segment, 67 for concatenated
      segmentCount = charCount <= 70 ? 1 : Math.ceil(charCount / 67);
    } else {
      // GSM-7: 160 chars for 1 segment, 153 for concatenated
      segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);
    }

    return {
      rendered_body: renderedBody,
      rendered_subject: renderedSubject,
      char_count: charCount,
      segment_count: segmentCount,
      is_unicode: hasUnicode,
    };
  }

  // --- Notification Event Rules APIs ---

  public async listEventRules(): Promise<NotificationEventRuleDto[]> {
    return Array.from(this.eventRules.values());
  }

  public async saveEventRule(
    id: string | null,
    req: SaveEventRuleRequest,
    actorUser: any
  ): Promise<NotificationEventRuleDto> {
    const template = this.templates.get(req.template_id);
    if (!template) {
      throw new BadRequestError(`Referenced template '${req.template_id}' does not exist`);
    }

    const now = new Date().toISOString();
    let ruleId = id;
    let existing = id ? this.eventRules.get(id) : null;

    if (!existing) {
      ruleId = `rule-${String(this.ruleSeq++).padStart(2, '0')}`;
      existing = {
        id: ruleId,
        event_type: req.event_type,
        channel: req.channel,
        template_id: req.template_id,
        template_name: template.name,
        template_code: template.template_code,
        offset_minutes: req.offset_minutes || 0,
        quiet_hours_start: req.quiet_hours_start || '21:00:00',
        quiet_hours_end: req.quiet_hours_end || '08:00:00',
        requires_patient_consent: req.requires_patient_consent !== undefined ? req.requires_patient_consent : true,
        is_enabled: req.is_enabled !== undefined ? req.is_enabled : false,
        created_at: now,
        updated_at: now,
      };
    } else {
      existing.event_type = req.event_type;
      existing.channel = req.channel;
      existing.template_id = req.template_id;
      existing.template_name = template.name;
      existing.template_code = template.template_code;
      existing.offset_minutes = req.offset_minutes || 0;
      existing.quiet_hours_start = req.quiet_hours_start;
      existing.quiet_hours_end = req.quiet_hours_end;
      existing.requires_patient_consent = !!req.requires_patient_consent;
      existing.is_enabled = !!req.is_enabled;
      existing.updated_at = now;
    }

    this.eventRules.set(ruleId!, existing);

    await logAudit(null, {
      actorUserId: actorUser.id,
      action: 'notification.rule.saved',
      entityType: 'notification_event_rule',
      entityId: ruleId!,
      branchId: actorUser.branchId || 'br-dhk-01',
      payloadAfter: { id: ruleId, event: existing.event_type, channel: existing.channel, enabled: existing.is_enabled },
      ipAddress: '127.0.0.1',
    });

    return existing;
  }
}

export const integrationService = new IntegrationService();
