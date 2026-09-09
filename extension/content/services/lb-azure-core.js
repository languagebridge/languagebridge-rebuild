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

// Detects when the extension was reloaded/updated while an old content script is
// still on the page — chrome.runtime.id goes undefined and sendMessage throws
// "Extension context invalidated". Shows a one-time reload prompt instead of
// failing silently or spamming errors. Real users hit this on every auto-update.
window.LBRuntime = {
  _notified: false,
  alive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  },
  handle(err) {
    const msg = String((err && err.message) || err || '');
    if (/context invalidated|Extension context|message port closed|receiving end does not exist/i.test(msg)) {
      this.notifyLost();
      return true;
    }
    return false;
  },
  notifyLost() {
    if (this._notified) return;
    this._notified = true;
    try {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483600;background:#742a69;color:#fff;font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:12px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.35);display:flex;align-items:center;gap:12px;';
      const span = document.createElement('span');
      span.textContent = 'LanguageBridge updated — reload this page to keep using it.';
      const btn = document.createElement('button');
      btn.textContent = 'Reload';
      btn.style.cssText = 'border:none;border-radius:8px;background:#fff;color:#742a69;font-weight:800;padding:7px 14px;cursor:pointer;';
      btn.addEventListener('click', () => location.reload());
      bar.appendChild(span);
      bar.appendChild(btn);
      document.body.appendChild(bar);
    } catch (e) { /* noop */ }
  },
};
