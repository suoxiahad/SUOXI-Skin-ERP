import { api } from './client.js';
import type {
  TreatmentCategoryDto,
  TreatmentServiceDto,
  TreatmentFollowupRuleDto,
  FoodLifestyleGuidanceDto,
  CreateTreatmentServiceRequest,
  UpdateTreatmentServiceRequest,
  CreateFollowupRuleRequest,
  CreateGuidanceRequest,
  UpdateGuidanceRequest,
} from '@suoxi/shared-types';

export const catalogApi = {
  // Categories
  getCategories: () => api.get<TreatmentCategoryDto[]>('/catalog/categories'),

  createCategory: (data: {
    name: string;
    name_bn?: string;
    code?: string;
    description?: string;
  }) => api.post<TreatmentCategoryDto>('/catalog/categories', data),

  // Treatments
  listTreatments: (params?: { categoryId?: string; activeOnly?: boolean; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.categoryId && params.categoryId !== 'all') query.set('categoryId', params.categoryId);
    if (params?.activeOnly) query.set('activeOnly', 'true');
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return api.get<TreatmentServiceDto[]>(qs ? `/catalog/treatments?${qs}` : '/catalog/treatments');
  },

  getTreatment: (id: string) => api.get<TreatmentServiceDto>(`/catalog/treatments/${id}`),

  createTreatment: (data: CreateTreatmentServiceRequest) =>
    api.post<TreatmentServiceDto>('/catalog/treatments', data),

  updateTreatment: (id: string, data: UpdateTreatmentServiceRequest) =>
    api.patch<TreatmentServiceDto>(`/catalog/treatments/${id}`, data),

  // Follow-up Rules
  getFollowupRules: (serviceId: string) =>
    api.get<TreatmentFollowupRuleDto[]>(`/catalog/treatments/${serviceId}/followup-rules`),

  createFollowupRule: (serviceId: string, data: CreateFollowupRuleRequest) =>
    api.post<TreatmentFollowupRuleDto>(`/catalog/treatments/${serviceId}/followup-rules`, data),

  // Guidance Library
  listGuidance: (params?: { serviceId?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.serviceId) query.set('serviceId', params.serviceId);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    const qs = query.toString();
    return api.get<FoodLifestyleGuidanceDto[]>(qs ? `/catalog/guidance?${qs}` : '/catalog/guidance');
  },

  getGuidance: (id: string) => api.get<FoodLifestyleGuidanceDto>(`/catalog/guidance/${id}`),

  createGuidance: (data: CreateGuidanceRequest) =>
    api.post<FoodLifestyleGuidanceDto>('/catalog/guidance', data),

  updateGuidance: (id: string, data: UpdateGuidanceRequest) =>
    api.patch<FoodLifestyleGuidanceDto>(`/catalog/guidance/${id}`, data),

  submitGuidance: (id: string) =>
    api.post<FoodLifestyleGuidanceDto>(`/catalog/guidance/${id}/submit`, {}),

  approveGuidance: (id: string) =>
    api.post<FoodLifestyleGuidanceDto>(`/catalog/guidance/${id}/approve`, {}),
};
