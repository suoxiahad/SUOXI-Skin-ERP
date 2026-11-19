import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Language, Translations } from './types.js';
import { en } from './en.js';
import { bn } from './bn.js';

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
  children: ReactNode;
  defaultLang?: Language;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children, defaultLang = 'en' }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('suoxi_crm_lang');
      if (saved === 'bn' || saved === 'en') {
        return saved;
      }
    } catch {
      // localStorage may fail in restricted sandboxes
    }
    return defaultLang;
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem('suoxi_crm_lang', newLang);
    } catch {
      // ignore
    }
  };

  const toggleLang = () => {
    setLang(lang === 'bn' ? 'en' : 'bn');
  };

  const t = lang === 'bn' ? bn : en;

  // Sync html lang attribute
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

const defaultI18nFallback: I18nContextType = {
  lang: 'en',
  setLang: () => {},
  toggleLang: () => {},
  t: en,
};

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    return defaultI18nFallback;
  }
  return context;
}

