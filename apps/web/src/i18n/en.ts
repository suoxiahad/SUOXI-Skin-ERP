import type { Translations } from './types.js';

export const en: Translations = {
  // App & Common
  appTitle: 'SUOXI CRM',
  clinicName: 'SUOXI Skin Care & Aesthetic Center',
  clinicBranch: 'SUOXI Skin Care, Bashundhara',
  bangla: 'বাংলা',
  english: 'EN',
  searchPlaceholder: 'Search patient by name, ID or mobile (⌘K or /)',
  searchPatients: 'Global Patient Search',
  notifications: 'Notifications',
  unreadNotifications: 'unread alerts',
  profile: 'My Profile',
  changePassword: 'Change Password',
  signOut: 'Sign Out',
  breadcrumbHome: 'Home',
  moduleComingNext: 'This module is coming next',
  moduleComingNextDesc: 'The complete data workflow and operational interface will be connected in subsequent phases according to K1 business specifications.',
  securityNote: 'Note: Hiding navigation items in the UI is for operational convenience only. Server-side authorization, branch scoping, and DB grants are enforced by the Node.js API.',
  switchRole: 'Switch Dev Role',
  currentRole: 'Current Role',
  devRoleSwitchBanner: 'TEMP-PROTOTYPE: Role-based navigation preview',
  dismiss: 'Dismiss',
  close: 'Close',
  cancel: 'Cancel',
  save: 'Save',
  submit: 'Submit',
  confirm: 'Confirm',
  viewDetails: 'View Details',
  k1ProductRule: 'K1 Product Rule Enforced',

  // Login
  welcomeBack: 'Welcome back',
  signinSubtitle: 'Sign in to the SUOXI clinic workspace',
  username: 'Username',
  password: 'Password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  signin: 'Sign in',
  forgotPassword: 'Forgot password?',
  errorInvalidCredentials: 'Incorrect username or password',
  errorAccountLocked: 'Account locked. Try again in 15 minutes.',
  quickDemoLogin: 'Quick Demo Accounts',
  testErrorScenario: 'Simulate Error State',
  lockedErrorTrigger: 'Test Account Locked Error',
  invalidErrorTrigger: 'Test Invalid Credentials Error',
  clearError: 'Clear Error',

  // Actions & Common Buttons
  newAppointment: 'New Appointment',
  under60SecBooking: 'Under-60-Second Appointment Booking',
  quickBookNew: 'Book Appointment',
  nextSessionDate: 'Next Session Date',
  noMatchingResults: 'No matching patient records found',
  ruleDuplicateNotice: 'Rule 7: Mandatory duplicate check via Phone (+880), NID, and Full Name before registration.',
  navigate: 'Navigate',
  select: 'Select',
  bangladeshMedicalSearch: 'Dhaka Clinic Operational Search',
  collapseSidebar: 'Collapse Sidebar',
  expandSidebar: 'Expand Sidebar',

  // Status Badges (K2 Design Tokens)
  statusDraft: 'Draft',
  statusConfirmed: 'Confirmed',
  statusCheckedIn: 'Checked In',
  statusInSession: 'In Session',
  statusCompleted: 'Completed',
  statusCancelled: 'Cancelled',
  statusNoShow: 'No-Show',
  statusPaid: 'Paid',
  statusPartial: 'Partial Due',
  statusDue: 'Due Unpaid',
  statusInStock: 'In Stock',
  statusLowStock: 'Low Stock',
  statusOutOfStock: 'Out of Stock',

  // Navigation Groups & Items
  nav: {
    // CRM
    crm: 'CRM',
    // Overview
    overview: 'Overview',
    dashboard: 'Dashboard',
    // Patients
    patients: 'Patient',
    patientList: 'Patients',
    duplicateReview: 'Duplicate Review',
    // Scheduling
    scheduling: 'Scheduling & Calendar',
    appointments: 'Appointment',
    calendar: 'Calendar',
    // Clinical
    clinical: 'Clinical',
    consultations: 'Consultations',
    treatmentSessions: 'Treatment Sessions',
    prescriptions: 'Prescriptions',
    // Catalog
    catalog: 'Catalog',
    treatments: 'Treatments',
    foodLifestyle: 'Food & Lifestyle Guidance',
    packages: 'Packages',
    // Billing
    billing: 'Billing',
    invoices: 'Invoices',
    payments: 'Payments',
    refunds: 'Refunds',
    // Inventory
    inventory: 'Inventory',
    products: 'Products',
    suppliers: 'Suppliers',
    purchases: 'Purchases',
    stock: 'Stock',
    // Follow-up
    followUp: 'Followup',
    callCenter: 'Call Center',
    followUpTasks: 'Follow-up Tasks',
    // Referrals
    referrals: 'Referrals',
    referrers: 'Referrers',
    commissions: 'Commissions',
    payouts: 'Payouts',
    // Reports
    reports: 'Reports',
    reportsAnalytics: 'Reports',
    notificationReports: 'Notification Queue',
    // Admin
    admin: 'Admin',
    staffRoles: 'Staff & Roles',
    settings: 'Settings',
    integrations: 'Integrations',
    templates: 'Templates',
    auditLog: 'Audit Log',
  },

  // Roles
  roles: {
    super_admin: 'Super Admin',
    admin_manager: 'Admin / Manager',
    receptionist: 'Receptionist',
    doctor: 'Doctor / Consultant',
    therapist: 'Therapist',
    cashier: 'Accounts / Cashier',
    inventory_manager: 'Inventory Manager',
    call_center: 'Call Center Agent',
    patient: 'Patient (Portal)',
  },

  // Direct indexing for roles
  super_admin: 'Super Admin',
  admin_manager: 'Admin / Manager',
  receptionist: 'Receptionist',
  doctor: 'Doctor / Consultant',
  therapist: 'Therapist',
  cashier: 'Accounts / Cashier',
  inventory_manager: 'Inventory Manager',
  call_center: 'Call Center Agent',
  patient: 'Patient (Portal)',

  // Status mapping
  status: {
    booked: 'Booked',
    confirmed: 'Confirmed',
    visited: 'Visited',
    cancelled: 'Cancelled',
    noShow: 'No-show',
    rescheduled: 'Rescheduled',
    paid: 'Paid',
    partiallyPaid: 'Partially Paid',
    unpaid: 'Unpaid',
    draft: 'Draft',
    void: 'Void',
  },
};
