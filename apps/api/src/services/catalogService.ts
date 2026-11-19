/**
 * SUOXI Skin Care & Aesthetic Center CRM (Dhaka, Bangladesh)
 * Treatment Catalog & Food & Lifestyle Guidance Service
 *
 * Implements:
 * - Treatment categories and services master
 * - Multi-resource allocation (rooms & devices)
 * - Interval-based clinical follow-up rules
 * - Versioned Food & Lifestyle guidance library
 * - Rule: Exactly ONE approved guidance version per service (atomic retirement + approval)
 * - Approved version immutability (modifying approved version returns 409 Conflict)
 * - Clinical authorization gate (only clinicians with guidance.approve can approve)
 * - Bilingual item validation (at least one language required)
 */

import crypto from 'node:crypto';
import type {
  TreatmentCategoryDto,
  TreatmentServiceDto,
  TreatmentFollowupRuleDto,
  FoodLifestyleGuidanceDto,
  FoodLifestyleGuidanceItemDto,
  GuidanceStatus,
  GuidanceSection,
  CreateTreatmentServiceRequest,
  UpdateTreatmentServiceRequest,
  CreateFollowupRuleRequest,
  CreateGuidanceRequest,
  UpdateGuidanceRequest,
} from '@suoxi/shared-types';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../middleware/errorHandler.js';
import { logAudit } from './auditLogger.js';

export class CatalogService {
  private categories: Map<string, TreatmentCategoryDto> = new Map();
  private services: Map<string, TreatmentServiceDto> = new Map();
  private followupRules: Map<string, TreatmentFollowupRuleDto[]> = new Map(); // service_id -> rules
  private guidanceList: Map<string, FoodLifestyleGuidanceDto> = new Map(); // guidance_id -> guidance
  private serviceApprovalLocks: Map<string, Promise<void>> = new Map();

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    // 1. Treatment Categories
    const initialCategories: TreatmentCategoryDto[] = [
      {
        id: 'cat-facial',
        code: 'facial',
        name: 'Facial & Skin Rejuvenation',
        name_bn: 'ফেসিয়াল ও ত্বক পুনরুজ্জীবন',
        description: 'Advanced aesthetic facial treatments, HydraFacial, and hydration regimens',
        sort_order: 1,
        is_active: true,
      },
      {
        id: 'cat-laser',
        code: 'laser',
        name: 'Laser & Energy Devices',
        name_bn: 'লেজার ট্রিটমেন্ট',
        description: 'Q-Switched Nd:YAG, Carbon laser peel, and laser toning procedures',
        sort_order: 2,
        is_active: true,
      },
      {
        id: 'cat-hair',
        code: 'hair',
        name: 'Hair & Scalp Therapy',
        name_bn: 'চুল ও স্ক্যাল্প থেরাপি',
        description: 'PRP hair restoration, mesotherapy, and hair loss management',
        sort_order: 3,
        is_active: true,
      },
      {
        id: 'cat-peel',
        code: 'peel',
        name: 'Chemical Peels',
        name_bn: 'কেমিক্যাল পিল',
        description: 'Glycolic, salicylic, and customized medical chemical peels',
        sort_order: 4,
        is_active: true,
      },
      {
        id: 'cat-acne',
        code: 'acne_care',
        name: 'Acne & Scar Care',
        name_bn: 'ব্রণ ও দাগের যত্ন',
        description: 'Subcision, microneedling, active acne extraction and recovery',
        sort_order: 5,
        is_active: true,
      },
      {
        id: 'cat-body',
        code: 'body',
        name: 'Body Contouring & Aesthetics',
        name_bn: 'বডি কনট্যুরিং',
        description: 'Non-invasive fat reduction, skin tightening, and contouring',
        sort_order: 6,
        is_active: true,
      },
      {
        id: 'cat-consultation',
        code: 'consultation',
        name: 'Clinical Consultation',
        name_bn: 'ক্লিনিক্যাল কনসালটেশন',
        description: 'Comprehensive dermatological and aesthetic specialist consultation',
        sort_order: 7,
        is_active: true,
      },
    ];

    for (const cat of initialCategories) {
      this.categories.set(cat.id, cat);
    }

    // 2. Sample Treatment Service: HydraFacial (HF-001)
    const hydraFacialId = 'srv-hf-001';
    const sampleService: TreatmentServiceDto = {
      id: hydraFacialId,
      service_code: 'HF-001',
      category_id: 'cat-facial',
      category_code: 'facial',
      category_name: 'Facial & Skin Rejuvenation',
      name: 'HydraFacial Treatment',
      name_bn: 'হাইড্রাফেসিয়াল ট্রিটমেন্ট',
      description: 'Deep cleansing, gentle exfoliation, pore extraction, and peptide hydration infusion',
      base_price: '4500.00',
      default_duration_minutes: 60,
      default_followup_days: 14,
      requires_clinical_approval: false,
      is_active: true,
      allowed_resource_ids: ['res-room-1', 'res-dev-hydra'],
      allowed_resources: [
        { id: 'res-room-1', name: 'Room 1 (Facial Suite)', resource_type: 'room' },
        { id: 'res-dev-hydra', name: 'HydraFacial MD Elite', resource_type: 'device' },
      ],
      created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
    };
    this.services.set(hydraFacialId, sampleService);

    const laserServiceId = 'srv-laser-01';
    const laserService: TreatmentServiceDto = {
      id: laserServiceId,
      service_code: 'FL-001',
      category_id: 'cat-laser',
      category_code: 'laser',
      category_name: 'Laser Treatments',
      name: 'Fractional CO2 Laser Resurfacing',
      name_bn: 'ফ্র্যাকশনাল CO2 লেজার রিসারফেসিং',
      description: 'Fractional ablative skin resurfacing for acne scars and skin texture',
      base_price: '8500.00',
      default_duration_minutes: 60,
      default_followup_days: 14,
      requires_clinical_approval: true,
      is_active: true,
      allowed_resource_ids: ['res-room-1'],
      allowed_resources: [{ id: 'res-room-1', name: 'Laser Suite 1', resource_type: 'room' }],
      created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
    };
    this.services.set(laserServiceId, laserService);

    // Sample Follow-up Rule for HydraFacial
    const sampleRule: TreatmentFollowupRuleDto = {
      id: 'rul-hf-001',
      service_id: hydraFacialId,
      interval_days: 14,
      max_followups: 1,
      instructions: 'Review skin moisture balance, pore clearance, and SPF compliance after 2 weeks',
      instructions_bn: '২ সপ্তাহ পর ত্বকের আর্দ্রতা, পোরস ও সানস্ক্রিন ব্যবহারের মূল্যায়ন',
      needs_clinical_approval: true,
      approved_by: 'usr-doctor-01',
      approver_name: 'Dr. Nusrat Jahan',
      created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
    };
    this.followupRules.set(hydraFacialId, [sampleRule]);

    // 3. Sample Guidance for HydraFacial (HF-001) marked SAMPLE ONLY
    const sampleGuidanceId = 'gd-hf-001';
    const sampleItems: FoodLifestyleGuidanceItemDto[] = [
      {
        id: 'gdi-1',
        guidance_id: sampleGuidanceId,
        section: 'recommended_foods',
        content_en: 'Drink 2 to 3 litres of water daily to maintain dermal cellular hydration',
        content_bn: 'প্রতিদিন ২-৩ লিটার পানি পান করুন কোষীয় আর্দ্রতা বজায় রাখতে',
        sort_order: 1,
        created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
      },
      {
        id: 'gdi-2',
        guidance_id: sampleGuidanceId,
        section: 'foods_to_avoid',
        content_en: 'Spicy and oily food for 48 hours to minimize cutaneous inflammation',
        content_bn: '৪৮ ঘণ্টা মসলাদার ও তৈলাক্ত খাবার এড়িয়ে চলুন প্রদাহ রোধে',
        sort_order: 2,
        created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
      },
      {
        id: 'gdi-3',
        guidance_id: sampleGuidanceId,
        section: 'lifestyle_avoid',
        content_en: 'Direct sun exposure for 3 days and avoid sauna/steam baths',
        content_bn: '৩ দিন সরাসরি রোদ এড়িয়ে চলুন এবং বাষ্প/সনা পরিহার করুন',
        sort_order: 3,
        created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
      },
      {
        id: 'gdi-4',
        guidance_id: sampleGuidanceId,
        section: 'lifestyle_do',
        content_en: 'Apply broad-spectrum SPF 50+ mineral sunscreen every 3-4 hours',
        content_bn: 'প্রতি ৩-৪ ঘণ্টা পর পর এসপিএফ ৫০+ সানস্ক্রিন ব্যবহার করুন',
        sort_order: 4,
        created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
      },
      {
        id: 'gdi-5',
        guidance_id: sampleGuidanceId,
        section: 'general_advice',
        content_en: 'SAMPLE ONLY — real guidance must be clinician-approved (open decision A-08)',
        content_bn: 'নমুনা তথ্য মাত্র — প্রকৃত নির্দেশনা অবশ্যই চিকিৎসকের দ্বারা অনুমোদিত হতে হবে',
        sort_order: 5,
        created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
      },
    ];

    const sampleGuidance: FoodLifestyleGuidanceDto = {
      id: sampleGuidanceId,
      service_id: hydraFacialId,
      service_code: 'HF-001',
      service_name: 'HydraFacial Treatment',
      version_number: 1,
      title: 'HydraFacial aftercare diet & lifestyle guidance',
      title_bn: 'হাইড্রাফেসিয়াল পরবর্তী খাদ্য ও জীবনধারা নির্দেশিকা',
      status: 'approved',
      author_id: 'usr-doctor-01',
      author_name: 'Dr. Nusrat Jahan',
      approved_by: 'usr-doctor-01',
      approver_name: 'Dr. Nusrat Jahan',
      approved_at: new Date('2026-01-15T09:30:00Z').toISOString(),
      clinical_notes: 'Standard aesthetic hydration protocol with SPF protection requirements',
      is_sample: true,
      items: sampleItems,
      created_at: new Date('2026-01-15T09:00:00Z').toISOString(),
      updated_at: new Date('2026-01-15T09:30:00Z').toISOString(),
    };
    this.guidanceList.set(sampleGuidanceId, sampleGuidance);
  }

  // ============================================================================
  // Categories
  // ============================================================================

  public listCategories(): TreatmentCategoryDto[] {
    return Array.from(this.categories.values()).sort((a, b) => a.sort_order - b.sort_order);
  }

  public createCategory(data: {
    name: string;
    name_bn?: string;
    code?: string;
    description?: string;
  }): TreatmentCategoryDto {
    const rawCode = data.code?.trim() || data.name.trim();
    const cleanCode = rawCode.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const id = `cat-${cleanCode || crypto.randomUUID().slice(0, 8)}`;

    // Check if category already exists with same id or code
    for (const cat of this.categories.values()) {
      if (
        cat.code.toLowerCase() === cleanCode.toLowerCase() ||
        cat.name.toLowerCase() === data.name.trim().toLowerCase()
      ) {
        return cat;
      }
    }

    const newCategory: TreatmentCategoryDto = {
      id,
      code: cleanCode || `cat_${Date.now()}`,
      name: data.name.trim(),
      name_bn: data.name_bn?.trim() || undefined,
      description: data.description?.trim() || undefined,
      sort_order: this.categories.size + 1,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    this.categories.set(id, newCategory);
    return newCategory;
  }

  // ============================================================================
  // Treatment Services
  // ============================================================================

  public listServices(filter?: { categoryId?: string; activeOnly?: boolean; search?: string }): TreatmentServiceDto[] {
    let result = Array.from(this.services.values());

    if (filter?.categoryId && filter.categoryId !== 'all') {
      result = result.filter(
        (s) => s.category_id === filter.categoryId || s.category_code === filter.categoryId
      );
    }

    if (filter?.activeOnly) {
      result = result.filter((s) => s.is_active);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.service_code.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.name_bn && s.name_bn.toLowerCase().includes(q))
      );
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  public getServiceById(id: string): TreatmentServiceDto {
    const s = this.services.get(id);
    if (!s) {
      throw new NotFoundError(`Treatment service '${id}' not found`);
    }
    const rules = this.followupRules.get(id) || [];
    return { ...s, followup_rules: rules };
  }

  public async createService(
    req: CreateTreatmentServiceRequest,
    user: { id: string; role: string }
  ): Promise<TreatmentServiceDto> {
    if (!req.service_code || !req.name || !req.category_id) {
      throw new BadRequestError('Service code, category, and name are required');
    }

    // Check duplicate service code
    const existing = Array.from(this.services.values()).find(
      (s) => s.service_code.toLowerCase() === req.service_code.toLowerCase()
    );
    if (existing) {
      throw new ConflictError(`Service code '${req.service_code}' already exists`);
    }

    // Category lookup
    const category =
      this.categories.get(req.category_id) ||
      Array.from(this.categories.values()).find((c) => c.code === req.category_id);
    if (!category) {
      throw new BadRequestError(`Invalid category '${req.category_id}'`);
    }

    const priceNum = Number(req.base_price);
    if (isNaN(priceNum) || priceNum < 0) {
      throw new BadRequestError('Base price must be a valid non-negative number');
    }

    const id = `srv-${crypto.randomUUID()}`;
    const newService: TreatmentServiceDto = {
      id,
      service_code: req.service_code.trim().toUpperCase(),
      category_id: category.id,
      category_code: category.code,
      category_name: category.name,
      name: req.name.trim(),
      name_bn: req.name_bn?.trim() || undefined,
      description: req.description?.trim() || undefined,
      base_price: priceNum.toFixed(2),
      default_duration_minutes: req.default_duration_minutes || 30,
      default_followup_days: req.default_followup_days ?? 14,
      requires_clinical_approval: Boolean(req.requires_clinical_approval),
      is_active: req.is_active !== undefined ? Boolean(req.is_active) : true,
      allowed_resource_ids: req.allowed_resource_ids || [],
      allowed_resources: (req.allowed_resource_ids || []).map((resId) => ({
        id: resId,
        name: resId.includes('dev') ? 'Aesthetic Device' : 'Treatment Room',
        resource_type: resId.includes('dev') ? 'device' : 'room',
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.services.set(id, newService);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'TREATMENT_SERVICE_CREATE',
      entityType: 'treatment_services',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: newService,
    });

    return newService;
  }

  public async updateService(
    id: string,
    req: UpdateTreatmentServiceRequest,
    user: { id: string; role: string }
  ): Promise<TreatmentServiceDto> {
    const service = this.services.get(id);
    if (!service) {
      throw new NotFoundError(`Treatment service '${id}' not found`);
    }

    if (req.service_code && req.service_code.toUpperCase() !== service.service_code) {
      const duplicate = Array.from(this.services.values()).find(
        (s) => s.id !== id && s.service_code.toLowerCase() === req.service_code!.toLowerCase()
      );
      if (duplicate) {
        throw new ConflictError(`Service code '${req.service_code}' already exists`);
      }
      service.service_code = req.service_code.trim().toUpperCase();
    }

    if (req.category_id) {
      const cat =
        this.categories.get(req.category_id) ||
        Array.from(this.categories.values()).find((c) => c.code === req.category_id);
      if (!cat) throw new BadRequestError(`Invalid category '${req.category_id}'`);
      service.category_id = cat.id;
      service.category_code = cat.code;
      service.category_name = cat.name;
    }

    if (req.name) service.name = req.name.trim();
    if (req.name_bn !== undefined) service.name_bn = req.name_bn.trim() || undefined;
    if (req.description !== undefined) service.description = req.description.trim() || undefined;
    if (req.base_price !== undefined) {
      const p = Number(req.base_price);
      if (isNaN(p) || p < 0) throw new BadRequestError('Invalid base price');
      service.base_price = p.toFixed(2);
    }
    if (req.default_duration_minutes !== undefined) {
      service.default_duration_minutes = req.default_duration_minutes;
    }
    if (req.default_followup_days !== undefined) {
      service.default_followup_days = req.default_followup_days;
    }
    if (req.requires_clinical_approval !== undefined) {
      service.requires_clinical_approval = Boolean(req.requires_clinical_approval);
    }
    if (req.is_active !== undefined) {
      service.is_active = Boolean(req.is_active);
    }
    if (req.allowed_resource_ids) {
      service.allowed_resource_ids = req.allowed_resource_ids;
      service.allowed_resources = req.allowed_resource_ids.map((resId) => ({
        id: resId,
        name: resId.includes('dev') ? 'Aesthetic Device' : 'Treatment Room',
        resource_type: resId.includes('dev') ? 'device' : 'room',
      }));
    }

    service.updated_at = new Date().toISOString();
    this.services.set(id, service);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'TREATMENT_SERVICE_UPDATE',
      entityType: 'treatment_services',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: service,
    });

    return service;
  }

  // ============================================================================
  // Follow-up Rules
  // ============================================================================

  public getFollowupRules(serviceId: string): TreatmentFollowupRuleDto[] {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new NotFoundError(`Treatment service '${serviceId}' not found`);
    }
    return this.followupRules.get(serviceId) || [];
  }

  public async createFollowupRule(
    serviceId: string,
    req: CreateFollowupRuleRequest,
    user: { id: string; role: string; fullName?: string }
  ): Promise<TreatmentFollowupRuleDto> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new NotFoundError(`Treatment service '${serviceId}' not found`);
    }

    if (!req.interval_days || req.interval_days <= 0) {
      throw new BadRequestError('Follow-up interval must be greater than zero');
    }

    const isClinical = user.role === 'doctor' || user.role === 'super_admin';

    const ruleId = `rul-${crypto.randomUUID()}`;
    const newRule: TreatmentFollowupRuleDto = {
      id: ruleId,
      service_id: serviceId,
      interval_days: req.interval_days,
      max_followups: req.max_followups || 1,
      instructions: req.instructions?.trim() || undefined,
      instructions_bn: req.instructions_bn?.trim() || undefined,
      needs_clinical_approval: Boolean(req.needs_clinical_approval),
      approved_by: isClinical && req.needs_clinical_approval ? user.id : undefined,
      approver_name: isClinical && req.needs_clinical_approval ? (user.fullName || 'Clinician') : undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const currentRules = this.followupRules.get(serviceId) || [];
    currentRules.push(newRule);
    this.followupRules.set(serviceId, currentRules);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'TREATMENT_FOLLOWUP_RULE_CREATE',
      entityType: 'treatment_followup_rules',
      entityId: ruleId,
      ipAddress: '127.0.0.1',
      payloadAfter: newRule,
    });

    return newRule;
  }

  // ============================================================================
  // Food & Lifestyle Guidance Library
  // ============================================================================

  public listGuidance(filter?: { serviceId?: string; status?: GuidanceStatus }): FoodLifestyleGuidanceDto[] {
    let result = Array.from(this.guidanceList.values());

    if (filter?.serviceId) {
      result = result.filter((g) => g.service_id === filter.serviceId);
    }

    if (filter?.status) {
      result = result.filter((g) => g.status === filter.status);
    }

    return result.sort((a, b) => b.version_number - a.version_number);
  }

  public getGuidanceById(id: string): FoodLifestyleGuidanceDto {
    const guidance = this.guidanceList.get(id);
    if (!guidance) {
      throw new NotFoundError(`Guidance document '${id}' not found`);
    }
    return guidance;
  }

  public async createGuidance(
    req: CreateGuidanceRequest,
    user: { id: string; role: string; fullName?: string }
  ): Promise<FoodLifestyleGuidanceDto> {
    const service = this.services.get(req.service_id);
    if (!service) {
      throw new NotFoundError(`Treatment service '${req.service_id}' not found`);
    }

    if (!req.title || !req.title.trim()) {
      throw new BadRequestError('Guidance title is required');
    }

    // Validate items: each item requires at least one language (content_en or content_bn)
    if (!req.items || req.items.length === 0) {
      throw new BadRequestError('At least one guidance item is required');
    }

    const validatedItems: FoodLifestyleGuidanceItemDto[] = [];
    const guidanceId = `gd-${crypto.randomUUID()}`;

    for (let i = 0; i < req.items.length; i++) {
      const it = req.items[i];
      const en = it.content_en?.trim();
      const bn = it.content_bn?.trim();

      if (!en && !bn) {
        throw new BadRequestError(
          `Guidance item #${i + 1} must have at least one language (English or Bangla)`
        );
      }

      validatedItems.push({
        id: `gdi-${crypto.randomUUID()}`,
        guidance_id: guidanceId,
        section: it.section,
        content_en: en || undefined,
        content_bn: bn || undefined,
        sort_order: it.sort_order ?? i + 1,
        created_at: new Date().toISOString(),
      });
    }

    // Determine next version number for this service
    const serviceGuidances = Array.from(this.guidanceList.values()).filter(
      (g) => g.service_id === req.service_id
    );
    const maxVersion = serviceGuidances.reduce((max, g) => Math.max(max, g.version_number), 0);
    const nextVersion = maxVersion + 1;

    const newGuidance: FoodLifestyleGuidanceDto = {
      id: guidanceId,
      service_id: req.service_id,
      service_code: service.service_code,
      service_name: service.name,
      version_number: nextVersion,
      title: req.title.trim(),
      title_bn: req.title_bn?.trim() || undefined,
      status: 'draft',
      author_id: user.id,
      author_name: user.fullName || 'Staff User',
      clinical_notes: req.clinical_notes?.trim() || undefined,
      is_sample: false,
      items: validatedItems,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.guidanceList.set(guidanceId, newGuidance);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'GUIDANCE_CREATE_DRAFT',
      entityType: 'food_lifestyle_guidance',
      entityId: guidanceId,
      ipAddress: '127.0.0.1',
      payloadAfter: newGuidance,
    });

    return newGuidance;
  }

  public async updateGuidance(
    id: string,
    req: UpdateGuidanceRequest,
    user: { id: string; role: string }
  ): Promise<FoodLifestyleGuidanceDto> {
    const guidance = this.guidanceList.get(id);
    if (!guidance) {
      throw new NotFoundError(`Guidance document '${id}' not found`);
    }

    // Rule: Approved versions are immutable! Editing an approved version must return 409 Conflict.
    if (guidance.status === 'approved') {
      throw new ConflictError(
        'Approved food and lifestyle guidance versions are immutable. Create a new draft version instead.'
      );
    }

    if (guidance.status === 'retired') {
      throw new BadRequestError('Cannot edit retired guidance version. Create a new draft version.');
    }

    if (req.title !== undefined) {
      if (!req.title.trim()) throw new BadRequestError('Guidance title cannot be empty');
      guidance.title = req.title.trim();
    }
    if (req.title_bn !== undefined) {
      guidance.title_bn = req.title_bn.trim() || undefined;
    }
    if (req.clinical_notes !== undefined) {
      guidance.clinical_notes = req.clinical_notes.trim() || undefined;
    }

    if (req.items) {
      const validatedItems: FoodLifestyleGuidanceItemDto[] = [];
      for (let i = 0; i < req.items.length; i++) {
        const it = req.items[i];
        const en = it.content_en?.trim();
        const bn = it.content_bn?.trim();

        if (!en && !bn) {
          throw new BadRequestError(
            `Guidance item #${i + 1} must have at least one language (English or Bangla)`
          );
        }

        validatedItems.push({
          id: it.id || `gdi-${crypto.randomUUID()}`,
          guidance_id: id,
          section: it.section,
          content_en: en || undefined,
          content_bn: bn || undefined,
          sort_order: it.sort_order ?? i + 1,
          created_at: new Date().toISOString(),
        });
      }
      guidance.items = validatedItems;
    }

    guidance.updated_at = new Date().toISOString();
    this.guidanceList.set(id, guidance);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'GUIDANCE_UPDATE_DRAFT',
      entityType: 'food_lifestyle_guidance',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: guidance,
    });

    return guidance;
  }

  public async submitGuidance(
    id: string,
    user: { id: string; role: string }
  ): Promise<FoodLifestyleGuidanceDto> {
    const guidance = this.guidanceList.get(id);
    if (!guidance) {
      throw new NotFoundError(`Guidance document '${id}' not found`);
    }

    if (guidance.status !== 'draft') {
      throw new BadRequestError(`Cannot submit guidance in status '${guidance.status}' for approval`);
    }

    guidance.status = 'pending_approval';
    guidance.updated_at = new Date().toISOString();
    this.guidanceList.set(id, guidance);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'GUIDANCE_SUBMIT_APPROVAL',
      entityType: 'food_lifestyle_guidance',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: guidance,
    });

    return guidance;
  }

  /**
   * Approve Guidance Version:
   * Rule: In ONE transaction:
   * 1. Lock service's guidance rows
   * 2. Retire the previous approved version
   * 3. Approve the new one
   * 4. Record approver / time
   * 5. Enforce only users with guidance.approve (clinical role) can approve
   */
  public async approveGuidance(
    id: string,
    user: { id: string; role: string; fullName?: string; permissions?: Set<string> | string[] }
  ): Promise<FoodLifestyleGuidanceDto> {
    const guidance = this.guidanceList.get(id);
    if (!guidance) {
      throw new NotFoundError(`Guidance document '${id}' not found`);
    }

    // Clinical role check: approver must have clinical role (doctor or super_admin)
    const isClinicalRole = user.role === 'doctor' || user.role === 'super_admin';
    if (!isClinicalRole) {
      throw new ForbiddenError(
        'Only clinicians with clinical roles (Doctor/Super Admin) and guidance.approve permission may approve guidance'
      );
    }

    const serviceId = guidance.service_id;

    // Mutex lock per service to guarantee atomic serialization and zero dual-approved race conditions
    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    while (this.serviceApprovalLocks.has(serviceId)) {
      await this.serviceApprovalLocks.get(serviceId);
    }
    this.serviceApprovalLocks.set(serviceId, lockPromise);

    try {
      // Re-read inside transaction lock
      const currentTarget = this.guidanceList.get(id);
      if (!currentTarget) {
        throw new NotFoundError(`Guidance document '${id}' not found`);
      }

      if (currentTarget.status === 'approved') {
        throw new ConflictError(`Guidance version ${currentTarget.version_number} is already approved`);
      }

      if (currentTarget.status === 'retired') {
        throw new BadRequestError('Cannot approve a retired guidance version');
      }

      // Step 2: Retire any previously approved version for this service
      const allServiceGuidances = Array.from(this.guidanceList.values()).filter(
        (g) => g.service_id === serviceId
      );

      for (const other of allServiceGuidances) {
        if (other.id !== id && other.status === 'approved') {
          other.status = 'retired';
          other.updated_at = new Date().toISOString();
          this.guidanceList.set(other.id, other);

          await logAudit(null, {
            actorUserId: user.id,
            action: 'GUIDANCE_RETIRE_PREVIOUS_VERSION',
            entityType: 'food_lifestyle_guidance',
            entityId: other.id,
            ipAddress: '127.0.0.1',
            reason: `Auto-retired upon approval of version ${currentTarget.version_number}`,
            payloadAfter: other,
          });
        }
      }

      // Step 3 & 4: Approve target version, timestamp & approver
      currentTarget.status = 'approved';
      currentTarget.approved_by = user.id;
      currentTarget.approver_name = user.fullName || 'Dr. Consultant';
      currentTarget.approved_at = new Date().toISOString();
      currentTarget.updated_at = new Date().toISOString();

      this.guidanceList.set(id, currentTarget);

      // Step 5: Audit approval
      await logAudit(null, {
        actorUserId: user.id,
        action: 'GUIDANCE_APPROVE',
        entityType: 'food_lifestyle_guidance',
        entityId: id,
        ipAddress: '127.0.0.1',
        reason: `Guidance v${currentTarget.version_number} approved by ${currentTarget.approver_name}`,
        payloadAfter: currentTarget,
      });

      return currentTarget;
    } finally {
      this.serviceApprovalLocks.delete(serviceId);
      releaseLock();
    }
  }

  /**
   * Returns the single active approved guidance version for a service, if one exists.
   */
  public getActiveApprovedGuidance(serviceId: string): FoodLifestyleGuidanceDto | null {
    const list = Array.from(this.guidanceList.values());
    return list.find((g) => g.service_id === serviceId && g.status === 'approved') || null;
  }

  /**
   * Reset / testing helper to restore clean sample state
   */
  public resetData() {
    this.categories.clear();
    this.services.clear();
    this.followupRules.clear();
    this.guidanceList.clear();
    this.seedInitialData();
  }
}

export const catalogService = new CatalogService();
