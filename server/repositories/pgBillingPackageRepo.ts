/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * PostgreSQL Repository: Treatment Packages, Non-Duplicate Session Deductions,
 * Billing Invoices, Derived Payments, Voiding & Daily Closing Reports
 *
 * All money and session-count mutations run inside ACID transactions with
 * `SELECT ... FOR UPDATE` row locks and DB-level UNIQUE constraints.
 */

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type {
  DailyClosingReport,
  Invoice,
  MasterPackage,
  PackageDeduction,
  PaymentMethod,
  PaymentRecord,
  TreatmentPackage,
  User,
} from '../../src/types/index.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import {
  applyPackageFinancials,
  generateCode,
  pgLogAuditEvent,
  toDateOnly,
  toIsoString,
  toNumber,
} from './pgHelpers.ts';

function mapMasterPackageRow(row: Record<string, unknown>): MasterPackage {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    nameBn: row.name_bn ? String(row.name_bn) : undefined,
    serviceCategory: String(row.service_category),
    totalSessions: toNumber(row.total_sessions, 1),
    regularPriceBDT: toNumber(row.regular_price_bdt, 0),
    packagePriceBDT: toNumber(row.package_price_bdt, 0),
    savingsBDT: toNumber(row.savings_bdt, 0),
    validityMonths: toNumber(row.validity_months, 6),
    minIntervalDays: toNumber(row.min_interval_days, 14),
    description: String(row.description || ''),
    descriptionBn: row.description_bn ? String(row.description_bn) : undefined,
    includedServices: Array.isArray(row.included_services) ? (row.included_services as string[]) : [],
    isActive: row.is_active !== false,
    createdAt: toIsoString(row.created_at),
  };
}

function mapRawPackageRow(row: Record<string, unknown>): TreatmentPackage {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    patientName: String(row.patient_name),
    packageName: String(row.package_name),
    serviceCategory: String(row.service_category),
    totalSessions: toNumber(row.total_sessions, 1),
    completedSessions: toNumber(row.completed_sessions, 0),
    remainingSessions: toNumber(row.remaining_sessions, 0),
    priceBDT: toNumber(row.price_bdt, 0),
    paidAmountBDT: toNumber(row.paid_amount_bdt, 0),
    dueAmountBDT: toNumber(row.due_amount_bdt, 0),
    purchaseDate: toDateOnly(row.purchase_date),
    expiryDate: toDateOnly(row.expiry_date),
    invoiceId: String(row.invoice_id || ''),
    status: (row.status as TreatmentPackage['status']) || 'active',
  };
}

function mapPaymentRow(row: Record<string, unknown>): PaymentRecord {
  return {
    id: String(row.id),
    invoiceId: String(row.invoice_id),
    receiptNumber: String(row.receipt_number),
    amountBDT: toNumber(row.amount_bdt, 0),
    method: row.method as PaymentMethod,
    transactionRef: row.transaction_ref ? String(row.transaction_ref) : undefined,
    paidAt: toIsoString(row.paid_at),
    receivedBy: String(row.received_by),
    status: (row.status as PaymentRecord['status']) || 'valid',
    reversalReason: row.reversal_reason ? String(row.reversal_reason) : undefined,
  };
}

function mapInvoiceRow(row: Record<string, unknown>, payments: PaymentRecord[] = []): Invoice {
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number),
    patientId: String(row.patient_id),
    patientName: String(row.patient_name),
    patientPhone: row.patient_phone ? String(row.patient_phone) : undefined,
    patientAge: row.patient_age !== null && row.patient_age !== undefined ? toNumber(row.patient_age) : undefined,
    patientGender: row.patient_gender ? String(row.patient_gender) : undefined,
    patientCode: row.patient_code ? String(row.patient_code) : undefined,
    branchId: String(row.branch_id),
    branchName: String(row.branch_name || ''),
    items: Array.isArray(row.items) ? (row.items as Invoice['items']) : [],
    subtotalBDT: toNumber(row.subtotal_bdt, 0),
    vatPercent: toNumber(row.vat_percent, 0),
    vatAmountBDT: toNumber(row.vat_amount_bdt, 0),
    discountBDT: toNumber(row.discount_bdt, 0),
    totalAmountBDT: toNumber(row.total_amount_bdt, 0),
    paidAmountBDT: toNumber(row.paid_amount_bdt, 0),
    dueAmountBDT: toNumber(row.due_amount_bdt, 0),
    status: (row.status as Invoice['status']) || 'unpaid',
    voidReason: row.void_reason ? String(row.void_reason) : undefined,
    voidedAt: row.voided_at ? toIsoString(row.voided_at) : undefined,
    voidedBy: row.voided_by ? String(row.voided_by) : undefined,
    payments,
    createdAt: toIsoString(row.created_at),
    createdBy: String(row.created_by || ''),
    paymentMethod: row.payment_method ? String(row.payment_method) : undefined,
    bankName: row.bank_name ? String(row.bank_name) : undefined,
    accountNumber: row.account_number ? String(row.account_number) : undefined,
  };
}

function mapDeductionRow(row: Record<string, unknown>): PackageDeduction {
  return {
    id: String(row.id),
    packageId: String(row.package_id),
    patientId: String(row.patient_id),
    sessionNumber: toNumber(row.session_number, 1),
    deductedAt: toIsoString(row.deducted_at),
    therapistId: String(row.therapist_id),
    therapistName: String(row.therapist_name),
    treatmentNotes: String(row.treatment_notes || ''),
    machineSettings: row.machine_settings ? String(row.machine_settings) : undefined,
  };
}

async function getValidPaidForInvoice(invoiceId: string, client?: PoolClient): Promise<number> {
  const sql = `
    SELECT COALESCE(SUM(amount_bdt), 0)::numeric AS paid
    FROM payment_records
    WHERE invoice_id = $1 AND status = 'valid'
  `;
  const res = client ? await client.query(sql, [invoiceId]) : await pgQuery(sql, [invoiceId]);
  return toNumber(res.rows[0]?.paid, 0);
}

async function enrichPackageWithDerivedFinancials(
  pkg: TreatmentPackage,
  client?: PoolClient
): Promise<TreatmentPackage> {
  let derivedPaid = 0;
  if (pkg.invoiceId) {
    derivedPaid = await getValidPaidForInvoice(pkg.invoiceId, client);
  } else {
    derivedPaid = pkg.paidAmountBDT || 0;
  }
  return applyPackageFinancials(pkg, derivedPaid);
}

export const pgBillingPackageRepo = {
  // ---------------------------------------------------------------------------
  // Master Packages
  // ---------------------------------------------------------------------------
  async listMasterPackages(): Promise<MasterPackage[]> {
    const res = await pgQuery('SELECT * FROM master_packages ORDER BY created_at DESC');
    return res.rows.map(mapMasterPackageRow);
  },

  async createMasterPackage(input: {
    name: string;
    nameBn?: string;
    serviceCategory?: string;
    totalSessions: number;
    regularPriceBDT?: number;
    packagePriceBDT: number;
    validityMonths?: number;
    minIntervalDays?: number;
    description?: string;
    descriptionBn?: string;
    includedServices?: string[];
  }): Promise<MasterPackage> {
    const reg = Number(input.regularPriceBDT) || Number(input.packagePriceBDT);
    const pkgPr = Number(input.packagePriceBDT);
    const id = `mpkg-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const code = `PKG-${crypto.randomInt(1000, 9999)}`;
    const res = await pgQuery(
      `
      INSERT INTO master_packages (
        id, code, name, name_bn, service_category, total_sessions,
        regular_price_bdt, package_price_bdt, savings_bdt, validity_months,
        min_interval_days, description, description_bn, included_services, is_active, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, TRUE, NOW())
      RETURNING *
      `,
      [
        id,
        code,
        input.name,
        input.nameBn || null,
        input.serviceCategory || 'Skin Care',
        Number(input.totalSessions),
        reg,
        pkgPr,
        Math.max(0, reg - pkgPr),
        Number(input.validityMonths) || 6,
        Number(input.minIntervalDays) || 14,
        input.description || '',
        input.descriptionBn || null,
        JSON.stringify(Array.isArray(input.includedServices) ? input.includedServices : [input.name]),
      ]
    );
    return mapMasterPackageRow(res.rows[0]);
  },

  // ---------------------------------------------------------------------------
  // Patient Treatment Packages & Session Ledger (ACID)
  // ---------------------------------------------------------------------------
  async listPackages(patientId?: string): Promise<TreatmentPackage[]> {
    const res = patientId
      ? await pgQuery('SELECT * FROM treatment_packages WHERE patient_id = $1 ORDER BY created_at DESC', [
          patientId,
        ])
      : await pgQuery('SELECT * FROM treatment_packages ORDER BY created_at DESC');

    const rawList = res.rows.map(mapRawPackageRow);
    const invIds = Array.from(new Set(rawList.map((p) => p.invoiceId).filter(Boolean)));
    const paidByInvoice = new Map<string, number>();

    if (invIds.length > 0) {
      const payRes = await pgQuery(
        `
        SELECT invoice_id, COALESCE(SUM(amount_bdt), 0)::numeric AS paid
        FROM payment_records
        WHERE invoice_id = ANY($1::text[]) AND status = 'valid'
        GROUP BY invoice_id
        `,
        [invIds]
      );
      for (const r of payRes.rows) {
        paidByInvoice.set(String(r.invoice_id), toNumber(r.paid, 0));
      }
    }

    return rawList.map((pkg) => {
      const paid = pkg.invoiceId ? paidByInvoice.get(pkg.invoiceId) ?? 0 : pkg.paidAmountBDT ?? 0;
      return applyPackageFinancials(pkg, paid);
    });
  },

  async listPackageDeductions(packageId?: string): Promise<PackageDeduction[]> {
    const res = packageId
      ? await pgQuery(
          'SELECT * FROM package_deductions WHERE package_id = $1 ORDER BY deducted_at DESC',
          [packageId]
        )
      : await pgQuery('SELECT * FROM package_deductions ORDER BY deducted_at DESC');
    return res.rows.map(mapDeductionRow);
  },

  async createPackage(
    input: {
      patientId: string;
      patientName: string;
      packageName: string;
      serviceCategory?: string;
      totalSessions: number;
      priceBDT?: number;
      validityMonths?: number;
      invoiceId?: string;
      initialPayment?: { amountBDT: number; method?: PaymentMethod; transactionRef?: string };
    },
    actor: User,
    ipAddress: string
  ): Promise<TreatmentPackage> {
    return withPgTransaction(async (client) => {
      const months = Number(input.validityMonths) || 6;
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + months);
      const total = Number(input.priceBDT) || 0;
      const totalSessions = Number(input.totalSessions);

      let invId = input.invoiceId || `inv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const existingInv = await client.query('SELECT * FROM invoices WHERE id = $1', [invId]);

      if (existingInv.rows.length === 0) {
        const ptRes = await client.query('SELECT * FROM patients WHERE id = $1', [input.patientId]);
        const pt = ptRes.rows[0];
        const branchId = pt?.branch_id || actor.branchId || 'br-dhanmondi';
        const brRes = await client.query('SELECT name FROM branches WHERE id = $1', [branchId]);
        const branchName = String(brRes.rows[0]?.name || 'Dhanmondi Main Center');

        const invItems = [
          {
            id: `it-${Date.now()}`,
            description: `${input.packageName} (${totalSessions} Sessions)`,
            quantity: 1,
            unitPriceBDT: total,
            discountBDT: 0,
            totalBDT: total,
          },
        ];

        await client.query(
          `
          INSERT INTO invoices (
            id, invoice_number, patient_id, patient_name, patient_phone, patient_age,
            patient_gender, patient_code, branch_id, branch_name, items,
            subtotal_bdt, vat_percent, vat_amount_bdt, discount_bdt, total_amount_bdt,
            paid_amount_bdt, due_amount_bdt, status, created_by, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11::jsonb,
            $12, 0, 0, 0, $12,
            0, $12, 'unpaid', $13, NOW(), NOW()
          )
          `,
          [
            invId,
            generateCode('INV'),
            input.patientId,
            input.patientName,
            pt?.phone || null,
            pt?.age ?? null,
            pt?.gender || null,
            pt?.patient_id_code || null,
            branchId,
            branchName,
            JSON.stringify(invItems),
            total,
            actor.name,
          ]
        );
      }

      let paidAmount = 0;
      if (input.initialPayment && Number(input.initialPayment.amountBDT) > 0) {
        const payAmt = Math.min(Number(input.initialPayment.amountBDT), total);
        const payId = `pay-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
        await client.query(
          `
          INSERT INTO payment_records (
            id, invoice_id, receipt_number, amount_bdt, method, transaction_ref, paid_at, received_by, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'valid')
          `,
          [
            payId,
            invId,
            generateCode('RCP'),
            payAmt,
            input.initialPayment.method || 'cash',
            input.initialPayment.transactionRef || `ADV-${crypto.randomInt(1000, 9999)}`,
            actor.name,
          ]
        );

        paidAmount = await getValidPaidForInvoice(invId, client);
        const dueAmount = Math.max(0, total - paidAmount);
        const invStatus = dueAmount <= 0.01 ? 'paid' : 'partially_paid';
        await client.query(
          'UPDATE invoices SET paid_amount_bdt = $2, due_amount_bdt = $3, status = $4, updated_at = NOW() WHERE id = $1',
          [invId, paidAmount, dueAmount, invStatus]
        );
      } else {
        paidAmount = await getValidPaidForInvoice(invId, client);
      }

      const pkgId = `pkg-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const pkgRes = await client.query(
        `
        INSERT INTO treatment_packages (
          id, patient_id, patient_name, package_name, service_category,
          total_sessions, completed_sessions, remaining_sessions, price_bdt,
          paid_amount_bdt, due_amount_bdt, purchase_date, expiry_date, invoice_id,
          status, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, 0, $6, $7,
          $8, $9, CURRENT_DATE, $10::date, $11,
          'active', NOW(), NOW()
        )
        RETURNING *
        `,
        [
          pkgId,
          input.patientId,
          input.patientName,
          input.packageName,
          input.serviceCategory || 'Skin Care',
          totalSessions,
          total,
          paidAmount,
          Math.max(0, total - paidAmount),
          expiry.toISOString().slice(0, 10),
          invId,
        ]
      );

      const pkg = applyPackageFinancials(mapRawPackageRow(pkgRes.rows[0]), paidAmount);
      await pgLogAuditEvent(
        actor,
        'PACKAGE_CREATED',
        'package',
        pkg.id,
        `Enrolled ${pkg.patientName} in ${pkg.packageName} (${pkg.totalSessions} sessions, ৳ ${pkg.priceBDT})`,
        ipAddress,
        client
      );
      return pkg;
    });
  },

  async recordPackagePayment(
    packageId: string,
    input: { amountBDT: number; method: PaymentMethod; transactionRef?: string },
    actor: User,
    ipAddress: string
  ): Promise<{ package: TreatmentPackage; invoice: Invoice; payment: PaymentRecord }> {
    return withPgTransaction(async (client) => {
      const pkgRes = await client.query('SELECT * FROM treatment_packages WHERE id = $1 FOR UPDATE', [
        packageId,
      ]);
      if (pkgRes.rows.length === 0) {
        const err = new Error('Package not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
      const rawPkg = mapRawPackageRow(pkgRes.rows[0]);

      // Lock or create linked invoice
      let invRes = rawPkg.invoiceId
        ? await client.query('SELECT * FROM invoices WHERE id = $1 OR invoice_number = $1 FOR UPDATE', [
            rawPkg.invoiceId,
          ])
        : { rows: [] };

      let invRow = invRes.rows[0];
      if (!invRow) {
        const newInvId = rawPkg.invoiceId || `inv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
        const createdInv = await client.query(
          `
          INSERT INTO invoices (
            id, invoice_number, patient_id, patient_name, branch_id, branch_name, items,
            subtotal_bdt, vat_percent, vat_amount_bdt, discount_bdt, total_amount_bdt,
            paid_amount_bdt, due_amount_bdt, status, created_by, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, 'Dhanmondi Main Center', $6::jsonb,
            $7, 0, 0, 0, $7, 0, $7, 'unpaid', $8, NOW(), NOW()
          )
          RETURNING *
          `,
          [
            newInvId,
            generateCode('INV'),
            rawPkg.patientId,
            rawPkg.patientName,
            actor.branchId || 'br-dhanmondi',
            JSON.stringify([
              {
                id: `it-${Date.now()}`,
                description: `${rawPkg.packageName} (${rawPkg.totalSessions} Sessions)`,
                quantity: 1,
                unitPriceBDT: rawPkg.priceBDT,
                discountBDT: 0,
                totalBDT: rawPkg.priceBDT,
              },
            ]),
            rawPkg.priceBDT,
            actor.name,
          ]
        );
        invRow = createdInv.rows[0];
        await client.query('UPDATE treatment_packages SET invoice_id = $2 WHERE id = $1', [
          packageId,
          invRow.id,
        ]);
        rawPkg.invoiceId = String(invRow.id);
      }

      const invoiceId = String(invRow.id);
      const totalAmount = toNumber(invRow.total_amount_bdt, rawPkg.priceBDT);
      const currentPaid = await getValidPaidForInvoice(invoiceId, client);
      const currentDue = Math.max(0, totalAmount - currentPaid);

      if (input.amountBDT > currentDue + 0.01) {
        const err = new Error(
          `Payment amount ৳ ${input.amountBDT} exceeds remaining due amount ৳ ${currentDue.toFixed(2)}`
        ) as Error & { statusCode?: number; code?: string };
        err.statusCode = 422;
        err.code = 'EXCEEDS_DUE_AMOUNT';
        throw err;
      }

      const payId = `pay-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const payRes = await client.query(
        `
        INSERT INTO payment_records (
          id, invoice_id, receipt_number, amount_bdt, method, transaction_ref, paid_at, received_by, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'valid')
        RETURNING *
        `,
        [
          payId,
          invoiceId,
          generateCode('RCP'),
          input.amountBDT,
          input.method,
          input.transactionRef || `${input.method.toUpperCase()}-${crypto.randomInt(1000, 9999)}`,
          actor.name,
        ]
      );
      const payment = mapPaymentRow(payRes.rows[0]);

      const newPaidAmount = await getValidPaidForInvoice(invoiceId, client);
      const newDueAmount = Math.max(0, totalAmount - newPaidAmount);
      const invStatus = newDueAmount <= 0.01 ? 'paid' : 'partially_paid';

      const updatedInvRes = await client.query(
        `
        UPDATE invoices
        SET paid_amount_bdt = $2, due_amount_bdt = $3, status = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [invoiceId, newPaidAmount, newDueAmount, invStatus]
      );

      await client.query(
        `
        UPDATE treatment_packages
        SET paid_amount_bdt = $2, due_amount_bdt = $3, updated_at = NOW()
        WHERE id = $1
        `,
        [packageId, newPaidAmount, Math.max(0, rawPkg.priceBDT - newPaidAmount)]
      );

      const allPays = await client.query(
        'SELECT * FROM payment_records WHERE invoice_id = $1 ORDER BY paid_at ASC',
        [invoiceId]
      );
      const invoice = mapInvoiceRow(updatedInvRes.rows[0], allPays.rows.map(mapPaymentRow));
      const updatedPkg = applyPackageFinancials(rawPkg, newPaidAmount);

      await pgLogAuditEvent(
        actor,
        'PACKAGE_PAYMENT_RECORDED',
        'package',
        rawPkg.id,
        `Recorded package installment of ৳ ${payment.amountBDT.toLocaleString()} via ${payment.method} (${payment.receiptNumber}). Linked Invoice: ${invoice.invoiceNumber}. Remaining due: ৳ ${newDueAmount.toFixed(2)}`,
        ipAddress,
        client
      );

      return { package: updatedPkg, invoice, payment };
    });
  },

  async deductSession(
    input: {
      packageId: string;
      treatmentNotes: string;
      machineSettings?: string;
      therapistName: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<{ package: TreatmentPackage; deduction: PackageDeduction }> {
    return withPgTransaction(async (client) => {
      // Lock package row to guarantee concurrency-safe non-duplicate deduction
      const pkgRes = await client.query('SELECT * FROM treatment_packages WHERE id = $1 FOR UPDATE', [
        input.packageId,
      ]);
      if (pkgRes.rows.length === 0) {
        const err = new Error('Package not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const rawPkg = mapRawPackageRow(pkgRes.rows[0]);
      if (rawPkg.remainingSessions <= 0 || rawPkg.completedSessions >= rawPkg.totalSessions) {
        const err = new Error(
          `Cannot deduct session: All ${rawPkg.totalSessions} sessions of package "${rawPkg.packageName}" have already been completed.`
        ) as Error & { statusCode?: number; code?: string };
        err.statusCode = 409;
        err.code = 'PACKAGE_EXHAUSTED';
        throw err;
      }

      const nextSessionNumber = rawPkg.completedSessions + 1;
      const financial = await enrichPackageWithDerivedFinancials(rawPkg, client);
      const unlockedSessions = financial.unlockedSessions ?? 0;

      if (rawPkg.completedSessions >= unlockedSessions) {
        const perSession = financial.perSessionPriceBDT || rawPkg.priceBDT / rawPkg.totalSessions;
        const neededCumulative = nextSessionNumber * perSession;
        const currentPaid = financial.paidAmountBDT || 0;
        const neededNow = Math.max(0, Math.round(neededCumulative - currentPaid));
        const err = new Error(
          `সেশন #${nextSessionNumber} এর ফি অপরিশোধিত। সেশনের বিল বাকি (Due) রেখে ট্রিটমেন্ট গ্রহণ অনুমোদিত নয়। এই সেশনটি আনলক করতে সর্বনিম্ন ৳ ${neededNow.toLocaleString('en-BD')} অগ্রিম/কিস্তি পরিশোধ করুন।`
        ) as Error & { statusCode?: number; code?: string; details?: unknown };
        err.statusCode = 402;
        err.code = 'SESSION_PAYMENT_REQUIRED';
        err.details = {
          packageId: rawPkg.id,
          packageName: rawPkg.packageName,
          patientName: rawPkg.patientName,
          nextSessionNumber,
          perSessionPriceBDT: perSession,
          currentPaidBDT: currentPaid,
          neededPaymentBDT: neededNow,
          totalDueBDT: financial.dueAmountBDT,
          invoiceId: rawPkg.invoiceId,
          unlockedSessions,
        };
        throw err;
      }

      const dupCheck = await client.query(
        'SELECT deducted_at FROM package_deductions WHERE package_id = $1 AND session_number = $2',
        [rawPkg.id, nextSessionNumber]
      );
      if (dupCheck.rows.length > 0) {
        const err = new Error(
          `Session #${nextSessionNumber} has already been logged on ${toIsoString(dupCheck.rows[0].deducted_at)}. Cannot deduct twice.`
        ) as Error & { statusCode?: number; code?: string };
        err.statusCode = 409;
        err.code = 'DUPLICATE_SESSION_DEDUCTION';
        throw err;
      }

      const newCompleted = rawPkg.completedSessions + 1;
      const newRemaining = rawPkg.remainingSessions - 1;
      const newStatus = newRemaining === 0 ? 'completed' : rawPkg.status;

      const updatedPkgRes = await client.query(
        `
        UPDATE treatment_packages
        SET completed_sessions = $2, remaining_sessions = $3, status = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [rawPkg.id, newCompleted, newRemaining, newStatus]
      );

      const dedId = `ded-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const dedRes = await client.query(
        `
        INSERT INTO package_deductions (
          id, package_id, patient_id, session_number, deducted_at,
          therapist_id, therapist_name, treatment_notes, machine_settings
        )
        VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
        RETURNING *
        `,
        [
          dedId,
          rawPkg.id,
          rawPkg.patientId,
          nextSessionNumber,
          actor.id,
          input.therapistName || actor.name,
          input.treatmentNotes,
          input.machineSettings || null,
        ]
      );

      const deduction = mapDeductionRow(dedRes.rows[0]);
      const updatedFinancial = applyPackageFinancials(
        mapRawPackageRow(updatedPkgRes.rows[0]),
        financial.paidAmountBDT || 0
      );

      await pgLogAuditEvent(
        actor,
        'PACKAGE_SESSION_DEDUCTED',
        'package',
        rawPkg.id,
        `Deducted session ${nextSessionNumber}/${rawPkg.totalSessions} for patient ${rawPkg.patientName}. Remaining: ${newRemaining}`,
        ipAddress,
        client
      );

      return { package: updatedFinancial, deduction };
    });
  },

  // ---------------------------------------------------------------------------
  // Invoices & Derived Payment Receipts (ACID)
  // ---------------------------------------------------------------------------
  async listInvoices(filters: { patientId?: string; status?: string }): Promise<Invoice[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.patientId) {
      params.push(filters.patientId);
      conditions.push(`patient_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const invRes = await pgQuery(`SELECT * FROM invoices ${where} ORDER BY created_at DESC`, params);
    const invIds = invRes.rows.map((r) => String(r.id));

    const payMap = new Map<string, PaymentRecord[]>();
    if (invIds.length > 0) {
      const payRes = await pgQuery(
        'SELECT * FROM payment_records WHERE invoice_id = ANY($1::text[]) ORDER BY paid_at ASC',
        [invIds]
      );
      for (const row of payRes.rows) {
        const rec = mapPaymentRow(row);
        const arr = payMap.get(rec.invoiceId) || [];
        arr.push(rec);
        payMap.set(rec.invoiceId, arr);
      }
    }

    return invRes.rows.map((r) => mapInvoiceRow(r, payMap.get(String(r.id)) || []));
  },

  async createInvoice(
    data: {
      patientId: string;
      branchId: string;
      items: Array<{ description: string; quantity: number; unitPriceBDT: number; discountBDT: number }>;
      discountBDT: number;
      vatPercent: number;
    },
    actor: User,
    ipAddress: string
  ): Promise<Invoice> {
    return withPgTransaction(async (client) => {
      const ptRes = await client.query('SELECT * FROM patients WHERE id = $1', [data.patientId]);
      if (ptRes.rows.length === 0) {
        const err = new Error('Patient not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
      const pt = ptRes.rows[0];

      const brRes = await client.query('SELECT id, name FROM branches WHERE id = $1', [data.branchId]);
      const branch = brRes.rows[0] || { id: 'br-dhanmondi', name: 'Dhanmondi Main Center' };

      let subtotal = 0;
      const computedItems = data.items.map((it, idx) => {
        const itemTotal = it.quantity * it.unitPriceBDT - it.discountBDT;
        subtotal += itemTotal;
        return {
          id: `it-${Date.now()}-${idx}`,
          description: it.description,
          quantity: it.quantity,
          unitPriceBDT: it.unitPriceBDT,
          discountBDT: it.discountBDT,
          totalBDT: itemTotal,
        };
      });

      const vatAmount = (subtotal * data.vatPercent) / 100;
      const totalAmount = Math.max(0, subtotal + vatAmount - data.discountBDT);
      const id = `inv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const invoiceNumber = generateCode('INV');

      const res = await client.query(
        `
        INSERT INTO invoices (
          id, invoice_number, patient_id, patient_name, patient_phone, patient_age,
          patient_gender, patient_code, branch_id, branch_name, items,
          subtotal_bdt, vat_percent, vat_amount_bdt, discount_bdt, total_amount_bdt,
          paid_amount_bdt, due_amount_bdt, status, created_by, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11::jsonb,
          $12, $13, $14, $15, $16,
          0, $16, 'unpaid', $17, NOW(), NOW()
        )
        RETURNING *
        `,
        [
          id,
          invoiceNumber,
          pt.id,
          pt.name,
          pt.phone,
          pt.age ?? 31,
          pt.gender || 'female',
          pt.patient_id_code || pt.id,
          branch.id,
          branch.name,
          JSON.stringify(computedItems),
          subtotal,
          data.vatPercent,
          vatAmount,
          data.discountBDT,
          totalAmount,
          actor.name,
        ]
      );

      const invoice = mapInvoiceRow(res.rows[0], []);
      await pgLogAuditEvent(
        actor,
        'INVOICE_CREATED',
        'invoice',
        invoice.id,
        `Generated invoice ${invoice.invoiceNumber} for ${pt.name} totaling ৳ ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        ipAddress,
        client
      );
      return invoice;
    });
  },

  async recordInvoicePayment(
    invoiceId: string,
    input: { amountBDT: number; method: PaymentMethod; transactionRef?: string },
    actor: User,
    ipAddress: string
  ): Promise<{ invoice: Invoice; payment: PaymentRecord }> {
    return withPgTransaction(async (client) => {
      const invRes = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      if (invRes.rows.length === 0) {
        const err = new Error('Invoice not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
      const invRow = invRes.rows[0];
      if (invRow.status === 'void') {
        const err = new Error('Cannot accept payment for a voided invoice') as Error & {
          statusCode?: number;
          code?: string;
        };
        err.statusCode = 409;
        err.code = 'INVOICE_VOIDED';
        throw err;
      }

      const totalAmount = toNumber(invRow.total_amount_bdt, 0);
      const currentPaid = await getValidPaidForInvoice(invoiceId, client);
      const currentDue = Math.max(0, totalAmount - currentPaid);

      if (input.amountBDT > currentDue + 0.01) {
        const err = new Error(
          `Payment amount ৳ ${input.amountBDT} exceeds remaining due amount ৳ ${currentDue.toFixed(2)}`
        ) as Error & { statusCode?: number; code?: string };
        err.statusCode = 422;
        err.code = 'EXCEEDS_DUE_AMOUNT';
        throw err;
      }

      const payId = `pay-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const payRes = await client.query(
        `
        INSERT INTO payment_records (
          id, invoice_id, receipt_number, amount_bdt, method, transaction_ref, paid_at, received_by, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'valid')
        RETURNING *
        `,
        [
          payId,
          invoiceId,
          generateCode('RCP'),
          input.amountBDT,
          input.method,
          input.transactionRef || `${input.method.toUpperCase()}-${crypto.randomInt(1000, 9999)}`,
          actor.name,
        ]
      );
      const payment = mapPaymentRow(payRes.rows[0]);

      const newPaidAmount = await getValidPaidForInvoice(invoiceId, client);
      const newDueAmount = Math.max(0, totalAmount - newPaidAmount);
      const nextStatus = newDueAmount <= 0.01 ? 'paid' : 'partially_paid';

      const updInvRes = await client.query(
        `
        UPDATE invoices
        SET paid_amount_bdt = $2, due_amount_bdt = $3, status = $4, payment_method = $5, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [invoiceId, newPaidAmount, newDueAmount, nextStatus, input.method]
      );

      // Sync linked treatment package financials if any
      await client.query(
        `
        UPDATE treatment_packages
        SET paid_amount_bdt = $2, due_amount_bdt = GREATEST(0, price_bdt - $2), updated_at = NOW()
        WHERE invoice_id = $1
        `,
        [invoiceId, newPaidAmount]
      );

      const allPays = await client.query(
        'SELECT * FROM payment_records WHERE invoice_id = $1 ORDER BY paid_at ASC',
        [invoiceId]
      );
      const invoice = mapInvoiceRow(updInvRes.rows[0], allPays.rows.map(mapPaymentRow));

      await pgLogAuditEvent(
        actor,
        'PAYMENT_RECORDED',
        'invoice',
        invoice.id,
        `Recorded payment of ৳ ${payment.amountBDT.toLocaleString('en-US', { minimumFractionDigits: 2 })} via ${payment.method} (${payment.receiptNumber}). Derived due: ৳ ${newDueAmount.toFixed(2)}`,
        ipAddress,
        client
      );

      return { invoice, payment };
    });
  },

  async voidInvoice(
    invoiceId: string,
    reason: string,
    actor: User,
    ipAddress: string
  ): Promise<Invoice> {
    return withPgTransaction(async (client) => {
      const invRes = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [invoiceId]);
      if (invRes.rows.length === 0) {
        const err = new Error('Invoice not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
      if (invRes.rows[0].status === 'void') {
        const err = new Error('Invoice is already voided') as Error & { statusCode?: number; code?: string };
        err.statusCode = 409;
        err.code = 'ALREADY_VOID';
        throw err;
      }

      const invoiceNumber = String(invRes.rows[0].invoice_number);
      await client.query(
        `
        UPDATE payment_records
        SET status = 'reversed', reversal_reason = $2
        WHERE invoice_id = $1 AND status = 'valid'
        `,
        [invoiceId, `Invoice ${invoiceNumber} voided: ${reason}`]
      );

      const updInvRes = await client.query(
        `
        UPDATE invoices
        SET status = 'void', void_reason = $2, voided_at = NOW(), voided_by = $3,
            paid_amount_bdt = 0, due_amount_bdt = total_amount_bdt, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [invoiceId, reason, actor.name]
      );

      const allPays = await client.query(
        'SELECT * FROM payment_records WHERE invoice_id = $1 ORDER BY paid_at ASC',
        [invoiceId]
      );
      const invoice = mapInvoiceRow(updInvRes.rows[0], allPays.rows.map(mapPaymentRow));

      await pgLogAuditEvent(
        actor,
        'INVOICE_VOIDED',
        'invoice',
        invoice.id,
        `Voided invoice ${invoice.invoiceNumber}. Reason: ${reason}. Any related payments marked reversed.`,
        ipAddress,
        client
      );
      return invoice;
    });
  },

  // ---------------------------------------------------------------------------
  // Daily Closing Reports
  // ---------------------------------------------------------------------------
  async listDailyClosings(branchId?: string): Promise<DailyClosingReport[]> {
    const res =
      branchId && branchId !== 'all'
        ? await pgQuery(
            'SELECT * FROM daily_closing_reports WHERE branch_id = $1 ORDER BY closing_date DESC, created_at DESC',
            [branchId]
          )
        : await pgQuery('SELECT * FROM daily_closing_reports ORDER BY closing_date DESC, created_at DESC');

    return res.rows.map((r) => ({
      id: String(r.id),
      closingDate: toDateOnly(r.closing_date),
      cashierId: String(r.cashier_id),
      cashierName: String(r.cashier_name),
      branchId: String(r.branch_id),
      branchName: String(r.branch_name || ''),
      openingCashBDT: toNumber(r.opening_cash_bdt, 0),
      expectedCashBDT: toNumber(r.expected_cash_bdt, 0),
      actualCashCountedBDT: toNumber(r.actual_cash_counted_bdt, 0),
      cashDifferenceBDT: toNumber(r.cash_difference_bdt, 0),
      cardSettlementBDT: toNumber(r.card_settlement_bdt, 0),
      mfsBkashSettlementBDT: toNumber(r.mfs_bkash_settlement_bdt, 0),
      mfsNagadSettlementBDT: toNumber(r.mfs_nagad_settlement_bdt, 0),
      bankTransferBDT: toNumber(r.bank_transfer_bdt, 0),
      totalCollectedBDT: toNumber(r.total_collected_bdt, 0),
      totalInvoicesCount: toNumber(r.total_invoices_count, 0),
      notes: r.notes ? String(r.notes) : undefined,
      status: (r.status as DailyClosingReport['status']) || 'submitted',
      createdAt: toIsoString(r.created_at),
    }));
  },

  async createDailyClosing(
    input: Omit<DailyClosingReport, 'id' | 'cashierId' | 'cashierName' | 'createdAt'>,
    actor: User,
    ipAddress: string
  ): Promise<DailyClosingReport> {
    return withPgTransaction(async (client) => {
      const id = `cls-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const res = await client.query(
        `
        INSERT INTO daily_closing_reports (
          id, closing_date, cashier_id, cashier_name, branch_id, branch_name,
          opening_cash_bdt, expected_cash_bdt, actual_cash_counted_bdt, cash_difference_bdt,
          card_settlement_bdt, mfs_bkash_settlement_bdt, mfs_nagad_settlement_bdt,
          bank_transfer_bdt, total_collected_bdt, total_invoices_count, notes, status, created_at
        )
        VALUES (
          $1, $2::date, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13,
          $14, $15, $16, $17, $18, NOW()
        )
        RETURNING *
        `,
        [
          id,
          input.closingDate,
          actor.id,
          actor.name,
          input.branchId || actor.branchId || 'br-dhanmondi',
          input.branchName || actor.branchName || 'Dhanmondi Main Center',
          input.openingCashBDT || 0,
          input.expectedCashBDT || 0,
          input.actualCashCountedBDT || 0,
          input.cashDifferenceBDT || 0,
          input.cardSettlementBDT || 0,
          input.mfsBkashSettlementBDT || 0,
          input.mfsNagadSettlementBDT || 0,
          input.bankTransferBDT || 0,
          input.totalCollectedBDT || 0,
          input.totalInvoicesCount || 0,
          input.notes || null,
          input.status || 'submitted',
        ]
      );
      await pgLogAuditEvent(
        actor,
        'DAILY_CLOSING_SUBMITTED',
        'daily_closing',
        id,
        `Submitted daily cash closing for ${input.closingDate} — Total collected: ৳ ${input.totalCollectedBDT}`,
        ipAddress,
        client
      );
      const r = res.rows[0];
      return {
        id: String(r.id),
        closingDate: toDateOnly(r.closing_date),
        cashierId: String(r.cashier_id),
        cashierName: String(r.cashier_name),
        branchId: String(r.branch_id),
        branchName: String(r.branch_name || ''),
        openingCashBDT: toNumber(r.opening_cash_bdt, 0),
        expectedCashBDT: toNumber(r.expected_cash_bdt, 0),
        actualCashCountedBDT: toNumber(r.actual_cash_counted_bdt, 0),
        cashDifferenceBDT: toNumber(r.cash_difference_bdt, 0),
        cardSettlementBDT: toNumber(r.card_settlement_bdt, 0),
        mfsBkashSettlementBDT: toNumber(r.mfs_bkash_settlement_bdt, 0),
        mfsNagadSettlementBDT: toNumber(r.mfs_nagad_settlement_bdt, 0),
        bankTransferBDT: toNumber(r.bank_transfer_bdt, 0),
        totalCollectedBDT: toNumber(r.total_collected_bdt, 0),
        totalInvoicesCount: toNumber(r.total_invoices_count, 0),
        notes: r.notes ? String(r.notes) : undefined,
        status: (r.status as DailyClosingReport['status']) || 'submitted',
        createdAt: toIsoString(r.created_at),
      };
    });
  },
};
