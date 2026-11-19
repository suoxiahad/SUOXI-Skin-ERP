import type { Translations } from './types.js';

export const bn: Translations = {
  // App & Common
  appTitle: 'সুঅক্সি সিআরএম',
  clinicName: 'সুঅক্সি স্কিন কেয়ার অ্যান্ড এস্থেটিক সেন্টার',
  clinicBranch: 'সুঅক্সি স্কিন কেয়ার, বসুন্ধরা শাখা',
  bangla: 'বাংলা',
  english: 'EN',
  searchPlaceholder: 'রোগীর নাম, আইডি বা মোবাইল দিয়ে খুঁজুন (⌘K বা /)',
  searchPatients: 'রোগী অনুসন্ধান',
  notifications: 'বিজ্ঞপ্তি',
  unreadNotifications: 'অপঠিত সতর্কতা',
  profile: 'আমার প্রোফাইল',
  changePassword: 'পাসওয়ার্ড পরিবর্তন',
  signOut: 'সাইন আউট',
  breadcrumbHome: 'নীড়পাতা',
  moduleComingNext: 'পরবর্তী ধাপে সংযুক্ত হবে',
  moduleComingNextDesc: 'কে-১ ব্যবসায়িক নিয়মাবলী অনুসারে পরবর্তী ধাপে এই মডিউলের তথ্য ও কার্যক্রম সক্রিয় করা হবে।',
  securityNote: 'বিজ্ঞপ্তি: ইউআই-তে মেনু হাইড করা শুধুমাত্র সুবিধার জন্য। সার্ভার সাইড রোল-বেজড এক্সেস ও ব্রাঞ্চ স্কোপিং ব্যাকএন্ডে কঠোরভাবে সংরক্ষিত।',
  switchRole: 'রোল পরিবর্তন করুন',
  currentRole: 'বর্তমান রোল',
  devRoleSwitchBanner: 'টেম্প-প্রোটোটাইপ: রোল ভিত্তিক নেভিগেশন প্রিভিউ',
  dismiss: 'বাতিল',
  close: 'বন্ধ করুন',
  cancel: 'বাতিল',
  save: 'সংরক্ষণ',
  submit: 'জমা দিন',
  confirm: 'নিশ্চিত করুন',
  viewDetails: 'বিস্তারিত দেখুন',
  k1ProductRule: 'কে-১ ব্যবসায়িক নিয়মাবলী বলবৎ',

  // Login
  welcomeBack: 'স্বাগতম',
  signinSubtitle: 'সুঅক্সি ক্লিনিক ওয়ার্কস্পেসে লগইন করুন',
  username: 'ব্যবহারকারীর নাম',
  password: 'পাসওয়ার্ড',
  showPassword: 'পাসওয়ার্ড দেখুন',
  hidePassword: 'পাসওয়ার্ড লুকান',
  signin: 'লগইন করুন',
  forgotPassword: 'পাসওয়ার্ড ভুলে গেছেন?',
  errorInvalidCredentials: 'ভুল ব্যবহারকারীর নাম বা পাসওয়ার্ড',
  errorAccountLocked: 'অ্যাকাউন্ট লক করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।',
  quickDemoLogin: 'ডেমো স্টাফ অ্যাকাউন্টস',
  testErrorScenario: 'ত্রুটি পরিস্থিতি পরীক্ষা',
  lockedErrorTrigger: 'অ্যাকাউন্ট লক ত্রুটি পরীক্ষা',
  invalidErrorTrigger: 'ভুল তথ্য ত্রুটি পরীক্ষা',
  clearError: 'ত্রুটি মুছুন',

  // Actions & Common Buttons
  newAppointment: 'নতুন অ্যাপয়েন্টমেন্ট',
  under60SecBooking: '৬০ সেকেন্ডের মধ্যে অ্যাপয়েন্টমেন্ট বুকিং',
  quickBookNew: 'অ্যাপয়েন্টমেন্ট বুক করুন',
  nextSessionDate: 'পরবর্তী সেশনের তারিখ',
  noMatchingResults: 'কোনো রোগীর তথ্য পাওয়া যায়নি',
  ruleDuplicateNotice: 'নিয়ম ৭: নিবন্ধনের পূর্বে ফোন (+৮৮০), জাতীয় পরিচয়পত্র ও পূর্ণ নাম যাচাই আবশ্যক।',
  navigate: 'নেভিগেট',
  select: 'নির্বাচন',
  bangladeshMedicalSearch: 'ঢাকা ক্লিনিক্যাল অনুসন্ধান ব্যবস্থা',
  collapseSidebar: 'সাইডবার গুটিয়ে নিন',
  expandSidebar: 'সাইডবার খুলুন',

  // Status Badges (K2 Design Tokens)
  statusDraft: 'খসড়া',
  statusConfirmed: 'নিশ্চিতকৃত',
  statusCheckedIn: 'উপস্থিত',
  statusInSession: 'সেশন চলমান',
  statusCompleted: 'সম্পন্ন',
  statusCancelled: 'বাতিলকৃত',
  statusNoShow: 'অনুপস্থিত',
  statusPaid: 'পরিশোধিত',
  statusPartial: 'আংশিক বকেয়া',
  statusDue: 'বকেয়া',
  statusInStock: 'মজুদ আছে',
  statusLowStock: 'স্বল্প স্টক',
  statusOutOfStock: 'স্টক শেষ',

  // Navigation Groups & Items
  nav: {
    // CRM
    crm: 'CRM',
    // Overview
    overview: 'ওভারভিউ',
    dashboard: 'ড্যাশবোর্ড',
    // CRM Sub-Menus
    patients: 'Patient (রোগীর তালিকা)',
    patientList: 'রোগীদের তালিকা',
    duplicateReview: 'দ্বৈত রোগী পর্যালোচনা',
    // Scheduling
    scheduling: 'সময়সূচি ও ক্যালেন্ডার',
    appointments: 'Appointment (অ্যাপয়েন্টমেন্ট)',
    calendar: 'ক্যালেন্ডার',
    // Clinical
    clinical: 'ক্লিনিক্যাল সেবা',
    consultations: 'পরামর্শ ও প্রেসক্রিপশন',
    treatmentSessions: 'ট্রিটমেন্ট সেশন',
    prescriptions: 'প্রেসক্রিপশন ও পথ্য',
    // Catalog
    catalog: 'সেবা ক্যাটালগ',
    treatments: 'চিকিৎসা ও সার্ভিস',
    foodLifestyle: 'খাদ্য ও জীবনধারা নির্দেশিকা',
    packages: 'ট্রিটমেন্ট প্যাকেজ',
    // Billing
    billing: 'বিলিং ও ক্যাশ',
    invoices: 'ইনভয়েস',
    payments: 'পেমেন্ট ও বকেয়া',
    refunds: 'রিফান্ড ও সমন্বয়',
    // Inventory
    inventory: 'ইনভেন্টরি ও স্টক',
    products: 'পণ্য ও ওষুধ তালিকা',
    suppliers: 'সরবরাহকারী',
    purchases: 'ক্রয়াদেশ (পিও)',
    stock: 'স্টক ও ব্যাচ ট্র্যাকিং',
    // Follow-up
    followUp: 'Followup (ফলো-আপ)',
    callCenter: 'কল সেন্টার ওয়ার্কলিস্ট',
    followUpTasks: 'ফলো-আপ টাস্ক',
    // Referrals
    referrals: 'রেফারেল ও কমিশন',
    referrers: 'রেফারার তালিকা',
    commissions: 'কমিশন হিসাব',
    payouts: 'কমিশন প্রদান',
    // Reports
    reports: 'প্রতিবেদন ও অ্যানালিটিক্স',
    reportsAnalytics: 'সার্বিক প্রতিবেদন',
    notificationReports: 'বার্তা ও নোটিফিকেশন কিউ',
    // Admin
    admin: 'অ্যাডমিনিস্ট্রেশন',
    staffRoles: 'কর্মী ও ভূমিকা',
    settings: 'ক্লিনিক সেটিংস',
    integrations: 'সংযোগ ও গেটওয়ে',
    templates: 'বার্তা টেমপ্লেট',
    auditLog: 'অডিট লগ',
  },

  // Roles
  roles: {
    super_admin: 'সুপার অ্যাডমিন',
    admin_manager: 'অ্যাডমিন / ম্যানেজার',
    receptionist: 'রিসেপশনিস্ট',
    doctor: 'ডাক্তার / কনসালটেন্ট',
    therapist: 'থেরাপিস্ট',
    cashier: 'হিসাবরক্ষক / ক্যাশিয়ার',
    inventory_manager: 'ইনভেন্টরি ম্যানেজার',
    call_center: 'কল সেন্টার প্রতিনিধি',
    patient: 'রোগী (পোর্টাল)',
  },

  // Direct indexing for roles
  super_admin: 'সুপার অ্যাডমিন',
  admin_manager: 'অ্যাডমিন / ম্যানেজার',
  receptionist: 'রিসেপশনিস্ট',
  doctor: 'ডাক্তার / কনসালটেন্ট',
  therapist: 'থেরাপিস্ট',
  cashier: 'হিসাবরক্ষক / ক্যাশিয়ার',
  inventory_manager: 'ইনভেন্টরি ম্যানেজার',
  call_center: 'কল সেন্টার প্রতিনিধি',
  patient: 'রোগী (পোর্টাল)',

  // Status mapping
  status: {
    booked: 'বুক করা হয়েছে',
    confirmed: 'নিশ্চিতকৃত',
    visited: 'উপস্থিত হয়েছেন',
    cancelled: 'বাতিল',
    noShow: 'অনুপস্থিত',
    rescheduled: 'পুনঃনির্ধারিত',
    paid: 'পরিশোধিত',
    partiallyPaid: 'আংশিক পরিশোধিত',
    unpaid: 'অপরিশোধিত',
    draft: 'খসড়া',
    void: 'বাতিলকৃত বিল',
  },
};
