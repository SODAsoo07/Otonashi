export type Language = 'ko' | 'en' | 'ja';

export const LANGUAGE_ORDER: Language[] = ['ko', 'en', 'ja'];

export const LANGUAGE_LABELS: Record<Language, string> = {
  ko: 'KO',
  en: 'EN',
  ja: 'JA',
};

export const LANGUAGE_NAMES: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
};
