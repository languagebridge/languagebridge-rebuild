// extension/config.js
// Creates window.CONFIG. Every content script reads from this.

window.CONFIG = {
  apiKey: '02dd1fc2301b6277cd7aed4357ea09990373078409a11942707d760726ec58e3',
  endpoints: {
    api: 'https://languagebridge-api.azurewebsites.net/api',
    lexiconLookup: 'https://languagebridge-api.azurewebsites.net/api/lexicon-lookup',
    ttsRouter: 'https://languagebridge-api.azurewebsites.net/api/tts-router',
    analyticsWriter: 'https://languagebridge-api.azurewebsites.net/api/analytics-writer',
    flagHandler: 'https://languagebridge-api.azurewebsites.net/api/flag-handler',
  },
  rateLimits: {
    translationsPerMinute: 30,
    ttsPerMinute: 20,
    sttPerMinute: 15,
  },
  textLimits: {
    maxSelectionLength: 2000,
    warningThreshold: 1500,
  },
  version: '2.0.0',
};
