import type { PrescriptionMedicine, RxProtocolCategory } from '../../../types/index.ts';

export type RxMedicineDraft = Omit<PrescriptionMedicine, 'id'>;

export interface AestheticProcedureOption {
  name: string;
  priceBDT: number;
  category: string;
}

export interface RxProtocolPreset {
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
  medicines: RxMedicineDraft[];
  adviceList: string[];
  sunInstructions: string;
  sunInstructionsBn: string;
  waterLiters: number;
  followUpDays: number;
  morningRoutine: string[];
  eveningRoutine: string[];
  recommendedFoods: string[];
  prohibitedFoods: string[];
  updatedAt?: string;
}

export const PROTOCOL_CATEGORIES: RxProtocolCategory[] = [
  'Pigmentation & Melasma',
  'Acne & Sebum',
  'Laser & Scar Recovery',
  'Hair & PRP',
  'Anti-Aging & Glow',
  'General Dermatology',
];

export const DIAGNOSIS_PRESETS = [
  'Acne Vulgaris (Grade II)',
  'Epidermal Melasma',
  'Post-Inflammatory Hyperpigmentation (PIH)',
  'Atrophic Acne Scars',
  'Androgenetic Alopecia',
  'Rosacea / Facial Erythema',
  'Photoaging & Fine Lines',
  'Seborrheic Dermatitis',
];

export const COMPLAINT_CHIPS = [
  'Active breakouts & comedones',
  'Dark patches on cheeks',
  'Uneven skin tone & dullness',
  'Post-acne marks & scarring',
  'Hair thinning & shedding',
  'Open pores & excess oil',
  'Dryness & barrier sensitivity',
];

export const PAST_HISTORY_CHIPS = [
  { label: 'No significant past history', critical: false },
  { label: 'Pregnancy / Lactation', critical: true },
  { label: 'Recent Isotretinoin (<6 mo)', critical: true },
  { label: 'Keloid Tendency', critical: true },
  { label: 'Active Herpes / Infection', critical: true },
  { label: 'Drug / Cosmetic Allergy', critical: true },
  { label: 'Topical Steroid Cream Use', critical: false },
  { label: 'PCOS / Hormonal Imbalance', critical: false },
  { label: 'Thyroid Disorder', critical: false },
  { label: 'Diabetes / HTN', critical: false },
];

export const OPERATION_HISTORY_CHIPS = [
  'No H/O Operation',
  'C-Section',
  'Appendectomy / General Surgery',
  'Previous Facial / Rhinoplasty Surgery',
  'Previous Laser / Chemical Peel',
  'Hair Transplant',
  'Post-op Keloid Scar',
];

export const INVESTIGATION_CHIPS = [
  'CBC',
  'TSH / Thyroid Profile',
  'Serum Ferritin',
  'Vitamin D3',
  'HbA1c / FBS',
  'LH / FSH / Testosterone (PCOS Panel)',
  'Serum IgE',
  'KOH / Skin Scraping',
  "Wood's Lamp / Dermoscopy",
];

export const FITZPATRICK_TYPES = [
  'Type I (Pale White / Highly Sensitive)',
  'Type II (Fair / Burns Easily)',
  'Type III (Medium / Sometimes Burns)',
  'Type IV (South Asian Moderate Brown)',
  'Type V (Dark Brown / Rarely Burns)',
  'Type VI (Deeply Pigmented / Never Burns)',
];

export const SKIN_TYPES: Array<{ id: 'oily' | 'dry' | 'combination' | 'sensitive' | 'normal'; label: string }> = [
  { id: 'oily', label: 'Oily' },
  { id: 'combination', label: 'Combination' },
  { id: 'dry', label: 'Dry' },
  { id: 'sensitive', label: 'Sensitive' },
  { id: 'normal', label: 'Normal' },
];

export const TARGET_ZONES = [
  'Forehead & Glabella',
  'Periorbital',
  'Malar Cheeks',
  'Nose & T-Zone',
  'Perioral & Chin',
  'Jawline & Submental',
  'Neck & Décolletage',
  'Scalp',
];

export const EXAM_FINDING_CHIPS = [
  'Skin barrier intact',
  'No active erythema',
  'Open & closed comedones',
  'Inflammatory papules',
  'Epidermal melanin patch',
  'Boxcar / Ice-pick scars',
  'Diffuse scalp thinning',
  'Mild barrier dehydration',
];

export const PROCEDURE_OPTIONS: AestheticProcedureOption[] = [
  { name: 'HydraFacial MD with GlySal Peel', priceBDT: 4500, category: 'Skin Care' },
  { name: 'Q-Switched Nd:YAG Laser Toning', priceBDT: 5500, category: 'Laser & Aesthetic' },
  { name: 'Fractional CO2 Laser Resurfacing', priceBDT: 8000, category: 'Laser & Aesthetic' },
  { name: 'Hollywood Carbon Laser Peel', priceBDT: 4000, category: 'Laser & Aesthetic' },
  { name: 'Medical Chemical Peel (Salicylic / Glycolic)', priceBDT: 3500, category: 'Skin Care' },
  { name: 'Autologous PRP Skin / Hair Therapy', priceBDT: 6500, category: 'Hair Therapy' },
  { name: 'Microneedling RF (MNRF)', priceBDT: 9000, category: 'Anti-Aging' },
];

export const MEDICINE_FORMS: RxMedicineDraft['form'][] = [
  'Cream',
  'Serum',
  'Sunscreen',
  'Facewash',
  'Gel',
  'Lotion',
  'Tablet',
  'Capsule',
];

export const DOSAGE_QUICK_CHIPS = [
  'AM (Morning)',
  'PM (Night)',
  'AM + PM',
  '1+0+1',
  '0+0+1',
  '1+0+0',
];

export const DURATION_QUICK_CHIPS = [
  '7 days',
  '14 days',
  '30 days',
  '60 days',
  'Continuous',
];

export const QUICK_ADVICE_CHIPS = [
  'বাইরে বের হওয়ার ২০ মিনিট আগে সানস্ক্রিন SPF 50+ ব্যবহার করুন (প্রতি ৩ ঘণ্টা পর পর)',
  'দৈনিক কমপক্ষে ২.৫–৩ লিটার বিশুদ্ধ পানি পান করুন',
  'লেজার/পিলের পর ৪৮ ঘণ্টা সরাসরি রোদ, গরম ভাপ ও চুলার তাপ এড়িয়ে চলুন',
  'মুখ ঘষে মুছবেন না; নরম তোয়ালে দিয়ে হালকাভাবে মুছুন',
  'অতিরিক্ত চিনি, দুধের মিষ্টি ও ভাজাপোড়া খাবার এড়িয়ে চলুন',
  'চিকিৎসকের পরামর্শ ছাড়া কোনো স্টেরয়েড বা ফার্মেসি ক্রিম ব্যবহার করবেন না',
  'Reapply broad-spectrum SPF 50+ every 3 hours during daytime',
  'Minimum 7–8 hours restful sleep nightly for dermal repair',
];

export const DEFAULT_MORNING_ROUTINE = [
  '1. Gentle pH-balanced Cleanser',
  '2. Antioxidant / Hyaluronic Serum',
  '3. Lightweight Barrier Moisturizer',
  '4. Broad-Spectrum Sunscreen SPF 50+ PA++++',
];

export const DEFAULT_EVENING_ROUTINE = [
  '1. Gentle Non-Stripping Wash',
  '2. Targeted Active Treatment (Pea-sized)',
  '3. Ceramide Barrier Repair Cream',
];

export const DEFAULT_RECOMMENDED_FOODS = [
  'Amla, Guava, Orange & Lemon (Vitamin C collagen support)',
  'Papaya, Carrots & Tomatoes (Antioxidant lycopene)',
  'Almonds, Walnuts & Chia Seeds (Omega-3 & Vitamin E)',
  'Spinach, Broccoli & Green Leafy Vegetables',
];

export const DEFAULT_PROHIBITED_FOODS = [
  'Refined sugar, sweet pastries & sugary carbonated drinks',
  'Deep-fried fast food & trans-fat street snacks',
  'Excessive spicy gravies causing facial flushing',
];

export const CONTEXTUAL_MEDICINE_SUGGESTIONS: Array<{
  keywords: string[];
  items: RxMedicineDraft[];
}> = [
  {
    keywords: ['melasma', 'pigment', 'pih', 'dark'],
    items: [
      {
        name: 'Azelaic Acid 20% Derma Cream',
        genericName: 'Azelaic Acid',
        form: 'Cream',
        dosage: 'PM (Night)',
        duration: '60 days',
        instructions: 'Apply pea-sized thin layer on pigmented patches after drying face',
        instructionsBn: 'রাতে মুখ ধোয়ার ২০ মিনিট পর দাগের ওপর পাতলা করে লাগাবেন',
      },
      {
        name: 'Vitamin C 15% + Ferulic Serum',
        genericName: 'L-Ascorbic Acid',
        form: 'Serum',
        dosage: 'AM (Morning)',
        duration: '60 days',
        instructions: '3–4 drops on clean skin before moisturizer and sunscreen',
        instructionsBn: 'সকালে ময়েশ্চারাইজার ও সানস্ক্রিনের আগে ৩–৪ ফোঁটা লাগাবেন',
      },
      {
        name: 'UV Shield Mineral Sunscreen SPF 50+',
        genericName: 'Zinc Oxide + Tinosorb',
        form: 'Sunscreen',
        dosage: 'AM + Noon',
        duration: 'Continuous',
        instructions: 'Two-finger length amount 20 mins before sun exposure',
        instructionsBn: 'রোদে বা চুলার পাশে যাওয়ার ২০ মিনিট আগে ব্যবহার করুন',
      },
      {
        name: 'Tab. Tranexa 250 mg',
        genericName: 'Tranexamic Acid',
        form: 'Tablet',
        dosage: '1+0+1',
        duration: '30 days',
        instructions: 'After meal',
        instructionsBn: 'ভরা পেটে খাবেন',
      },
    ],
  },
  {
    keywords: ['acne', 'comedone', 'breakout', 'pimple', 'sebum'],
    items: [
      {
        name: 'Salicylic Acid 2% Clarifying Wash',
        genericName: 'Salicylic Acid',
        form: 'Facewash',
        dosage: 'AM + PM',
        duration: '60 days',
        instructions: 'Massage gently for 30 seconds and rinse with cool water',
        instructionsBn: 'সকাল ও রাতে ৩০ সেকেন্ড ম্যাসাজ করে ঠান্ডা পানিতে ধুয়ে ফেলুন',
      },
      {
        name: 'Adapalene 0.1% + Clindamycin Gel',
        genericName: 'Adapalene + Clindamycin',
        form: 'Gel',
        dosage: 'PM (Night)',
        duration: '45 days',
        instructions: 'Apply thin pea-sized layer at bedtime; avoid corners of eyes & nose',
        instructionsBn: 'রাতে ঘুমানোর আগে পাতলা করে লাগান (চোখের কোণা এড়িয়ে চলুন)',
      },
      {
        name: 'Oil-Free Matte Gel Sunscreen SPF 50',
        genericName: 'Non-comedogenic UV Filter',
        form: 'Sunscreen',
        dosage: 'AM (Morning)',
        duration: 'Continuous',
        instructions: 'Apply every morning and reapply if outdoors',
        instructionsBn: 'প্রতিদিন সকালে মুখে ব্যবহার করুন',
      },
      {
        name: 'Cap. Doxycycline 100 mg',
        genericName: 'Doxycycline',
        form: 'Capsule',
        dosage: '0+0+1',
        duration: '14 days',
        instructions: 'After dinner with a full glass of water; stay upright 30 mins',
        instructionsBn: 'রাতের খাবারের পর এক গ্লাস পানি দিয়ে খাবেন',
      },
    ],
  },
  {
    keywords: ['hair', 'alopecia', 'scalp', 'prp'],
    items: [
      {
        name: 'Minoxidil 5% + Finasteride Topical Solution',
        genericName: 'Minoxidil + Finasteride',
        form: 'Lotion',
        dosage: 'PM (Night)',
        duration: '90 days',
        instructions: 'Apply 1 ml directly on dry scalp and massage gently',
        instructionsBn: 'রাতে শুষ্ক স্ক্যাল্পে ১ মিলি লাগিয়ে হালকা ম্যাসাজ করুন',
      },
      {
        name: 'Biotin + Zinc + Amino Hair Support',
        genericName: 'Biotin 10mg Complex',
        form: 'Tablet',
        dosage: '0+1+0',
        duration: '60 days',
        instructions: 'After lunch',
        instructionsBn: 'দুপুরের খাবারের পর ১টি করে খাবেন',
      },
      {
        name: 'Ketoconazole 2% Medicated Scalp Wash',
        genericName: 'Ketoconazole',
        form: 'Facewash',
        dosage: '2x Weekly',
        duration: '30 days',
        instructions: 'Leave foam on scalp for 3–5 minutes before rinsing',
        instructionsBn: 'সপ্তাহে ২ দিন মাথায় ৩–৫ মিনিট রেখে ধুয়ে ফেলুন',
      },
    ],
  },
  {
    keywords: ['scar', 'laser', 'co2', 'barrier', 'aging'],
    items: [
      {
        name: 'Centella + Ceramide Barrier Repair Cream',
        genericName: 'Ceramide NP + Madecassoside',
        form: 'Cream',
        dosage: 'AM + PM',
        duration: '30 days',
        instructions: 'Apply generously to calm redness and support post-procedure healing',
        instructionsBn: 'দিনে ২ বার ত্বক কোমল ও সুরক্ষিত রাখতে লাগান',
      },
      {
        name: 'Hyaluronic Acid 2% + B5 Hydrating Serum',
        genericName: 'Sodium Hyaluronate + Panthenol',
        form: 'Serum',
        dosage: 'AM + PM',
        duration: '60 days',
        instructions: 'Apply on slightly damp skin before moisturizer',
        instructionsBn: 'হালকা ভেজা ত্বকে ২–৩ ফোঁটা ব্যবহার করুন',
      },
      {
        name: 'Mineral Soothing Sunscreen SPF 50+',
        genericName: 'Physical UV Filters',
        form: 'Sunscreen',
        dosage: 'AM + Noon',
        duration: 'Continuous',
        instructions: 'Mandatory post-laser protection every 3 hours',
        instructionsBn: 'লেজারের পর রোদ ও তাপ থেকে বাঁচতে প্রতি ৩ ঘণ্টায় ব্যবহার করুন',
      },
    ],
  },
];

export const RX_PROTOCOLS: RxProtocolPreset[] = [
  {
    id: 'proto-melasma',
    name: 'Epidermal Melasma & Brightening',
    subtitle: 'Q-Switch Laser + Azelaic + Vit C + Strict SPF',
    category: 'Pigmentation & Melasma',
    isActive: true,
    isDefaultBaseline: true,
    diagnosis: 'Epidermal Melasma',
    chiefComplaints: 'Dark brownish patches over bilateral malar cheeks and forehead',
    investigations: "Wood's Lamp / Dermoscopy, TSH / Thyroid Profile, Serum Ferritin",
    examinationNotes: 'Fitzpatrick Type IV, epidermal melanin patch under Wood’s lamp, barrier intact',
    skinType: 'combination',
    targetZones: ['Malar Cheeks', 'Forehead & Glabella'],
    procedures: ['Q-Switched Nd:YAG Laser Toning', 'HydraFacial MD with GlySal Peel'],
    medicines: CONTEXTUAL_MEDICINE_SUGGESTIONS[0].items,
    adviceList: [
      'বাইরে বের হওয়ার ২০ মিনিট আগে সানস্ক্রিন SPF 50+ ব্যবহার করুন (প্রতি ৩ ঘণ্টা পর পর)',
      'রান্নাঘরের সরাসরি চুলার তাপ ও রোদ এড়িয়ে চলুন',
      'চিকিৎসকের পরামর্শ ছাড়া কোনো স্টেরয়েড বা ফার্মেসি ক্রিম ব্যবহার করবেন না',
    ],
    sunInstructions: 'Apply 2-finger length broad-spectrum SPF 50+ PA++++ every 3 hours; avoid direct kitchen stove heat.',
    sunInstructionsBn: 'রোদে বা চুলার কাছে যাওয়ার ২০ মিনিট আগে ২-আঙুল পরিমাণ সানস্ক্রিন ব্যবহার করুন।',
    waterLiters: 3.0,
    followUpDays: 14,
    morningRoutine: DEFAULT_MORNING_ROUTINE,
    eveningRoutine: ['1. Gentle Cleanser', '2. Azelaic Acid 20% Thin Layer', '3. Ceramide Moisturizer'],
    recommendedFoods: DEFAULT_RECOMMENDED_FOODS,
    prohibitedFoods: DEFAULT_PROHIBITED_FOODS,
  },
  {
    id: 'proto-acne',
    name: 'Acne & Sebum Control',
    subtitle: 'Salicylic Peel + Adapalene + Matte SPF',
    category: 'Acne & Sebum',
    isActive: true,
    isDefaultBaseline: false,
    diagnosis: 'Acne Vulgaris (Grade II)',
    chiefComplaints: 'Recurrent facial breakouts, open/closed comedones, and oily T-zone',
    investigations: 'LH / FSH / Testosterone (PCOS Panel), HbA1c / FBS',
    examinationNotes: 'Open & closed comedones with mild inflammatory papules on cheeks and jawline',
    skinType: 'oily',
    targetZones: ['Malar Cheeks', 'Nose & T-Zone', 'Jawline & Submental'],
    procedures: ['Medical Chemical Peel (Salicylic / Glycolic)'],
    medicines: CONTEXTUAL_MEDICINE_SUGGESTIONS[1].items,
    adviceList: [
      'ব্রণ খুঁটবেন বা চাপ দেবেন না—এতে স্থায়ী দাগ বা গর্ত হতে পারে',
      'অতিরিক্ত চিনি, দুধের মিষ্টি ও ভাজাপোড়া খাবার এড়িয়ে চলুন',
      'দৈনিক কমপক্ষে ২.৫–৩ লিটার বিশুদ্ধ পানি পান করুন',
    ],
    sunInstructions: 'Use oil-free non-comedogenic gel sunscreen SPF 50 daily before stepping out.',
    sunInstructionsBn: 'তেলমুক্ত জেল সানস্ক্রিন প্রতিদিন সকালে ব্যবহার করুন।',
    waterLiters: 3.0,
    followUpDays: 14,
    morningRoutine: ['1. Salicylic Acid 2% Wash', '2. Niacinamide Oil-Control Serum', '3. Matte Gel SPF 50'],
    eveningRoutine: ['1. Salicylic Acid 2% Wash', '2. Adapalene + Clindamycin Gel (Pea-sized)', '3. Light Oil-Free Gel'],
    recommendedFoods: DEFAULT_RECOMMENDED_FOODS,
    prohibitedFoods: [
      'High-glycemic sweets, sugary tea/coffee & dairy desserts',
      'Deep-fried snacks & oily fast food',
    ],
  },
  {
    id: 'proto-post-laser',
    name: 'Post-CO2 Laser & Scar Recovery',
    subtitle: 'Barrier Repair + HA Serum + Physical SPF',
    category: 'Laser & Scar Recovery',
    isActive: true,
    isDefaultBaseline: false,
    diagnosis: 'Atrophic Acne Scars (Post-Fractional Care)',
    chiefComplaints: 'Rolling and boxcar post-acne scars across malar region',
    investigations: 'CBC, HbA1c / FBS',
    examinationNotes: 'Fitzpatrick Type IV, deep scars suitable for fractional resurfacing; barrier prep needed',
    skinType: 'sensitive',
    targetZones: ['Malar Cheeks', 'Forehead & Glabella'],
    procedures: ['Fractional CO2 Laser Resurfacing', 'Autologous PRP Skin / Hair Therapy'],
    medicines: CONTEXTUAL_MEDICINE_SUGGESTIONS[3].items,
    adviceList: [
      'লেজার/পিলের পর ৪৮ ঘণ্টা সরাসরি রোদ, গরম ভাপ ও চুলার তাপ এড়িয়ে চলুন',
      'পাঁচ দিন কোনো স্ক্রাব, ফেসওয়াশ বা অ্যাক্টিভ অ্যাসিড ব্যবহার করবেন না',
      'মুখ ঘষে মুছবেন না; নরম তোয়ালে দিয়ে হালকাভাবে মুছুন',
    ],
    sunInstructions: 'Strict photoprotection for 14 days post-laser. Apply mineral SPF 50+ indoors near windows as well.',
    sunInstructionsBn: 'লেজারের পর ১৪ দিন কঠোরভাবে রোদ ও তাপ এড়িয়ে চলুন ও মিনারেল সানস্ক্রিন লাগান।',
    waterLiters: 3.0,
    followUpDays: 7,
    morningRoutine: ['1. Thermal Spring Water Mist / Gentle Wash', '2. Hyaluronic Acid B5 Serum', '3. Ceramide Cream', '4. Mineral SPF 50+'],
    eveningRoutine: ['1. Ultra-Gentle Cleanser', '2. Centella Barrier Repair Balm'],
    recommendedFoods: DEFAULT_RECOMMENDED_FOODS,
    prohibitedFoods: DEFAULT_PROHIBITED_FOODS,
  },
  {
    id: 'proto-hair',
    name: 'Hair Fall & PRP Density Protocol',
    subtitle: 'PRP Therapy + Minoxidil + Biotin Complex',
    category: 'Hair & PRP',
    isActive: true,
    isDefaultBaseline: false,
    diagnosis: 'Androgenetic Alopecia',
    chiefComplaints: 'Progressive hair thinning at crown and frontal hairline for 6 months',
    investigations: 'CBC, Serum Ferritin, Vitamin D3, TSH / Thyroid Profile',
    examinationNotes: 'Positive hair pull test, widening central part, mild scalp seborrhea',
    skinType: 'normal',
    targetZones: ['Scalp'],
    procedures: ['Autologous PRP Skin / Hair Therapy'],
    medicines: CONTEXTUAL_MEDICINE_SUGGESTIONS[2].items,
    adviceList: [
      'PRP সেশনের পর ২৪ ঘণ্টা মাথায় শ্যাম্পু বা তেল ব্যবহার করবেন না',
      'পর্যাপ্ত প্রোটিনসমৃদ্ধ খাবার (ডিম, মাছ, বাদাম) ও পর্যাপ্ত ঘুম নিশ্চিত করুন',
    ],
    sunInstructions: 'Protect scalp from intense midday sun after PRP microneedling for 48 hours.',
    sunInstructionsBn: 'PRP করার পর ৪৮ ঘণ্টা সরাসরি কড়া রোদ এড়িয়ে চলুন।',
    waterLiters: 2.5,
    followUpDays: 30,
    morningRoutine: ['1. Gentle Scalp Care', '2. Post-Breakfast Biotin Supplement'],
    eveningRoutine: ['1. Dry Scalp Application (Minoxidil 1ml)', '2. Gentle Fingertip Massage'],
    recommendedFoods: [
      'Eggs, lean fish, lentils & Greek yogurt (Keratin protein)',
      'Pumpkin seeds, walnuts & spinach (Iron & Zinc)',
    ],
    prohibitedFoods: ['Crash dieting & excess sugary beverages'],
  },
];

export function getContextualSuggestionsForDiagnosis(diagnosis: string): RxMedicineDraft[] {
  const d = diagnosis.toLowerCase();
  const matched = CONTEXTUAL_MEDICINE_SUGGESTIONS.find((group) =>
    group.keywords.some((kw) => d.includes(kw))
  );
  return matched ? matched.items : CONTEXTUAL_MEDICINE_SUGGESTIONS[0].items;
}
