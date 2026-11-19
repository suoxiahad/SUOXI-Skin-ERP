import type { DbId } from './api.js';

export type ReportType =
  | 'revenue'
  | 'doctor_activity'
  | 'follow_up'
  | 'inventory'
  | 'referral'
  | 'sms';

export type ExportFormat = 'csv' | 'pdf';

export interface ReportFilterParams {
  from: string; // YYYY-MM-DD (Asia/Dhaka wall-clock / UTC)
  to: string; // YYYY-MM-DD
  branchId?: DbId;
  doctorId?: DbId;
  serviceId?: DbId;
  paymentMethod?: string;
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RevenueKpi {
  totalRevenue: number;
  packageSales: number;
  dailyAverage: number;
  collections: number;
  dues: number;
  discounts: number;
  refunds: number;
}

export interface DailyRevenueItem {
  date: string;
  grossRevenue: number;
  collections: number;
  refunds: number;
  netRevenue: number;
}

export interface TreatmentRevenueItem {
  serviceId: string;
  serviceName: string;
  serviceNameBn?: string;
  category: string;
  sessionCount: number;
  revenue: number;
  percentage: number;
}

export interface PaymentMethodBreakdown {
  method: string;
  label: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface RevenueTableRow {
  date: string;
  invoiceNumber: string;
  patientCode: string;
  patientName: string;
  serviceName: string;
  grossAmount: number;
  discountAmount: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: string;
}

export interface RevenueReportDto {
  kpi: RevenueKpi;
  dailyRevenue: DailyRevenueItem[];
  treatmentWise: TreatmentRevenueItem[];
  paymentMethods: PaymentMethodBreakdown[];
  table: RevenueTableRow[];
  pagination: PaginationMeta;
}

export interface DoctorActivityKpi {
  totalAppointments: number;
  completedConsultations: number;
  treatmentSessions: number;
  noShowRate: number;
  totalDoctorRevenue: number;
}

export interface DoctorPerformanceItem {
  doctorId: string;
  doctorName: string;
  doctorNameBn?: string;
  specialty: string;
  appointmentCount: number;
  completedCount: number;
  noShowCount: number;
  revenueGenerated: number;
  avgConsultationMin: number;
}

export interface DoctorActivityTableRow {
  id: string;
  date: string;
  doctorName: string;
  patientName: string;
  patientCode: string;
  type: 'consultation' | 'session';
  status: string;
  serviceName: string;
  revenue: number;
  durationMinutes: number;
}

export interface DoctorActivityReportDto {
  kpi: DoctorActivityKpi;
  doctorPerformance: DoctorPerformanceItem[];
  table: DoctorActivityTableRow[];
  pagination: PaginationMeta;
}

export interface FollowUpKpi {
  totalTasks: number;
  completedTasks: number;
  rescheduledAppointments: number;
  unreachableTasks: number;
  conversionRate: number;
}

export interface FollowUpOutcomeBreakdown {
  outcome: string;
  label: string;
  count: number;
  percentage: number;
}

export interface FollowUpRuleBreakdown {
  ruleType: string;
  label: string;
  count: number;
  completed: number;
}

export interface FollowUpTableRow {
  id: string;
  dueDate: string;
  patientName: string;
  patientMobile: string;
  ruleType: string;
  status: string;
  outcome?: string;
  notes?: string;
  assignedToName?: string;
}

export interface FollowUpReportDto {
  kpi: FollowUpKpi;
  outcomeBreakdown: FollowUpOutcomeBreakdown[];
  ruleBreakdown: FollowUpRuleBreakdown[];
  table: FollowUpTableRow[];
  pagination: PaginationMeta;
}

export interface InventoryReportKpi {
  totalProducts: number;
  lowStockCount: number;
  stockValue: number;
  consumptionCost: number;
  totalAdjustments: number;
}

export interface ConsumptionByTreatment {
  serviceName: string;
  productName: string;
  quantityUsed: number;
  totalCost: number;
}

export interface StockStatusBreakdown {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface InventoryTableRow {
  productId: string;
  productCode: string;
  productName: string;
  category: string;
  currentStock: number;
  minStockAlert: number;
  unit: string;
  costPrice: number;
  totalValue: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface InventoryReportDto {
  kpi: InventoryReportKpi;
  consumptionByTreatment: ConsumptionByTreatment[];
  stockStatus: StockStatusBreakdown[];
  table: InventoryTableRow[];
  pagination: PaginationMeta;
}

export interface ReferralReportKpi {
  totalReferrers: number;
  convertedPatients: number;
  totalCommissionAccrued: number;
  commissionPaid: number;
  commissionPending: number;
}

export interface ReferrerPerformanceItem {
  referrerId: string;
  referrerName: string;
  tier: string;
  patientCount: number;
  commissionAccrued: number;
  commissionPaid: number;
}

export interface ReferralTableRow {
  id: string;
  date: string;
  referrerName: string;
  patientName: string;
  invoiceNumber: string;
  billAmount: number;
  commissionAmount: number;
  status: string;
}

export interface ReferralReportDto {
  kpi: ReferralReportKpi;
  referrerPerformance: ReferrerPerformanceItem[];
  table: ReferralTableRow[];
  pagination: PaginationMeta;
}

export interface SmsReportKpi {
  totalSent: number;
  gatewayAccepted: number;
  carrierDelivered: number;
  deliveryFailed: number;
  totalCostCredits: number;
}

export interface SmsStatusBreakdown {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface SmsTypeBreakdown {
  type: string;
  label: string;
  count: number;
}

export interface SmsTableRow {
  id: string;
  sentAt: string;
  recipientMobile: string;
  templateCode?: string;
  messageType: string;
  status: string;
  gatewayResponse?: string;
}

export interface SmsReportDto {
  kpi: SmsReportKpi;
  statusBreakdown: SmsStatusBreakdown[];
  typeBreakdown: SmsTypeBreakdown[];
  table: SmsTableRow[];
  pagination: PaginationMeta;
}

export interface ExportReportRequest {
  reportType: ReportType;
  format: ExportFormat;
  from: string;
  to: string;
  branchId?: DbId;
  doctorId?: DbId;
  serviceId?: DbId;
  paymentMethod?: string;
}

export interface DataExportLogDto {
  id: DbId;
  actorUserId: DbId;
  actorName: string;
  reportType: ReportType;
  exportFormat: ExportFormat;
  filtersJson: Record<string, unknown>;
  rowCount: number;
  fileName: string;
  ipAddress: string;
  userAgent?: string;
  createdAt: string;
}
