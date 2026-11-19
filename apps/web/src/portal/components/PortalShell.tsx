import React, { useState } from 'react';
import {
  Home,
  Calendar,
  FileText,
  CreditCard,
  User,
  LogOut,
  FolderOpen,
  Sparkles,
} from 'lucide-react';
import { usePortalAuth } from '../context/PortalAuthContext.js';
import { PortalHomeView } from '../views/PortalHomeView.js';
import { PortalSessionsView } from '../views/PortalSessionsView.js';
import { PortalPrescriptionsView } from '../views/PortalPrescriptionsView.js';
import { PortalBillingView } from '../views/PortalBillingView.js';
import { PortalDocumentsView } from '../views/PortalDocumentsView.js';
import { PortalProfileView } from '../views/PortalProfileView.js';

export type PortalTab = 'home' | 'sessions' | 'prescriptions' | 'billing' | 'documents' | 'profile';

export const PortalShell: React.FC = () => {
  const { account, language, setLanguage, logout } = usePortalAuth();
  const [activeTab, setActiveTab] = useState<PortalTab>('home');

  return (
    <div className="min-h-screen bg-slate-100/80 flex flex-col items-center">
      {/* Mobile-first viewport container */}
      <div className="w-full max-w-md min-h-screen bg-slate-50 flex flex-col shadow-xl relative pb-20">
        {/* Top Bar with Brand & Language Toggle */}
        <header className="sticky top-0 z-30 px-4 py-3 bg-white/90 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-700 to-teal-800 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
              S
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-extrabold text-xs text-slate-800 tracking-tight">
                  SUOXI
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                  PORTAL
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                {language === 'bn' ? 'ত্বক ও এস্থেটিক কেয়ার' : 'Skin Care & Aesthetics'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setLanguage('bn')}
                className={`min-h-[36px] px-2 rounded-md font-bold text-[11px] transition-all cursor-pointer ${
                  language === 'bn' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-500'
                }`}
              >
                বাং
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`min-h-[36px] px-2 rounded-md font-bold text-[11px] transition-all cursor-pointer ${
                  language === 'en' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-500'
                }`}
              >
                EN
              </button>
            </div>

            {/* Logout button (44px min target) */}
            <button
              type="button"
              onClick={logout}
              title={language === 'bn' ? 'লগআউট' : 'Logout'}
              className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-4 overflow-y-auto">
          {activeTab === 'home' && <PortalHomeView onNavigateTab={(tab) => setActiveTab(tab)} />}
          {activeTab === 'sessions' && <PortalSessionsView />}
          {activeTab === 'prescriptions' && <PortalPrescriptionsView />}
          {activeTab === 'billing' && <PortalBillingView />}
          {activeTab === 'documents' && <PortalDocumentsView />}
          {activeTab === 'profile' && <PortalProfileView />}
        </main>

        {/* Fixed Mobile Bottom Tab Bar (44px+ touch targets) */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-lg">
          <div className="max-w-md mx-auto grid grid-cols-5 px-1 py-1">
            {/* Home Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className={`min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'home' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Home className={`w-5 h-5 ${activeTab === 'home' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              <span className="text-[10px] leading-tight">
                {language === 'bn' ? 'হোম' : 'Home'}
              </span>
            </button>

            {/* Sessions Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('sessions')}
              className={`min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'sessions' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Calendar className={`w-5 h-5 ${activeTab === 'sessions' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              <span className="text-[10px] leading-tight">
                {language === 'bn' ? 'সেশন' : 'Sessions'}
              </span>
            </button>

            {/* Prescriptions Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('prescriptions')}
              className={`min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'prescriptions' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <FileText className={`w-5 h-5 ${activeTab === 'prescriptions' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              <span className="text-[10px] leading-tight">
                {language === 'bn' ? 'প্রেসক্রিপশন' : 'Rx'}
              </span>
            </button>

            {/* Billing Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('billing')}
              className={`min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'billing' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <CreditCard className={`w-5 h-5 ${activeTab === 'billing' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              <span className="text-[10px] leading-tight">
                {language === 'bn' ? 'বিলিং' : 'Billing'}
              </span>
            </button>

            {/* Profile & Security Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`min-h-[48px] py-1 flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'profile' ? 'text-emerald-700 font-bold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <User className={`w-5 h-5 ${activeTab === 'profile' ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
              <span className="text-[10px] leading-tight">
                {language === 'bn' ? 'প্রোফাইল' : 'Profile'}
              </span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
};
