/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * i18n Types Definition
 */

export type Language = 'bn' | 'en';

export interface Translations {
  // App & Common
  appTitle: string;
  clinicName: string;
  clinicBranch: string;
  bangla: string;
  english: string;
  searchPlaceholder: string;
  searchPatients: string;
  notifications: string;
  unreadNotifications: string;
  profile: string;
  changePassword: string;
  signOut: string;
  breadcrumbHome: string;
  moduleComingNext: string;
  moduleComingNextDesc: string;
  securityNote: string;
  switchRole: string;
  currentRole: string;
  devRoleSwitchBanner: string;
  dismiss: string;
  close: string;
  cancel: string;
  save: string;
  submit: string;
  confirm: string;
  viewDetails: string;
  k1ProductRule: string;

  // Login
  welcomeBack: string;
  signinSubtitle: string;
  username: string;
  password: string;
  showPassword: string;
  hidePassword: string;
  signin: string;
  forgotPassword: string;
  errorInvalidCredentials: string;
  errorAccountLocked: string;
  quickDemoLogin: string;
  testErrorScenario: string;
  lockedErrorTrigger: string;
  invalidErrorTrigger: string;
  clearError: string;

  // Actions & Common Buttons
  newAppointment: string;
  under60SecBooking: string;
  quickBookNew: string;
  nextSessionDate: string;
  noMatchingResults: string;
  ruleDuplicateNotice: string;
  navigate: string;
  select: string;
  bangladeshMedicalSearch: string;
  collapseSidebar: string;
  expandSidebar: string;

  // Status Badges (K2 Design Tokens)
  statusDraft: string;
  statusConfirmed: string;
  statusCheckedIn: string;
  statusInSession: string;
  statusCompleted: string;
  statusCancelled: string;
  statusNoShow: string;
  statusPaid: string;
  statusPartial: string;
  statusDue: string;
  statusInStock: string;
  statusLowStock: string;
  statusOutOfStock: string;

  // Navigation Groups & Items
  nav: {
    // CRM Main Menu
    crm: string;
    // Overview
    overview: string;
    dashboard: string;
    // Patients
    patients: string;
    patientList: string;
    duplicateReview: string;
    // Scheduling
    scheduling: string;
    appointments: string;
    calendar: string;
    // Clinical
    clinical: string;
    consultations: string;
    treatmentSessions: string;
    prescriptions: string;
    // Catalog
    catalog: string;
    treatments: string;
    foodLifestyle: string;
    packages: string;
    // Billing
    billing: string;
    invoices: string;
    payments: string;
    refunds: string;
    // Inventory
    inventory: string;
    products: string;
    suppliers: string;
    purchases: string;
    stock: string;
    // Follow-up
    followUp: string;
    callCenter: string;
    followUpTasks: string;
    // Referrals
    referrals: string;
    referrers: string;
    commissions: string;
    payouts: string;
    // Reports
    reports: string;
    reportsAnalytics: string;
    notificationReports: string;
    // Admin
    admin: string;
    staffRoles: string;
    settings: string;
    integrations: string;
    templates: string;
    auditLog: string;
  };

  // Roles
  roles: {
    super_admin: string;
    admin_manager: string;
    receptionist: string;
    doctor: string;
    therapist: string;
    cashier: string;
    inventory_manager: string;
    call_center: string;
    patient: string;
  };

  // Top-level role keys for direct indexing
  super_admin: string;
  admin_manager: string;
  receptionist: string;
  doctor: string;
  therapist: string;
  cashier: string;
  inventory_manager: string;
  call_center: string;
  patient: string;

  // Status mapping
  status: {
    booked: string;
    confirmed: string;
    visited: string;
    cancelled: string;
    noShow: string;
    rescheduled: string;
    paid: string;
    partiallyPaid: string;
    unpaid: string;
    draft: string;
    void: string;
  };
}
