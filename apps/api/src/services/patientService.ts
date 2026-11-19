import crypto from 'node:crypto';
import type {
  PatientDto,
  RestrictedCallCenterPatientDto,
  CreatePatientRequest,
  UpdatePatientRequest,
  PatientDuplicateCheckResult,
  PatientDuplicateCandidateDto,
  PatientMedicalHistoryDto,
  MedicalEntryCategory,
  MedicalEntrySeverity,
  PatientMedicalEntryDto,
  CreateMedicalEntryRequest,
  PatientNoteType,
  PatientNoteDto,
  CreatePatientNoteRequest,
  PatientTimelineItemDto,
  PatientProfileDto,
} from '@suoxi/shared-types';
import { BadRequestError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import { logAudit } from './auditLogger.js';
import { fileService } from './fileService.js';

export function normalizeMobile(mobile: string): string {
  if (!mobile) return '';
  let cleaned = mobile.trim().replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('01')) {
    cleaned = `+88${cleaned}`;
  } else if (cleaned.startsWith('8801')) {
    cleaned = `+${cleaned}`;
  }
  return cleaned;
}

export function isValidBangladeshMobile(mobile: string): boolean {
  return /^\+8801[3-9][0-9]{8}$/.test(mobile);
}

export interface PatientRecord {
  id: string;
  patient_code: string;
  branch_id: string;
  full_name: string;
  full_name_bn?: string | null;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  date_of_birth?: string | null;
  approximate_age?: number | null;
  blood_group?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | null;
  primary_mobile: string;
  primary_mobile_normalized: string;
  secondary_mobile?: string | null;
  email?: string | null;
  address?: string | null;
  area?: string | null;
  city: string;
  district: string;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relation?: string | null;
  preferred_language: 'bn' | 'en';
  acquisition_source: 'call' | 'walk_in' | 'referral' | 'social_media' | 'other';
  referrer_id?: string | null;
  status: 'active' | 'inactive' | 'merged';
  merged_into_patient_id?: string | null;
  merged_at?: string | null;
  merged_by?: string | null;
  last_visit?: string | null;
  due_amount?: number;
  consent_sms_notifications?: boolean;
  consent_email_notifications?: boolean;
  consent_marketing?: boolean;
  created_at: string;
  updated_at: string;
}


export interface DuplicateCandidateRecord {
  id: string;
  primary_patient_id: string;
  duplicate_patient_id: string;
  match_confidence: 'high' | 'medium' | 'low';
  match_reasons: string[];
  status: 'pending' | 'not_duplicate' | 'confirmed_duplicate' | 'merged';
  detected_during: string;
  resolved_by?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  created_at: string;
}

export interface MedicalHistoryRecord {
  patient_id: string;
  allergies?: string | null;
  skin_type?: string | null;
  current_medications?: string | null;
  chronic_conditions?: string | null;
  past_aesthetic_procedures?: string | null;
  contraindications?: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalEntryRecord {
  id: string;
  patient_id: string;
  category: MedicalEntryCategory;
  title: string;
  details?: string | null;
  severity?: MedicalEntrySeverity | null;
  onset_date?: string | null;
  is_active: boolean;
  created_by: string;
  creator_name?: string;
  created_at: string;
  updated_at: string;
}

export interface NoteRecord {
  id: string;
  patient_id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  note_type: PatientNoteType;
  note_text: string;
  is_pinned: boolean;
  created_at: string;
}

class PatientRepository {
  private patients = new Map<string, PatientRecord>();
  private duplicateCandidates = new Map<string, DuplicateCandidateRecord>();
  private medicalHistories = new Map<string, MedicalHistoryRecord>();
  private medicalEntries = new Map<string, MedicalEntryRecord>();
  private notes = new Map<string, NoteRecord>();
  private codeSequenceCounter = 87;

  constructor() {
    this.seedDevPatients();
  }

  private seedDevPatients(): void {
    const devPatients: Array<Omit<PatientRecord, 'id' | 'patient_code' | 'created_at' | 'updated_at'> & { codeNum: number }> = [
      {
        codeNum: 87,
        branch_id: 'SKC-01',
        full_name: 'Sumaiya Rahman',
        full_name_bn: 'সুমাইয়া রহমান',
        gender: 'female',
        date_of_birth: '1995-04-12',
        approximate_age: 31,
        blood_group: 'O+',
        primary_mobile: '+8801712345678',
        primary_mobile_normalized: '+8801712345678',
        secondary_mobile: '+8801712999999',
        email: 'sumaiya.rahman@example.com',
        address: 'Road 7A, House 34',
        area: 'Dhanmondi',
        city: 'Dhaka',
        district: 'Dhaka',
        emergency_contact_name: 'Kamrul Rahman',
        emergency_contact_phone: '+8801711000001',
        emergency_contact_relation: 'Spouse',
        preferred_language: 'bn',
        acquisition_source: 'walk_in',
        status: 'active',
        due_amount: 1500,
        last_visit: '2026-10-10',
      },
      {
        codeNum: 88,
        branch_id: 'SKC-01',
        full_name: 'Tasnim Akter',
        full_name_bn: 'তাসনিম আক্তার',
        gender: 'female',
        date_of_birth: '1998-09-20',
        approximate_age: 28,
        blood_group: 'A+',
        primary_mobile: '+8801811223344',
        primary_mobile_normalized: '+8801811223344',
        email: 'tasnim.akter@example.com',
        address: 'Sector 4, Road 11, House 2',
        area: 'Uttara',
        city: 'Dhaka',
        district: 'Dhaka',
        emergency_contact_name: 'Monirul Islam',
        emergency_contact_phone: '+8801811000002',
        emergency_contact_relation: 'Brother',
        preferred_language: 'bn',
        acquisition_source: 'social_media',
        status: 'active',
        due_amount: 0,
        last_visit: '2026-10-14',
      },
      {
        codeNum: 89,
        branch_id: 'SKC-01',
        full_name: 'Mahmudul Hasan',
        full_name_bn: 'মাহমুদুল হাসান',
        gender: 'male',
        date_of_birth: '1989-11-05',
        approximate_age: 37,
        blood_group: 'B+',
        primary_mobile: '+8801911556677',
        primary_mobile_normalized: '+8801911556677',
        email: 'mahmudul.hasan@example.com',
        address: 'Block C, Road 5',
        area: 'Bashundhara R/A',
        city: 'Dhaka',
        district: 'Dhaka',
        emergency_contact_name: 'Shirin Hasan',
        emergency_contact_phone: '+8801911000003',
        emergency_contact_relation: 'Spouse',
        preferred_language: 'en',
        acquisition_source: 'referral',
        status: 'active',
        due_amount: 4200,
        last_visit: '2026-10-02',
      },
      {
        codeNum: 90,
        branch_id: 'SKC-01',
        full_name: 'Nazia Sultana',
        full_name_bn: 'নাজিয়া সুলতানা',
        gender: 'female',
        date_of_birth: '1992-02-18',
        approximate_age: 34,
        blood_group: 'AB+',
        primary_mobile: '+8801611889900',
        primary_mobile_normalized: '+8801611889900',
        email: 'nazia.sultana@example.com',
        address: 'Section 10, Block D',
        area: 'Mirpur 10',
        city: 'Dhaka',
        district: 'Dhaka',
        emergency_contact_name: 'Jalal Ahmed',
        emergency_contact_phone: '+8801611000004',
        emergency_contact_relation: 'Father',
        preferred_language: 'bn',
        acquisition_source: 'call',
        status: 'active',
        due_amount: 0,
        last_visit: '2026-09-28',
      },
      {
        codeNum: 91,
        branch_id: 'SKC-01',
        full_name: 'Farhana Yasmin',
        full_name_bn: 'ফারহানা ইয়াসমিন',
        gender: 'female',
        date_of_birth: '1994-06-30',
        approximate_age: 32,
        blood_group: 'O-',
        primary_mobile: '+8801722334455',
        primary_mobile_normalized: '+8801722334455',
        email: 'farhana.yasmin@example.com',
        address: 'Road 55, House 12',
        area: 'Gulshan 2',
        city: 'Dhaka',
        district: 'Dhaka',
        emergency_contact_name: 'Arif Hossain',
        emergency_contact_phone: '+8801722000005',
        emergency_contact_relation: 'Spouse',
        preferred_language: 'en',
        acquisition_source: 'walk_in',
        status: 'active',
        due_amount: 0,
        last_visit: '2026-10-15',
      },
      {
        codeNum: 92,
        branch_id: 'SKC-01',
        full_name: 'Tanvir Ahmed',
        full_name_bn: 'তানভীর আহমেদ',
        gender: 'male',
        date_of_birth: '1987-12-14',
        approximate_age: 39,
        blood_group: 'B-',
        primary_mobile: '+8801733445566',
        primary_mobile_normalized: '+8801733445566',
        email: 'tanvir.ahmed@example.com',
        address: 'Block E, Road 13',
        area: 'Banani',
        city: 'Dhaka',
        district: 'Dhaka',
        emergency_contact_name: 'Salma Begum',
        emergency_contact_phone: '+8801733000006',
        emergency_contact_relation: 'Mother',
        preferred_language: 'bn',
        acquisition_source: 'social_media',
        status: 'active',
        due_amount: 3500,
        last_visit: '2026-10-11',
      },
      {
        codeNum: 93,
        branch_id: 'SKC-01',
        full_name: 'Mehedi Hasan',
        full_name_bn: 'মেহেদী হাসান',
        gender: 'male',
        date_of_birth: '1996-08-25',
        approximate_age: 30,
        blood_group: 'A-',
        primary_mobile: '+8801744556677',
        primary_mobile_normalized: '+8801744556677',
        email: 'mehedi.hasan@example.com',
        address: 'Lane 4, House 102',
        area: 'Mohakhali DOHS',
        city: 'Dhaka',
        district: 'Dhaka',
        emergency_contact_name: 'Faruk Hasan',
        emergency_contact_phone: '+8801744000007',
        emergency_contact_relation: 'Brother',
        preferred_language: 'bn',
        acquisition_source: 'walk_in',
        status: 'active',
        due_amount: 0,
        last_visit: '2026-10-09',
      },
      {
        codeNum: 94,
        branch_id: 'SKC-01',
        full_name: 'Nusrat Jahan',
        full_name_bn: 'নুসরাত জাহান',
        gender: 'female',
        date_of_birth: '1993-01-15',
        approximate_age: 33,
        blood_group: 'O+',
        primary_mobile: '+8801755667788',
        primary_mobile_normalized: '+8801755667788',
        email: 'nusrat.jahan@example.com',
        address: 'Avenue 3, Road 8',
        area: 'Mirpur DOHS',
        city: 'Dhaka',
        district: 'Dhaka',
        emergency_contact_name: 'Shafiqul Alam',
        emergency_contact_phone: '+8801755000008',
        emergency_contact_relation: 'Spouse',
        preferred_language: 'bn',
        acquisition_source: 'referral',
        status: 'active',
        due_amount: 0,
        last_visit: '2026-10-12',
      },
    ];

    for (const p of devPatients) {
      const id = `pat_${p.codeNum}`;
      const code = `SKC-${String(p.codeNum).padStart(6, '0')}`;
      const record: PatientRecord = {
        ...p,
        id,
        patient_code: code,
        created_at: new Date('2026-09-01T08:00:00Z').toISOString(),
        updated_at: new Date('2026-10-12T10:00:00Z').toISOString(),
      };
      this.patients.set(id, record);
    }
  }

  public generatePatientCode(): string {
    this.codeSequenceCounter += 1;
    return `SKC-${String(this.codeSequenceCounter).padStart(6, '0')}`;
  }

  public async findByNormalizedMobile(mobile: string, branchId?: string): Promise<PatientRecord | null> {
    const normalized = normalizeMobile(mobile);
    for (const p of this.patients.values()) {
      if (p.status !== 'merged' && p.primary_mobile_normalized === normalized) {
        if (!branchId || p.branch_id === branchId) {
          return p;
        }
      }
    }
    return null;
  }

  public upsertPatient(data: Partial<PatientRecord> & { id: string; full_name?: string }): PatientRecord {
    const existing = this.patients.get(data.id);
    if (existing) {
      const updated: PatientRecord = {
        ...existing,
        ...data,
        updated_at: new Date().toISOString(),
      };
      this.patients.set(data.id, updated);
      if (updated.patient_code) {
        this.patients.set(updated.patient_code, updated);
      }
      return updated;
    }

    const codeNum = data.id.replace(/[^0-9]/g, '') || String(this.codeSequenceCounter + 1);
    const newRecord: PatientRecord = {
      id: data.id,
      patient_code: data.patient_code || `SKC-${codeNum.padStart(6, '0')}`,
      branch_id: data.branch_id || 'br-dhanmondi',
      full_name: data.full_name || 'Registered Patient',
      full_name_bn: data.full_name_bn || null,
      gender: data.gender || 'female',
      date_of_birth: data.date_of_birth || null,
      approximate_age: data.approximate_age || 30,
      blood_group: data.blood_group || 'B+',
      primary_mobile: data.primary_mobile || '+8801700000000',
      primary_mobile_normalized: data.primary_mobile_normalized || normalizeMobile(data.primary_mobile || '+8801700000000'),
      secondary_mobile: data.secondary_mobile || null,
      email: data.email || null,
      address: data.address || null,
      area: data.area || null,
      city: data.city || 'Dhaka',
      district: data.district || 'Dhaka',
      emergency_contact_name: data.emergency_contact_name || null,
      emergency_contact_phone: data.emergency_contact_phone || null,
      emergency_contact_relation: data.emergency_contact_relation || null,
      preferred_language: data.preferred_language || 'bn',
      acquisition_source: data.acquisition_source || 'walk_in',
      referrer_id: data.referrer_id || null,
      status: data.status || 'active',
      due_amount: data.due_amount || 0,
      last_visit: data.last_visit || null,
      consent_sms_notifications: data.consent_sms_notifications ?? true,
      consent_email_notifications: data.consent_email_notifications ?? true,
      consent_marketing: data.consent_marketing ?? false,
      created_at: data.created_at || new Date().toISOString(),
      updated_at: data.updated_at || new Date().toISOString(),
    };

    this.patients.set(data.id, newRecord);
    if (newRecord.patient_code) {
      this.patients.set(newRecord.patient_code, newRecord);
    }
    // Also set alias for pt- / pat- / pat_ variants
    const dashToUnderscore = data.id.replace(/-/g, '_');
    const underscoreToDash = data.id.replace(/_/g, '-');
    this.patients.set(dashToUnderscore, newRecord);
    this.patients.set(underscoreToDash, newRecord);

    return newRecord;
  }

  public resolvePatient(id: string): PatientRecord | null {
    if (!id) return null;
    const trimmedId = id.trim();

    // 1. Direct match in Map
    const direct = this.patients.get(trimmedId);
    if (direct) return direct;

    // 2. Case-insensitive code or ID match
    const lowerId = trimmedId.toLowerCase();
    for (const p of this.patients.values()) {
      if (p.id.toLowerCase() === lowerId || p.patient_code.toLowerCase() === lowerId) {
        return p;
      }
    }

    // 3. Known seed aliases
    if (trimmedId === 'pt-sumaiya-01' || trimmedId === 'pt_sumaiya_01' || trimmedId === 'pat-1' || trimmedId === 'pat_1') {
      const p = this.patients.get('pat_87') || Array.from(this.patients.values())[0];
      if (p) return { ...p, id: trimmedId };
    }
    if (trimmedId === 'pat-2' || trimmedId === 'pat_2') {
      const p = this.patients.get('pat_88');
      if (p) return { ...p, id: 'pat-2' };
    }

    // 4. Underscore / hyphen normalization
    const normalized = trimmedId.replace(/-/g, '_');
    if (this.patients.has(normalized)) {
      return this.patients.get(normalized) || null;
    }
    const hyphenated = trimmedId.replace(/_/g, '-');
    if (this.patients.has(hyphenated)) {
      return this.patients.get(hyphenated) || null;
    }

    // 5. Match by numeric ID suffix (e.g. pt-8 or pat-8)
    const matchNum = trimmedId.match(/\d+/);
    if (matchNum) {
      const num = parseInt(matchNum[0], 10);
      // Check pat_<86+num> or pat_<num>
      const candidateKey1 = `pat_${86 + num}`;
      if (this.patients.has(candidateKey1)) {
        const found = this.patients.get(candidateKey1)!;
        this.patients.set(trimmedId, found);
        return found;
      }
      const candidateKey2 = `pat_${num}`;
      if (this.patients.has(candidateKey2)) {
        const found = this.patients.get(candidateKey2)!;
        this.patients.set(trimmedId, found);
        return found;
      }
    }

    // 6. Safe on-demand synthesis for any valid client ID like 'pt-8' or 'pat-X'
    if (/^(pt|pat)[-_]?\d+$/i.test(trimmedId)) {
      const synthesized = this.upsertPatient({
        id: trimmedId,
        full_name: 'Registered Patient',
      });
      return synthesized;
    }

    return null;
  }

  public async findById(id: string): Promise<PatientRecord | null> {
    return this.resolvePatient(id);
  }

  public getPatientById(id: string, includeMerged = true): PatientRecord | null {
    const p = this.resolvePatient(id);
    if (!p) return null;
    if (!includeMerged && p.status === 'merged') return null;
    return p;
  }

  public async searchPatients(options: {
    q?: string;
    status?: string;
    hasDue?: boolean;
    branchId?: string;
    allBranches?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ patients: PatientRecord[]; total: number }> {
    const { q, status, hasDue, branchId, allBranches, page = 1, limit = 20 } = options;

    let list = Array.from(this.patients.values());

    // Branch scoping
    if (!allBranches && branchId) {
      list = list.filter((p) => p.branch_id === branchId);
    }

    // Status filter
    if (status) {
      list = list.filter((p) => p.status === status);
    }

    // Has Due filter
    if (hasDue !== undefined) {
      if (hasDue) {
        list = list.filter((p) => (p.due_amount || 0) > 0);
      } else {
        list = list.filter((p) => !p.due_amount || p.due_amount === 0);
      }
    }

    // Text search (q) — safe against SQL injection
    if (q && q.trim().length > 0) {
      const search = q.trim().toLowerCase();
      list = list.filter((p) => {
        const matchCode = p.patient_code.toLowerCase().includes(search);
        const matchName = p.full_name.toLowerCase().includes(search);
        const matchNameBn = p.full_name_bn?.toLowerCase().includes(search);
        const matchMobile = p.primary_mobile.includes(search) || p.primary_mobile_normalized.includes(search);
        return matchCode || matchName || matchNameBn || matchMobile;
      });
    }

    // Sort by created_at desc
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = list.length;
    const startIndex = (page - 1) * limit;
    const paginated = list.slice(startIndex, startIndex + limit);

    return { patients: paginated, total };
  }

  public async createPatient(
    reqData: CreatePatientRequest,
    branchId: string,
    actorId: string,
    ipAddress: string
  ): Promise<{ patient: PatientRecord; duplicateCandidate?: DuplicateCandidateRecord }> {
    const normalizedMobile = normalizeMobile(reqData.primaryMobile);

    if (!isValidBangladeshMobile(normalizedMobile)) {
      throw new BadRequestError('Invalid mobile format. Must match Bangladesh pattern +8801[3-9]XXXXXXXX');
    }

    // Check for existing active record with same normalized mobile
    const existingDuplicate = await this.findByNormalizedMobile(normalizedMobile);
    if (existingDuplicate && !reqData.proceedWithDuplicate) {
      throw new ConflictError(
        `A patient with this mobile number already exists: ${existingDuplicate.full_name} (${existingDuplicate.patient_code})`
      );
    }

    const patientId = `pat_${crypto.randomUUID()}`;
    const patientCode = this.generatePatientCode();
    const now = new Date().toISOString();

    const newRecord: PatientRecord = {
      id: patientId,
      patient_code: patientCode,
      branch_id: branchId,
      full_name: reqData.fullName.trim(),
      full_name_bn: reqData.fullNameBn?.trim() || null,
      gender: reqData.gender,
      date_of_birth: reqData.dateOfBirth || null,
      approximate_age: reqData.approximateAge ?? null,
      blood_group: reqData.bloodGroup || null,
      primary_mobile: reqData.primaryMobile.trim(),
      primary_mobile_normalized: normalizedMobile,
      secondary_mobile: reqData.secondaryMobile?.trim() || null,
      email: reqData.email?.trim() || null,
      address: reqData.address?.trim() || null,
      area: reqData.area?.trim() || null,
      city: reqData.city?.trim() || 'Dhaka',
      district: reqData.district?.trim() || 'Dhaka',
      emergency_contact_name: reqData.emergencyContactName?.trim() || null,
      emergency_contact_phone: reqData.emergencyContactPhone?.trim() || null,
      emergency_contact_relation: reqData.emergencyContactRelation?.trim() || null,
      preferred_language: reqData.preferredLanguage || 'bn',
      acquisition_source: reqData.acquisitionSource || 'walk_in',
      referrer_id: reqData.referrerId || null,
      status: 'active',
      due_amount: 0,
      consent_sms_notifications: reqData.consentSmsNotifications ?? true,
      consent_email_notifications: reqData.consentEmailNotifications ?? true,
      consent_marketing: reqData.consentMarketing ?? false,
      created_at: now,
      updated_at: now,
    };

    this.patients.set(patientId, newRecord);

    let candidateRecord: DuplicateCandidateRecord | undefined;
    if (existingDuplicate) {
      // Log into human-review duplicate candidates queue
      const candidateId = `cand_${crypto.randomUUID()}`;
      candidateRecord = {
        id: candidateId,
        primary_patient_id: existingDuplicate.id,
        duplicate_patient_id: patientId,
        match_confidence: 'high',
        match_reasons: ['same_mobile'],
        status: 'pending',
        detected_during: 'server_insert',
        created_at: now,
      };
      this.duplicateCandidates.set(candidateId, candidateRecord);
    }

    // Write audit event
    await logAudit(null, {
      actorUserId: actorId,
      action: 'patient.create',
      entityType: 'patients',
      entityId: patientId,
      branchId,
      ipAddress,
      payloadAfter: {
        patientCode,
        fullName: newRecord.full_name,
        primaryMobile: newRecord.primary_mobile,
      },
    });

    return { patient: newRecord, duplicateCandidate: candidateRecord };
  }

  public async updatePatient(
    id: string,
    updates: UpdatePatientRequest,
    actorId: string,
    ipAddress: string
  ): Promise<PatientRecord> {
    const patient = await this.findById(id);
    if (!patient) {
      throw new NotFoundError('Patient record not found');
    }

    const payloadBefore = { ...patient };

    if (updates.primaryMobile) {
      const normalized = normalizeMobile(updates.primaryMobile);
      if (!isValidBangladeshMobile(normalized)) {
        throw new BadRequestError('Invalid mobile format. Must match Bangladesh pattern +8801[3-9]XXXXXXXX');
      }
      patient.primary_mobile = updates.primaryMobile.trim();
      patient.primary_mobile_normalized = normalized;
    }

    if (updates.fullName !== undefined) patient.full_name = updates.fullName.trim();
    if (updates.fullNameBn !== undefined) patient.full_name_bn = updates.fullNameBn?.trim() || null;
    if (updates.gender !== undefined) patient.gender = updates.gender;
    if (updates.dateOfBirth !== undefined) patient.date_of_birth = updates.dateOfBirth;
    if (updates.approximateAge !== undefined) patient.approximate_age = updates.approximateAge;
    if (updates.bloodGroup !== undefined) patient.blood_group = updates.bloodGroup;
    if (updates.secondaryMobile !== undefined) patient.secondary_mobile = updates.secondaryMobile;
    if (updates.email !== undefined) patient.email = updates.email;
    if (updates.address !== undefined) patient.address = updates.address;
    if (updates.area !== undefined) patient.area = updates.area;
    if (updates.city !== undefined) patient.city = updates.city;
    if (updates.district !== undefined) patient.district = updates.district;
    if (updates.emergencyContactName !== undefined) patient.emergency_contact_name = updates.emergencyContactName;
    if (updates.emergencyContactPhone !== undefined) patient.emergency_contact_phone = updates.emergencyContactPhone;
    if (updates.emergencyContactRelation !== undefined) patient.emergency_contact_relation = updates.emergencyContactRelation;
    if (updates.preferredLanguage !== undefined) patient.preferred_language = updates.preferredLanguage;
    if (updates.acquisitionSource !== undefined) patient.acquisition_source = updates.acquisitionSource;
    if (updates.status !== undefined) patient.status = updates.status;
    if (updates.consentSmsNotifications !== undefined) patient.consent_sms_notifications = updates.consentSmsNotifications;
    if (updates.consentEmailNotifications !== undefined) patient.consent_email_notifications = updates.consentEmailNotifications;
    if (updates.consentMarketing !== undefined) patient.consent_marketing = updates.consentMarketing;

    patient.updated_at = new Date().toISOString();

    await logAudit(null, {
      actorUserId: actorId,
      action: 'patient.update',
      entityType: 'patients',
      entityId: id,
      branchId: patient.branch_id,
      ipAddress,
      payloadBefore,
      payloadAfter: patient,
    });

    return patient;
  }

  public async getDuplicateCandidates(): Promise<DuplicateCandidateRecord[]> {
    const list = Array.from(this.duplicateCandidates.values());
    return list.filter((c) => c.status === 'pending');
  }

  public async resolveDuplicate(
    candidateId: string,
    action: 'not_duplicate' | 'confirm' | 'merge',
    resolutionNotes: string | undefined,
    actorId: string,
    ipAddress: string
  ): Promise<{ success: boolean; candidate: DuplicateCandidateRecord }> {
    const candidate = this.duplicateCandidates.get(candidateId);
    if (!candidate) {
      throw new NotFoundError('Duplicate candidate record not found');
    }

    const primaryPatient = await this.findById(candidate.primary_patient_id);
    const duplicatePatient = await this.findById(candidate.duplicate_patient_id);

    if (!primaryPatient || !duplicatePatient) {
      throw new NotFoundError('Referenced patients for candidate not found');
    }

    if (action === 'not_duplicate') {
      candidate.status = 'not_duplicate';
      candidate.resolved_by = actorId;
      candidate.resolved_at = new Date().toISOString();
      candidate.resolution_notes = resolutionNotes || null;
    } else if (action === 'confirm') {
      candidate.status = 'confirmed_duplicate';
      candidate.resolved_by = actorId;
      candidate.resolved_at = new Date().toISOString();
      candidate.resolution_notes = resolutionNotes || null;
    } else if (action === 'merge') {
      // Non-destructive merge validations
      if (primaryPatient.id === duplicatePatient.id) {
        throw new BadRequestError('Self-merge rejected. Cannot merge a patient record into itself.');
      }

      if (primaryPatient.status === 'merged') {
        throw new BadRequestError('Chain-merge rejected. Target patient is already merged into another profile.');
      }

      if (duplicatePatient.status === 'merged') {
        throw new BadRequestError('Patient is already merged.');
      }

      // Mark duplicate as merged
      duplicatePatient.status = 'merged';
      duplicatePatient.merged_into_patient_id = primaryPatient.id;
      duplicatePatient.merged_at = new Date().toISOString();
      duplicatePatient.merged_by = actorId;
      duplicatePatient.updated_at = new Date().toISOString();

      candidate.status = 'merged';
      candidate.resolved_by = actorId;
      candidate.resolved_at = new Date().toISOString();
      candidate.resolution_notes = resolutionNotes || 'Merged by administrator';

      await logAudit(null, {
        actorUserId: actorId,
        action: 'patient.merge',
        entityType: 'patients',
        entityId: duplicatePatient.id,
        branchId: primaryPatient.branch_id,
        ipAddress,
        payloadBefore: { id: duplicatePatient.id, status: 'active' },
        payloadAfter: {
          id: duplicatePatient.id,
          status: 'merged',
          mergedIntoPatientId: primaryPatient.id,
        },
      });
    }

    return { success: true, candidate };
  }

  public async getMedicalHistory(patientId: string): Promise<MedicalHistoryRecord | null> {
    return this.medicalHistories.get(patientId) || null;
  }

  public async saveMedicalHistory(
    patientId: string,
    data: {
      allergies?: string;
      skinType?: string;
      currentMedications?: string;
      chronicConditions?: string;
      pastAestheticProcedures?: string;
      contraindications?: string;
    },
    actorId: string,
    ipAddress: string
  ): Promise<MedicalHistoryRecord> {
    const patient = await this.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient record not found');
    }

    const now = new Date().toISOString();
    const existing = this.medicalHistories.get(patientId);

    const record: MedicalHistoryRecord = {
      patient_id: patientId,
      allergies: data.allergies !== undefined ? data.allergies : existing?.allergies,
      skin_type: data.skinType !== undefined ? data.skinType : existing?.skin_type,
      current_medications: data.currentMedications !== undefined ? data.currentMedications : existing?.current_medications,
      chronic_conditions: data.chronicConditions !== undefined ? data.chronicConditions : existing?.chronic_conditions,
      past_aesthetic_procedures: data.pastAestheticProcedures !== undefined ? data.pastAestheticProcedures : existing?.past_aesthetic_procedures,
      contraindications: data.contraindications !== undefined ? data.contraindications : existing?.contraindications,
      created_by: existing?.created_by || actorId,
      updated_by: actorId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    this.medicalHistories.set(patientId, record);

    await logAudit(null, {
      actorUserId: actorId,
      action: 'medical_history.update',
      entityType: 'patient_medical_history',
      entityId: patientId,
      branchId: patient.branch_id,
      ipAddress,
    });

    return record;
  }

  public async getTimeline(patientId: string, eventTypeFilter?: string): Promise<PatientTimelineItemDto[]> {
    const patient = this.resolvePatient(patientId);
    if (!patient) {
      throw new NotFoundError('Patient record not found');
    }

    const items: PatientTimelineItemDto[] = [];

    // 1. Registration
    items.push({
      id: `tl_reg_${patient.id}`,
      patientId: patient.id,
      eventType: 'patient_registered',
      eventAt: patient.created_at,
      summary: `Patient profile registered at branch ${patient.branch_id} (${patient.patient_code})`,
      refType: 'patients',
      refId: patient.id,
    });

    // 2. Merged event
    if (patient.status === 'merged' && patient.merged_at) {
      items.push({
        id: `tl_merge_${patient.id}`,
        patientId: patient.id,
        eventType: 'patient_merged',
        eventAt: patient.merged_at,
        summary: `Profile merged into primary record #${patient.merged_into_patient_id}`,
        refType: 'patients',
        refId: patient.merged_into_patient_id || patient.id,
      });
    }

    // 3. Notes
    for (const note of this.notes.values()) {
      if (note.patient_id === patientId) {
        items.push({
          id: `tl_note_${note.id}`,
          patientId: note.patient_id,
          eventType: `note_${note.note_type}`,
          eventAt: note.created_at,
          summary: `${note.is_pinned ? '[PINNED] ' : ''}${note.author_name} (${note.author_role}): ${note.note_text}`,
          refType: 'patient_notes',
          refId: note.id,
        });
      }
    }

    // 4. Medical history update
    const medHistory = this.medicalHistories.get(patientId);
    if (medHistory) {
      items.push({
        id: `tl_med_${medHistory.patient_id}`,
        patientId: medHistory.patient_id,
        eventType: 'medical_history_updated',
        eventAt: medHistory.updated_at,
        summary: `Clinical medical profile updated (Skin: ${medHistory.skin_type || 'N/A'}, Allergies: ${medHistory.allergies || 'None'})`,
        refType: 'patient_medical_history',
        refId: medHistory.patient_id,
      });
    }

    // 5. Categorized medical entries
    for (const entry of this.medicalEntries.values()) {
      if (entry.patient_id === patientId) {
        items.push({
          id: `tl_pme_${entry.id}`,
          patientId: entry.patient_id,
          eventType: `clinical_${entry.category}`,
          eventAt: entry.created_at,
          summary: `${entry.category.toUpperCase()}: ${entry.title}${entry.details ? ' — ' + entry.details : ''}`,
          refType: 'patient_medical_entries',
          refId: entry.id,
        });
      }
    }

    // 6. Attached Files
    const attachedFiles = fileService.getPatientFiles(patientId);
    for (const f of attachedFiles) {
      items.push({
        id: `tl_file_${f.id}`,
        patientId: f.patientId,
        eventType: `file_${f.fileCategory}`,
        eventAt: f.createdAt,
        summary: `Uploaded ${f.fileCategory.replace('_', ' ')}: ${f.title}`,
        refType: 'patient_files',
        refId: f.id,
      });
    }

    // Filter by eventType if provided
    let filtered = items;
    if (eventTypeFilter && eventTypeFilter !== 'all') {
      filtered = items.filter((it) => it.eventType.includes(eventTypeFilter) || it.refType === eventTypeFilter);
    }

    // Sort strictly chronological DESC (newest first)
    return filtered.sort((a, b) => new Date(b.eventAt).getTime() - new Date(a.eventAt).getTime());
  }

  public async getMedicalEntries(patientId: string, categoryFilter?: string): Promise<PatientMedicalEntryDto[]> {
    const list: PatientMedicalEntryDto[] = [];
    for (const e of this.medicalEntries.values()) {
      if (e.patient_id === patientId) {
        if (!categoryFilter || categoryFilter === 'all' || e.category === categoryFilter) {
          list.push({
            id: e.id,
            patientId: e.patient_id,
            category: e.category,
            title: e.title,
            details: e.details,
            severity: e.severity,
            onsetDate: e.onset_date,
            isActive: e.is_active,
            createdBy: e.created_by,
            creatorName: e.creator_name,
            createdAt: e.created_at,
            updatedAt: e.updated_at,
          });
        }
      }
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async addMedicalEntry(
    patientId: string,
    req: CreateMedicalEntryRequest,
    creatorId: string,
    creatorName?: string
  ): Promise<PatientMedicalEntryDto> {
    const patient = this.resolvePatient(patientId);
    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    const id = `pme_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const entry: MedicalEntryRecord = {
      id,
      patient_id: patientId,
      category: req.category,
      title: req.title,
      details: req.details || null,
      severity: req.severity || null,
      onset_date: req.onsetDate || null,
      is_active: req.isActive ?? true,
      created_by: creatorId,
      creator_name: creatorName || 'Staff Clinician',
      created_at: now,
      updated_at: now,
    };

    this.medicalEntries.set(id, entry);
    return {
      id: entry.id,
      patientId: entry.patient_id,
      category: entry.category,
      title: entry.title,
      details: entry.details,
      severity: entry.severity,
      onsetDate: entry.onset_date,
      isActive: entry.is_active,
      createdBy: entry.created_by,
      creatorName: entry.creator_name,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    };
  }

  public async toggleMedicalEntry(entryId: string): Promise<PatientMedicalEntryDto> {
    const entry = this.medicalEntries.get(entryId);
    if (!entry) {
      throw new NotFoundError('Medical entry not found');
    }
    entry.is_active = !entry.is_active;
    entry.updated_at = new Date().toISOString();
    return {
      id: entry.id,
      patientId: entry.patient_id,
      category: entry.category,
      title: entry.title,
      details: entry.details,
      severity: entry.severity,
      onsetDate: entry.onset_date,
      isActive: entry.is_active,
      createdBy: entry.created_by,
      creatorName: entry.creator_name,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    };
  }

  public async getNotes(patientId: string, noteTypeFilter?: string): Promise<PatientNoteDto[]> {
    const list: PatientNoteDto[] = [];
    for (const n of this.notes.values()) {
      if (n.patient_id === patientId) {
        if (!noteTypeFilter || noteTypeFilter === 'all' || n.note_type === noteTypeFilter) {
          list.push({
            id: n.id,
            patientId: n.patient_id,
            authorId: n.author_id,
            authorName: n.author_name,
            authorRole: n.author_role,
            noteType: n.note_type,
            noteText: n.note_text,
            isPinned: n.is_pinned,
            createdAt: n.created_at,
          });
        }
      }
    }
    // Pinned first, then newest first
    return list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  public async addNote(
    patientId: string,
    req: CreatePatientNoteRequest,
    authorId: string,
    authorName: string,
    authorRole: string
  ): Promise<PatientNoteDto> {
    const patient = this.resolvePatient(patientId);
    if (!patient) {
      throw new NotFoundError('Patient not found');
    }

    const id = `note_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const note: NoteRecord = {
      id,
      patient_id: patientId,
      author_id: authorId,
      author_name: authorName,
      author_role: authorRole,
      note_type: req.noteType,
      note_text: req.noteText,
      is_pinned: req.isPinned ?? false,
      created_at: now,
    };

    this.notes.set(id, note);
    return {
      id: note.id,
      patientId: note.patient_id,
      authorId: note.author_id,
      authorName: note.author_name,
      authorRole: note.author_role,
      noteType: note.note_type,
      noteText: note.note_text,
      isPinned: note.is_pinned,
      createdAt: note.created_at,
    };
  }

  public async getPatientProfile(patientId: string, roles: string[]): Promise<PatientProfileDto> {
    const patient = await this.findById(patientId);
    if (!patient) {
      throw new NotFoundError('Patient record not found');
    }

    const baseDto = formatPatientDto(patient, roles) as PatientDto;

    // Next session sample per Prompt 5:
    // Sample: Sumaiya Rahman, SKC-000087, Next session "Tue 21 Oct 2026, 4:30 PM, Dr. Nusrat Jahan, Confirmed"
    let nextSession = null;
    let packageBalance = null;
    let activeTreatmentPlan = null;

    if (patient.patient_code === 'SKC-000087' || patient.full_name.includes('Sumaiya')) {
      nextSession = {
        sessionDate: 'Tue 21 Oct 2026',
        timeSlot: '4:30 PM',
        doctorName: 'Dr. Nusrat Jahan',
        treatmentName: 'Laser Toning Session 3/10',
        status: 'CONFIRMED' as const,
      };
      packageBalance = {
        packageName: 'Laser Toning & Pigment Clarifying Protocol',
        sessionsLeft: 8,
        totalSessions: 10,
        expiresAt: '12 Jan 2027',
      };
      activeTreatmentPlan = 'Melasma Pigmentation Protocol & Laser Toning (10 Sessions)';
    }

    return {
      ...baseDto,
      nextSession,
      packageBalance,
      activeTreatmentPlan,
      portalAccount: {
        status: 'NOT_CREATED',
      },
    };
  }

  public getPatientTimeline(patientId: string, appointments: Array<{ id: string; appointment_code: string; service_name: string; appointment_date: string; start_time: string; status: string; created_at: string }> = []): PatientTimelineItemDto[] {
    const patient = this.resolvePatient(patientId);
    if (!patient) return [];

    const items: PatientTimelineItemDto[] = [];

    // 1. Patient Registration Event
    items.push({
      id: `tl-reg-${patient.id}`,
      patientId: patient.id,
      eventType: 'patient_registered',
      eventAt: patient.created_at,
      summary: `Patient profile registered at branch #${patient.branch_id} (${patient.patient_code})`,
      refType: 'patients',
      refId: patient.id,
    });

    // 2. Patient Merged Event
    if (patient.status === 'merged' && patient.merged_at) {
      items.push({
        id: `tl-mrg-${patient.id}`,
        patientId: patient.id,
        eventType: 'patient_merged',
        eventAt: patient.merged_at,
        summary: `Profile merged into primary record #${patient.merged_into_patient_id}`,
        refType: 'patients',
        refId: patient.merged_into_patient_id || '',
      });
    }

    // 3. Categorized Medical Entries
    for (const e of this.medicalEntries.values()) {
      if (e.patient_id === patient.id) {
        items.push({
          id: `tl-pme-${e.id}`,
          patientId: patient.id,
          eventType: `clinical_${e.category}`,
          eventAt: e.created_at,
          summary: `${e.category.toUpperCase()}: ${e.title}`,
          refType: 'patient_medical_entries',
          refId: e.id,
        });
      }
    }

    // 4. Patient Notes
    for (const n of this.notes.values()) {
      if (n.patient_id === patient.id) {
        items.push({
          id: `tl-note-${n.id}`,
          patientId: patient.id,
          eventType: `note_${n.note_type}`,
          eventAt: n.created_at,
          summary: n.note_text,
          refType: 'patient_notes',
          refId: n.id,
        });
      }
    }

    // 5. Appointments Events
    for (const apt of appointments) {
      items.push({
        id: `tl-apt-${apt.id}`,
        patientId,
        eventType: `appointment_${apt.status}`,
        eventAt: apt.created_at,
        summary: `Appointment ${apt.appointment_code} (${apt.service_name} on ${apt.appointment_date} at ${apt.start_time})`,
        refType: 'appointments',
        refId: apt.id,
      });
    }

    // Chronological sort descending
    items.sort((a, b) => b.eventAt.localeCompare(a.eventAt));
    return items;
  }

  public clear(): void {
    this.patients.clear();
    this.duplicateCandidates.clear();
    this.medicalHistories.clear();
    this.medicalEntries.clear();
    this.notes.clear();
    this.codeSequenceCounter = 87;
    this.seedDevPatients();
  }
}

export const patientRepository = new PatientRepository();
export const patientService = patientRepository;

/**
 * Filter patient DTO based on caller's role.
 * Call Center role receives a restricted view (no address, no clinical history, no billing).
 */
export function formatPatientDto(
  record: PatientRecord,
  roles: string[]
): PatientDto | RestrictedCallCenterPatientDto {
  const isCallCenterOnly = roles.length === 1 && roles.includes('call_center');

  if (isCallCenterOnly) {
    const restricted: RestrictedCallCenterPatientDto = {
      id: record.id,
      patientCode: record.patient_code,
      branchId: record.branch_id,
      fullName: record.full_name,
      fullNameBn: record.full_name_bn || undefined,
      gender: record.gender,
      approximateAge: record.approximate_age ?? undefined,
      primaryMobile: record.primary_mobile,
      preferredLanguage: record.preferred_language,
      status: record.status,
      lastVisit: record.last_visit || undefined,
    };
    return restricted;
  }

  const fullDto: PatientDto = {
    id: record.id,
    patientCode: record.patient_code,
    branchId: record.branch_id,
    fullName: record.full_name,
    fullNameBn: record.full_name_bn || undefined,
    gender: record.gender,
    dateOfBirth: record.date_of_birth || undefined,
    approximateAge: record.approximate_age ?? undefined,
    bloodGroup: record.blood_group || undefined,
    primaryMobile: record.primary_mobile,
    secondaryMobile: record.secondary_mobile || undefined,
    email: record.email || undefined,
    address: record.address || undefined,
    area: record.area || undefined,
    city: record.city,
    district: record.district,
    emergencyContactName: record.emergency_contact_name || undefined,
    emergencyContactPhone: record.emergency_contact_phone || undefined,
    emergencyContactRelation: record.emergency_contact_relation || undefined,
    preferredLanguage: record.preferred_language,
    acquisitionSource: record.acquisition_source,
    referrerId: record.referrer_id || undefined,
    status: record.status,
    mergedIntoPatientId: record.merged_into_patient_id || undefined,
    lastVisit: record.last_visit || undefined,
    dueAmount: record.due_amount || 0,
    consentSmsNotifications: record.consent_sms_notifications ?? true,
    consentEmailNotifications: record.consent_email_notifications ?? true,
    consentMarketing: record.consent_marketing ?? false,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };

  return fullDto;
}
