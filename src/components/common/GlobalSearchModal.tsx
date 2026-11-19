import React, { useState, useEffect } from 'react';
import { Search, X, User, Phone, AlertTriangle, Calendar, FileText, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../api/client.ts';
import type { Patient } from '../../types/index.ts';

export const GlobalSearchModal: React.FC = () => {
  const { isSearchOpen, setIsSearchOpen, setSelectedPatientId, setCurrentView, setIsQuickBookOpen } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSearchOpen) {
      setSearchTerm('');
      setResults([]);
      return;
    }

    // Load initial list or filter
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const patients = await api.patients.list(searchTerm);
        setResults(patients);
      } catch (err) {
        console.error('Failed to search patients:', err);
      } finally {
        setIsLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [searchTerm, isSearchOpen]);

  if (!isSearchOpen) return null;

  const handleSelectPatient = (patient: Patient, targetView = 'patients') => {
    setSelectedPatientId(patient.id);
    setCurrentView(targetView);
    setIsSearchOpen(false);
  };

  const handleBookForPatient = (patient: Patient) => {
    setSelectedPatientId(patient.id);
    setIsSearchOpen(false);
    setIsQuickBookOpen(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 gap-3">
          <Search className="w-5 h-5 text-[#0DA54F]" />
          <input
            type="text"
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patient by name, +880 phone, or SX ID... (ESC to close)"
            className="flex-1 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 text-slate-800 placeholder:text-slate-400"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsSearchOpen(false);
            }}
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-mono text-slate-400 bg-slate-100 rounded border border-slate-200">
            ESC
          </kbd>
          <button
            onClick={() => setIsSearchOpen(false)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 p-2">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">Searching SUOXI patient database...</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600 font-medium">No patients found</p>
              <p className="text-xs text-slate-400 mt-1">Try searching with phone number e.g. +88017... or patient ID</p>
            </div>
          ) : (
            results.map((p) => (
              <div
                key={p.id}
                className="p-3 hover:bg-slate-50/80 rounded-lg transition-colors flex items-center justify-between group"
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => handleSelectPatient(p, 'patients')}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm">{p.name}</span>
                    {p.nameBn && <span className="text-xs text-slate-500 font-bengali">({p.nameBn})</span>}
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {p.patientIdCode}
                    </span>
                    {p.isFlaggedDuplicate && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                        Duplicate Flagged (Review)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {p.phone}
                    </span>
                    <span>
                      {p.gender ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1) : ''}
                      {p.age ? `, ${p.age} yrs` : ''}
                    </span>
                    {p.skinType && (
                      <span className="text-[#0DA54F] font-medium capitalize">
                        Skin: {p.skinType}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100">
                  <button
                    onClick={() => handleBookForPatient(p)}
                    title="Quick Book Appointment"
                    className="p-1.5 text-xs text-[#0DA54F] hover:bg-[#0DA54F]/10 rounded-md flex items-center gap-1"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Book</span>
                  </button>
                  <button
                    onClick={() => handleSelectPatient(p, 'patients')}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-md"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Tip: Press ESC to exit or click any record to view details</span>
          <span className="font-medium text-[#0DA54F]">SUOXI Clinic Operations</span>
        </div>
      </div>
    </div>
  );
};
