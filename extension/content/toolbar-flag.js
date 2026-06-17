/**
 * LanguageBridge - Toolbar Flag Controller
 * Handles flag reporting to the backend.
 * Also instantiates the toolbar (this is the last file in load order).
 */

const _TF = LanguageBridgeToolbar.prototype;

// flagType: 'translation' (default) or 'pronunciation'. The backend REQUIRES
// flagType — without it the flag is rejected. Returns { ok, count } so callers
// can show honest confirmation (never "thank you" on a failed flag).
_TF.reportProblem = async function (flagText, flagType) {
  const text = flagText || this.selectedText || window.LBState.selectedText;
  const type = flagType === 'pronunciation' ? 'pronunciation' : 'translation';
  if (!text) { this.showStatus('Select text to flag', 'error'); return { ok: false }; }

  // Avoid duplicate flags for the same text+type within a session.
  this._flagged = this._flagged || new Set();
  const dedupeKey = `${this.userLanguage}::${type}::${text.toLowerCase().trim()}`;
  if (this._flagged.has(dedupeKey)) {
    return { ok: true, count: 0, alreadyFlagged: true };
  }

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'api-fetch',
      endpoint: 'flag-handler',
      body: {
        flaggedText: text.slice(0, 500),
        language: this.userLanguage,
        studentCode: window.LBState.studentCode,
        timestamp: new Date().toISOString(),
        flagType: type,
      },
    });

    if (res?.ok && res.data) {
      this._flagged.add(dedupeKey);
      const count = res.data.flagCount || 1;
      this.showStatus(`Reported — thank you (${count} flagged this)`, 'success');
      window.LBAnalytics?.flagEvent(text);
      return { ok: true, count };
    }

    LBLog.warn('Flag rejected:', res?.data?.error, res?.data?.details);
    this.showStatus('Could not send report — please try again', 'error');
    return { ok: false };
  } catch (err) {
    LBLog.warn('Flag failed:', err);
    this.showStatus('Could not send report — please try again', 'error');
    return { ok: false };
  }
};

// ---------- Instantiate ----------
// This is the last toolbar file in manifest load order, so all prototype methods are defined.

window.__lbToolbar = new LanguageBridgeToolbar();
LBLog.info('Toolbar loaded');

// Session start analytics
window.LBAnalytics?.sessionStart();

// Session end on page unload
window.addEventListener('beforeunload', () => {
  window.LBAnalytics?.sessionEnd();
});
