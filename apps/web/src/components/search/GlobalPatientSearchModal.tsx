import React, { useState, useEffect, useRef } from 'react';
import { Search, X, User, Phone, Calendar, Clock, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface GlobalPatientSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPatient?: (patientId: string) => void;
  onQuickBookAppointment?: () => void;
}

export const GlobalPatientSearchModal: React.FC<GlobalPatientSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectPatient,
  onQuickBookAppointment,
}) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sample match demonstrator for the shell navigation
  const sampleResults = [
    {
      id: 'SX-2026-0041',
      name: 'Nusrat Jahan',
      phone: '+880 1712-345678',
      lastVisit: '2026-10-12',
      nextSession: '2026-10-19',
      treatment: 'HydraFacial Glow + Laser Toning',
    },
    {
      id: 'SX-2026-0089',
      name: 'Farhana Ahmed',
      phone: '+880 1819-987654',
      lastVisit: '2026-10-14',
      nextSession: '2026-10-21',
      treatment: 'Acne Clarifying Peel',
    },
    {
      id: 'SX-2026-0105',
      name: 'Tanvir Hossain',
      phone: '+880 1911-223344',
      lastVisit: '2026-09-30',
      nextSession: '2026-10-18',
      treatment: 'PRP Hair Therapy Session 3',
    },
  ].filter(
    (item) =>
      query.trim() === '' ||
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.phone.includes(query) ||
      item.id.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (sampleResults.length > 0 ? (prev + 1) % sampleResults.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          sampleResults.length > 0 ? (prev - 1 + sampleResults.length) % sampleResults.length : 0
        );
      } else if (e.key === 'Enter') {
        if (sampleResults.length > 0 && sampleResults[selectedIndex]) {
          e.preventDefault();
          onSelectPatient?.(sampleResults[selectedIndex].id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, sampleResults, selectedIndex, onClose, onSelectPatient]);

  if (!isOpen) return null;

  const isQuickBookRole = user?.roles?.includes('receptionist') || user?.roles?.includes('call_center');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-brand-border overflow-hidden glass-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-brand-border bg-white/80">
          <Search className="w-5 h-5 text-brand-primary flex-shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={t.searchPlaceholder}
            className="flex-1 text-sm sm:text-base bg-transparent text-brand-text placeholder:text-brand-muted focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-brand-muted hover:text-brand-text hover:bg-slate-100 mr-2 focus-ring"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-mono text-brand-muted bg-slate-100 border border-slate-200 rounded">
            ESC
          </kbd>
        </div>

        {/* Fast Action Banner for Receptionists & Call Center */}
        {isQuickBookRole && (
          <div className="px-4 py-2 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-900">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-brand-primary" />
              <span>{t.under60SecBooking}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onQuickBookAppointment?.();
              }}
              className="text-brand-primary font-semibold hover:underline flex items-center gap-1"
            >
              {t.quickBookNew}
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-slate-100">
          {sampleResults.length > 0 ? (
            sampleResults.map((patient, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={patient.id}
                  onClick={() => {
                    onSelectPatient?.(patient.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`p-3 rounded-lg cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-brand-primary/10 border-l-4 border-brand-primary text-brand-text'
                      : 'hover:bg-slate-50 text-brand-text'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0 text-brand-primary font-semibold">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{patient.name}</span>
                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {patient.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-brand-muted mt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {patient.phone}
                        </span>
                        <span className="truncate hidden sm:inline">
                          {patient.treatment}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-[11px] text-brand-muted">
                      {t.nextSessionDate}:
                    </div>
                    <div className="text-xs font-semibold text-brand-primary flex items-center gap-1 justify-end">
                      <Calendar className="w-3 h-3" />
                      {patient.nextSession}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-sm text-brand-muted">
              <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <div className="font-medium text-slate-700">{t.noMatchingResults}</div>
              <div className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {t.ruleDuplicateNotice}
              </div>
            </div>
          )}
        </div>

        {/* Search Modal Footer / Hints */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-brand-border flex items-center justify-between text-[11px] text-brand-muted">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">↓</kbd>
              <span>{t.navigate}</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">↵</kbd>
              <span>{t.select}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-brand-primary font-medium">
            <Sparkles className="w-3 h-3" />
            <span>{t.bangladeshMedicalSearch}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
