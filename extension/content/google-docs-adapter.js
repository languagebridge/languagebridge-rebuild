// extension/content/google-docs-adapter.js
// Detects Google Docs and provides alternative text extraction.

window.LBGoogleDocsAdapter = {
  isGoogleDocs() {
    return window.location.hostname === 'docs.google.com';
  },

  getSelectedText() {
    if (!this.isGoogleDocs()) return null;

    // Try to get text from Google Docs' internal DOM structure
    try {
      const selection = document.querySelector('.kix-selection-overlay');
      if (!selection) return null;

      // Google Docs renders text in spans with class kix-lineview-text-block
      const editArea = document.querySelector('.kix-appview-editor');
      if (!editArea) return null;

      // Fallback: use the clipboard approach
      const activeEl = document.activeElement;
      if (activeEl && activeEl.contentEditable === 'true') {
        return window.getSelection().toString().trim();
      }

      return null;
    } catch (err) {
      LBLog.warn('Google Docs adapter failed:', err);
      return null;
    }
  },

  // Remind students they can use copy-paste if selection fails
  showFallbackHint() {
    LBLog.info('Google Docs: use copy-paste workflow if text selection fails');
  },
};