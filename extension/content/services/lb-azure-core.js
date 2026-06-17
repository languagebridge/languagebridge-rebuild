// extension/content/services/lb-azure-core.js
// Language map and shared utilities. Single source of truth for all 16 supported languages.
// Keys are the FULL WORD codes that Justin's API expects (e.g. "dari" not "fa").

window.LB_LANGUAGES = {
  dari:        { code: 'dari',        label: 'Dari',         nativeLabel: 'دری',        rtl: true },
  pashto:      { code: 'pashto',      label: 'Pashto',       nativeLabel: 'پښتو',       rtl: true },
  arabic:      { code: 'arabic',      label: 'Arabic',       nativeLabel: 'العربية',     rtl: true },
  urdu:        { code: 'urdu',        label: 'Urdu',         nativeLabel: 'اردو',        rtl: true },
  persian:     { code: 'persian',     label: 'Persian',      nativeLabel: 'فارسی',       rtl: true },
  ukrainian:   { code: 'ukrainian',   label: 'Ukrainian',    nativeLabel: 'Українська',  rtl: false },
  spanish:     { code: 'spanish',     label: 'Spanish',      nativeLabel: 'Español',     rtl: false },
  somali:      { code: 'somali',      label: 'Somali',       nativeLabel: 'Soomaali',    rtl: false },
  english:     { code: 'english',     label: 'English',      nativeLabel: 'English',     rtl: false },
  french:      { code: 'french',      label: 'French',       nativeLabel: 'Français',    rtl: false },
  portuguese:  { code: 'portuguese',  label: 'Portuguese',   nativeLabel: 'Português',   rtl: false },
  vietnamese:  { code: 'vietnamese',  label: 'Vietnamese',   nativeLabel: 'Tiếng Việt',  rtl: false },
  nepali:      { code: 'nepali',      label: 'Nepali',       nativeLabel: 'नेपाली',       rtl: false },
  swahili:     { code: 'swahili',     label: 'Swahili',      nativeLabel: 'Kiswahili',   rtl: false },
  burmese:     { code: 'burmese',     label: 'Burmese',      nativeLabel: 'မြန်မာ',        rtl: false },
  tagalog:     { code: 'tagalog',     label: 'Tagalog',      nativeLabel: 'Tagalog',     rtl: false },
};

// XSS prevention utility
window.escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

// Simple rate limiter
window.LBRateLimiter = {
  counts: {},
  check(key, limit) {
    const now = Date.now();
    if (!this.counts[key]) this.counts[key] = [];
    this.counts[key] = this.counts[key].filter(t => now - t < 60000);
    if (this.counts[key].length >= limit) return false;
    this.counts[key].push(now);
    return true;
  },
};
