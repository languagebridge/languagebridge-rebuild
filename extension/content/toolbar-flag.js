/**
 * LanguageBridge - Toolbar Flag Controller
 * Handles flag reporting to the backend.
 * Also instantiates the toolbar (this is the last file in load order).
 */

const _TF = LanguageBridgeToolbar.prototype;

_TF.reportProblem = async function (flagText) {
  const text = flagText || this.selectedText || window.LBState.selectedText;
  if (!text) { this.showStatus('Select text to flag', 'error'); return; }

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'api-fetch',
      endpoint: 'flag-handler',
      body: {
        flaggedText: text,
        language: this.userLanguage,
        studentCode: window.LBState.studentCode,
        timestamp: new Date().toISOString(),
      },
    });

    if (res?.ok && res.data) {
      const count = res.data.flagCount || 1;
      this.showStatus(`Flagged! (${count} student${count > 1 ? 's' : ''} reported this)`, 'success');
      window.LBAnalytics?.flagEvent(text);
    } else {
      this.showStatus('Flagged! Thank you.', 'success');
    }
  } catch (err) {
    LBLog.warn('Flag failed (non-fatal):', err);
    this.showStatus('Flag sent', 'success');
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
