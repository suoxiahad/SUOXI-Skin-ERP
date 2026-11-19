/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Treatment Catalog & Food & Lifestyle Guidance Types
 */

export interface TreatmentCategoryDto {
  id: string;
  code: string;
  name: string;
  name_bn?: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

export interface TreatmentServiceResourceRef {
  id: string;
  name: string;
  resource_type: 'room' | 'device';
}

export interface TreatmentFollowupRuleDto {
  id: string;
  service_id: string;
  interval_days: number;
  max_followups: number;
  instructions?: string;
  instructions_bn?: string;
  needs_clinical_approval: boolean;
  approved_by?: string;
  approver_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface TreatmentServiceDto {
  id: string;
  service_code: string;
  category_id: string;
  category_code?: string;
  category_name?: string;
  name: string;
  name_bn?: string;
  description?: string;
  base_price: string;
  default_duration_minutes: number;
  default_followup_days?: number;
  requires_clinical_approval: boolean;
  is_active: boolean;
  allowed_resource_ids: string[];
  allowed_resources?: TreatmentServiceResourceRef[];
  followup_rules?: TreatmentFollowupRuleDto[];
  created_at: string;
  updated_at?: string;
}

export interface CreateTreatmentServiceRequest {
  service_code: string;
  category_id: string;
  name: string;
  name_bn?: string;
  description?: string;
  base_price: number | string;
  default_duration_minutes: number;
  default_followup_days?: number;
  requires_clinical_approval?: boolean;
  allowed_resource_ids?: string[];
  is_active?: boolean;
}

export interface UpdateTreatmentServiceRequest {
  service_code?: string;
  category_id?: string;
  name?: string;
  name_bn?: string;
  description?: string;
  base_price?: number | string;
  default_duration_minutes?: number;
  default_followup_days?: number;
  requires_clinical_approval?: boolean;
  allowed_resource_ids?: string[];
  is_active?: boolean;
}

export interface CreateFollowupRuleRequest {
  interval_days: number;
  max_followups?: number;
  instructions?: string;
  instructions_bn?: string;
  needs_clinical_approval?: boolean;
}

export type GuidanceStatus = 'draft' | 'pending_approval' | 'approved' | 'retired';

export type GuidanceSection =
  | 'recommended_foods'
  | 'foods_to_avoid'
  | 'lifestyle_do'
  | 'lifestyle_avoid'
  | 'general_advice';

export interface FoodLifestyleGuidanceItemDto {
  id: string;
  guidance_id: string;
  section: GuidanceSection;
  content_en?: string;
  content_bn?: string;
  sort_order: number;
  created_at?: string;
}

export interface FoodLifestyleGuidanceDto {
  id: string;
  service_id: string;
  service_code?: string;
  service_name?: string;
  version_number: number;
  title: string;
  title_bn?: string;
  status: GuidanceStatus;
  author_id: string;
  author_name?: string;
  approved_by?: string;
  approver_name?: string;
  approved_at?: string;
  clinical_notes?: string;
  is_sample?: boolean;
  items: FoodLifestyleGuidanceItemDto[];
  created_at: string;
  updated_at?: string;
}

export interface CreateGuidanceItemInput {
  section: GuidanceSection;
  content_en?: string;
  content_bn?: string;
  sort_order?: number;
}

export interface CreateGuidanceRequest {
  service_id: string;
  title: string;
  title_bn?: string;
  clinical_notes?: string;
  items: CreateGuidanceItemInput[];
}

export interface UpdateGuidanceRequest {
  title?: string;
  title_bn?: string;
  clinical_notes?: string;
  items?: Array<{
    id?: string;
    section: GuidanceSection;
    content_en?: string;
    content_bn?: string;
    sort_order?: number;
  }>;
}
