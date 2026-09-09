// Talk to Teacher (PWA) — supported languages.
// Mirrors the extension's LB_LANGUAGES and the backend's SUPPORTED_LANGUAGES
// (backend/shared/types.ts). All 16 have Azure STT coverage, so every one of
// them works as a *spoken* input side in Talk to Teacher.
//
// Note: Dari uses the Persian voice/STT model server-side (they share script +
// ~80% mutual intelligibility). That routing lives in the backend/proxy, not here.

export interface LanguageInfo {
  code: string;
  label: string;       // English name
  nativeLabel: string; // endonym
  rtl: boolean;
}

export const LANGUAGES: Record<string, LanguageInfo> = {
  english:    { code: 'english',    label: 'English',    nativeLabel: 'English',     rtl: false },
  dari:       { code: 'dari',       label: 'Dari',       nativeLabel: 'دری',          rtl: true  },
  pashto:     { code: 'pashto',     label: 'Pashto',     nativeLabel: 'پښتو',         rtl: true  },
  arabic:     { code: 'arabic',     label: 'Arabic',     nativeLabel: 'العربية',      rtl: true  },
  urdu:       { code: 'urdu',       label: 'Urdu',       nativeLabel: 'اردو',         rtl: true  },
  persian:    { code: 'persian',    label: 'Persian',    nativeLabel: 'فارسی',        rtl: true  },
  ukrainian:  { code: 'ukrainian',  label: 'Ukrainian',  nativeLabel: 'Українська',   rtl: false },
  spanish:    { code: 'spanish',    label: 'Spanish',    nativeLabel: 'Español',      rtl: false },
  somali:     { code: 'somali',     label: 'Somali',     nativeLabel: 'Soomaali',     rtl: false },
  french:     { code: 'french',     label: 'French',     nativeLabel: 'Français',     rtl: false },
  portuguese: { code: 'portuguese', label: 'Portuguese', nativeLabel: 'Português',    rtl: false },
  vietnamese: { code: 'vietnamese', label: 'Vietnamese', nativeLabel: 'Tiếng Việt',   rtl: false },
  nepali:     { code: 'nepali',     label: 'Nepali',     nativeLabel: 'नेपाली',        rtl: false },
  swahili:    { code: 'swahili',    label: 'Swahili',    nativeLabel: 'Kiswahili',    rtl: false },
  burmese:    { code: 'burmese',    label: 'Burmese',    nativeLabel: 'မြန်မာ',         rtl: false },
  tagalog:    { code: 'tagalog',    label: 'Tagalog',    nativeLabel: 'Tagalog',      rtl: false },
};

export const langInfo = (code: string): LanguageInfo =>
  LANGUAGES[code] || { code, label: code, nativeLabel: code, rtl: false };

export const LANGUAGE_LIST = Object.values(LANGUAGES);
