import { api } from './client.js';
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
} from '@suoxi/shared-types';

export const integrationsApi = {
  // Configurations
  getConfigs: () => api.get<IntegrationConfigDto[]>('/integrations/configs'),
  getConfig: (id: string) => api.get<IntegrationConfigDto>(`/integrations/configs/${id}`),
  createConfig: (data: SaveIntegrationConfigRequest) =>
    api.post<IntegrationConfigDto>('/integrations/configs', data),
  updateConfig: (id: string, data: SaveIntegrationConfigRequest) =>
    api.put<IntegrationConfigDto>(`/integrations/configs/${id}`, data),
  testConfig: (id: string, data: TestIntegrationRequest) =>
    api.post<TestIntegrationResultDto>(`/integrations/configs/${id}/test`, data),

  // Logs
  getLogs: (type?: IntegrationType) =>
    api.get<IntegrationLogDto[]>(type ? `/integrations/logs?type=${type}` : '/integrations/logs'),

  // Templates
  getTemplates: (params?: { channel?: string; language?: string }) => {
    const q = new URLSearchParams();
    if (params?.channel && params.channel !== 'all') q.set('channel', params.channel);
    if (params?.language && params.language !== 'all') q.set('language', params.language);
    const qs = q.toString();
    return api.get<NotificationTemplateDto[]>(qs ? `/templates?${qs}` : '/templates');
  },
  getTemplate: (id: string) => api.get<NotificationTemplateDto>(`/templates/${id}`),
  createTemplate: (data: SaveTemplateRequest) =>
    api.post<NotificationTemplateDto>('/templates', data),
  updateTemplate: (id: string, data: SaveTemplateRequest) =>
    api.put<NotificationTemplateDto>(`/templates/${id}`, data),
  approveTemplate: (id: string) =>
    api.post<NotificationTemplateDto>(`/templates/${id}/approve`, {}),
  previewTemplate: (data: TemplatePreviewRequest) =>
    api.post<TemplatePreviewResultDto>('/templates/preview', data),

  // Event Rules
  getEventRules: () => api.get<NotificationEventRuleDto[]>('/event-rules'),
  createEventRule: (data: SaveEventRuleRequest) =>
    api.post<NotificationEventRuleDto>('/event-rules', data),
  updateEventRule: (id: string, data: SaveEventRuleRequest) =>
    api.put<NotificationEventRuleDto>(`/event-rules/${id}`, data),
};
