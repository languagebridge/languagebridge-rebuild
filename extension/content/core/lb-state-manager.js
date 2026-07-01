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
};

// Load persisted state from chrome.storage on startup
chrome.storage.local.get(
  ['studentCode', 'schoolCode', 'gradeBand'],
  (local) => {
    if (local.studentCode) window.LBState.studentCode = local.studentCode;
    if (local.schoolCode) window.LBState.schoolCode = local.schoolCode;
    if (local.gradeBand) window.LBState.gradeBand = local.gradeBand;
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
  }
);
