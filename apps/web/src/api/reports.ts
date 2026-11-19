import { api } from './client.js';
import type {
  RevenueReportDto,
  DoctorActivityReportDto,
  FollowUpReportDto,
  InventoryReportDto,
  ReferralReportDto,
  SmsReportDto,
  ExportReportRequest,
  ReportFilterParams,
  DataExportLogDto,
} from '@suoxi/shared-types';

function buildQuery(params: ReportFilterParams): string {
  const q = new URLSearchParams();
  if (params.from) q.append('from', params.from);
  if (params.to) q.append('to', params.to);
  if (params.branchId && params.branchId !== 'all') q.append('branchId', String(params.branchId));
  if (params.doctorId && params.doctorId !== 'all') q.append('doctorId', String(params.doctorId));
  if (params.serviceId && params.serviceId !== 'all') q.append('serviceId', String(params.serviceId));
  if (params.paymentMethod && params.paymentMethod !== 'all') q.append('paymentMethod', params.paymentMethod);
  if (params.page) q.append('page', String(params.page));
  if (params.limit) q.append('limit', String(params.limit));
  const str = q.toString();
  return str ? `?${str}` : '';
}

export const reportsApi = {
  getRevenueReport: (params: ReportFilterParams) =>
    api.get<RevenueReportDto>(`/reports/revenue${buildQuery(params)}`),

  getDoctorActivityReport: (params: ReportFilterParams) =>
    api.get<DoctorActivityReportDto>(`/reports/doctor-activity${buildQuery(params)}`),

  getFollowUpReport: (params: ReportFilterParams) =>
    api.get<FollowUpReportDto>(`/reports/follow-ups${buildQuery(params)}`),

  getInventoryReport: (params: ReportFilterParams) =>
    api.get<InventoryReportDto>(`/reports/inventory${buildQuery(params)}`),

  getReferralReport: (params: ReportFilterParams) =>
    api.get<ReferralReportDto>(`/reports/referrals${buildQuery(params)}`),

  getSmsReport: (params: ReportFilterParams) =>
    api.get<SmsReportDto>(`/reports/sms${buildQuery(params)}`),

  exportReport: (req: ExportReportRequest) =>
    api.post<{ fileName: string; mimeType: string; content: string; logId: string; rowCount: number }>(
      '/reports/export',
      req
    ),

  getExportLogs: () =>
    api.get<DataExportLogDto[]>('/reports/export-logs'),
};
