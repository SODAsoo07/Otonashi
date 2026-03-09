
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { LANGUAGE_ORDER, Language } from '../utils/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  cycleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
const LANGUAGE_STORAGE_KEY = 'otonashi-language';

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'ko';
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return LANGUAGE_ORDER.includes(stored as Language) ? (stored as Language) : 'ko';
  });

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  const cycleLanguage = useCallback(() => {
    setLanguage(prev => LANGUAGE_ORDER[(LANGUAGE_ORDER.indexOf(prev) + 1) % LANGUAGE_ORDER.length]);
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      cycleLanguage,
    }),
    [language, cycleLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
