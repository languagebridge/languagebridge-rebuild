// extension/content/services/lb-analytics.js
// Centralized analytics logger. Fire-and-forget — never blocks the student experience.

window.LBAnalytics = {
  send(eventType, extras = {}) {
    if (!window.LBState?.studentCode) return;

    chrome.runtime.sendMessage({
      action: 'api-fetch',
      endpoint: 'analytics-writer',
      body: {
        studentCode: window.LBState.studentCode,
        language: window.LBState.language || 'english',
        eventType,
        timestamp: new Date().toISOString(),
        extensionVersion: window.CONFIG?.version || '2.0.0',
        ...extras,
      },
    }).catch(() => {}); // Fire and forget
  },

  termLookup(term, result) {
    this.send('term_lookup', {
      term,
      subject: result?.subject || null,
      source: result?.source || null,
    });
  },

  scaffoldView(term) {
    this.send('scaffold_view', { term });
  },

  ttsPlay(term) {
    this.send('tts_play', { term });
  },

  flagEvent(flaggedText) {
    this.send('flag_event', { term: flaggedText });
  },

  glossaryView() {
    this.send('glossary_view');
  },

  sessionStart() {
    this.send('session_start');
  },

  sessionEnd() {
    this.send('session_end');
  },
};
