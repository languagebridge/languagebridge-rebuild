// extension/options/options.js
// Settings page. Persists to chrome.storage.sync and broadcasts changes to all
// open tabs so the toolbar updates live (settings-updated message).

// The 18 supported languages (mirror of LB_LANGUAGES; this page has no content-
// script globals). english is included here so a user can switch back to it.
const LANGUAGES = [
  ['dari', 'دری — Dari'], ['pashto', 'پښتو — Pashto'], ['arabic', 'العربية — Arabic'],
  ['urdu', 'اردو — Urdu'], ['persian', 'فارسی — Persian'], ['ukrainian', 'Українська — Ukrainian'],
  ['spanish', 'Español — Spanish'], ['somali', 'Soomaali — Somali'], ['english', 'English'],
  ['french', 'Français — French'], ['portuguese', 'Português — Portuguese'],
  ['vietnamese', 'Tiếng Việt — Vietnamese'], ['nepali', 'नेपाली — Nepali'],
  ['swahili', 'Kiswahili — Swahili'], ['burmese', 'မြန်မာ — Burmese'], ['tagalog', 'Tagalog'],
  ['amharic', 'አማርኛ — Amharic'], ['uzbek', 'Oʻzbekcha — Uzbek'],
];

const DEFAULTS = { defaultLanguage: 'dari', readingSpeed: 1.0, languageVariant: '' };

const langSel = document.getElementById('lang');
const variantSel = document.getElementById('variant');
const variantWrap = document.getElementById('variant-wrap');
const speed = document.getElementById('speed');
const speedVal = document.getElementById('speed-val');
const statusEl = document.getElementById('status');

LANGUAGES.forEach(([code, label]) => {
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = label;
  langSel.appendChild(opt);
});

document.getElementById('ver').textContent = (chrome.runtime.getManifest().version || '');

function setSpeedLabel() { speedVal.textContent = `${Number(speed.value).toFixed(1)}×`; }
speed.addEventListener('input', setSpeedLabel);

// Dialect choices come from the backend (shared/variants.ts) so this page never
// keeps its own copy. Optional, defaults to the core language. It is a language
// preference — we never ask where a student is from.
async function loadVariants(language, selected) {
  variantSel.innerHTML = '';
  variantWrap.hidden = true;
  try {
    const res = await chrome.runtime.sendMessage({
      action: 'api-fetch-get',
      endpoint: `onboarding/variants?language=${encodeURIComponent(language)}`,
    });
    const list = (res && res.ok && res.data?.variants?.[language]) || [];
    if (list.length === 0) return;
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Not sure / standard';
    variantSel.appendChild(none);
    list.forEach(({ tag, label }) => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = label;
      variantSel.appendChild(opt);
    });
    variantSel.value = list.some((v) => v.tag === selected) ? selected : '';
    variantWrap.hidden = false;
  } catch (e) {
    // Offline or old backend — the picker simply stays hidden.
  }
}

langSel.addEventListener('change', () => loadVariants(langSel.value, ''));

// Load current settings.
chrome.storage.sync.get(['defaultLanguage', 'readingSpeed', 'languageVariant'], (data) => {
  langSel.value = data.defaultLanguage || DEFAULTS.defaultLanguage;
  speed.value = data.readingSpeed || DEFAULTS.readingSpeed;
  setSpeedLabel();
  loadVariants(langSel.value, data.languageVariant || '');
});

function flashStatus(text) {
  statusEl.textContent = text;
  statusEl.classList.add('show');
  setTimeout(() => statusEl.classList.remove('show'), 1800);
}

function broadcast(settings) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((t) => {
      if (t.id) chrome.tabs.sendMessage(t.id, { action: 'settings-updated', settings }).catch(() => {});
    });
  });
}

document.getElementById('save').addEventListener('click', () => {
  const settings = {
    defaultLanguage: langSel.value,
    readingSpeed: Number(speed.value),
    languageVariant: variantWrap.hidden ? '' : variantSel.value,
  };
  chrome.storage.sync.set(settings, () => {
    broadcast({ userLanguage: settings.defaultLanguage, readingSpeed: settings.readingSpeed });
    flashStatus('Saved ✓');
  });
});

document.getElementById('reset').addEventListener('click', () => {
  langSel.value = DEFAULTS.defaultLanguage;
  speed.value = DEFAULTS.readingSpeed;
  setSpeedLabel();
  loadVariants(DEFAULTS.defaultLanguage, '');
  chrome.storage.sync.set(DEFAULTS, () => {
    broadcast({ userLanguage: DEFAULTS.defaultLanguage, readingSpeed: DEFAULTS.readingSpeed });
    flashStatus('Reset ✓');
  });
});

// Re-show the privacy/consent modal on the next page load.
document.getElementById('reconsent').addEventListener('click', () => {
  chrome.storage.sync.remove(['consentGiven', 'analyticsEnabled'], () => {
    flashStatus('Privacy choices will show again on your next page');
  });
});

// Clear everything (enrollment + settings) from this device.
document.getElementById('clear').addEventListener('click', () => {
  if (!confirm('Clear all your LanguageBridge data on this device? You will set up again next time.')) return;
  chrome.storage.local.clear(() => {
    chrome.storage.sync.clear(() => {
      flashStatus('All data cleared');
    });
  });
});
