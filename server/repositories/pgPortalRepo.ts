/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Isolated Patient Portal Realm (PostgreSQL-Only, IDOR-Safe)
 *
 * Security Guarantees:
 *  - Completely separate session cookie (`portal_sid`) and DB tables (`patient_portal_*`).
 *  - Staff cookies cannot access portal endpoints; portal cookies cannot access staff endpoints.
 *  - Every data read strictly binds `WHERE patient_id = $portalSession.patientId`.
 *  - Passwords hashed with Argon2id; setup/reset tokens & OTPs stored strictly as SHA-256 hashes.
 */

import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import type { User } from '../../src/types/index.ts';
import { parseCookieHeader } from '../auth/productionAuth.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import { pgLogAuditEvent, toDateOnly, toIsoString, toNumber } from './pgHelpers.ts';

export const PORTAL_COOKIE_NAME = 'portal_sid';
const PORTAL_SESSION_TTL_SECONDS = 24 * 60 * 60;
const PORTAL_MAX_FAILURES = 5;
const PORTAL_LOCK_MINUTES = 15;

export interface PortalSessionContext {
  sessionId: string;
  portalAccountId: string;
  patientId: string;
  loginIdentifier: string;
}

function sha256(val: string): string {
  return crypto.createHash('sha256').update(val, 'utf8').digest('hex');
}

export function setPortalCookie(res: Response, sessionId: string, req: Request): void {
  const isSecure =
    process.env.NODE_ENV === 'production' &&
    (req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true');
  const parts = [
    `${PORTAL_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${PORTAL_SESSION_TTL_SECONDS}`,
  ];
  if (isSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearPortalCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${PORTAL_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function resolvePortalSession(req: Request): Promise<PortalSessionContext | null> {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sid = cookies[PORTAL_COOKIE_NAME];
  if (!sid || !/^[a-f0-9]{32,128}$/i.test(sid)) return null;

  const res = await pgQuery<{
    id: string;
    portal_account_id: string;
    patient_id: string;
    login_identifier: string;
  }>(
    `
    SELECT s.id, s.portal_account_id, s.patient_id, a.login_identifier
    FROM patient_portal_sessions s
    JOIN patient_portal_accounts a ON a.id = s.portal_account_id
    WHERE s.id = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND a.status = 'active'
    LIMIT 1
    `,
    [sid]
  );

  if ((res.rowCount || 0) === 0) return null;
  const r = res.rows[0];
  pgQuery('UPDATE patient_portal_sessions SET last_active_at = NOW() WHERE id = $1', [sid]).catch(() => {});

  return {
    sessionId: r.id,
    portalAccountId: r.portal_account_id,
    patientId: r.patient_id,
    loginIdentifier: r.login_identifier,
  };
}

export async function pgProvisionPortalAccount(
  patientId: string,
  loginIdentifier: string | undefined,
  actor: User,
  ipAddress: string
) {
  return withPgTransaction(async (client) => {
    const patRes = await client.query<{ id: string; phone: string; email: string | null; name: string }>(
      'SELECT id, phone, email, name FROM patients WHERE id = $1 LIMIT 1',
      [patientId]
    );
    if ((patRes.rowCount || 0) === 0) {
      const err = new Error('Patient not found') as Error & { statusCode?: number; code?: string };
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const pat = patRes.rows[0];
    const identifier = (loginIdentifier || pat.phone || pat.email || '').trim().toLowerCase();
    if (!identifier) {
      const err = new Error('Patient must have a mobile number or email for portal access') as Error & {
        statusCode?: number;
        code?: string;
      };
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    const existing = await client.query<{ id: string }>(
      'SELECT id FROM patient_portal_accounts WHERE patient_id = $1 LIMIT 1',
      [patientId]
    );

    let accountId: string;
    if ((existing.rowCount || 0) > 0) {
      accountId = existing.rows[0].id;
      await client.query(
        `UPDATE patient_portal_accounts SET login_identifier = $2, updated_at = NOW() WHERE id = $1`,
        [accountId, identifier]
      );
    } else {
      accountId = `ppa-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      await client.query(
        `
        INSERT INTO patient_portal_accounts (id, patient_id, login_identifier, status, created_by)
        VALUES ($1, $2, $3, 'pending_setup', $4)
        `,
        [accountId, patientId, identifier, actor.id]
      );
    }

    const rawSetupToken = crypto.randomBytes(24).toString('hex');
    const tokenId = `ppt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    await client.query(
      `
      INSERT INTO patient_portal_tokens (id, portal_account_id, token_type, token_hash, expires_at)
      VALUES ($1, $2, 'setup', $3, NOW() + INTERVAL '24 hours')
      `,
      [tokenId, accountId, sha256(rawSetupToken)]
    );

    await pgLogAuditEvent(
      actor,
      'PORTAL_ACCOUNT_PROVISIONED',
      'patient_portal_account',
      accountId,
      `Provisioned portal setup token for patient ${pat.name}`,
      ipAddress,
      client
    );

    return {
      portalAccountId: accountId,
      patientId,
      loginIdentifier: identifier,
      setupToken: rawSetupToken,
      expiresInHours: 24,
    };
  });
}

export async function pgCompletePortalSetup(rawToken: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    const err = new Error('Password must be at least 8 characters long') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'WEAK_PASSWORD';
    throw err;
  }

  return withPgTransaction(async (client) => {
    const tokRes = await client.query<{ id: string; portal_account_id: string }>(
      `
      SELECT id, portal_account_id
      FROM patient_portal_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      FOR UPDATE
      `,
      [sha256(rawToken)]
    );

    if ((tokRes.rowCount || 0) === 0) {
      const err = new Error('Setup or reset token is invalid or expired') as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    const hash = await argon2.hash(newPassword);
    await client.query(
      `
      UPDATE patient_portal_accounts
      SET password_hash = $2, status = 'active', failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE id = $1
      `,
      [tokRes.rows[0].portal_account_id, hash]
    );
    await client.query('UPDATE patient_portal_tokens SET used_at = NOW() WHERE id = $1', [tokRes.rows[0].id]);

    return { activated: true };
  });
}

export async function pgPortalLogin(params: {
  identifier: string;
  password: string;
  req: Request;
  res: Response;
  ipAddress: string;
}) {
  const cleanId = params.identifier.trim().toLowerCase();
  const res = await pgQuery<{
    id: string;
    patient_id: string;
    login_identifier: string;
    password_hash: string | null;
    status: string;
    failed_login_attempts: number;
    locked_until: string | null;
  }>('SELECT * FROM patient_portal_accounts WHERE LOWER(login_identifier) = $1 LIMIT 1', [cleanId]);

  if ((res.rowCount || 0) === 0) {
    const err = new Error('Invalid credentials') as Error & { statusCode?: number; code?: string };
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const acc = res.rows[0];
  if (acc.status !== 'active') {
    const err = new Error('Portal account is not active') as Error & { statusCode?: number; code?: string };
    err.statusCode = 403;
    err.code = 'ACCOUNT_INACTIVE';
    throw err;
  }
  if (acc.locked_until && new Date(acc.locked_until).getTime() > Date.now()) {
    const err = new Error('Portal account temporarily locked due to failed attempts') as Error & {
      statusCode?: number;
      code?: string;
    };
    err.statusCode = 429;
    err.code = 'ACCOUNT_LOCKED';
    throw err;
  }

  const verified = acc.password_hash ? await argon2.verify(acc.password_hash, params.password).catch(() => false) : false;
  if (!verified) {
    const nextFails = acc.failed_login_attempts + 1;
    await pgQuery(
      `
      UPDATE patient_portal_accounts
      SET failed_login_attempts = $2,
          locked_until = CASE WHEN $2 >= $3 THEN NOW() + ($4::int || ' minutes')::interval ELSE locked_until END,
          updated_at = NOW()
      WHERE id = $1
      `,
      [acc.id, nextFails, PORTAL_MAX_FAILURES, PORTAL_LOCK_MINUTES]
    );
    const err = new Error('Invalid credentials') as Error & { statusCode?: number; code?: string };
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const sid = crypto.randomBytes(32).toString('hex');
  await pgQuery(
    `
    INSERT INTO patient_portal_sessions (id, portal_account_id, patient_id, ip_address, user_agent, expires_at)
    VALUES ($1, $2, $3, $4, $5, NOW() + ($6::int || ' seconds')::interval)
    `,
    [
      sid,
      acc.id,
      acc.patient_id,
      params.ipAddress,
      String(params.req.headers['user-agent'] || '').slice(0, 180),
      PORTAL_SESSION_TTL_SECONDS,
    ]
  );
  await pgQuery(
    'UPDATE patient_portal_accounts SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1',
    [acc.id]
  );

  setPortalCookie(params.res, sid, params.req);
  return {
    portalAccountId: acc.id,
    patientId: acc.patient_id,
    loginIdentifier: acc.login_identifier,
  };
}

export async function pgPortalLogout(req: Request, res: Response) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sid = cookies[PORTAL_COOKIE_NAME];
  if (sid) {
    await pgQuery('UPDATE patient_portal_sessions SET revoked_at = NOW() WHERE id = $1', [sid]).catch(() => {});
  }
  clearPortalCookie(res);
}

/**
 * Strictly scoped patient portal summary & sub-resources.
 * Always bound to `patientId` from the authenticated portal session (zero IDOR).
 */
export async function pgGetPortalPatientBundle(patientId: string) {
  const [patRes, aptRes, rxRes, pkgRes, invRes, docRes] = await Promise.all([
    pgQuery(
      'SELECT id, patient_id_code, name, name_bn, phone, email, gender, date_of_birth, blood_group, skin_type, branch_id FROM patients WHERE id = $1 LIMIT 1',
      [patientId]
    ),
    pgQuery(
      `SELECT id, doctor_name, service_name, appointment_date, appointment_time, status, branch_id
       FROM appointments WHERE patient_id = $1 ORDER BY appointment_date DESC LIMIT 50`,
      [patientId]
    ),
    pgQuery(
      `SELECT id, prescription_code, doctor_name, diagnosis, medicines, lifestyle_guidance, next_session_date, created_at
       FROM prescriptions WHERE patient_id = $1 AND is_finalized = TRUE ORDER BY created_at DESC LIMIT 50`,
      [patientId]
    ),
    pgQuery(
      `SELECT id, package_name, total_sessions, completed_sessions, remaining_sessions, price_bdt, paid_amount_bdt, due_amount_bdt, expiry_date, status
       FROM treatment_packages WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [patientId]
    ),
    pgQuery(
      `SELECT id, invoice_number, total_amount_bdt, paid_amount_bdt, due_amount_bdt, status, created_at
       FROM invoices WHERE patient_id = $1 AND status <> 'void' ORDER BY created_at DESC LIMIT 50`,
      [patientId]
    ),
    pgQuery(
      `SELECT id, doc_type, title, file_format, created_at
       FROM medical_attachments WHERE patient_id = $1 AND is_confidential = FALSE ORDER BY created_at DESC LIMIT 30`,
      [patientId]
    ),
  ]);

  if ((patRes.rowCount || 0) === 0) return null;
  const p = patRes.rows[0];
  return {
    profile: {
      id: p.id,
      patientCode: p.patient_id_code,
      fullName: p.name,
      fullNameBn: p.name_bn || undefined,
      phone: p.phone,
      email: p.email || undefined,
      gender: p.gender,
      dateOfBirth: p.date_of_birth ? toDateOnly(p.date_of_birth) : undefined,
      bloodGroup: p.blood_group || undefined,
      skinType: p.skin_type || undefined,
      branchId: p.branch_id,
    },
    appointments: aptRes.rows.map((a) => ({
      id: a.id,
      doctorName: a.doctor_name,
      serviceName: a.service_name,
      date: toDateOnly(a.appointment_date),
      time: a.appointment_time,
      status: a.status,
    })),
    prescriptions: rxRes.rows.map((rx) => ({
      id: rx.id,
      prescriptionCode: rx.prescription_code,
      doctorName: rx.doctor_name,
      diagnosis: rx.diagnosis,
      medicines: rx.medicines || [],
      foodLifestyleGuidance: rx.lifestyle_guidance || null,
      nextSessionDate: rx.next_session_date ? toDateOnly(rx.next_session_date) : undefined,
      issuedAt: toIsoString(rx.created_at),
    })),
    packages: pkgRes.rows.map((k) => ({
      id: k.id,
      packageName: k.package_name,
      totalSessions: toNumber(k.total_sessions),
      completedSessions: toNumber(k.completed_sessions),
      remainingSessions: toNumber(k.remaining_sessions),
      priceBDT: toNumber(k.price_bdt),
      paidAmountBDT: toNumber(k.paid_amount_bdt),
      dueAmountBDT: toNumber(k.due_amount_bdt),
      expiryDate: toDateOnly(k.expiry_date),
      status: k.status,
    })),
    invoices: invRes.rows.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoice_number,
      totalAmountBDT: toNumber(i.total_amount_bdt),
      paidAmountBDT: toNumber(i.paid_amount_bdt),
      dueAmountBDT: toNumber(i.due_amount_bdt),
      status: i.status,
      createdAt: toIsoString(i.created_at),
    })),
    documents: docRes.rows,
  };
}

export async function pgRequestPortalContactOtp(
  session: PortalSessionContext,
  changeType: 'mobile' | 'email',
  targetValue: string
) {
  const otp = String(crypto.randomInt(100000, 999999));
  const id = `otp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await pgQuery(
    `
    INSERT INTO patient_contact_otps (id, portal_account_id, patient_id, change_type, target_value, otp_hash, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '5 minutes')
    `,
    [id, session.portalAccountId, session.patientId, changeType, targetValue.trim(), sha256(otp)]
  );
  // Queue notification in PostgreSQL for worker delivery (never log OTP in prod)
  await pgQuery(
    `
    INSERT INTO notifications (id, patient_id, channel, recipient, subject, body, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'queued')
    `,
    [
      `ntf-otp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      session.patientId,
      changeType === 'mobile' ? 'sms' : 'email',
      targetValue.trim(),
      'SUOXI Verification Code',
      `Your SUOXI Patient Portal verification code is ${otp}. Valid for 5 minutes.`,
    ]
  );
  return { otpId: id, expiresInMinutes: 5 };
}

export async function pgVerifyPortalContactOtp(
  session: PortalSessionContext,
  otpId: string,
  otpCode: string
) {
  return withPgTransaction(async (client) => {
    const res = await client.query<{
      id: string;
      change_type: 'mobile' | 'email';
      target_value: string;
      otp_hash: string;
      attempts: number;
    }>(
      `
      SELECT id, change_type, target_value, otp_hash, attempts
      FROM patient_contact_otps
      WHERE id = $1 AND portal_account_id = $2 AND verified_at IS NULL AND expires_at > NOW()
      FOR UPDATE
      `,
      [otpId, session.portalAccountId]
    );
    if ((res.rowCount || 0) === 0) {
      const err = new Error('OTP expired or invalid') as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = 'INVALID_OTP';
      throw err;
    }
    const row = res.rows[0];
    if (row.attempts >= 5) {
      const err = new Error('Too many failed OTP attempts') as Error & { statusCode?: number; code?: string };
      err.statusCode = 429;
      err.code = 'OTP_LOCKED';
      throw err;
    }
    if (row.otp_hash !== sha256(otpCode.trim())) {
      await client.query('UPDATE patient_contact_otps SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      const err = new Error('Incorrect OTP code') as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = 'INVALID_OTP';
      throw err;
    }

    await client.query('UPDATE patient_contact_otps SET verified_at = NOW() WHERE id = $1', [row.id]);
    if (row.change_type === 'mobile') {
      await client.query('UPDATE patients SET phone = $2, updated_at = NOW() WHERE id = $1', [
        session.patientId,
        row.target_value,
      ]);
    } else {
      await client.query('UPDATE patients SET email = $2, updated_at = NOW() WHERE id = $1', [
        session.patientId,
        row.target_value,
      ]);
    }
    return { verified: true, changeType: row.change_type, value: row.target_value };
  });
}
