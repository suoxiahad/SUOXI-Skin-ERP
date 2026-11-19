import crypto from 'node:crypto';
import type {
  DbId,
  PaymentMethodDto,
  InvoiceDto,
  InvoiceItemDto,
  CreateInvoiceInput,
  VoidInvoiceInput,
  PaymentDto,
  PaymentAllocationDto,
  RecordPaymentInput,
  AllocatePaymentInput,
  RefundDto,
  RequestRefundInput,
  ApproveRefundInput,
  MarkRefundPaidInput,
  PatientDuesDto,
  DailyCollectionReportDto,
  DailyCollectionItemDto,
  ReceiptDto,
  DomainEventDto,
} from '@suoxi/shared-types';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../middleware/errorHandler.js';
import { logAudit } from './auditLogger.js';
import { patientService } from './patientService.js';

interface RequestActor {
  id: DbId;
  fullName?: string;
  role?: string;
  roles?: string[];
  branchId?: DbId;
}

// Role max discount matrix (percentage limit)
const ROLE_MAX_DISCOUNT_PERCENT: Record<string, number> = {
  super_admin: 100,
  admin: 50,
  doctor: 25,
  cashier: 10,
  receptionist: 5,
  call_center: 0,
  therapist: 0,
  inventory_manager: 0,
};

export class BillingService {
  private paymentMethods: Map<string, PaymentMethodDto> = new Map();
  private paymentMethodsByCode: Map<string, PaymentMethodDto> = new Map();
  private invoices: Map<string, InvoiceDto> = new Map();
  private invoiceItems: Map<string, InvoiceItemDto[]> = new Map();
  private payments: Map<string, PaymentDto> = new Map();
  private allocations: Map<string, PaymentAllocationDto> = new Map();
  private refunds: Map<string, RefundDto> = new Map();
  private domainEvents: Map<string, DomainEventDto> = new Map();
  private processedIdempotencyKeys: Map<string, any> = new Map();
  private mutexLocks: Map<string, Promise<void>> = new Map();

  private invoiceSeq = 232;
  private paymentSeq = 2;
  private refundSeq = 1;

  public generateInvoiceNo(): string {
    const year = new Date().getFullYear();
    return `INV-${year}-${String(this.invoiceSeq++).padStart(6, '0')}`;
  }

  public generatePaymentNo(): string {
    const year = new Date().getFullYear();
    return `REC-${year}-${String(this.paymentSeq++).padStart(6, '0')}`;
  }

  public generateRefundNo(): string {
    const year = new Date().getFullYear();
    return `RFD-${year}-${String(this.refundSeq++).padStart(6, '0')}`;
  }

  private async recordAudit(
    actorId: DbId,
    action: string,
    entityType: string,
    entityId: DbId,
    details?: any,
    patientId?: DbId,
    branchId?: DbId,
    reason?: string
  ) {
    try {
      await logAudit(null, {
        actorUserId: actorId,
        action,
        entityType,
        entityId,
        patientId: patientId ?? null,
        branchId: branchId ?? null,
        reason: reason || null,
        payloadAfter: details,
        ipAddress: '127.0.0.1',
      });
    } catch (err: any) {
      console.warn('Audit log error (ignored):', err.message);
    }
  }

  constructor() {
    this.seedPaymentMethods();
    this.seedDevSample();
  }

  public resetData() {
    this.invoices.clear();
    this.invoiceItems.clear();
    this.payments.clear();
    this.allocations.clear();
    this.refunds.clear();
    this.domainEvents.clear();
    this.processedIdempotencyKeys.clear();
    this.mutexLocks.clear();
    this.invoiceSeq = 232;
    this.paymentSeq = 2;
    this.refundSeq = 1;
    this.seedPaymentMethods();
    this.seedDevSample();
  }

  // ============================================================================
  // MUTEX & LOCK ORDERING (Hard Rule 5: lock order patient -> invoice -> payment)
  // ============================================================================
  private async acquireLock(key: string): Promise<() => void> {
    while (this.mutexLocks.has(key)) {
      await this.mutexLocks.get(key);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((res) => {
      resolveLock = res;
    });
    this.mutexLocks.set(key, lockPromise);
    return () => {
      this.mutexLocks.delete(key);
      resolveLock();
    };
  }

  // ============================================================================
  // SEED DATA
  // ============================================================================
  private seedPaymentMethods() {
    this.paymentMethods.clear();
    this.paymentMethodsByCode.clear();
    const methods: PaymentMethodDto[] = [
      {
        id: 1,
        code: 'CASH',
        name: 'Cash',
        nameBn: 'নগদ ক্যাশ',
        requiresReference: false,
        isActive: true,
        sortOrder: 1,
      },
      {
        id: 2,
        code: 'BKASH',
        name: 'bKash Merchant / Personal',
        nameBn: 'বিকাশ',
        requiresReference: true,
        isActive: true,
        sortOrder: 2,
      },
      {
        id: 3,
        code: 'NAGAD',
        name: 'Nagad',
        nameBn: 'নগদ',
        requiresReference: true,
        isActive: true,
        sortOrder: 3,
      },
      {
        id: 4,
        code: 'CARD',
        name: 'POS Card (Visa / Mastercard / Amex)',
        nameBn: 'কার্ড',
        requiresReference: true,
        isActive: true,
        sortOrder: 4,
      },
      {
        id: 5,
        code: 'BANK_TRANSFER',
        name: 'Bank Transfer / EFT',
        nameBn: 'ব্যাংক ট্রান্সফার',
        requiresReference: true,
        isActive: true,
        sortOrder: 5,
      },
    ];
    for (const m of methods) {
      this.paymentMethods.set(String(m.id), m);
      this.paymentMethodsByCode.set(m.code.toUpperCase(), m);
    }
  }

  public resolvePaymentMethod(idOrCode?: DbId | null, code?: string | null): PaymentMethodDto | undefined {
    if (code && code.trim().length > 0) {
      const byCode = this.paymentMethodsByCode.get(code.trim().toUpperCase());
      if (byCode) return byCode;
    }
    if (idOrCode !== undefined && idOrCode !== null && String(idOrCode).trim().length > 0) {
      const key = String(idOrCode).trim();
      const byId = this.paymentMethods.get(key);
      if (byId) return byId;
      return this.paymentMethodsByCode.get(key.toUpperCase());
    }
    return undefined;
  }

  private seedDevSample() {
    // DEV sample: INV-2026-000231, Sumaiya Rahman: HydraFacial x1 ৳ 4,500,
    // discount ৳ 500 ("Returning patient"), total ৳ 4,000,
    // paid ৳ 2,000 via bKash (TrxID 9KD73HX2), due ৳ 2,000.
    const invId = 'inv-sample-01';
    const patientId = 'pt-sumaiya-01';
    const branchId = 'br-dhk-01';

    const item: InvoiceItemDto = {
      id: 'inv-item-01',
      invoiceId: invId,
      itemType: 'treatment',
      serviceId: 'srv-hf-001',
      description: 'HydraFacial Treatment (Clinical Cleansing & Peptide Infusion)',
      quantity: 1,
      unitPrice: '4500.00',
      discountAmount: '500.00',
      lineTotal: '4000.00',
      sortOrder: 1,
      createdAt: '2026-08-01T10:00:00.000Z',
    };

    const invoice: InvoiceDto = {
      id: invId,
      invoiceNo: 'INV-2026-000231',
      patientId,
      patientName: 'Sumaiya Rahman',
      patientCode: 'PAT-000001',
      branchId,
      branchName: 'Dhanmondi Main Clinic',
      invoiceDate: '2026-08-01',
      dueDate: '2026-08-01',
      status: 'partially_paid',
      subtotal: '4500.00',
      discountAmount: '500.00',
      discountPercent: '11.11',
      discountReason: 'Returning patient campaign concession',
      discountAuthorizedBy: 'usr-admin-01',
      discountAuthorizedByName: 'Admin Manager',
      taxAmount: '0.00',
      taxPercent: '0.00',
      totalAmount: '4000.00',
      paidAmount: '2000.00',
      dueAmount: '2000.00',
      createdBy: 'usr-admin-01',
      createdByName: 'Admin Manager',
      issuedAt: '2026-08-01T10:05:00.000Z',
      issuedBy: 'usr-admin-01',
      issuedByName: 'Admin Manager',
      notes: 'Initial HydraFacial consultation & treatment',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:10:00.000Z',
      items: [item],
    };

    this.invoices.set(invId, invoice);
    this.invoiceItems.set(invId, [item]);

    // Payment: ৳ 2,000 via bKash (TrxID 9KD73HX2)
    const paymentId = 'pay-sample-01';
    const payment: PaymentDto = {
      id: paymentId,
      paymentNo: 'REC-2026-000001',
      patientId,
      patientName: 'Sumaiya Rahman',
      patientCode: 'PAT-000001',
      branchId,
      branchName: 'Dhanmondi Main Clinic',
      paymentMethodId: 2,
      paymentMethodCode: 'BKASH',
      paymentMethodName: 'bKash Merchant / Personal',
      amount: '2000.00',
      paymentDate: '2026-08-01T10:10:00.000Z',
      transactionReference: '9KD73HX2',
      notes: 'Initial 50% deposit received via bKash',
      isAdvance: false,
      status: 'completed',
      recordedBy: 'usr-cashier-01',
      recordedByName: 'Tanvir Hossain (Cashier)',
      unallocatedAmount: '0.00',
      allocations: [
        {
          id: 'alloc-sample-01',
          paymentId,
          invoiceId: invId,
          invoiceNo: 'INV-2026-000231',
          amount: '2000.00',
          allocatedAt: '2026-08-01T10:10:00.000Z',
          allocatedBy: 'usr-cashier-01',
        },
      ],
      createdAt: '2026-08-01T10:10:00.000Z',
      updatedAt: '2026-08-01T10:10:00.000Z',
    };

    this.payments.set(paymentId, payment);
    this.allocations.set('alloc-sample-01', payment.allocations![0]);
  }

  // ============================================================================
  // PAYMENT METHODS
  // ============================================================================
  public async getPaymentMethods(): Promise<PaymentMethodDto[]> {
    return Array.from(this.paymentMethods.values())
      .filter((m) => m.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // ============================================================================
  // DERIVED BALANCES (Hard Rule 4: Paid amount & Due are ALWAYS derived)
  // ============================================================================
  public calculateInvoiceBalances(invoice: InvoiceDto): {
    paidAmount: string;
    dueAmount: string;
    paymentStatus: InvoiceDto['status'];
  } {
    if (invoice.status === 'void') {
      return {
        paidAmount: '0.00',
        dueAmount: '0.00',
        paymentStatus: 'void',
      };
    }

    let allocatedSum = 0;
    for (const alloc of this.allocations.values()) {
      if (alloc.invoiceId === invoice.id) {
        allocatedSum += Number(alloc.amount);
      }
    }

    let refundedSum = 0;
    for (const ref of this.refunds.values()) {
      if (ref.invoiceId === invoice.id && ref.status === 'paid') {
        refundedSum += Number(ref.amount);
      }
    }

    const netPaid = Math.max(0, allocatedSum - refundedSum);
    const totalAmount = Number(invoice.totalAmount);
    const due = Math.max(0, totalAmount - netPaid);

    let status: InvoiceDto['status'] = invoice.status;
    if (invoice.status !== 'draft') {
      if (due === 0 && totalAmount > 0) {
        status = 'paid';
      } else if (netPaid > 0 && due > 0) {
        status = 'partially_paid';
      } else {
        status = 'unpaid';
      }
    }

    return {
      paidAmount: netPaid.toFixed(2),
      dueAmount: due.toFixed(2),
      paymentStatus: status,
    };
  }

  public calculatePaymentBalances(payment: PaymentDto): {
    allocatedAmount: string;
    refundedAmount: string;
    unallocatedAmount: string;
  } {
    let allocatedSum = 0;
    for (const alloc of this.allocations.values()) {
      if (alloc.paymentId === payment.id) {
        allocatedSum += Number(alloc.amount);
      }
    }

    let refundedSum = 0;
    for (const ref of this.refunds.values()) {
      if (ref.sourcePaymentId === payment.id && ref.status === 'paid') {
        refundedSum += Number(ref.amount);
      }
    }

    const totalAmount = Number(payment.amount);
    const unallocated = Math.max(0, totalAmount - allocatedSum - refundedSum);

    return {
      allocatedAmount: allocatedSum.toFixed(2),
      refundedAmount: refundedSum.toFixed(2),
      unallocatedAmount: unallocated.toFixed(2),
    };
  }

  // ============================================================================
  // INVOICES (CRUD, Server-side Recomputations, Discount Limits)
  // ============================================================================
  public async listInvoices(filters?: {
    patientId?: DbId;
    branchId?: DbId;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<InvoiceDto[]> {
    let list = Array.from(this.invoices.values());

    if (filters?.patientId !== undefined && filters.patientId !== '') {
      const pid = String(filters.patientId);
      list = list.filter((i) => String(i.patientId) === pid);
    }
    if (filters?.branchId !== undefined && filters.branchId !== '') {
      const bid = String(filters.branchId);
      list = list.filter((i) => String(i.branchId) === bid);
    }
    if (filters?.status) {
      list = list.filter((i) => i.status === filters.status);
    }
    if (filters?.startDate) {
      list = list.filter((i) => i.invoiceDate >= filters.startDate!);
    }
    if (filters?.endDate) {
      list = list.filter((i) => i.invoiceDate <= filters.endDate!);
    }

    // Sort descending by date, invoiceNo
    list.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate) || b.invoiceNo.localeCompare(a.invoiceNo));

    // Attach items and real-time derived balances
    return list.map((inv) => {
      const balances = this.calculateInvoiceBalances(inv);
      return {
        ...inv,
        paidAmount: balances.paidAmount,
        dueAmount: balances.dueAmount,
        status: balances.paymentStatus,
        items: this.invoiceItems.get(inv.id) || [],
      };
    });
  }

  public async getInvoiceById(id: DbId): Promise<InvoiceDto> {
    const key = String(id);
    const inv = this.invoices.get(key);
    if (!inv) {
      throw new NotFoundError(`Invoice with ID '${key}' not found`);
    }
    const balances = this.calculateInvoiceBalances(inv);
    return {
      ...inv,
      paidAmount: balances.paidAmount,
      dueAmount: balances.dueAmount,
      status: balances.paymentStatus,
      items: this.invoiceItems.get(inv.id) || [],
    };
  }

  public async createInvoice(input: CreateInvoiceInput, actor: RequestActor): Promise<InvoiceDto> {
    if (!input.patientId) throw new ValidationError('Patient is required');
    if (!input.branchId) throw new ValidationError('Branch is required');
    if (!input.items || input.items.length === 0) {
      throw new ValidationError('Invoice must contain at least one line item');
    }

    const patientIdStr = String(input.patientId);
    const branchIdStr = String(input.branchId);
    const actorIdStr = String(actor.id);

    // Verify patient
    const patient = await patientService.getPatientById(patientIdStr);
    if (!patient) throw new NotFoundError(`Patient '${patientIdStr}' not found`);

    // Lock patient scope
    const releasePatientLock = await this.acquireLock(`patient:${patientIdStr}`);

    try {
      // Server recalculates all totals (rule: client totals are display-only and ignored)
      let subtotalNum = 0;
      const itemsToInsert: InvoiceItemDto[] = [];
      const invoiceId = `inv-${crypto.randomUUID()}`;

      for (let i = 0; i < input.items.length; i++) {
        const raw = input.items[i];
        const qty = Math.max(1, Math.floor(raw.quantity || 1));
        const unitPriceNum = Number(raw.unitPrice || 0);
        if (unitPriceNum < 0) throw new ValidationError('Unit price cannot be negative');

        const lineGross = qty * unitPriceNum;
        const lineDiscountNum = Math.min(lineGross, Math.max(0, Number(raw.discountAmount || 0)));
        const lineTotalNum = lineGross - lineDiscountNum;

        subtotalNum += lineTotalNum;

        itemsToInsert.push({
          id: `invi-${crypto.randomUUID()}`,
          invoiceId,
          itemType: raw.itemType,
          serviceId: raw.serviceId ? String(raw.serviceId) : null,
          packageId: raw.packageId ? String(raw.packageId) : null,
          productId: raw.productId ? String(raw.productId) : null,
          description: raw.description,
          quantity: qty,
          unitPrice: unitPriceNum.toFixed(2),
          discountAmount: lineDiscountNum.toFixed(2),
          lineTotal: lineTotalNum.toFixed(2),
          sortOrder: i + 1,
          createdAt: new Date().toISOString(),
        });
      }

      // Invoice-level discount computation
      let discountAmountNum = 0;
      let discountPercentNum = 0;

      if (input.discountPercent) {
        discountPercentNum = Math.min(100, Math.max(0, Number(input.discountPercent)));
        discountAmountNum = (subtotalNum * discountPercentNum) / 100;
      } else if (input.discountAmount) {
        discountAmountNum = Math.min(subtotalNum, Math.max(0, Number(input.discountAmount)));
        discountPercentNum = subtotalNum > 0 ? (discountAmountNum / subtotalNum) * 100 : 0;
      }

      // Check discount authorization against staff role limits
      const actorRole = actor.role || (actor.roles && actor.roles[0]) || 'receptionist';
      const actorMaxDiscount = ROLE_MAX_DISCOUNT_PERCENT[actorRole] ?? 0;

      if (discountPercentNum > actorMaxDiscount) {
        if (!input.discountAuthorizedBy) {
          throw new ForbiddenError(
            `Discount of ${discountPercentNum.toFixed(1)}% exceeds your role limit of ${actorMaxDiscount}%. Authorization required from supervisor.`
          );
        }
        // Audit log the authorized discount override
        await this.recordAudit(
          actorIdStr,
          'DISCOUNT_AUTHORIZED',
          'invoice',
          invoiceId,
          {
            discountPercent: discountPercentNum.toFixed(2),
            discountAmount: discountAmountNum.toFixed(2),
            authorizedBy: String(input.discountAuthorizedBy),
            reason: input.discountReason || 'Discount authorization approved',
          },
          patientIdStr,
          branchIdStr
        );
      }

      // Tax computation
      const taxPercentNum = Math.max(0, Number(input.taxPercent || 0));
      const taxableBase = Math.max(0, subtotalNum - discountAmountNum);
      const taxAmountNum = (taxableBase * taxPercentNum) / 100;
      const totalAmountNum = taxableBase + taxAmountNum;

      // Generate Invoice Number
      const invoiceNo = this.generateInvoiceNo();

      const now = new Date().toISOString();
      const status: InvoiceDto['status'] = input.issueImmediately ? 'unpaid' : 'draft';

      const invoice: InvoiceDto = {
        id: invoiceId,
        invoiceNo,
        patientId: patientIdStr,
        patientName: patient.full_name,
        patientCode: patient.patient_code,
        branchId: branchIdStr,
        branchName: branchIdStr === 'br-dhk-01' ? 'Dhanmondi Main Clinic' : 'Uttara Branch',
        appointmentId: input.appointmentId ? String(input.appointmentId) : null,
        consultationId: input.consultationId ? String(input.consultationId) : null,
        invoiceDate: input.invoiceDate || now.split('T')[0],
        dueDate: input.dueDate || input.invoiceDate || now.split('T')[0],
        status,
        subtotal: subtotalNum.toFixed(2),
        discountAmount: discountAmountNum.toFixed(2),
        discountPercent: discountPercentNum.toFixed(2),
        discountReason: input.discountReason || null,
        discountAuthorizedBy: input.discountAuthorizedBy ? String(input.discountAuthorizedBy) : null,
        discountAuthorizedByName: input.discountAuthorizedBy ? 'Dr. Medical Director' : null,
        taxAmount: taxAmountNum.toFixed(2),
        taxPercent: taxPercentNum.toFixed(2),
        totalAmount: totalAmountNum.toFixed(2),
        paidAmount: '0.00',
        dueAmount: totalAmountNum.toFixed(2),
        issuedAt: input.issueImmediately ? now : null,
        issuedBy: input.issueImmediately ? actorIdStr : null,
        issuedByName: input.issueImmediately ? actor.fullName || 'Staff User' : null,
        createdBy: actorIdStr,
        createdByName: actor.fullName || 'Staff User',
        notes: input.notes || null,
        createdAt: now,
        updatedAt: now,
        items: itemsToInsert,
      };

      this.invoices.set(invoiceId, invoice);
      this.invoiceItems.set(invoiceId, itemsToInsert);

      await this.recordAudit(
        actorIdStr,
        'INVOICE_CREATED',
        'invoice',
        invoiceId,
        {
          invoiceNo,
          patientId: patientIdStr,
          totalAmount: invoice.totalAmount,
          status: invoice.status,
        },
        patientIdStr,
        branchIdStr
      );

      return invoice;
    } finally {
      releasePatientLock();
    }
  }

  public async issueInvoice(id: DbId, actor: RequestActor): Promise<InvoiceDto> {
    const key = String(id);
    const inv = this.invoices.get(key);
    if (!inv) throw new NotFoundError(`Invoice with ID '${key}' not found`);

    if (inv.status !== 'draft') {
      throw new ValidationError(`Invoice ${inv.invoiceNo} is already ${inv.status}. Only draft invoices can be issued.`);
    }

    const now = new Date().toISOString();
    const actorIdStr = String(actor.id);
    inv.status = 'unpaid';
    inv.issuedAt = now;
    inv.issuedBy = actorIdStr;
    inv.issuedByName = actor.fullName || 'Staff User';
    inv.updatedAt = now;

    await this.recordAudit(
      actorIdStr,
      'INVOICE_ISSUED',
      'invoice',
      key,
      { invoiceNo: inv.invoiceNo, totalAmount: inv.totalAmount },
      inv.patientId,
      inv.branchId
    );

    const balances = this.calculateInvoiceBalances(inv);
    return {
      ...inv,
      paidAmount: balances.paidAmount,
      dueAmount: balances.dueAmount,
      status: balances.paymentStatus,
      items: this.invoiceItems.get(key) || [],
    };
  }

  public async voidInvoice(id: DbId, input: VoidInvoiceInput, actor: RequestActor): Promise<InvoiceDto> {
    if (!input.voidReason || input.voidReason.trim().length === 0) {
      throw new ValidationError('A detailed reason is required to void an invoice (Hard Rule 3 & 6)');
    }

    const key = String(id);
    const inv = this.invoices.get(key);
    if (!inv) throw new NotFoundError(`Invoice with ID '${key}' not found`);

    if (inv.status === 'void') {
      throw new ValidationError(`Invoice ${inv.invoiceNo} is already voided.`);
    }

    // Check if invoice has allocations
    const balances = this.calculateInvoiceBalances(inv);
    if (Number(balances.paidAmount) > 0) {
      throw new ConflictError(
        `Cannot void invoice ${inv.invoiceNo} because it has active payment allocations (৳ ${balances.paidAmount}). Please refund or reallocate payments before voiding.`
      );
    }

    const now = new Date().toISOString();
    const actorIdStr = String(actor.id);
    inv.status = 'void';
    inv.voidReason = input.voidReason;
    inv.voidedAt = now;
    inv.voidedBy = actorIdStr;
    inv.voidedByName = actor.fullName || 'Staff User';
    inv.updatedAt = now;

    await this.recordAudit(
      actorIdStr,
      'INVOICE_VOIDED',
      'invoice',
      key,
      { invoiceNo: inv.invoiceNo, reason: input.voidReason },
      inv.patientId,
      inv.branchId,
      input.voidReason
    );

    return {
      ...inv,
      paidAmount: '0.00',
      dueAmount: '0.00',
      status: 'void',
      items: this.invoiceItems.get(key) || [],
    };
  }

  // ============================================================================
  // RECORD PAYMENT (RECEIPTS, Hard Rule 5: Atomic, Idempotency-Key, Locking Order)
  // ============================================================================
  public async recordPayment(
    input: RecordPaymentInput,
    idempotencyKey: string | undefined,
    actor: RequestActor
  ): Promise<PaymentDto> {
    // 1. Idempotency Check
    if (idempotencyKey) {
      const cached = this.processedIdempotencyKeys.get(idempotencyKey);
      if (cached) {
        return cached as PaymentDto;
      }
    }

    // 2. Validate amount & method
    const amountNum = Number(input.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }

    const method = this.resolvePaymentMethod(input.paymentMethodId, input.paymentMethodCode);
    if (!method || !method.isActive) {
      throw new ValidationError(
        `Invalid or inactive payment method: '${input.paymentMethodCode || input.paymentMethodId || ''}'`
      );
    }

    // Check transaction reference requirement
    if (method.requiresReference) {
      if (!input.transactionReference || input.transactionReference.trim().length === 0) {
        throw new ValidationError(`Transaction reference (TrxID) is required for ${method.name}`);
      }
    }

    // Check UNIQUE(payment_method_id, transaction_reference)
    if (input.transactionReference) {
      for (const p of this.payments.values()) {
        if (
          String(p.paymentMethodId) === String(method.id) &&
          p.transactionReference &&
          p.transactionReference.toLowerCase() === input.transactionReference.toLowerCase()
        ) {
          throw new ConflictError(
            `A payment with ${method.name} transaction reference '${input.transactionReference}' already exists (Payment No: ${p.paymentNo})`
          );
        }
      }
    }

    const patientIdStr = String(input.patientId);
    const branchIdStr = String(input.branchId);
    const actorIdStr = String(actor.id);

    // Verify patient
    const patient = await patientService.getPatientById(patientIdStr);
    if (!patient) throw new NotFoundError(`Patient '${patientIdStr}' not found`);

    // 3. Locking Order: patient -> invoices -> payment
    const releasePatientLock = await this.acquireLock(`patient:${patientIdStr}`);

    try {
      // Validate allocations
      const allocationRecords: PaymentAllocationDto[] = [];
      let totalAllocatedNum = 0;

      if (input.allocations && input.allocations.length > 0) {
        for (const alloc of input.allocations) {
          const allocAmount = Number(alloc.amount);
          if (isNaN(allocAmount) || allocAmount <= 0) {
            throw new ValidationError('Allocation amount must be greater than zero');
          }

          const invKey = String(alloc.invoiceId);
          const invoice = this.invoices.get(invKey);
          if (!invoice) {
            throw new NotFoundError(`Target invoice '${invKey}' not found`);
          }
          if (invoice.status === 'draft') {
            throw new ValidationError(`Cannot allocate payment to draft invoice ${invoice.invoiceNo}. Issue it first.`);
          }
          if (invoice.status === 'void') {
            throw new ValidationError(`Cannot allocate payment to void invoice ${invoice.invoiceNo}.`);
          }

          const balances = this.calculateInvoiceBalances(invoice);
          const currentDue = Number(balances.dueAmount);

          if (allocAmount > currentDue + 0.001) {
            throw new ConflictError(
              `Allocation of ৳ ${allocAmount.toFixed(2)} exceeds invoice ${invoice.invoiceNo} due balance of ৳ ${currentDue.toFixed(2)}`
            );
          }

          totalAllocatedNum += allocAmount;
        }

        if (totalAllocatedNum > amountNum + 0.001) {
          throw new ValidationError(
            `Sum of invoice allocations (৳ ${totalAllocatedNum.toFixed(2)}) cannot exceed payment amount (৳ ${amountNum.toFixed(2)})`
          );
        }
      }

      // Generate Receipt / Payment Number
      const paymentNo = this.generatePaymentNo();
      const paymentId = `pay-${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      // Create allocations
      if (input.allocations && input.allocations.length > 0) {
        for (const alloc of input.allocations) {
          const invKey = String(alloc.invoiceId);
          const allocId = `alloc-${crypto.randomUUID()}`;
          const targetInv = this.invoices.get(invKey)!;
          const rec: PaymentAllocationDto = {
            id: allocId,
            paymentId,
            invoiceId: invKey,
            invoiceNo: targetInv.invoiceNo,
            amount: Number(alloc.amount).toFixed(2),
            allocatedAt: now,
            allocatedBy: actorIdStr,
          };
          this.allocations.set(allocId, rec);
          allocationRecords.push(rec);
        }
      }

      const unallocatedAmount = Math.max(0, amountNum - totalAllocatedNum).toFixed(2);

      const payment: PaymentDto = {
        id: paymentId,
        paymentNo,
        patientId: patientIdStr,
        patientName: patient.full_name,
        patientCode: patient.patient_code,
        branchId: branchIdStr,
        branchName: branchIdStr === 'br-dhk-01' ? 'Dhanmondi Main Clinic' : 'Uttara Branch',
        paymentMethodId: method.id,
        paymentMethodCode: method.code,
        paymentMethodName: method.name,
        amount: amountNum.toFixed(2),
        paymentDate: input.paymentDate || now,
        transactionReference: input.transactionReference || null,
        notes: input.notes || null,
        isAdvance: Boolean(input.isAdvance || totalAllocatedNum === 0),
        status: 'completed',
        recordedBy: actorIdStr,
        recordedByName: actor.fullName || 'Staff User',
        unallocatedAmount,
        allocations: allocationRecords,
        createdAt: now,
        updatedAt: now,
      };

      this.payments.set(paymentId, payment);

      // 4. Transactional Outbox Event ('payment.recorded')
      const domainEventId = `evt-${crypto.randomUUID()}`;
      this.domainEvents.set(domainEventId, {
        id: domainEventId,
        eventType: 'payment.recorded',
        aggregateType: 'payment',
        aggregateId: paymentId,
        payload: {
          paymentId,
          paymentNo,
          patientId: patientIdStr,
          amount: payment.amount,
          paymentMethodCode: method.code,
          allocations: allocationRecords.map((a) => ({
            invoiceId: a.invoiceId,
            amount: a.amount,
          })),
        },
        createdAt: now,
        processedAt: null,
      });

      // Audit Log
      await this.recordAudit(
        actorIdStr,
        'PAYMENT_RECORDED',
        'payment',
        paymentId,
        {
          paymentNo,
          amount: payment.amount,
          paymentMethod: method.code,
          isAdvance: payment.isAdvance,
          allocationsCount: allocationRecords.length,
        },
        patientIdStr,
        branchIdStr
      );

      // Cache idempotency
      if (idempotencyKey) {
        this.processedIdempotencyKeys.set(idempotencyKey, payment);
      }

      return payment;
    } finally {
      releasePatientLock();
    }
  }

  public async listPayments(filters?: {
    patientId?: DbId;
    branchId?: DbId;
    startDate?: string;
    endDate?: string;
  }): Promise<PaymentDto[]> {
    let list = Array.from(this.payments.values());

    if (filters?.patientId !== undefined && filters.patientId !== '') {
      const pid = String(filters.patientId);
      list = list.filter((p) => String(p.patientId) === pid);
    }
    if (filters?.branchId !== undefined && filters.branchId !== '') {
      const bid = String(filters.branchId);
      list = list.filter((p) => String(p.branchId) === bid);
    }
    if (filters?.startDate) {
      list = list.filter((p) => p.paymentDate >= filters.startDate!);
    }
    if (filters?.endDate) {
      list = list.filter((p) => p.paymentDate <= filters.endDate!);
    }

    list.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

    return list.map((p) => {
      const b = this.calculatePaymentBalances(p);
      const allocs = Array.from(this.allocations.values()).filter((a) => a.paymentId === p.id);
      return {
        ...p,
        unallocatedAmount: b.unallocatedAmount,
        allocations: allocs,
      };
    });
  }

  public async getPaymentById(id: DbId): Promise<PaymentDto> {
    const key = String(id);
    const payment = this.payments.get(key);
    if (!payment) throw new NotFoundError(`Payment with ID '${key}' not found`);

    const b = this.calculatePaymentBalances(payment);
    const allocs = Array.from(this.allocations.values()).filter((a) => a.paymentId === payment.id);

    return {
      ...payment,
      unallocatedAmount: b.unallocatedAmount,
      allocations: allocs,
    };
  }

  // ============================================================================
  // ALLOCATE PAYMENT (Allocate unallocated advance to open invoices)
  // ============================================================================
  public async allocatePayment(
    paymentId: DbId,
    input: AllocatePaymentInput,
    actor: RequestActor
  ): Promise<PaymentDto> {
    const payKey = String(paymentId);
    const payment = this.payments.get(payKey);
    if (!payment) throw new NotFoundError(`Payment with ID '${payKey}' not found`);

    const releasePatientLock = await this.acquireLock(`patient:${payment.patientId}`);

    try {
      const b = this.calculatePaymentBalances(payment);
      const availableUnallocated = Number(b.unallocatedAmount);

      let requestedTotal = 0;
      for (const alloc of input.allocations) {
        const amt = Number(alloc.amount);
        if (isNaN(amt) || amt <= 0) {
          throw new ValidationError('Allocation amount must be greater than zero');
        }
        const invKey = String(alloc.invoiceId);
        const invoice = this.invoices.get(invKey);
        if (!invoice) throw new NotFoundError(`Target invoice '${invKey}' not found`);
        if (invoice.status === 'draft' || invoice.status === 'void') {
          throw new ValidationError(`Cannot allocate to ${invoice.status} invoice ${invoice.invoiceNo}`);
        }

        const invBalances = this.calculateInvoiceBalances(invoice);
        const currentDue = Number(invBalances.dueAmount);
        if (amt > currentDue + 0.001) {
          throw new ConflictError(
            `Allocation of ৳ ${amt.toFixed(2)} exceeds invoice ${invoice.invoiceNo} due balance of ৳ ${currentDue.toFixed(2)}`
          );
        }
        requestedTotal += amt;
      }

      if (requestedTotal > availableUnallocated + 0.001) {
        throw new ValidationError(
          `Sum of allocations (৳ ${requestedTotal.toFixed(2)}) exceeds available unallocated payment balance of ৳ ${availableUnallocated.toFixed(2)}`
        );
      }

      const now = new Date().toISOString();
      const actorIdStr = String(actor.id);
      for (const alloc of input.allocations) {
        const invKey = String(alloc.invoiceId);
        const allocId = `alloc-${crypto.randomUUID()}`;
        const targetInv = this.invoices.get(invKey)!;
        this.allocations.set(allocId, {
          id: allocId,
          paymentId: payKey,
          invoiceId: invKey,
          invoiceNo: targetInv.invoiceNo,
          amount: Number(alloc.amount).toFixed(2),
          allocatedAt: now,
          allocatedBy: actorIdStr,
        });
      }

      await this.recordAudit(
        actorIdStr,
        'PAYMENT_ALLOCATED',
        'payment',
        payKey,
        {
          paymentNo: payment.paymentNo,
          allocatedAmount: requestedTotal.toFixed(2),
        },
        payment.patientId,
        payment.branchId
      );

      return this.getPaymentById(payKey);
    } finally {
      releasePatientLock();
    }
  }

  // ============================================================================
  // REFUNDS (3-Stage Lifecycle: requested -> approved -> paid)
  // ============================================================================
  public async requestRefund(input: RequestRefundInput, actor: RequestActor): Promise<RefundDto> {
    const amt = Number(input.amount);
    if (isNaN(amt) || amt <= 0) {
      throw new ValidationError('Refund amount must be greater than zero');
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new ValidationError('A detailed reason is required for requesting a refund');
    }

    const sourcePayKey = String(input.sourcePaymentId);
    const invoiceKey = input.invoiceId !== undefined && input.invoiceId !== null ? String(input.invoiceId) : undefined;
    const payment = this.payments.get(sourcePayKey);
    if (!payment) {
      throw new NotFoundError(`Source payment '${sourcePayKey}' not found`);
    }

    // Lock source payment row
    const releasePaymentLock = await this.acquireLock(`payment:${payment.id}`);

    try {
      // Calculate refundable balance on this payment
      // Refund cannot exceed (total allocated on payment - already refunded on payment)
      let allocatedOnPayment = 0;
      for (const alloc of this.allocations.values()) {
        if (alloc.paymentId === payment.id) {
          if (!invoiceKey || alloc.invoiceId === invoiceKey) {
            allocatedOnPayment += Number(alloc.amount);
          }
        }
      }

      let alreadyRefundedOnPayment = 0;
      for (const ref of this.refunds.values()) {
        if (ref.sourcePaymentId === payment.id && ref.status !== 'rejected') {
          if (!invoiceKey || ref.invoiceId === invoiceKey) {
            alreadyRefundedOnPayment += Number(ref.amount);
          }
        }
      }

      // If advance payment without allocations, refundable balance is amount - refunds
      const effectiveCap =
        allocatedOnPayment > 0 ? allocatedOnPayment : Number(payment.amount);
      const refundableBalance = Math.max(0, effectiveCap - alreadyRefundedOnPayment);

      if (amt > refundableBalance + 0.001) {
        throw new ValidationError(
          `Refund amount of ৳ ${amt.toFixed(2)} exceeds maximum refundable balance of ৳ ${refundableBalance.toFixed(2)}`
        );
      }

      let resolvedRefundMethod = this.resolvePaymentMethod(
        input.refundMethodId ?? payment.paymentMethodId,
        input.refundMethodCode
      );
      if ((input.refundMethodId !== undefined || input.refundMethodCode) && !resolvedRefundMethod) {
        throw new ValidationError(
          `Invalid or inactive refund method: '${input.refundMethodCode || input.refundMethodId || ''}'`
        );
      }

      const refundNo = this.generateRefundNo();
      const refundId = `ref-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const actorIdStr = String(actor.id);

      let targetInvoiceNo: string | undefined;
      if (invoiceKey) {
        const inv = this.invoices.get(invoiceKey);
        targetInvoiceNo = inv?.invoiceNo;
      }

      const refund: RefundDto = {
        id: refundId,
        refundNo,
        sourcePaymentId: payment.id,
        sourcePaymentNo: payment.paymentNo,
        invoiceId: invoiceKey || null,
        invoiceNo: targetInvoiceNo || null,
        patientId: payment.patientId,
        patientName: payment.patientName,
        branchId: payment.branchId,
        branchName: payment.branchName,
        amount: amt.toFixed(2),
        reason: input.reason,
        status: 'requested',
        refundMethodId: resolvedRefundMethod?.id ?? payment.paymentMethodId,
        refundMethodName: resolvedRefundMethod?.name ?? payment.paymentMethodName,
        requestedBy: actorIdStr,
        requestedByName: actor.fullName || 'Staff User',
        requestedAt: now,
        notes: input.notes || null,
        createdAt: now,
        updatedAt: now,
      };

      this.refunds.set(refundId, refund);

      await this.recordAudit(
        actorIdStr,
        'REFUND_REQUESTED',
        'refund',
        refundId,
        {
          refundNo,
          amount: refund.amount,
          sourcePaymentNo: payment.paymentNo,
          reason: input.reason,
        },
        payment.patientId,
        payment.branchId,
        input.reason
      );

      return refund;
    } finally {
      releasePaymentLock();
    }
  }

  public async approveRefund(id: DbId, input: ApproveRefundInput, actor: RequestActor): Promise<RefundDto> {
    const key = String(id);
    const refund = this.refunds.get(key);
    if (!refund) throw new NotFoundError(`Refund with ID '${key}' not found`);

    if (refund.status !== 'requested') {
      throw new ValidationError(`Refund ${refund.refundNo} is already ${refund.status}. Only requested refunds can be approved.`);
    }

    const now = new Date().toISOString();
    const actorIdStr = String(actor.id);
    refund.status = 'approved';
    refund.approvedBy = actorIdStr;
    refund.approvedByName = actor.fullName || 'Medical Director / Admin';
    refund.approvedAt = now;
    if (input.notes) refund.notes = `${refund.notes ? refund.notes + ' | ' : ''}${input.notes}`;
    refund.updatedAt = now;

    await this.recordAudit(
      actorIdStr,
      'REFUND_APPROVED',
      'refund',
      key,
      { refundNo: refund.refundNo, amount: refund.amount },
      refund.patientId,
      refund.branchId
    );

    return refund;
  }

  public async markRefundPaid(id: DbId, input: MarkRefundPaidInput, actor: RequestActor): Promise<RefundDto> {
    const key = String(id);
    const refund = this.refunds.get(key);
    if (!refund) throw new NotFoundError(`Refund with ID '${key}' not found`);

    if (refund.status !== 'approved') {
      throw new ValidationError(`Refund ${refund.refundNo} must be approved before being marked as paid.`);
    }

    if (input.refundMethodId !== undefined || input.refundMethodCode) {
      const resolvedMethod = this.resolvePaymentMethod(input.refundMethodId, input.refundMethodCode);
      if (!resolvedMethod || !resolvedMethod.isActive) {
        throw new ValidationError(
          `Invalid or inactive refund method: '${input.refundMethodCode || input.refundMethodId || ''}'`
        );
      }
      refund.refundMethodId = resolvedMethod.id;
      refund.refundMethodName = resolvedMethod.name;
    }

    const now = new Date().toISOString();
    const actorIdStr = String(actor.id);
    refund.status = 'paid';
    refund.paidBy = actorIdStr;
    refund.paidByName = actor.fullName || 'Cashier';
    refund.paidAt = now;
    if (input.transactionReference) refund.transactionReference = input.transactionReference;
    if (input.notes) refund.notes = `${refund.notes ? refund.notes + ' | ' : ''}${input.notes}`;
    refund.updatedAt = now;

    // Transactional Outbox Event ('refund.completed')
    const domainEventId = `evt-${crypto.randomUUID()}`;
    this.domainEvents.set(domainEventId, {
      id: domainEventId,
      eventType: 'refund.completed',
      aggregateType: 'refund',
      aggregateId: key,
      payload: {
        refundId: key,
        refundNo: refund.refundNo,
        sourcePaymentId: refund.sourcePaymentId,
        amount: refund.amount,
        patientId: refund.patientId,
      },
      createdAt: now,
      processedAt: null,
    });

    await this.recordAudit(
      actorIdStr,
      'REFUND_PAID',
      'refund',
      key,
      {
        refundNo: refund.refundNo,
        amount: refund.amount,
        transactionReference: refund.transactionReference,
      },
      refund.patientId,
      refund.branchId
    );

    return refund;
  }

  public async listRefunds(filters?: {
    patientId?: DbId;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<RefundDto[]> {
    let list = Array.from(this.refunds.values());

    if (filters?.patientId !== undefined && filters.patientId !== '') {
      const pid = String(filters.patientId);
      list = list.filter((r) => String(r.patientId) === pid);
    }
    if (filters?.status) {
      list = list.filter((r) => r.status === filters.status);
    }
    if (filters?.startDate) {
      list = list.filter((r) => r.createdAt >= filters.startDate!);
    }
    if (filters?.endDate) {
      list = list.filter((r) => r.createdAt <= filters.endDate!);
    }

    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }

  // ============================================================================
  // PATIENT DUES VIEW (v_patient_dues)
  // ============================================================================
  public async getPatientDues(patientId: DbId): Promise<PatientDuesDto> {
    const pid = String(patientId);
    const patientInvoices = Array.from(this.invoices.values()).filter(
      (i) => String(i.patientId) === pid && i.status !== 'void'
    );

    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalDue = 0;

    for (const inv of patientInvoices) {
      const b = this.calculateInvoiceBalances(inv);
      totalInvoiced += Number(inv.totalAmount);
      totalPaid += Number(b.paidAmount);
      totalDue += Number(b.dueAmount);
    }

    // Unallocated advances
    const patientPayments = Array.from(this.payments.values()).filter(
      (p) => String(p.patientId) === pid
    );

    let totalUnallocatedAdvance = 0;
    for (const p of patientPayments) {
      const pb = this.calculatePaymentBalances(p);
      totalUnallocatedAdvance += Number(pb.unallocatedAmount);
    }

    const netPatientDue = Math.max(0, totalDue - totalUnallocatedAdvance);

    return {
      patientId: pid,
      totalInvoiced: totalInvoiced.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalDue: totalDue.toFixed(2),
      totalUnallocatedAdvance: totalUnallocatedAdvance.toFixed(2),
      netPatientDue: netPatientDue.toFixed(2),
    };
  }

  // ============================================================================
  // DAILY COLLECTIONS REPORT (v_daily_collections)
  // ============================================================================
  public async getDailyCollections(
    date: string,
    branchId?: DbId,
    actor?: RequestActor
  ): Promise<DailyCollectionReportDto> {
    const items: DailyCollectionItemDto[] = [];
    const branchKey = branchId !== undefined && branchId !== null && branchId !== '' ? String(branchId) : undefined;

    // Group payments on date
    for (const method of this.paymentMethods.values()) {
      let totalReceived = 0;
      let paymentCount = 0;

      for (const p of this.payments.values()) {
        const pDate = p.paymentDate.split('T')[0];
        if (pDate === date && String(p.paymentMethodId) === String(method.id)) {
          if (!branchKey || String(p.branchId) === branchKey) {
            totalReceived += Number(p.amount);
            paymentCount++;
          }
        }
      }

      // Group refunds paid on date
      let totalRefunded = 0;
      for (const r of this.refunds.values()) {
        if (r.status === 'paid' && r.paidAt) {
          const rDate = r.paidAt.split('T')[0];
          if (rDate === date && (String(r.refundMethodId) === String(method.id) || !r.refundMethodId)) {
            if (!branchKey || String(r.branchId) === branchKey) {
              totalRefunded += Number(r.amount);
            }
          }
        }
      }

      if (totalReceived > 0 || totalRefunded > 0) {
        items.push({
          collectionDate: date,
          branchId: branchKey || 'all',
          branchName: branchKey ? 'Dhanmondi Main Clinic' : 'All Branches',
          paymentMethodId: method.id,
          paymentMethodName: method.name,
          paymentMethodCode: method.code,
          totalReceived: totalReceived.toFixed(2),
          totalRefunded: totalRefunded.toFixed(2),
          netCollected: (totalReceived - totalRefunded).toFixed(2),
          paymentCount,
        });
      }
    }

    const grandTotalReceived = items
      .reduce((sum, it) => sum + Number(it.totalReceived), 0)
      .toFixed(2);
    const grandTotalRefunded = items
      .reduce((sum, it) => sum + Number(it.totalRefunded), 0)
      .toFixed(2);
    const grandNetCollected = items
      .reduce((sum, it) => sum + Number(it.netCollected), 0)
      .toFixed(2);

    return {
      date,
      branchId: branchKey,
      items,
      grandTotalReceived,
      grandTotalRefunded,
      grandNetCollected,
    };
  }

  // ============================================================================
  // PRINTABLE RECEIPT (Number to Words, Staff Recorded Badge)
  // ============================================================================
  public async getReceipt(paymentId: DbId): Promise<ReceiptDto> {
    const payment = await this.getPaymentById(paymentId);
    const amountNum = Math.floor(Number(payment.amount));
    const amountInWords = this.numberToWordsBanglaCurrency(amountNum);

    const allocsWithDetails = (payment.allocations || []).map((a) => {
      const inv = this.invoices.get(a.invoiceId);
      const b = inv ? this.calculateInvoiceBalances(inv) : { dueAmount: '0.00' };
      return {
        invoiceNo: a.invoiceNo || (inv ? inv.invoiceNo : 'N/A'),
        invoiceDate: inv ? inv.invoiceDate : 'N/A',
        invoiceTotal: inv ? inv.totalAmount : '0.00',
        allocatedAmount: a.amount,
        remainingDue: b.dueAmount,
      };
    });

    return {
      paymentId: payment.id,
      receiptNo: payment.paymentNo,
      paymentDate: payment.paymentDate,
      patientId: payment.patientId,
      patientName: payment.patientName || 'Sumaiya Rahman',
      patientCode: payment.patientCode || 'PAT-000001',
      branchName: payment.branchName || 'Dhanmondi Main Clinic',
      amount: payment.amount,
      amountInWords,
      paymentMethodName: payment.paymentMethodName || 'Cash',
      paymentMethodCode: payment.paymentMethodCode || 'CASH',
      transactionReference: payment.transactionReference || undefined,
      isAdvance: payment.isAdvance,
      allocations: allocsWithDetails,
      recordedByName: payment.recordedByName || 'Staff Cashier',
      staffRecordedBadge: true, // Prominently displayed: "Staff recorded" (NOT "Verified")
    };
  }

  // Helper: Amount in words for BDT
  private numberToWordsBanglaCurrency(num: number): string {
    if (num === 0) return 'Zero Taka Only';

    const ones = [
      '',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
      'Thirteen',
      'Fourteen',
      'Fifteen',
      'Sixteen',
      'Seventeen',
      'Eighteen',
      'Nineteen',
    ];

    const tens = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];

    function convertUnderHundred(n: number): string {
      if (n < 20) return ones[n];
      const t = Math.floor(n / 10);
      const o = n % 10;
      return tens[t] + (o > 0 ? ' ' + ones[o] : '');
    }

    function convertUnderThousand(n: number): string {
      const h = Math.floor(n / 100);
      const rem = n % 100;
      let str = '';
      if (h > 0) str += ones[h] + ' Hundred';
      if (rem > 0) {
        if (str) str += ' and ';
        str += convertUnderHundred(rem);
      }
      return str;
    }

    let result = '';
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;
    const remainder = num;

    if (crore > 0) result += convertUnderHundred(crore) + ' Crore ';
    if (lakh > 0) result += convertUnderHundred(lakh) + ' Lakh ';
    if (thousand > 0) result += convertUnderHundred(thousand) + ' Thousand ';
    if (remainder > 0) result += convertUnderThousand(remainder);

    return `${result.trim()} Taka Only`;
  }

  // ============================================================================
  // OUTBOX TESTING ACCESS
  // ============================================================================
  public getDomainEvents(): DomainEventDto[] {
    return Array.from(this.domainEvents.values());
  }
}

export const billingService = new BillingService();
