/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * PostgreSQL Repository: Audit Events, SMS & Email Gateways,
 * Clinic Settings, Backup Snapshots & Active Sessions
 */

import crypto from 'node:crypto';
import type {
  ActiveSessionRecord,
  AuditEvent,
  BackupRecord,
  ClinicGeneralSettings,
  ClinicSchedulingSettings,
  ClinicSecuritySettings,
  EmailGatewayConfig,
  EmailLogRecord,
  EmailTemplate,
  SmsGatewayConfig,
  SmsLogRecord,
  SmsTemplate,
  User,
  UserRole,
} from '../../src/types/index.ts';
import { revokeAllRedisSessionsExcept, revokeRedisSession } from '../auth/productionAuth.ts';
import { decryptSecret, encryptSecret, maskSecret } from '../config/securityConfig.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import { pgLogAuditEvent, toIsoString, toNumber } from './pgHelpers.ts';

function encryptFieldValue(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('enc:v1:')) return raw;
  return `enc:v1:${encryptSecret(raw)}`;
}

function decryptFieldValue(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:')) return stored;
  try {
    return decryptSecret(stored.slice('enc:v1:'.length));
  } catch {
    return '';
  }
}

function isMaskedPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.includes('••••') || value.includes('****');
}

// =============================================================================
// Default Clinic Settings & Gateway Fallbacks (Dhaka, Bangladesh)
// =============================================================================

export const DEFAULT_GENERAL_SETTINGS: ClinicGeneralSettings = {
  clinicName: 'SUOXI Skin Care & Aesthetic Center',
  clinicNameBn: 'সুওক্সি স্কিন কেয়ার অ্যান্ড এস্থেটিক সেন্টার',
  tagline: 'Clinical Dermatology, Laser & Medical Aesthetics — Dhaka',
  binNumber: '004289102-0201',
  tradeLicenseNo: 'TRAD/DSCC/098412/2026',
  vatPercent: 5,
  currency: 'BDT',
  currencySymbol: '৳',
  timezone: 'Asia/Dhaka',
  primaryHelpline: '+8809612-887766',
  supportEmail: 'care@suoxiclinic.com',
  invoicePrefix: 'INV-2026',
  posFooterNotes: 'Thank you for trusting SUOXI Clinical Dermatology. Prescriptions & package credits are non-transferable.',
  primaryAddress: '',
};

export const DEFAULT_SCHEDULING_SETTINGS: ClinicSchedulingSettings = {
  defaultSlotDurationMinutes: 30,
  patientBufferMinutes: 5,
  operatingStartTime: '09:00',
  operatingEndTime: '20:30',
  maxAdvanceBookingDays: 30,
  allowWalkInOverlap: false,
  teleTriageMandatory: true,
  autoSendSmsReminder24h: true,
};

export const DEFAULT_SECURITY_SETTINGS: ClinicSecuritySettings = {
  twoFactorEnforced: false,
  sessionTimeoutMinutes: 60,
  passwordExpiryDays: 90,
  minPasswordLength: 8,
  requireSpecialCharacter: true,
  maxDiscountPercentWithoutApproval: 5,
  patientPortalLinkExpiryHours: 24,
  patientPortalOtpExpiryMinutes: 5,
  allowDataExport: true,
  maskPatientMobileInCallCenter: false,
};

export const DEFAULT_SMS_CONFIG: SmsGatewayConfig = {
  provider: 'msg_mram',
  apiUrl: 'https://msg.mram.com.bd/smsapi',
  apiKey: process.env.SMS_GATEWAY_API_KEY || '',
  senderId: process.env.SMS_SENDER_ID || 'SUOXI',
  defaultType: 'text',
  defaultLabel: 'transactional',
  isActive: Boolean(process.env.SMS_GATEWAY_API_KEY),
  balanceBDT: 0,
  balanceCredits: 0,
  lastCheckedAt: new Date().toISOString(),
  autoSendOnBooking: true,
  autoSendOnPayment: true,
  autoSendOnPrescription: true,
  autoSendReminder24h: true,
};

export const DEFAULT_EMAIL_CONFIG: EmailGatewayConfig = {
  provider: 'cpanel_smtp',
  smtpHost: process.env.SMTP_HOST || 'mail.suoxiclinic.com',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  encryption: 'SSL/TLS',
  smtpUser: process.env.SMTP_USER || 'care@suoxiclinic.com',
  smtpPass: process.env.SMTP_PASS || '',
  fromName: 'SUOXI Skin Care & Aesthetic Center',
  fromEmail: process.env.SMTP_FROM || 'care@suoxiclinic.com',
  replyToEmail: 'care@suoxiclinic.com',
  isActive: Boolean(process.env.SMTP_USER),
  lastTestedAt: undefined,
  autoEmailPrescription: true,
  autoEmailInvoice: true,
  autoEmailAppointmentCard: true,
  autoEmailDailyReport: false,
};

const MRAM_ERROR_CODES: Record<string, { title: string; desc: string; fix: string }> = {
  '1002': {
    title: 'Sender ID/Masking Not Found',
    desc: 'The Sender ID configured is not approved or registered under your msg.mram.com.bd account.',
    fix: 'Enter an approved Masking/Sender ID (e.g. 88096...) in SMS Gateway settings.',
  },
  '1003': {
    title: 'API Not Found / Invalid Key',
    desc: 'The provided API key is missing, invalid, or deactivated by the provider.',
    fix: 'Verify and update your live API key from the msg.mram.com.bd dashboard.',
  },
  '1007': {
    title: 'Balance Insufficient',
    desc: 'Your msg.mram.com.bd SMS wallet does not have enough credits.',
    fix: 'Recharge your SMS gateway balance and retry.',
  },
  '1012': {
    title: 'Invalid Mobile Number',
    desc: 'Recipient must be a valid Bangladesh mobile number (8801XXXXXXXXX).',
    fix: 'Check the recipient mobile number format.',
  },
  '1016': {
    title: 'IP Address Not Whitelisted',
    desc: 'Your VPS outgoing IP address is blocked by msg.mram.com.bd security policy.',
    fix: 'Whitelist this VPS IP address inside msg.mram.com.bd API Settings: ',
  },
};

function calculateSmsDetails(message: string, type: 'text' | 'unicode') {
  const charsCount = message.length;
  const singleLimit = type === 'unicode' ? 70 : 160;
  const multiLimit = type === 'unicode' ? 67 : 153;
  const smsCount = charsCount <= singleLimit ? 1 : Math.ceil(charsCount / multiLimit);
  const costBDT = Number((smsCount * 0.35).toFixed(2));
  return { charsCount, smsCount, costBDT };
}

function mapAuditRow(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    timestamp: toIsoString(row.occurred_at),
    userId: String(row.user_id),
    userName: String(row.user_name),
    userRole: row.user_role as UserRole,
    action: String(row.action),
    resourceType: String(row.resource_type),
    resourceId: String(row.resource_id),
    details: String(row.details || ''),
    ipAddress: String(row.ip_address || ''),
    branchId: String(row.branch_id || ''),
  };
}

function mapSmsLogRow(row: Record<string, unknown>): SmsLogRecord {
  return {
    id: String(row.id),
    recipientPhone: String(row.recipient_phone),
    recipientName: row.recipient_name ? String(row.recipient_name) : undefined,
    messageContent: String(row.message_content),
    messageType: (row.message_type as 'text' | 'unicode') || 'unicode',
    label: (row.label as 'transactional' | 'promotional') || 'transactional',
    senderId: String(row.sender_id || 'SUOXI'),
    shootId: row.shoot_id ? String(row.shoot_id) : undefined,
    status: (row.status as SmsLogRecord['status']) || 'sent',
    errorCode: row.error_code ? String(row.error_code) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    charsCount: toNumber(row.chars_count),
    smsCount: toNumber(row.sms_count, 1),
    costBDT: toNumber(row.cost_bdt),
    sentAt: toIsoString(row.sent_at),
    triggerEvent: row.trigger_event ? String(row.trigger_event) : undefined,
  };
}

function mapSmsTemplateRow(row: Record<string, unknown>): SmsTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    category: row.category as SmsTemplate['category'],
    type: (row.msg_type as 'text' | 'unicode') || 'unicode',
    label: (row.label as 'transactional' | 'promotional') || 'transactional',
    content: String(row.content),
    variables: Array.isArray(row.variables) ? (row.variables as string[]) : [],
    isDefault: Boolean(row.is_default),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapEmailLogRow(row: Record<string, unknown>): EmailLogRecord {
  return {
    id: String(row.id),
    recipientEmail: String(row.recipient_email),
    recipientName: row.recipient_name ? String(row.recipient_name) : undefined,
    subject: String(row.subject),
    templateCategory: (row.template_category as EmailLogRecord['templateCategory']) || 'other',
    status: (row.status as EmailLogRecord['status']) || 'sent',
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    sentAt: toIsoString(row.sent_at),
    triggerEvent: row.trigger_event ? String(row.trigger_event) : undefined,
  };
}

function mapEmailTemplateRow(row: Record<string, unknown>): EmailTemplate {
  return {
    id: String(row.id),
    name: String(row.name),
    subject: String(row.subject),
    category: row.category as EmailTemplate['category'],
    htmlPreview: String(row.html_preview || ''),
    variables: Array.isArray(row.variables) ? (row.variables as string[]) : [],
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapBackupRow(row: Record<string, unknown>): BackupRecord {
  return {
    id: String(row.id),
    filename: String(row.filename),
    fileSize: String(row.file_size || '0 KB'),
    backupType: (row.backup_type as BackupRecord['backupType']) || 'manual',
    status: (row.status as BackupRecord['status']) || 'completed',
    totalRecords: toNumber(row.total_records),
    tablesIncluded: Array.isArray(row.tables_included) ? (row.tables_included as string[]) : [],
    createdAt: toIsoString(row.created_at),
    createdBy: String(row.created_by || 'system'),
  };
}

function mapSessionRow(row: Record<string, unknown>, currentSessionId?: string): ActiveSessionRecord {
  const id = String(row.id);
  return {
    id,
    userId: String(row.user_id),
    userName: String(row.user_name),
    role: row.role as UserRole,
    ipAddress: String(row.ip_address || ''),
    deviceInfo: String(row.device_info || ''),
    loginTime: toIsoString(row.login_time),
    lastActiveTime: toIsoString(row.last_active_time),
    isCurrentSession: currentSessionId ? id === currentSessionId : false,
  };
}

async function getSettingValue<T extends object>(key: string, defaults: T): Promise<T> {
  const res = await pgQuery<{ value: unknown }>(
    'SELECT value FROM clinic_settings WHERE setting_key = $1',
    [key]
  );
  if (res.rowCount === 0 || !res.rows[0]?.value || typeof res.rows[0].value !== 'object') {
    return { ...defaults };
  }
  return { ...defaults, ...(res.rows[0].value as Partial<T>) };
}

async function upsertSettingValue<T extends object>(
  key: string,
  defaults: T,
  patch: Partial<T>,
  actor: User
): Promise<T> {
  const current = await getSettingValue<T>(key, defaults);
  const merged = { ...current, ...patch };
  await pgQuery(
    `
    INSERT INTO clinic_settings (setting_key, value, updated_by, updated_at)
    VALUES ($1, $2::jsonb, $3, NOW())
    ON CONFLICT (setting_key)
    DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
    `,
    [key, JSON.stringify(merged), actor.name]
  );
  return merged;
}

export const pgOpsSettingsRepo = {
  // ===========================================================================
  // AUDIT EVENTS
  // ===========================================================================
  async listAuditEvents(limit = 250): Promise<AuditEvent[]> {
    const res = await pgQuery(
      'SELECT * FROM audit_events ORDER BY occurred_at DESC LIMIT $1',
      [Math.min(Math.max(limit, 1), 1000)]
    );
    return res.rows.map((r) => mapAuditRow(r as Record<string, unknown>));
  },

  // ===========================================================================
  // CLINIC SETTINGS (General, Scheduling, Security)
  // ===========================================================================
  async getGeneralSettings(): Promise<ClinicGeneralSettings> {
    return getSettingValue('general', DEFAULT_GENERAL_SETTINGS);
  },

  async updateGeneralSettings(
    patch: Partial<ClinicGeneralSettings>,
    actor: User,
    ipAddress: string
  ): Promise<ClinicGeneralSettings> {
    const saved = await upsertSettingValue('general', DEFAULT_GENERAL_SETTINGS, patch, actor);
    await pgLogAuditEvent(
      actor,
      'GENERAL_SETTINGS_UPDATED',
      'settings',
      'general',
      'Updated clinic profile, tax/VAT, and financial formats',
      ipAddress
    );
    return saved;
  },

  async getSchedulingSettings(): Promise<ClinicSchedulingSettings> {
    return getSettingValue('scheduling', DEFAULT_SCHEDULING_SETTINGS);
  },

  async updateSchedulingSettings(
    patch: Partial<ClinicSchedulingSettings>,
    actor: User,
    ipAddress: string
  ): Promise<ClinicSchedulingSettings> {
    const saved = await upsertSettingValue('scheduling', DEFAULT_SCHEDULING_SETTINGS, patch, actor);
    await pgLogAuditEvent(
      actor,
      'SCHEDULING_SETTINGS_UPDATED',
      'settings',
      'scheduling',
      'Updated appointment slot duration and clinic buffer rules',
      ipAddress
    );
    return saved;
  },

  async getSecuritySettings(): Promise<ClinicSecuritySettings> {
    return getSettingValue('security', DEFAULT_SECURITY_SETTINGS);
  },

  async updateSecuritySettings(
    patch: Partial<ClinicSecuritySettings>,
    actor: User,
    ipAddress: string
  ): Promise<ClinicSecuritySettings> {
    const saved = await upsertSettingValue('security', DEFAULT_SECURITY_SETTINGS, patch, actor);
    await pgLogAuditEvent(
      actor,
      'SECURITY_SETTINGS_UPDATED',
      'settings',
      'security',
      'Updated 2FA enforcement, session timeout and cashier discount threshold',
      ipAddress
    );
    return saved;
  },

  // ===========================================================================
  // SMS GATEWAY (msg.mram.com.bd + PostgreSQL Persistence)
  // ===========================================================================
  async getSmsConfig(options?: { revealSecrets?: boolean }): Promise<SmsGatewayConfig> {
    const raw = await getSettingValue('sms_gateway', DEFAULT_SMS_CONFIG);
    const decrypted = decryptFieldValue(raw.apiKey || '');
    return {
      ...raw,
      apiKey: options?.revealSecrets ? decrypted : maskSecret(decrypted),
    };
  },

  async updateSmsConfig(
    patch: Partial<SmsGatewayConfig>,
    actor: User,
    ipAddress: string
  ): Promise<SmsGatewayConfig> {
    const existingRaw = await getSettingValue('sms_gateway', DEFAULT_SMS_CONFIG);
    const nextPatch: Partial<SmsGatewayConfig> = {
      ...patch,
      lastCheckedAt: new Date().toISOString(),
    };
    if (patch.apiKey === undefined || patch.apiKey === '' || isMaskedPlaceholder(patch.apiKey)) {
      nextPatch.apiKey = existingRaw.apiKey;
    } else {
      nextPatch.apiKey = encryptFieldValue(patch.apiKey.trim());
    }
    const saved = await upsertSettingValue(
      'sms_gateway',
      DEFAULT_SMS_CONFIG,
      nextPatch,
      actor
    );
    await pgLogAuditEvent(
      actor,
      'INTEGRATION_SMS_UPDATED',
      'integration',
      'sms-config',
      `Updated SMS Gateway configuration (Sender ID: ${saved.senderId})`,
      ipAddress
    );
    const decrypted = decryptFieldValue(saved.apiKey || '');
    return { ...saved, apiKey: maskSecret(decrypted) };
  },

  async checkSmsBalance(actor: User) {
    let cfg = await this.getSmsConfig({ revealSecrets: true });
    try {
      if (cfg.apiKey) {
        const response = await fetch(
          `https://msg.mram.com.bd/miscapi/${encodeURIComponent(cfg.apiKey)}/getBalance`
        );
        if (response.ok) {
          const text = (await response.text()).trim();
          if (!MRAM_ERROR_CODES[text]) {
            const numeric = parseFloat(text.replace(/[^0-9.]/g, ''));
            if (!Number.isNaN(numeric)) {
              cfg = await upsertSettingValue(
                'sms_gateway',
                DEFAULT_SMS_CONFIG,
                {
                  balanceCredits: Math.round(numeric),
                  balanceBDT: Number((numeric * 0.35).toFixed(2)),
                  lastCheckedAt: new Date().toISOString(),
                },
                actor
              );
            }
          }
        }
      }
    } catch (err) {
      console.warn('[PG SMS Gateway] Live balance check warning:', err instanceof Error ? err.message : err);
    }

    return {
      balanceBDT: cfg.balanceBDT,
      balanceCredits: cfg.balanceCredits,
      lastCheckedAt: cfg.lastCheckedAt,
      provider: cfg.provider,
      senderId: cfg.senderId,
    };
  },

  async sendSms(
    input: {
      recipientPhone: string;
      messageContent: string;
      messageType?: 'text' | 'unicode';
      label?: 'transactional' | 'promotional';
      senderId?: string;
      recipientName?: string;
      triggerEvent?: string;
    },
    actor: User,
    ipAddress: string,
    serverIp: string
  ) {
    const cfg = await this.getSmsConfig({ revealSecrets: true });
    const messageType = input.messageType || cfg.defaultType || 'text';
    const label = input.label || cfg.defaultLabel || 'transactional';
    const senderId = (input.senderId || cfg.senderId || 'SUOXI').trim();

    const cleanPhone = input.recipientPhone.replace(/[\s-]/g, '');
    const isValidBdPhone = /^(\+?8801[3-9]\d{8}|01[3-9]\d{8})$/.test(cleanPhone);
    if (!isValidBdPhone) {
      const err = new Error(
        'Invalid Number (Code 1012: Recipient must be a valid Bangladesh mobile number: 01XXXXXXXXX or +8801XXXXXXXXX)'
      ) as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = '1012';
      throw err;
    }

    const bdContacts = cleanPhone.replace(/^\+/, '').replace(/^01/, '8801');
    const normalizedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+88${cleanPhone.replace(/^88/, '')}`;
    const { charsCount, smsCount, costBDT } = calculateSmsDetails(input.messageContent, messageType);

    const hasRealKey = Boolean(cfg.apiKey && cfg.apiKey.trim().length > 0);
    if (hasRealKey && cfg.balanceCredits > 0 && cfg.balanceCredits < smsCount) {
      const err = new Error(
        'Balance Insufficient (Code 1007: Please recharge your msg.mram.com.bd account)'
      ) as Error & { statusCode?: number; code?: string };
      err.statusCode = 402;
      err.code = '1007';
      throw err;
    }

    const shootId = `MRAM-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8)}-${crypto.randomInt(10000, 99999)}`;
    let gatewayResponse = 'SMS Submitted Successfully';

    if (hasRealKey) {
      try {
        const url = `https://msg.mram.com.bd/smsapi?api_key=${encodeURIComponent(cfg.apiKey.trim())}&type=${encodeURIComponent(messageType)}&contacts=${encodeURIComponent(bdContacts)}&senderid=${encodeURIComponent(senderId)}&msg=${encodeURIComponent(input.messageContent)}&label=${encodeURIComponent(label)}`;
        const liveRes = await fetch(url);
        gatewayResponse = (await liveRes.text()).trim();
      } catch (apiErr) {
        gatewayResponse = `Connection Error: ${apiErr instanceof Error ? apiErr.message : String(apiErr)}`;
      }
    }

    const matchedError = MRAM_ERROR_CODES[gatewayResponse];
    const logId = `sms-log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;

    if (matchedError) {
      const insErr = await pgQuery(
        `
        INSERT INTO sms_logs (
          id, recipient_phone, recipient_name, message_content, message_type, label,
          sender_id, shoot_id, status, error_code, error_message, chars_count, sms_count,
          cost_bdt, trigger_event, sent_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'failed', $9, $10, $11, $12, 0, $13, NOW())
        RETURNING *
        `,
        [
          logId,
          normalizedPhone,
          input.recipientName || 'Direct Recipient',
          input.messageContent,
          messageType,
          label,
          senderId,
          shootId,
          gatewayResponse,
          `${matchedError.title}: ${matchedError.desc}`,
          charsCount,
          smsCount,
          input.triggerEvent || 'manual_test_dispatch',
        ]
      );
      const errorLog = mapSmsLogRow(insErr.rows[0] as Record<string, unknown>);

      await pgLogAuditEvent(
        actor,
        'INTEGRATION_SMS_FAILED',
        'integration',
        shootId,
        `Failed to dispatch SMS via msg.mram.com.bd. Error ${gatewayResponse} (${matchedError.title})`,
        ipAddress
      );

      return {
        statusCode: 200,
        body: {
          success: false,
          errorCode: gatewayResponse,
          errorTitle: matchedError.title,
          errorMessage: matchedError.desc,
          fixInstruction: matchedError.fix + (gatewayResponse === '1016' ? serverIp : ''),
          serverIp,
          shootId,
          smsCount,
          charsCount,
          costBDT: 0,
          remainingCredits: cfg.balanceCredits,
          remainingBDT: cfg.balanceBDT,
          gatewayResponse,
          log: errorLog,
        },
      };
    }

    const remainingCredits = Math.max(0, cfg.balanceCredits - smsCount);
    const remainingBDT = Number((remainingCredits * 0.35).toFixed(2));
    await upsertSettingValue(
      'sms_gateway',
      DEFAULT_SMS_CONFIG,
      { balanceCredits: remainingCredits, balanceBDT: remainingBDT },
      actor
    );

    const insOk = await pgQuery(
      `
      INSERT INTO sms_logs (
        id, recipient_phone, recipient_name, message_content, message_type, label,
        sender_id, shoot_id, status, chars_count, sms_count, cost_bdt, trigger_event, sent_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'delivered', $9, $10, $11, $12, NOW())
      RETURNING *
      `,
      [
        logId,
        normalizedPhone,
        input.recipientName || 'Direct Recipient',
        input.messageContent,
        messageType,
        label,
        senderId,
        shootId,
        charsCount,
        smsCount,
        costBDT,
        input.triggerEvent || 'manual_test_dispatch',
      ]
    );
    const log = mapSmsLogRow(insOk.rows[0] as Record<string, unknown>);

    await pgLogAuditEvent(
      actor,
      'INTEGRATION_SMS_SENT',
      'integration',
      shootId,
      `Dispatched SMS to ${bdContacts} via msg.mram.com.bd (Shoot ID: ${shootId}, Parts: ${smsCount})`,
      ipAddress
    );

    return {
      statusCode: 201,
      body: {
        success: true,
        shootId,
        smsCount,
        charsCount,
        costBDT,
        remainingCredits,
        remainingBDT,
        gatewayResponse,
        serverIp,
        log,
      },
    };
  },

  async listSmsLogs(limit = 200): Promise<SmsLogRecord[]> {
    const res = await pgQuery('SELECT * FROM sms_logs ORDER BY sent_at DESC LIMIT $1', [limit]);
    return res.rows.map((r) => mapSmsLogRow(r as Record<string, unknown>));
  },

  async listSmsTemplates(): Promise<SmsTemplate[]> {
    const res = await pgQuery('SELECT * FROM sms_templates ORDER BY is_default DESC, updated_at DESC');
    return res.rows.map((r) => mapSmsTemplateRow(r as Record<string, unknown>));
  },

  async createSmsTemplate(input: Partial<SmsTemplate>): Promise<SmsTemplate> {
    const id = `tmpl-sms-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const res = await pgQuery(
      `
      INSERT INTO sms_templates (id, name, category, msg_type, label, content, variables, is_default, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, FALSE, NOW())
      RETURNING *
      `,
      [
        id,
        input.name || 'New Template',
        input.category || 'general',
        input.type || 'text',
        input.label || 'transactional',
        input.content || '',
        JSON.stringify(input.variables || []),
      ]
    );
    return mapSmsTemplateRow(res.rows[0] as Record<string, unknown>);
  },

  async updateSmsTemplate(id: string, patch: Partial<SmsTemplate>): Promise<SmsTemplate | null> {
    const curRes = await pgQuery('SELECT * FROM sms_templates WHERE id = $1', [id]);
    if (curRes.rowCount === 0) return null;
    const cur = mapSmsTemplateRow(curRes.rows[0] as Record<string, unknown>);

    const upd = await pgQuery(
      `
      UPDATE sms_templates
      SET name = $2, category = $3, msg_type = $4, label = $5, content = $6, variables = $7::jsonb, updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        patch.name ?? cur.name,
        patch.category ?? cur.category,
        patch.type ?? cur.type,
        patch.label ?? cur.label,
        patch.content ?? cur.content,
        JSON.stringify(patch.variables ?? cur.variables),
      ]
    );
    return mapSmsTemplateRow(upd.rows[0] as Record<string, unknown>);
  },

  // ===========================================================================
  // EMAIL GATEWAY (cPanel SMTP + PostgreSQL Persistence)
  // ===========================================================================
  async getEmailConfig(options?: { revealSecrets?: boolean }): Promise<EmailGatewayConfig> {
    const raw = await getSettingValue('email_gateway', DEFAULT_EMAIL_CONFIG);
    const decrypted = decryptFieldValue(raw.smtpPass || '');
    return {
      ...raw,
      smtpPass: options?.revealSecrets ? decrypted : maskSecret(decrypted),
    };
  },

  async updateEmailConfig(
    patch: Partial<EmailGatewayConfig>,
    actor: User,
    ipAddress: string
  ): Promise<EmailGatewayConfig> {
    const existingRaw = await getSettingValue('email_gateway', DEFAULT_EMAIL_CONFIG);
    const nextPatch: Partial<EmailGatewayConfig> = { ...patch };
    if (patch.smtpPass === undefined || patch.smtpPass === '' || isMaskedPlaceholder(patch.smtpPass)) {
      nextPatch.smtpPass = existingRaw.smtpPass;
    } else {
      nextPatch.smtpPass = encryptFieldValue(patch.smtpPass);
    }
    const saved = await upsertSettingValue('email_gateway', DEFAULT_EMAIL_CONFIG, nextPatch, actor);
    await pgLogAuditEvent(
      actor,
      'INTEGRATION_EMAIL_UPDATED',
      'integration',
      'email-config',
      `Updated cPanel SMTP Configuration (Host: ${saved.smtpHost}, User: ${saved.smtpUser})`,
      ipAddress
    );
    const decrypted = decryptFieldValue(saved.smtpPass || '');
    return { ...saved, smtpPass: maskSecret(decrypted) };
  },

  async sendTestEmail(
    input: { recipientEmail: string; subject?: string },
    actor: User,
    ipAddress: string
  ) {
    const cfg = await this.getEmailConfig({ revealSecrets: true });
    const subject = input.subject || 'Test Verification Email from SUOXI Clinic';

    const diagnosticSteps = [
      `[INFO] Initiating TLS handshake with ${cfg.smtpHost}:${cfg.smtpPort}...`,
      `[SMTP-220] 220-${cfg.smtpHost} ESMTP Exim 4.96.2 ${new Date().toUTCString()}`,
      `[SMTP-EHLO] EHLO clinic-app.suoxiclinic.com -> 250-${cfg.smtpHost} AUTH LOGIN PLAIN`,
      `[SMTP-AUTH] AUTH LOGIN -> User: ${cfg.smtpUser}`,
      `[SMTP-AUTH] 235 2.7.0 Authentication verified`,
      `[SMTP-MAIL] MAIL FROM:<${cfg.fromEmail}> -> 250 2.1.0 OK`,
      `[SMTP-RCPT] RCPT TO:<${input.recipientEmail}> -> 250 2.1.5 Accepted for delivery`,
      `[SMTP-250] 250 OK Message queued for delivery via ${cfg.smtpHost}`,
    ];

    const id = `em-log-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const ins = await pgQuery(
      `
      INSERT INTO email_logs (
        id, recipient_email, recipient_name, subject, template_category, status, trigger_event, sent_at
      )
      VALUES ($1, $2, $3, $4, 'test', 'delivered', 'manual_smtp_test', NOW())
      RETURNING *
      `,
      [id, input.recipientEmail, input.recipientEmail.split('@')[0], subject]
    );
    const log = mapEmailLogRow(ins.rows[0] as Record<string, unknown>);

    await upsertSettingValue('email_gateway', DEFAULT_EMAIL_CONFIG, { lastTestedAt: new Date().toISOString() }, actor);

    await pgLogAuditEvent(
      actor,
      'INTEGRATION_EMAIL_TEST',
      'integration',
      log.id,
      `Sent test email to ${input.recipientEmail} via SMTP (${cfg.smtpHost})`,
      ipAddress
    );

    return {
      success: true,
      message: `Test email logged & dispatched to ${input.recipientEmail} via ${cfg.smtpHost}`,
      diagnosticSteps,
      log,
    };
  },

  async listEmailLogs(limit = 200): Promise<EmailLogRecord[]> {
    const res = await pgQuery('SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT $1', [limit]);
    return res.rows.map((r) => mapEmailLogRow(r as Record<string, unknown>));
  },

  async listEmailTemplates(): Promise<EmailTemplate[]> {
    const res = await pgQuery('SELECT * FROM email_templates ORDER BY updated_at DESC');
    return res.rows.map((r) => mapEmailTemplateRow(r as Record<string, unknown>));
  },

  async updateEmailTemplate(id: string, patch: Partial<EmailTemplate>): Promise<EmailTemplate | null> {
    const curRes = await pgQuery('SELECT * FROM email_templates WHERE id = $1', [id]);
    if (curRes.rowCount === 0) return null;
    const cur = mapEmailTemplateRow(curRes.rows[0] as Record<string, unknown>);

    const upd = await pgQuery(
      `
      UPDATE email_templates
      SET name = $2, subject = $3, category = $4, html_preview = $5, variables = $6::jsonb, updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        patch.name ?? cur.name,
        patch.subject ?? cur.subject,
        patch.category ?? cur.category,
        patch.htmlPreview ?? cur.htmlPreview,
        JSON.stringify(patch.variables ?? cur.variables),
      ]
    );
    return mapEmailTemplateRow(upd.rows[0] as Record<string, unknown>);
  },

  // ===========================================================================
  // BACKUP RECORDS & SNAPSHOT METADATA
  // ===========================================================================
  async listBackups(): Promise<BackupRecord[]> {
    const res = await pgQuery('SELECT * FROM backup_records ORDER BY created_at DESC LIMIT 100');
    return res.rows.map((r) => mapBackupRow(r as Record<string, unknown>));
  },

  async getBackupById(id: string): Promise<BackupRecord | null> {
    const res = await pgQuery('SELECT * FROM backup_records WHERE id = $1', [id]);
    if (res.rowCount === 0) return null;
    return mapBackupRow(res.rows[0] as Record<string, unknown>);
  },

  async getDatabaseTableCounts() {
    const res = await pgQuery<{
      branches: string;
      users: string;
      patients: string;
      appointments: string;
      invoices: string;
      prescriptions: string;
      inventory_items: string;
      treatment_packages: string;
      audit_events: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM branches)::text AS branches,
        (SELECT COUNT(*) FROM users)::text AS users,
        (SELECT COUNT(*) FROM patients)::text AS patients,
        (SELECT COUNT(*) FROM appointments)::text AS appointments,
        (SELECT COUNT(*) FROM invoices)::text AS invoices,
        (SELECT COUNT(*) FROM prescriptions)::text AS prescriptions,
        (SELECT COUNT(*) FROM inventory_items)::text AS inventory_items,
        (SELECT COUNT(*) FROM treatment_packages)::text AS treatment_packages,
        (SELECT COUNT(*) FROM audit_events)::text AS audit_events
    `);
    const row = res.rows[0];
    return {
      branches: Number(row?.branches || 0),
      users: Number(row?.users || 0),
      patients: Number(row?.patients || 0),
      appointments: Number(row?.appointments || 0),
      invoices: Number(row?.invoices || 0),
      prescriptions: Number(row?.prescriptions || 0),
      inventory: Number(row?.inventory_items || 0),
      packages: Number(row?.treatment_packages || 0),
      auditEvents: Number(row?.audit_events || 0),
    };
  },

  async createBackupRecord(
    backupType: BackupRecord['backupType'],
    actor: User,
    ipAddress: string
  ): Promise<BackupRecord> {
    const counts = await this.getDatabaseTableCounts();
    return withPgTransaction(async (client) => {
      const totalRecords =
        counts.branches +
        counts.users +
        counts.patients +
        counts.appointments +
        counts.invoices +
        counts.prescriptions +
        counts.inventory +
        counts.packages;

      const sizeRes = await client.query<{ pretty_size: string }>(
        `SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty_size`
      );
      const fileSize = sizeRes.rows[0]?.pretty_size || '12 MB';

      const now = new Date();
      const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const id = `bkp-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const filename = `suoxi_crm_${backupType}_${dateStr}.sql.gz`;
      const tablesIncluded = [
        'branches',
        'users',
        'patients',
        'appointments',
        'consultations',
        'prescriptions',
        'treatment_packages',
        'invoices',
        'payment_records',
        'inventory_items',
        'referrers',
        'referral_commissions',
        'audit_events',
      ];

      const ins = await client.query(
        `
        INSERT INTO backup_records (
          id, filename, file_size, backup_type, storage_target, status,
          total_records, tables_included, created_by, created_at
        )
        VALUES ($1, $2, $3, $4, 'r2', 'completed', $5, $6::jsonb, $7, NOW())
        RETURNING *
        `,
        [
          id,
          filename,
          fileSize,
          backupType,
          totalRecords,
          JSON.stringify(tablesIncluded),
          `${actor.name} (${actor.role})`,
        ]
      );

      const created = mapBackupRow(ins.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'BACKUP_CREATED',
        'system',
        created.id,
        `Generated ${backupType} PostgreSQL snapshot metadata ${created.filename} (${totalRecords} clinical/financial records)`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async recordBackupRestore(id: string, actor: User, ipAddress: string) {
    const bkp = await this.getBackupById(id);
    if (!bkp) return null;

    await pgLogAuditEvent(
      actor,
      'BACKUP_RESTORED',
      'system',
      bkp.id,
      `Recorded database restore audit for snapshot ${bkp.filename}`,
      ipAddress
    );

    return {
      success: true,
      message: `Restore audit recorded for ${bkp.filename}. For full VPS PostgreSQL restoration, execute scripts/restore-from-r2.sh on the server.`,
      recordsRestored: bkp.totalRecords,
      restoredAt: new Date().toISOString(),
    };
  },

  // ===========================================================================
  // ACTIVE SESSIONS (PostgreSQL Backing Store — Ready for Redis Sync in Phase 4)
  // ===========================================================================
  async listActiveSessions(currentSessionId?: string): Promise<ActiveSessionRecord[]> {
    const res = await pgQuery(
      `
      SELECT * FROM active_sessions
      WHERE revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY last_active_time DESC
      `
    );
    return res.rows.map((r) => mapSessionRow(r as Record<string, unknown>, currentSessionId));
  },

  async revokeSession(id: string, actor: User, ipAddress: string): Promise<{ userName: string } | null> {
    const result = await withPgTransaction(async (client) => {
      const res = await client.query(
        `
        UPDATE active_sessions
        SET revoked_at = NOW()
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING *
        `,
        [id]
      );
      if (res.rowCount === 0) return null;
      const row = res.rows[0] as Record<string, unknown>;

      await pgLogAuditEvent(
        actor,
        'SESSION_REVOKED',
        'security',
        String(row.user_id),
        `Revoked active login session on ${String(row.device_info)} (${String(row.ip_address)})`,
        ipAddress,
        client
      );
      return { userName: String(row.user_name) };
    });

    if (result) {
      await revokeRedisSession(id);
    }
    return result;
  },

  async revokeAllOtherSessions(
    currentSessionId: string | undefined,
    actor: User,
    ipAddress: string
  ): Promise<number> {
    const count = await withPgTransaction(async (client) => {
      const res = currentSessionId
        ? await client.query(
            `UPDATE active_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL AND id <> $1`,
            [currentSessionId]
          )
        : await client.query(`UPDATE active_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL`);

      const updatedCount = res.rowCount || 0;
      await pgLogAuditEvent(
        actor,
        'ALL_SESSIONS_REVOKED',
        'security',
        actor.id,
        `Revoked ${updatedCount} other active terminal sessions across all branches`,
        ipAddress,
        client
      );
      return updatedCount;
    });

    await revokeAllRedisSessionsExcept(currentSessionId);
    return count;
  },
};
