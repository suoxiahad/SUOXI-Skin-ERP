/**
 * SUOXI Skin Care & Aesthetic Center CRM (Dhaka, Bangladesh)
 * Domain Models & Type Definitions
 */

export type UserRole =
  | 'super_admin'
  | 'admin_manager'
  | 'receptionist'
  | 'doctor'
  | 'therapist'
  | 'cashier'
  | 'inventory_manager'
  | 'call_center'
  | 'patient';

export interface User {
  id: string;
  name: string;
  nameBn?: string;
  email: string;
  role: UserRole;
  phone: string;
  branchId: string;
  branchName: string;
  specialization?: string;
  bmdcRegNo?: string; // Bangladesh Medical & Dental Council reg
  avatarUrl?: string;
  consultationFeeBDT?: number;
  followUpFeeBDT?: number;
  roomNumber?: string;
  signatureUrl?: string;
  certifications?: string[];
  shift?: 'morning' | 'evening' | 'full_day';
  status?: 'active' | 'inactive' | 'suspended';
  lastLoginAt?: string;
  createdAt?: string;
  permissions?: string[];
  designation?: string;
}

export interface Branch {
  id: string;
  name: string;
  nameBn: string;
  code: string;
  address: string;
  city: string;
  phone: string;
  email?: string;
  managerName?: string;
  managerPhone?: string;
  operatingHours?: string;
  isActive?: boolean;
  createdAt?: string;
}

export type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'visited'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export interface Patient {
  id: string;
  patientIdCode: string; // e.g. SX-2026-0842
  name: string;
  nameBn?: string;
  phone: string; // +8801XXXXXXXXX
  email?: string;
  gender: 'female' | 'male' | 'other';
  dateOfBirth?: string;
  age?: number;
  bloodGroup?: string;
  address?: string;
  city: string; // Dhaka, Chittagong, etc.
  branchId: string;
  allergies?: string[];
  medicalHistory?: string;
  skinType?: 'normal' | 'dry' | 'oily' | 'combination' | 'sensitive';
  referredBy?: string;
  referrerDoctorId?: string;
  isFlaggedDuplicate?: boolean;
  duplicateReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientAge?: number;
  patientGender?: 'female' | 'male' | 'other';
  patientAddress?: string;
  patientBloodGroup?: string;
  branchId: string;
  branchName: string;
  doctorId: string;
  doctorName: string;
  diseaseName?: string;
  bookingMethod?: string;
  serviceCategory: 'Skin Care' | 'Laser & Aesthetic' | 'Anti-Aging' | 'Hair Therapy' | 'Body Contouring' | 'General Consultation';
  serviceName: string;
  appointmentDate: string; // YYYY-MM-DD (Asia/Dhaka wall-clock)
  appointmentTime: string; // HH:mm (Asia/Dhaka wall-clock)
  durationMinutes: number;
  status: AppointmentStatus;
  statusReason?: string;
  callReference?: string; // CRM never dials calls; manual call ref
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CallStatus =
  | 'pending'
  | 'call_attempted'
  | 'confirmed'
  | 'rescheduled'
  | 'no_answer'
  | 'left_voicemail'
  | 'cancelled';

export type SmsStatus =
  | 'pending'
  | 'gateway_accepted'
  | 'sent'
  | 'failed';

export type CallOutcome =
  | 'Connected'
  | 'Call Waiting'
  | 'No Answer'
  | 'Switched Off'
  | 'Call Back Requested'
  | 'Wrong Number'
  | 'connected'
  | 'busy'
  | 'no_answer'
  | 'switched_off'
  | 'callback_requested'
  | 'wrong_number'
  | string;

export type PatientIntent =
  | 'Appointment Confirmed'
  | 'Rescheduled'
  | 'Follow-up Later'
  | 'Cancelled'
  | 'Post-Care Follow-up Complete'
  | 'confirmed'
  | 'thinking'
  | 'not_interested'
  | 'post_care_done'
  | string;

export type FollowupPurpose =
  | 'New Booking Confirmation'
  | 'Treatment Post-Care Follow-up'
  | 'Package Session Reminder'
  | 'Overdue Re-engagement'
  | 'General Clinical Followup';

export interface CallCenterTask {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  doctorName: string;
  serviceName: string;
  branchName: string;
  callStatus: CallStatus;
  smsStatus: SmsStatus;
  callAttempts: number;
  lastCalledAt?: string;
  callNotes?: string;
  agentId?: string;
  agentName?: string;
  followupPurpose?: FollowupPurpose | string;
  callOutcome?: CallOutcome | string;
  patientIntent?: PatientIntent | string;
  nextFollowupDate?: string;
  nextFollowupTime?: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  consultationDate: string;
  chiefComplaints: string;
  examinationNotes: string;
  clinicalDiagnosis: string;
  skinAnalysis?: {
    hydration: string;
    pigmentation: string;
    elasticity: string;
    sebum: string;
  };
  recommendedProcedures: string[];
  // Hard Rule 2: Only doctor sets next-session date
  nextSessionDate?: string;
  nextSessionNotes?: string;
  prescriptionId?: string;
  createdAt: string;
}

export interface PrescriptionMedicine {
  id: string;
  name: string;
  genericName?: string;
  form: 'Tablet' | 'Capsule' | 'Cream' | 'Gel' | 'Serum' | 'Sunscreen' | 'Facewash' | 'Lotion';
  dosage: string; // e.g. 1-0-1 or Apply at night
  duration: string; // e.g. 14 days, 1 month
  instructions: string; // e.g. After meal / 30 mins before sun exposure
  instructionsBn?: string;
}

export interface FoodLifestyleGuidance {
  id: string;
  prescriptionId: string;
  isFrozenSnapshot: boolean; // Hard Rule 6
  snapshotVersion: number;
  waterIntakeLiters: number;
  sunProtectionInstructions: string;
  sunProtectionInstructionsBn: string;
  recommendedFoods: string[];
  recommendedFoodsBn: string[];
  prohibitedFoods: string[];
  prohibitedFoodsBn: string[];
  lifestylePrecautions: string[];
  lifestylePrecautionsBn: string[];
  skincareRoutineMorning: string[];
  skincareRoutineEvening: string[];
  createdAt: string;
}

export interface Prescription {
  id: string;
  prescriptionCode: string; // e.g. RX-2026-0312
  patientId: string;
  patientCode?: string; // e.g. SX-2026-0841
  patientName: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  patientAddress?: string;
  doctorId: string;
  doctorName: string;
  doctorCredentials: string;
  consultationId: string;
  chiefComplaints?: string;
  pastHistory?: string;
  operationHistory?: string;
  investigations?: string;
  diagnosis: string;
  skinAnalysis?: {
    hydration?: string;
    pigmentation?: string;
    elasticity?: string;
    sebum?: string;
    skinType?: string;
  };
  recommendedProcedures?: string[];
  adviceList?: string[];
  planNotes?: string;
  medicines: PrescriptionMedicine[];
  lifestyleGuidance: FoodLifestyleGuidance;
  nextSessionDate?: string; // Frozen from doctor consultation
  version: number;
  isFinalized: boolean;
  language: 'en' | 'bn' | 'both';
  createdAt: string;
}

export type RxProtocolCategory =
  | 'Pigmentation & Melasma'
  | 'Acne & Sebum'
  | 'Laser & Scar Recovery'
  | 'Hair & PRP'
  | 'Anti-Aging & Glow'
  | 'General Dermatology';

export interface RxProtocol {
  id: string;
  name: string;
  subtitle: string;
  category: RxProtocolCategory;
  isActive: boolean;
  isDefaultBaseline?: boolean;
  diagnosis: string;
  chiefComplaints: string;
  investigations: string;
  examinationNotes: string;
  skinType: 'normal' | 'dry' | 'oily' | 'combination' | 'sensitive';
  targetZones: string[];
  procedures: string[];
  medicines: Array<Omit<PrescriptionMedicine, 'id'>>;
  adviceList: string[];
  sunInstructions: string;
  sunInstructionsBn: string;
  waterLiters: number;
  followUpDays: number;
  morningRoutine: string[];
  eveningRoutine: string[];
  recommendedFoods: string[];
  prohibitedFoods: string[];
  createdBy?: string;
  updatedAt: string;
}

export interface MasterPackage {
  id: string;
  code: string;
  name: string;
  nameBn?: string;
  serviceCategory: string;
  totalSessions: number;
  regularPriceBDT: number;
  packagePriceBDT: number;
  savingsBDT: number;
  validityMonths: number;
  minIntervalDays: number;
  description: string;
  descriptionBn?: string;
  includedServices: string[];
  isActive: boolean;
  createdAt?: string;
}

export interface TreatmentPackage {
  id: string;
  patientId: string;
  patientName: string;
  packageName: string;
  serviceCategory: string;
  totalSessions: number;
  completedSessions: number;
  remainingSessions: number;
  priceBDT: number;
  paidAmountBDT?: number;
  dueAmountBDT?: number;
  perSessionPriceBDT?: number;
  unlockedSessions?: number;
  advanceCreditBDT?: number;
  purchaseDate: string;
  expiryDate: string;
  invoiceId: string;
  status: 'active' | 'completed' | 'expired';
}

export interface PackageDeduction {
  id: string;
  packageId: string;
  patientId: string;
  sessionNumber: number;
  deductedAt: string;
  therapistId: string;
  therapistName: string;
  treatmentNotes: string;
  machineSettings?: string;
}

export type PaymentMethod = 'cash' | 'card' | 'bkash' | 'nagad' | 'bank_transfer';

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  receiptNumber: string;
  amountBDT: number;
  method: PaymentMethod;
  transactionRef?: string;
  paidAt: string;
  receivedBy: string;
  status: 'valid' | 'reversed';
  reversalReason?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceBDT: number;
  discountBDT: number;
  totalBDT: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. INV-2026-0591
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientAge?: number;
  patientGender?: string;
  patientCode?: string;
  branchId: string;
  branchName: string;
  items: InvoiceItem[];
  subtotalBDT: number;
  vatPercent: number; // 5% standard in BD medical/beauty services
  vatAmountBDT: number;
  discountBDT: number;
  totalAmountBDT: number;
  // Hard Rule 4: derived from payment records, never typed
  paidAmountBDT: number;
  dueAmountBDT: number;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'void';
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  payments: PaymentRecord[];
  createdAt: string;
  createdBy: string;
  paymentMethod?: string;
  bankName?: string;
  accountNumber?: string;
}

export type ProductType = 'retail' | 'consumable' | 'dual_use';

export interface ProductBatch {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPriceBDT: number;
  receivedDate?: string;
}

export interface InventoryItem {
  id: string;
  itemCode: string;
  name: string;
  category: 'Serums & Peels' | 'Laser Consumables' | 'Injectables' | 'Post-Care Creams' | 'Disposables';
  brand: string;
  productType?: ProductType;
  barcode?: string;
  sku?: string;
  description?: string;
  currentStock: number;
  unit: 'vials' | 'bottles' | 'boxes' | 'pieces' | 'tubes';
  reorderLevel: number;
  unitCostBDT: number;
  sellingPriceBDT: number;
  batchNumber: string;
  expiryDate: string;
  batches?: ProductBatch[];
  usageProtocol?: string; // e.g. "5ml per HydraFacial session"
  branchId: string;
  branchName: string;
  status: 'in_stock' | 'low_stock' | 'expired';
  isActive?: boolean;
}

export interface StockAdjustment {
  id: string;
  itemId: string;
  itemName: string;
  batchNumber: string;
  adjustmentType: 'damaged' | 'expired' | 'clinic_use' | 'restock' | 'tester' | 'audit_correction';
  quantityDelta: number; // + or -
  balanceAfter: number;
  unitCostBDT?: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  brandsSupplied: string[];
  paymentTerms: 'Net 15' | 'Net 30' | 'Cash on Delivery' | 'Advance';
  balanceDueBDT: number;
  isActive: boolean;
  createdAt?: string;
}

export interface PurchaseOrderItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  orderedQty: number;
  receivedQty: number;
  unitCostBDT: number;
  discountBDT?: number;
  totalBDT: number;
  paidBDT?: number;
  dueBDT?: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string; // e.g. PO-2026-081 or Invoice No
  invoiceNo?: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDeliveryDate: string;
  items: PurchaseOrderItem[];
  subtotalBDT: number;
  discountBDT?: number;
  taxBDT: number;
  totalBDT: number;
  paidBDT?: number;
  dueBDT?: number;
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface GRNItem {
  itemId: string;
  itemName: string;
  batchNumber: string;
  expiryDate: string;
  receivedQty: number;
  unitCostBDT: number;
  condition: 'good' | 'damaged';
}

export interface GoodsReceivedNote {
  id: string;
  grnNumber: string; // e.g. GRN-2026-104
  poId?: string;
  poNumber?: string;
  supplierId: string;
  supplierName: string;
  receivedDate: string;
  receivedBy: string;
  invoiceRefNumber?: string;
  items: GRNItem[];
  totalCostBDT: number;
  notes?: string;
  createdAt: string;
}

export interface ReferralCommission {
  id: string;
  referrerName: string;
  referrerType: 'Doctor' | 'Partner Clinic' | 'Influencer' | 'Corporate';
  phone: string;
  patientId: string;
  patientName: string;
  invoiceId: string;
  serviceCategory: string;
  billAmountBDT: number;
  commissionPercentage: number;
  commissionAmountBDT: number;
  status: 'pending' | 'approved' | 'paid';
  paidAt?: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  ipAddress: string;
  branchId: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: {
    total?: number;
    page?: number;
    limit?: number;
    requestId: string;
    timestamp: string;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export type MedicalDocumentType =
  | 'clinical_photo'
  | 'consent_form'
  | 'lab_biopsy_report'
  | 'patch_test'
  | 'allergy_card';

export interface MedicalAttachment {
  id: string;
  documentCode: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  type: MedicalDocumentType;
  title: string;
  titleBn?: string;
  category: 'Before-After Photos' | 'Informed Consent' | 'Lab & Biopsy' | 'Patch Test';
  procedureName?: string;
  sessionNumber?: number;
  photoType?: 'before' | 'after' | 'during';
  fileUrl: string;
  thumbnailUrl?: string;
  fileSize: string;
  fileFormat: 'PNG' | 'JPG' | 'PDF';
  doctorName: string;
  signedByPatient?: boolean;
  signatureDate?: string;
  clinicalNotes?: string;
  isConfidential: boolean;
  createdAt: string;
}

export interface DailyClosingReport {
  id: string;
  closingDate: string;
  cashierId: string;
  cashierName: string;
  branchId: string;
  branchName: string;
  openingCashBDT: number;
  expectedCashBDT: number;
  actualCashCountedBDT: number;
  cashDifferenceBDT: number;
  cardSettlementBDT: number;
  mfsBkashSettlementBDT: number;
  mfsNagadSettlementBDT: number;
  bankTransferBDT: number;
  totalCollectedBDT: number;
  totalInvoicesCount: number;
  notes?: string;
  status: 'draft' | 'submitted' | 'approved';
  createdAt: string;
}

// =========================================================================
// Integration: SMS & Email Gateways
// =========================================================================

export interface SmsGatewayConfig {
  provider: 'msg_mram' | 'custom_api';
  apiUrl: string;
  apiKey: string;
  senderId: string; // Approved Masking ID e.g. SUOXI
  defaultType: 'text' | 'unicode';
  defaultLabel: 'transactional' | 'promotional';
  isActive: boolean;
  balanceBDT: number;
  balanceCredits: number;
  lastCheckedAt?: string;
  autoSendOnBooking: boolean;
  autoSendOnPayment: boolean;
  autoSendOnPrescription: boolean;
  autoSendReminder24h: boolean;
}

export interface SmsLogRecord {
  id: string;
  recipientPhone: string;
  recipientName?: string;
  messageContent: string;
  messageType: 'text' | 'unicode';
  label: 'transactional' | 'promotional';
  senderId: string;
  shootId?: string;
  status: 'delivered' | 'gateway_accepted' | 'sent' | 'failed';
  errorCode?: string;
  errorMessage?: string;
  charsCount: number;
  smsCount: number;
  costBDT?: number;
  sentAt: string;
  triggerEvent?: string;
}

export interface SmsTemplate {
  id: string;
  name: string;
  category: 'appointment' | 'billing' | 'clinical' | 'promotional' | 'general';
  type: 'text' | 'unicode';
  label: 'transactional' | 'promotional';
  content: string;
  variables: string[];
  isDefault?: boolean;
  updatedAt: string;
}

export interface EmailGatewayConfig {
  provider: 'cpanel_smtp' | 'custom_smtp';
  smtpHost: string; // mail.suoxiclinic.com
  smtpPort: number; // 465 or 587
  encryption: 'SSL/TLS' | 'STARTTLS' | 'none';
  smtpUser: string; // care@suoxiclinic.com
  smtpPass: string;
  fromName: string; // SUOXI Skin Care & Aesthetic Center
  fromEmail: string;
  replyToEmail?: string;
  isActive: boolean;
  lastTestedAt?: string;
  autoEmailPrescription: boolean;
  autoEmailInvoice: boolean;
  autoEmailAppointmentCard: boolean;
  autoEmailDailyReport: boolean;
}

export interface EmailLogRecord {
  id: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  templateCategory: 'prescription' | 'invoice' | 'appointment' | 'guidance' | 'test' | 'other';
  status: 'delivered' | 'sent' | 'bounced' | 'failed';
  errorMessage?: string;
  sentAt: string;
  triggerEvent?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  category: 'prescription' | 'invoice' | 'appointment' | 'guidance' | 'general';
  htmlPreview: string;
  variables: string[];
  updatedAt: string;
}

// =========================================================================
// User Management & Access Control (RBAC)
// =========================================================================

export interface ClinicRoleDefinition {
  id: UserRole;
  name: string;
  nameBn?: string;
  description: string;
  userCount: number;
  permissions: string[];
  isSystemRole?: boolean;
}

export interface StaffDutyRoster {
  id: string;
  staffId: string;
  staffName: string;
  role: UserRole;
  branchId: string;
  branchName: string;
  date: string;
  shift: 'morning' | 'evening' | 'full_day' | 'off';
  roomNumber?: string;
  assignedDoctorName?: string;
  notes?: string;
}

export interface UserSecurityLog {
  id: string;
  userId: string;
  userName: string;
  role: UserRole;
  action: 'LOGIN' | 'LOGOUT' | 'PASSWORD_RESET' | 'ROLE_CHANGED' | 'STATUS_CHANGED' | 'PERMISSION_OVERRIDE' | 'EXPORT_DATA';
  ipAddress: string;
  deviceInfo: string;
  status: 'success' | 'failed' | 'flagged';
  details: string;
  timestamp: string;
}

// =========================================================================
// Security & System Settings
// =========================================================================

export interface ClinicGeneralSettings {
  clinicName: string;
  clinicNameBn?: string;
  tagline?: string;
  binNumber: string;
  tradeLicenseNo?: string;
  vatPercent: number; // 5% in Bangladesh medical/beauty services
  currency: string;
  currencySymbol: string;
  timezone: string;
  primaryHelpline: string;
  supportEmail: string;
  invoicePrefix: string;
  posFooterNotes?: string;
  primaryAddress?: string;
}

export interface ClinicSchedulingSettings {
  defaultSlotDurationMinutes: number; // 15, 20, 30, 45, 60
  patientBufferMinutes: number; // 0, 5, 10
  operatingStartTime: string; // e.g. "09:00"
  operatingEndTime: string; // e.g. "20:00"
  maxAdvanceBookingDays: number; // e.g. 30
  allowWalkInOverlap: boolean;
  teleTriageMandatory: boolean;
  autoSendSmsReminder24h: boolean;
}

export interface ClinicSecuritySettings {
  twoFactorEnforced: boolean;
  sessionTimeoutMinutes: number; // 15, 30, 60
  passwordExpiryDays: number; // 90
  minPasswordLength: number; // 8
  requireSpecialCharacter: boolean;
  maxDiscountPercentWithoutApproval: number; // e.g. 5
  patientPortalLinkExpiryHours: number; // e.g. 24
  patientPortalOtpExpiryMinutes: number; // e.g. 5
  allowDataExport: boolean;
  maskPatientMobileInCallCenter: boolean;
}

export interface BackupRecord {
  id: string;
  filename: string;
  fileSize: string;
  backupType: 'auto_daily' | 'manual' | 'pre_update';
  status: 'completed' | 'in_progress' | 'failed';
  totalRecords: number;
  tablesIncluded: string[];
  createdAt: string;
  createdBy: string;
}

export interface ActiveSessionRecord {
  id: string;
  userId: string;
  userName: string;
  role: UserRole;
  ipAddress: string;
  deviceInfo: string;
  loginTime: string;
  lastActiveTime: string;
  isCurrentSession: boolean;
}



