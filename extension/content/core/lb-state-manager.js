// extension/content/core/lb-state-manager.js
// Shared state object. Every content script reads from window.LBState.

window.LBState = {
  selectedText: '',
  language: 'dari',
  studentCode: null,     // From onboarding enrollment (e.g. "LB-7K2M")
  sessionToken: null,    // Legacy — kept for backwards compat
  schoolCode: null,
  gradeBand: null,
  onboardingComplete: false,
  consentGiven: false,
  analyticsEnabled: true,   // set false if the student chose "limited features"
  readingSpeed: 1.0,        // TTS playback rate, set in the options page
  ready: false,             // true once BOTH storage reads below have completed
};

// Persisted state loads asynchronously from two stores. Anything that must not
// run before state exists (e.g. the session_start analytics event, which needs
// studentCode) should wait for `ready` / the 'lb-state-ready' event — otherwise
// it fires against defaults and, in the analytics case, gets silently dropped.
let _pendingLoads = 2;
function _markLoaded() {
  if (--_pendingLoads > 0) return;
  window.LBState.ready = true;
  try { window.dispatchEvent(new CustomEvent('lb-state-ready')); } catch (e) { /* noop */ }
}

// Run `cb` once state is loaded (immediately if it already is).
window.LBState.whenReady = (cb) => {
  if (window.LBState.ready) cb();
  else window.addEventListener('lb-state-ready', () => cb(), { once: true });
};

// Load persisted state from chrome.storage on startup
chrome.storage.local.get(
  ['studentCode', 'schoolCode', 'gradeBand'],
  (local) => {
    if (local.studentCode) window.LBState.studentCode = local.studentCode;
    if (local.schoolCode) window.LBState.schoolCode = local.schoolCode;
    if (local.gradeBand) window.LBState.gradeBand = local.gradeBand;
    _markLoaded();
  }
);

chrome.storage.sync.get(
  ['defaultLanguage', 'lb_session_token', 'onboardingComplete', 'consentGiven', 'analyticsEnabled', 'readingSpeed'],
  (data) => {
    if (data.defaultLanguage) window.LBState.language = data.defaultLanguage;
    if (data.lb_session_token) window.LBState.sessionToken = data.lb_session_token;
    if (data.onboardingComplete) window.LBState.onboardingComplete = true;
    if (data.consentGiven) window.LBState.consentGiven = true;
    if (data.analyticsEnabled === false) window.LBState.analyticsEnabled = false;
    if (data.readingSpeed) window.LBState.readingSpeed = data.readingSpeed;
    _markLoaded();
  }
);
