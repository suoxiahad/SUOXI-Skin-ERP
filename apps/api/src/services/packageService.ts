import crypto from 'node:crypto';
import type {
  DbId,
  PackageDto,
  PackageItemDto,
  PatientPackageDto,
  PatientPackageItemDto,
  PackageSessionLedgerEntryDto,
  PackageCancellationDto,
  CreatePackageInput,
  UpdatePackageInput,
  AssignPackageInput,
  CancelPackageInput,
  RenewPackageInput,
  PackageStatus,
} from '@suoxi/shared-types';
import { catalogService } from './catalogService.js';
import { patientService } from './patientService.js';
import { logAudit } from './auditLogger.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from '../middleware/errorHandler.js';

export interface PackageActor {
  id: DbId;
  fullName?: string;
  role: string;
}

export class PackageService {
  // Catalog Packages
  private packages = new Map<string, PackageDto>();
  private packageCodeSeq = 1;

  // Patient Assigned Packages (Snapshots)
  private patientPackages = new Map<string, PatientPackageDto>();
  private patientPackageItems = new Map<string, PatientPackageItemDto>();

  // Append-Only Ledger
  private ledger = new Map<string, PackageSessionLedgerEntryDto>();
  private ledgerSeq = 1;

  // Cancellations
  private cancellations = new Map<string, PackageCancellationDto>();

  // Mutex lock for concurrent completeSessionDeduct calls
  private sessionDeductLocks = new Set<string>();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // Sample Catalog Package: "Glow Boost Package"
    // 10 sessions of HydraFacial (srv-hf-001), ৳ 38,000, valid 180 days
    const glowBoostId = 'pkg-glow-boost-01';
    const hydraFacial = catalogService.getServiceById('srv-hf-001');

    const samplePackage: PackageDto = {
      id: glowBoostId,
      packageCode: 'PKG-000001',
      name: 'Glow Boost Package',
      nameBn: 'গ্লো বুস্ট প্যাকেজ',
      description: '10 sessions of clinical HydraFacial with deep peptide infusion and barrier repair',
      price: '38000.00',
      validityDays: 180,
      isActive: true,
      items: [
        {
          id: 'pkgi-01',
          packageId: glowBoostId,
          serviceId: hydraFacial?.id || 'srv-hf-001',
          serviceName: hydraFacial?.name || 'HydraFacial Treatment',
          serviceCode: hydraFacial?.service_code || 'HF-001',
          sessionCount: 10,
          sortOrder: 1,
        },
      ],
      createdAt: new Date('2026-01-15T09:00:00Z').toISOString(),
      updatedAt: new Date('2026-01-15T09:00:00Z').toISOString(),
    };
    this.packages.set(glowBoostId, samplePackage);
    this.packageCodeSeq = 2;

    // Seed Sample Assigned Patient Package for Sumaiya Rahman
    const samplePtPkgId = 'ptpkg-sample-01';
    const samplePtItemId = 'ptpkgi-sample-01';

    const samplePtPackage: PatientPackageDto = {
      id: samplePtPkgId,
      patientId: 'pt-sumaiya-01',
      patientName: 'Sumaiya Rahman',
      patientCode: 'P-DHK-2026-0001',
      branchId: 'br-dhk-01',
      branchName: 'Dhanmondi Main Clinic',
      packageId: glowBoostId,
      packageCode: 'PKG-000001',
      packageName: 'Glow Boost Package',
      packageNameBn: 'গ্লো বুস্ট প্যাকেজ',
      purchaseDate: '2026-08-01',
      startDate: '2026-08-01',
      expiryDate: '2027-01-28', // 180 days from 2026-08-01
      validityDays: 180,
      daysToExpiry: 100,
      priceSold: '38000.00',
      saleTerms: 'Purchased during Summer Glow Campaign. Non-transferable.',
      status: 'active',
      assignedBy: 'usr-admin-01',
      assignedByName: 'Admin Manager',
      renewedFromId: null,
      invoiceItemId: null,
      items: [
        {
          id: samplePtItemId,
          patientPackageId: samplePtPkgId,
          serviceId: 'srv-hf-001',
          serviceName: 'HydraFacial Treatment',
          serviceCode: 'HF-001',
          initialSessions: 10,
          completedSessions: 2,
          remainingSessions: 8,
        },
      ],
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    };
    this.patientPackages.set(samplePtPkgId, samplePtPackage);
    this.patientPackageItems.set(samplePtItemId, samplePtPackage.items[0]);

    // Seed Sample Laser Resurfacing Package for Sumaiya Rahman (SES-000001: Session 3 of 6)
    const laserPtPkgId = 'pkg-sample-0021';
    const laserPtItemId = 'ptpkgi-laser-01';
    const sampleLaserPackage: PatientPackageDto = {
      id: laserPtPkgId,
      patientId: 'pt-sumaiya-01',
      patientName: 'Sumaiya Rahman',
      patientCode: 'PAT-000001',
      branchId: 'br-dhk-01',
      branchName: 'Dhanmondi Main Clinic',
      packageId: 'pkg-cat-laser-01',
      packageCode: 'PKG-0021',
      packageName: 'Fractional CO2 Laser Resurfacing Package (6 Sessions)',
      packageNameBn: 'ফ্র্যাকশনাল CO2 লেজার রিসারফেসিং প্যাকেজ',
      purchaseDate: '2026-07-15',
      startDate: '2026-07-15',
      expiryDate: '2027-04-15',
      validityDays: 270,
      daysToExpiry: 175,
      priceSold: '54000.00',
      saleTerms: 'Clinical laser package — 6 sessions. Non-transferable.',
      status: 'active',
      assignedBy: 'usr-admin-01',
      assignedByName: 'Admin Manager',
      renewedFromId: null,
      invoiceItemId: null,
      items: [
        {
          id: laserPtItemId,
          patientPackageId: laserPtPkgId,
          serviceId: 'srv-laser-01',
          serviceName: 'Fractional CO2 Laser Resurfacing',
          serviceCode: 'LSR-001',
          initialSessions: 6,
          completedSessions: 2,
          remainingSessions: 4,
        },
      ],
      createdAt: '2026-07-15T10:00:00Z',
      updatedAt: '2026-07-15T10:00:00Z',
    };
    this.patientPackages.set(laserPtPkgId, sampleLaserPackage);
    this.patientPackageItems.set(laserPtItemId, sampleLaserPackage.items[0]);

    // Seed 2 existing deductions in ledger
    const ledgerEntry1: PackageSessionLedgerEntryDto = {
      id: 'psl-000001',
      patientPackageId: samplePtPkgId,
      patientPackageItemId: samplePtItemId,
      treatmentSessionId: 'ses-sample-00',
      treatmentSessionCode: 'SES-000000',
      entryType: 'deduction',
      changeQuantity: -1,
      cycleNo: 1,
      reason: 'Session SES-000000 completion deduction',
      createdBy: 'usr-doctor-01',
      createdByName: 'Dr. Farhana Khan',
      createdAt: '2026-08-15T15:00:00Z',
    };
    const ledgerEntry2: PackageSessionLedgerEntryDto = {
      id: 'psl-000002',
      patientPackageId: samplePtPkgId,
      patientPackageItemId: samplePtItemId,
      treatmentSessionId: 'ses-sample-prev-02',
      treatmentSessionCode: 'SES-000000-B',
      entryType: 'deduction',
      changeQuantity: -1,
      cycleNo: 1,
      reason: 'Session SES-000000-B completion deduction',
      createdBy: 'usr-doctor-01',
      createdByName: 'Dr. Farhana Khan',
      createdAt: '2026-09-02T16:00:00Z',
    };
    this.ledger.set(ledgerEntry1.id, ledgerEntry1);
    this.ledger.set(ledgerEntry2.id, ledgerEntry2);
    this.ledgerSeq = 3;
  }

  // ============================================================================
  // Catalog Packages Management
  // ============================================================================

  public listPackages(params?: { activeOnly?: boolean; search?: string }): PackageDto[] {
    let list = Array.from(this.packages.values());

    if (params?.activeOnly) {
      list = list.filter((p) => p.isActive);
    }

    if (params?.search && params.search.trim()) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.packageCode.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.nameBn && p.nameBn.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getPackageById(id: DbId): PackageDto {
    const key = String(id);
    const pkg = this.packages.get(key);
    if (!pkg) {
      throw new NotFoundError(`Package not found: ${key}`);
    }
    return pkg;
  }

  public createPackage(
    input: CreatePackageInput,
    user: PackageActor
  ): PackageDto {
    if (!input.name || !input.name.trim()) {
      throw new ValidationError('Package name is required');
    }
    const priceNum = parseFloat(String(input.price));
    if (isNaN(priceNum) || priceNum <= 0) {
      throw new ValidationError('Valid positive package price is required');
    }
    if (!input.validityDays || input.validityDays <= 0) {
      throw new ValidationError('Validity in days must be greater than 0');
    }
    if (!input.items || input.items.length === 0) {
      throw new ValidationError('At least one included treatment service is required');
    }

    const id = `pkg-${crypto.randomUUID()}`;
    const codeNum = this.packageCodeSeq++;
    const packageCode = `PKG-${String(codeNum).padStart(6, '0')}`;

    const items: PackageItemDto[] = input.items.map((it, idx) => {
      const serviceIdStr = String(it.serviceId);
      const srv = catalogService.getServiceById(serviceIdStr);
      return {
        id: `pkgi-${crypto.randomUUID()}`,
        packageId: id,
        serviceId: serviceIdStr,
        serviceName: srv.name,
        serviceCode: srv.service_code,
        sessionCount: it.sessionCount,
        sortOrder: it.sortOrder ?? idx + 1,
      };
    });

    const newPkg: PackageDto = {
      id,
      packageCode,
      name: input.name.trim(),
      nameBn: input.nameBn ? input.nameBn.trim() : null,
      description: input.description ? input.description.trim() : null,
      price: priceNum.toFixed(2),
      validityDays: Number(input.validityDays),
      isActive: true,
      items,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.packages.set(id, newPkg);

    logAudit(null, {
      actorUserId: user.id,
      action: 'PACKAGE_CREATE',
      entityType: 'packages',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: { packageCode, name: newPkg.name, price: newPkg.price },
    });

    return newPkg;
  }

  public updatePackage(
    id: DbId,
    input: UpdatePackageInput,
    user: PackageActor
  ): PackageDto {
    const key = String(id);
    const pkg = this.getPackageById(key);

    const beforeState = { ...pkg };

    if (input.name !== undefined) pkg.name = input.name.trim();
    if (input.nameBn !== undefined) pkg.nameBn = input.nameBn ? input.nameBn.trim() : null;
    if (input.description !== undefined) pkg.description = input.description ? input.description.trim() : null;
    if (input.price !== undefined) {
      const p = parseFloat(String(input.price));
      if (isNaN(p) || p <= 0) throw new ValidationError('Invalid price');
      pkg.price = p.toFixed(2);
    }
    if (input.validityDays !== undefined) {
      if (input.validityDays <= 0) throw new ValidationError('Invalid validity days');
      pkg.validityDays = Number(input.validityDays);
    }
    if (input.isActive !== undefined) pkg.isActive = Boolean(input.isActive);

    pkg.updatedAt = new Date().toISOString();
    this.packages.set(key, pkg);

    logAudit(null, {
      actorUserId: user.id,
      action: 'PACKAGE_UPDATE',
      entityType: 'packages',
      entityId: key,
      ipAddress: '127.0.0.1',
      payloadBefore: beforeState,
      payloadAfter: pkg,
    });

    return pkg;
  }

  // ============================================================================
  // Patient Package Assignment (Entitlement Snapshot)
  // ============================================================================

  public async assignPackage(
    input: AssignPackageInput,
    user: PackageActor
  ): Promise<PatientPackageDto> {
    const patientIdStr = String(input.patientId);
    const packageIdStr = String(input.packageId);
    const patient = await patientService.getPatientById(patientIdStr);
    if (!patient) {
      throw new NotFoundError(`Patient not found: ${patientIdStr}`);
    }

    const pkg = this.getPackageById(packageIdStr);
    if (!pkg.isActive) {
      throw new ValidationError(`Package '${pkg.name}' is inactive and cannot be assigned`);
    }

    if (!input.startDate || !input.purchaseDate) {
      throw new ValidationError('Start date and purchase date are required');
    }

    // Auto-calculate expiry date = startDate + validityDays
    const startDateObj = new Date(input.startDate);
    const expiryDateObj = new Date(startDateObj);
    expiryDateObj.setDate(expiryDateObj.getDate() + pkg.validityDays);
    const expiryDate = expiryDateObj.toISOString().split('T')[0];

    const priceSoldNum = input.priceSold ? parseFloat(String(input.priceSold)) : parseFloat(pkg.price);
    if (isNaN(priceSoldNum) || priceSoldNum < 0) {
      throw new ValidationError('Valid price sold is required');
    }

    const id = `ptpkg-${crypto.randomUUID()}`;
    const branchId = input.branchId ? String(input.branchId) : patient.branch_id || 'br-dhk-01';

    // Snapshot package items
    const items: PatientPackageItemDto[] = pkg.items.map((it) => {
      const itemId = `ptpkgi-${crypto.randomUUID()}`;
      const itemDto: PatientPackageItemDto = {
        id: itemId,
        patientPackageId: id,
        serviceId: it.serviceId,
        serviceName: it.serviceName || 'Treatment Service',
        serviceCode: it.serviceCode || 'SRV-001',
        initialSessions: it.sessionCount,
        completedSessions: 0,
        remainingSessions: it.sessionCount,
      };
      this.patientPackageItems.set(itemId, itemDto);
      return itemDto;
    });

    const now = new Date();
    const daysToExpiry = Math.ceil((expiryDateObj.getTime() - now.getTime()) / (1000 * 3600 * 24));

    const patientPackage: PatientPackageDto = {
      id,
      patientId: patientIdStr,
      patientName: patient.full_name,
      patientCode: patient.patient_code,
      branchId,
      branchName: 'Dhanmondi Main Clinic',
      packageId: pkg.id,
      packageCode: pkg.packageCode,
      packageName: pkg.name,
      packageNameBn: pkg.nameBn || null,
      purchaseDate: input.purchaseDate,
      startDate: input.startDate,
      expiryDate,
      validityDays: pkg.validityDays,
      daysToExpiry: Math.max(0, daysToExpiry),
      priceSold: priceSoldNum.toFixed(2),
      saleTerms: input.saleTerms ? input.saleTerms.trim() : null,
      status: 'active',
      assignedBy: String(user.id),
      assignedByName: user.fullName || 'Staff User',
      renewedFromId: null,
      invoiceItemId: null,
      items,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.patientPackages.set(id, patientPackage);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'PATIENT_PACKAGE_ASSIGN',
      entityType: 'patient_packages',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: {
        patientId: patientIdStr,
        packageCode: pkg.packageCode,
        priceSold: patientPackage.priceSold,
        expiryDate,
      },
    });

    return patientPackage;
  }

  // ============================================================================
  // Patient Package Balances & Queries
  // ============================================================================

  public getPatientPackage(id: DbId): PatientPackageDto {
    const key = String(id);
    const ptPkg = this.patientPackages.get(key);
    if (!ptPkg) {
      throw new NotFoundError(`Patient package not found: ${key}`);
    }

    const calculated = this.calculatePackageBalances(ptPkg);
    const ledger = this.getPackageLedger(key);
    const cancellation = this.cancellations.get(key) || null;

    return {
      ...calculated,
      ledger,
      cancellation,
    };
  }

  public listPatientPackages(patientId: DbId): PatientPackageDto[] {
    const pid = String(patientId);
    const list = Array.from(this.patientPackages.values())
      .filter((p) => String(p.patientId) === pid)
      .map((p) => this.getPatientPackage(p.id));

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public listExpiringPackages(withinDays: number = 30): PatientPackageDto[] {
    const all = Array.from(this.patientPackages.values())
      .filter((p) => p.status === 'active')
      .map((p) => this.getPatientPackage(p.id));

    return all.filter((p) => {
      const remainingTotal = p.items.reduce((acc, it) => acc + it.remainingSessions, 0);
      return p.daysToExpiry <= withinDays && remainingTotal > 0;
    }).sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  }

  private calculatePackageBalances(ptPkg: PatientPackageDto): PatientPackageDto {
    const now = new Date();
    const expiryDateObj = new Date(ptPkg.expiryDate);
    const isExpired = expiryDateObj < now && ptPkg.status === 'active';
    const daysToExpiry = Math.ceil((expiryDateObj.getTime() - now.getTime()) / (1000 * 3600 * 24));

    let allCompleted = true;

    const items: PatientPackageItemDto[] = ptPkg.items.map((it) => {
      // Sum deductions and reversals from append-only ledger
      const entries = Array.from(this.ledger.values()).filter(
        (e) => e.patientPackageItemId === it.id
      );

      let deductions = 0;
      let reversals = 0;

      for (const entry of entries) {
        if (entry.entryType === 'deduction') {
          deductions += Math.abs(entry.changeQuantity);
        } else if (entry.entryType === 'reversal') {
          reversals += Math.abs(entry.changeQuantity);
        }
      }

      const completedSessions = deductions - reversals;
      const remainingSessions = Math.max(0, it.initialSessions - completedSessions);

      if (remainingSessions > 0) {
        allCompleted = false;
      }

      return {
        ...it,
        completedSessions,
        remainingSessions,
      };
    });

    let currentStatus = ptPkg.status;
    if (currentStatus === 'active') {
      if (allCompleted && items.length > 0) {
        currentStatus = 'completed';
      } else if (isExpired) {
        currentStatus = 'expired';
      }
    }

    return {
      ...ptPkg,
      status: currentStatus,
      daysToExpiry: Math.max(0, daysToExpiry),
      items,
    };
  }

  public getPackageLedger(patientPackageId: DbId): PackageSessionLedgerEntryDto[] {
    const pid = String(patientPackageId);
    return Array.from(this.ledger.values())
      .filter((e) => String(e.patientPackageId) === pid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ============================================================================
  // Session Deduction Transaction (completeSessionDeduct)
  // Hard Rule 5: A package session can never be deducted twice
  // ============================================================================

  public async completeSessionDeduct(
    session: {
      id: DbId;
      sessionCode: string;
      patientId: DbId;
      serviceId: DbId;
      packageId?: DbId | null;
    },
    actor: PackageActor
  ): Promise<{ deducted: boolean; ledgerId?: string; patientPackageId?: string }> {
    const sessionIdStr = String(session.id);
    const patientIdStr = String(session.patientId);
    const serviceIdStr = String(session.serviceId);
    const packageIdStr = session.packageId !== undefined && session.packageId !== null ? String(session.packageId) : null;

    // 1. Concurrency lock on session ID to guarantee serialized deduction
    const lockKey = `deduct-lock-${sessionIdStr}`;
    if (this.sessionDeductLocks.has(lockKey)) {
      throw new ConflictError(`Concurrent deduction already in progress for session ${session.sessionCode}`);
    }
    this.sessionDeductLocks.add(lockKey);

    try {
      // 2. Check if a deduction entry ALREADY exists for this treatment session
      // (UNIQUE constraint: uq_session_cycle_entry on treatment_session_id, cycle_no, entry_type)
      for (const entry of this.ledger.values()) {
        if (
          String(entry.treatmentSessionId) === sessionIdStr &&
          entry.entryType === 'deduction' &&
          entry.cycleNo === 1
        ) {
          // Hard Rule 5: Already deducted! Return idempotent 409
          throw new ConflictError(
            `Session ${session.sessionCode} has already been deducted from package. Double deduction prohibited.`
          );
        }
      }

      // 3. Find matching active, non-expired patient package for this patient and service
      const patientPkgs = Array.from(this.patientPackages.values()).filter(
        (p) => String(p.patientId) === patientIdStr
      );

      let targetPackage: PatientPackageDto | null = null;
      let targetItem: PatientPackageItemDto | null = null;

      for (const p of patientPkgs) {
        const calculated = this.calculatePackageBalances(p);

        // Check explicit package link or match active package with remaining allowance
        if (packageIdStr && String(p.id) !== packageIdStr && String(p.packageId) !== packageIdStr) {
          continue;
        }

        // Must be active and not expired
        if (calculated.status !== 'active') {
          continue;
        }

        const matchItem = calculated.items.find(
          (it) => String(it.serviceId) === serviceIdStr && it.remainingSessions > 0
        );

        if (matchItem) {
          targetPackage = calculated;
          targetItem = matchItem;
          break;
        }
      }

      // If session explicitly specified a packageId but it's expired or exhausted
      if (packageIdStr && !targetPackage) {
        const explicitPkg =
          this.patientPackages.get(packageIdStr) ||
          Array.from(this.patientPackages.values()).find((x) => String(x.packageId) === packageIdStr);
        if (explicitPkg) {
          const calc = this.calculatePackageBalances(explicitPkg);
          if (calc.status === 'expired') {
            throw new ValidationError(`Package '${calc.packageName}' is expired. Cannot deduct session.`);
          }
          const item = calc.items.find((i) => String(i.serviceId) === serviceIdStr);
          if (item && item.remainingSessions <= 0) {
            throw new ValidationError(`Package '${calc.packageName}' has zero remaining sessions for this service.`);
          }
        }
      }

      // If no package applies to this session, it's a regular unbundled / single-session treatment
      if (!targetPackage || !targetItem) {
        return { deducted: false };
      }

      // 4. Require remaining > 0
      if (targetItem.remainingSessions <= 0) {
        throw new ValidationError(
          `Cannot deduct: Package '${targetPackage.packageName}' has no remaining sessions.`
        );
      }

      // 5. Insert exactly ONE deduction row into the append-only ledger
      const ledgerId = `psl-${crypto.randomUUID()}`;
      const entry: PackageSessionLedgerEntryDto = {
        id: ledgerId,
        patientPackageId: targetPackage.id,
        patientPackageItemId: targetItem.id,
        treatmentSessionId: sessionIdStr,
        treatmentSessionCode: session.sessionCode,
        entryType: 'deduction',
        changeQuantity: -1,
        cycleNo: 1,
        reason: `Session ${session.sessionCode} completion deduction`,
        createdBy: String(actor.id),
        createdByName: actor.fullName || 'Clinician',
        createdAt: new Date().toISOString(),
      };

      this.ledger.set(ledgerId, entry);

      // Re-calculate package status
      const updated = this.calculatePackageBalances(targetPackage);
      this.patientPackages.set(targetPackage.id, updated);

      await logAudit(null, {
        actorUserId: actor.id,
        action: 'PACKAGE_SESSION_DEDUCT',
        entityType: 'package_session_ledger',
        entityId: ledgerId,
        ipAddress: '127.0.0.1',
        payloadAfter: {
          sessionId: sessionIdStr,
          sessionCode: session.sessionCode,
          patientPackageId: targetPackage.id,
          remaining: targetItem.remainingSessions - 1,
        },
      });

      return {
        deducted: true,
        ledgerId,
        patientPackageId: targetPackage.id,
      };
    } finally {
      this.sessionDeductLocks.delete(lockKey);
    }
  }

  // ============================================================================
  // Reversal Service (reverseDeduction)
  // Reversals append a row pointing to the original; never edit/delete rows.
  // One deduction can be reversed once only.
  // ============================================================================

  public async reverseDeduction(
    ledgerId: DbId,
    reason: string,
    approver: PackageActor
  ): Promise<PackageSessionLedgerEntryDto> {
    const ledgerKey = String(ledgerId);
    const original = this.ledger.get(ledgerKey);
    if (!original) {
      throw new NotFoundError(`Ledger entry not found: ${ledgerKey}`);
    }

    if (original.entryType !== 'deduction') {
      throw new ValidationError(`Only deductions can be reversed. Entry ${ledgerKey} is a ${original.entryType}.`);
    }

    // Check if already reversed (UNIQUE original_ledger_id constraint)
    for (const e of this.ledger.values()) {
      if (e.originalLedgerId === ledgerKey) {
        throw new ConflictError(
          `Deduction ${ledgerKey} has already been reversed by ledger entry ${e.id}. Duplicate reversal prohibited.`
        );
      }
    }

    const reversalId = `psl-${crypto.randomUUID()}`;
    const reversalEntry: PackageSessionLedgerEntryDto = {
      id: reversalId,
      patientPackageId: original.patientPackageId,
      patientPackageItemId: original.patientPackageItemId,
      treatmentSessionId: original.treatmentSessionId,
      treatmentSessionCode: original.treatmentSessionCode,
      entryType: 'reversal',
      changeQuantity: 1, // Restores balance (+1)
      cycleNo: original.cycleNo,
      originalLedgerId: ledgerKey,
      reason: reason.trim() || 'Clinical adjustment/cancellation reversal',
      createdBy: String(approver.id),
      createdByName: approver.fullName || 'Admin',
      createdAt: new Date().toISOString(),
    };

    // Insert reversal row (append-only)
    this.ledger.set(reversalId, reversalEntry);

    // Refresh patient package status
    const ptPkg = this.patientPackages.get(original.patientPackageId);
    if (ptPkg) {
      const refreshed = this.calculatePackageBalances(ptPkg);
      this.patientPackages.set(ptPkg.id, refreshed);
    }

    await logAudit(null, {
      actorUserId: approver.id,
      action: 'PACKAGE_DEDUCTION_REVERSAL',
      entityType: 'package_session_ledger',
      entityId: reversalId,
      ipAddress: '127.0.0.1',
      payloadAfter: {
        originalLedgerId: ledgerKey,
        reason: reversalEntry.reason,
      },
    });

    return reversalEntry;
  }

  // ============================================================================
  // Renew Package
  // ============================================================================

  public async renewPackage(
    patientPackageId: DbId,
    input: RenewPackageInput,
    actor: PackageActor
  ): Promise<PatientPackageDto> {
    const oldPkgId = String(patientPackageId);
    const oldPkg = this.getPatientPackage(oldPkgId);

    // Mark old package as renewed if active or completed
    oldPkg.status = 'renewed';
    oldPkg.updatedAt = new Date().toISOString();
    this.patientPackages.set(oldPkgId, oldPkg);

    // Assign new package with renewed_from_id link
    const newPkg = await this.assignPackage(
      {
        patientId: oldPkg.patientId,
        packageId: oldPkg.packageId,
        purchaseDate: input.purchaseDate,
        startDate: input.startDate,
        priceSold: input.priceSold ?? oldPkg.priceSold,
        saleTerms: input.saleTerms ?? `Renewed from package ${oldPkg.packageCode}`,
      },
      actor
    );

    newPkg.renewedFromId = oldPkgId;
    this.patientPackages.set(newPkg.id, newPkg);

    await logAudit(null, {
      actorUserId: actor.id,
      action: 'PACKAGE_RENEW',
      entityType: 'patient_packages',
      entityId: newPkg.id,
      ipAddress: '127.0.0.1',
      payloadAfter: {
        oldPackageId: oldPkgId,
        newPackageId: newPkg.id,
      },
    });

    return newPkg;
  }

  // ============================================================================
  // Cancel Package
  // ============================================================================

  public async cancelPackage(
    patientPackageId: DbId,
    input: CancelPackageInput,
    actor: PackageActor
  ): Promise<PatientPackageDto> {
    const ptPkgId = String(patientPackageId);
    const ptPkg = this.getPatientPackage(ptPkgId);

    if (ptPkg.status === 'cancelled') {
      throw new ConflictError(`Package '${ptPkg.packageName}' is already cancelled`);
    }

    const cancelId = `pcanc-${crypto.randomUUID()}`;
    const cancellation: PackageCancellationDto = {
      id: cancelId,
      patientPackageId: ptPkgId,
      cancelledAt: new Date().toISOString(),
      cancelledBy: String(actor.id),
      cancelledByName: actor.fullName || 'Staff User',
      approvedBy: String(actor.id),
      approvedByName: actor.fullName || 'Admin User',
      reason: input.reason.trim(),
      remainingHandling: input.remainingHandling,
      refundReference: input.refundReference ? input.refundReference.trim() : null,
      notes: input.notes ? input.notes.trim() : null,
    };

    this.cancellations.set(ptPkgId, cancellation);

    ptPkg.status = 'cancelled';
    ptPkg.updatedAt = new Date().toISOString();
    this.patientPackages.set(ptPkgId, ptPkg);

    await logAudit(null, {
      actorUserId: actor.id,
      action: 'PACKAGE_CANCEL',
      entityType: 'patient_packages',
      entityId: ptPkgId,
      ipAddress: '127.0.0.1',
      payloadAfter: {
        reason: cancellation.reason,
        remainingHandling: cancellation.remainingHandling,
        refundReference: cancellation.refundReference,
      },
    });

    return this.getPatientPackage(ptPkgId);
  }

  // ============================================================================
  // Append-Only Guard Verification
  // Direct UPDATE or DELETE on ledger fails
  // ============================================================================

  public directLedgerUpdate(): never {
    throw new ForbiddenError(
      'package_session_ledger is append-only: UPDATE operations are strictly prohibited (Engineering Rule 6)'
    );
  }

  public directLedgerDelete(): never {
    throw new ForbiddenError(
      'package_session_ledger is append-only: DELETE operations are strictly prohibited (Engineering Rule 6)'
    );
  }

  // Testing reset helper
  public resetData() {
    this.packages.clear();
    this.patientPackages.clear();
    this.patientPackageItems.clear();
    this.ledger.clear();
    this.cancellations.clear();
    this.sessionDeductLocks.clear();
    this.seedInitialData();
  }
}

export const packageService = new PackageService();
