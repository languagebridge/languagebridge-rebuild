// extension/config.js
// Creates window.CONFIG. Every content script reads from this.

window.CONFIG = {
  // API key is stored only in background.js (service worker) for security
  endpoints: {
    api: 'https://languagebridge-api.azurewebsites.net/api',
    lexiconLookup: 'https://languagebridge-api.azurewebsites.net/api/lexicon-lookup',
    ttsRouter: 'https://languagebridge-api.azurewebsites.net/api/tts-router',
    analyticsWriter: 'https://languagebridge-api.azurewebsites.net/api/analytics-writer',
    flagHandler: 'https://languagebridge-api.azurewebsites.net/api/flag-handler',
    speechToText: 'https://languagebridge-api.azurewebsites.net/api/speech-to-text',
    translate: 'https://languagebridge-api.azurewebsites.net/api/translate',
  },
  rateLimits: {
    translationsPerMinute: 90,
    ttsPerMinute: 90,
    sttPerMinute: 30,
    translatePerMinute: 100,
  },
  textLimits: {
    maxSelectionLength: 2000,
    warningThreshold: 1500,
  },
  version: '2.0.0',
};
