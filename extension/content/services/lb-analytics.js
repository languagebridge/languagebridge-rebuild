// extension/content/services/lb-analytics.js
// Centralized analytics logger. Fire-and-forget — never blocks the student experience.

window.LBAnalytics = {
  send(eventType, extras = {}) {
    if (!window.LBState?.studentCode) return;
    // Respect a "limited features" consent choice — no usage events sent.
    if (window.LBState?.analyticsEnabled === false) return;

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

  // Local usage counters shown in the popup's "Usage Today" panel.
  _bumpUsage(field) {
    try {
      chrome.storage.local.get(['usageStats'], (data) => {
        const stats = data.usageStats || { translations: 0, speechRecognitions: 0 };
        stats[field] = (stats[field] || 0) + 1;
        chrome.storage.local.set({ usageStats: stats });
      });
    } catch (e) { /* noop */ }
  },

  termLookup(term, result) {
    this._bumpUsage('translations');
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
    this._bumpUsage('speechRecognitions');
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
