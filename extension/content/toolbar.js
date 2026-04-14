/**
 * LanguageBridge - Toolbar Core (Rebuild v2.0)
 * Class definition, UI creation, events, language, text selection.
 * Audio, tooltip, glossary, and flag methods are added via mixin files.
 */

function isExtensionContextValid() {
  try { chrome.runtime.getURL(''); return true; } catch (e) { return false; }
}

class LanguageBridgeToolbar {
  constructor() {
    this.isActive = false;
    this.isReading = false;
    this.isPaused = false;
    this.toolbar = null;
    this.userLanguage = 'dari';
    this.readingSpeed = 1.0;
    this.isExpanded = false;
    this.selectedText = '';
    this.lastReadTime = 0;
    this.cooldownMs = 500;
    this.lastPasteTime = 0;
    this.cachedTranslation = null;
    this.cachedOriginalText = null;
    this.isTranslating = false;
    this.sentences = [];
    this.currentSentenceIndex = 0;

    this.init();
  }

  async init() {
    const settings = await chrome.storage.sync.get([
      'toolbarEnabled', 'defaultLanguage', 'speechRate'
    ]);
    if (settings.defaultLanguage) this.userLanguage = settings.defaultLanguage;
    if (settings.speechRate) this.readingSpeed = settings.speechRate;
    if (settings.toolbarEnabled !== false) this.show();

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggle-toolbar') {
        this.toggle();
        sendResponse({ success: true, isActive: this.isActive });
        return true;
      }
      if (request.action === 'settings-updated') {
        const oldLang = this.userLanguage;
        if (request.settings?.userLanguage) this.userLanguage = request.settings.userLanguage;
        if (request.settings?.readingSpeed) this.readingSpeed = request.settings.readingSpeed;
        this.updateLanguageDisplay();
        if (oldLang !== this.userLanguage) {
          this.cachedTranslation = null;
          this.cachedOriginalText = null;
          this.hideTranslationTooltip();
          this.showStatus(`Language changed to ${this.getLanguageName()}`, 'success');
        }
        sendResponse({ success: true });
        return true;
      }
      if (request.action === 'show-tutorial') {
        if (window.LanguageBridgeGuide) window.LanguageBridgeGuide.show(true);
        sendResponse({ success: true });
        return true;
      }
      return false;
    });

    document.addEventListener('mouseup', this.handleTextSelection.bind(this));
    this.setupGoogleDocsIntegration();
  }

  createToolbar() {
    this.toolbar = document.createElement('div');
    this.toolbar.id = 'lb-toolbar';
    this.toolbar.className = 'lb-toolbar collapsed';
    const logoUrl = chrome.runtime.getURL('assets/icon48.png');

    this.toolbar.innerHTML = `
      <div class="lb-toolbar-minimal">
        <img src="${logoUrl}" alt="LanguageBridge" class="lb-toolbar-logo">
        <span class="lb-toolbar-minimal-text">LanguageBridge\u2122</span>
        <span class="lb-status-dot" aria-hidden="true"></span>
      </div>
      <div class="lb-toolbar-inner">
        <div class="lb-toolbar-brand">
          <img src="${logoUrl}" alt="LanguageBridge" class="lb-toolbar-logo">
          <span class="lb-toolbar-title">LanguageBridge\u2122</span>
        </div>
        <div class="lb-toolbar-controls">
          <div class="lb-control-group lb-text-input-group">
            <input type="text" id="lb-text-input" class="lb-text-input"
              placeholder="Select text \u2192 Copy (Ctrl+C) \u2192 Paste here (Ctrl+V)"
              title="Highlight text, press Ctrl+C to copy, then Ctrl+V to paste here" />
          </div>
          <div class="lb-control-group">
            <button id="lb-play-pause" class="lb-toolbar-btn" title="Play audio translation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button id="lb-show-translation" class="lb-toolbar-btn" title="Show written translation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
            </button>
          </div>
          <div class="lb-control-group">
            <button id="lb-talk-teacher" class="lb-toolbar-btn lb-talk-btn" title="Talk to Teacher">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
              <span>TALK</span>
            </button>
          </div>
          <div class="lb-control-group lb-lang-group">
            <button id="lb-lang-selector" class="lb-toolbar-btn lb-lang-btn" title="Change language">
              <span id="lb-lang-display"></span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            </button>
            <div id="lb-lang-dropdown" class="lb-lang-dropdown"></div>
          </div>
          <div class="lb-status" id="lb-status">
            <span class="lb-status-dot"></span>
            <span class="lb-status-text">Active</span>
          </div>
          <button id="lb-help-guide" class="lb-toolbar-btn lb-help-btn" title="Open tutorial guide">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
          </button>
          <button id="lb-collapse" class="lb-toolbar-btn" title="Collapse toolbar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/></svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.toolbar);

    // Build language dropdown dynamically (safe for all Unicode)
    const dropdown = this.toolbar.querySelector('#lb-lang-dropdown');
    Object.entries(window.LB_LANGUAGES).forEach(([code, lang]) => {
      const opt = document.createElement('div');
      opt.className = 'lb-lang-option';
      opt.setAttribute('data-lang', code);
      opt.textContent = `${lang.nativeLabel} ${lang.label}`;
      dropdown.appendChild(opt);
    });

    this.adjustPageLayout();
    this.attachEventListeners();
    this.updateLanguageDisplay();
  }

  attachEventListeners() {
    const q = (sel) => this.toolbar.querySelector(sel);

    q('.lb-toolbar-minimal')?.addEventListener('click', () => this.expand());

    q('#lb-play-pause')?.addEventListener('click', () => {
      if (this.isReading || this.isPaused) { this.toggleReading(); return; }
      if (Date.now() - this.lastReadTime < 1000) { this.showStatus('Please wait before playing again', 'info'); return; }
      this.toggleReading();
    });

    q('#lb-show-translation')?.addEventListener('click', () => this.showWrittenTranslation());

    q('#lb-talk-teacher')?.addEventListener('click', () => {
      if (window.FloatingTranslator) {
        const el = document.getElementById('lb-floating-translator');
        (el && el.style.display !== 'none') ? window.FloatingTranslator.hide() : window.FloatingTranslator.show();
      }
    });

    q('#lb-help-guide')?.addEventListener('click', () => {
      if (window.LanguageBridgeGuide) window.LanguageBridgeGuide.show(true);
    });

    q('#lb-collapse')?.addEventListener('click', () => this.collapse());

    this.setupLanguageDropdown();
    this.setupTextInput();
  }

  setupLanguageDropdown() {
    const langSelector = this.toolbar.querySelector('#lb-lang-selector');
    const langDropdown = this.toolbar.querySelector('#lb-lang-dropdown');
    if (!langSelector || !langDropdown) return;

    langSelector.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      langDropdown.classList.toggle('lb-lang-dropdown-visible');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#lb-lang-selector') && !e.target.closest('#lb-lang-dropdown')) {
        langDropdown.classList.remove('lb-lang-dropdown-visible');
      }
    });

    this.toolbar.querySelectorAll('.lb-lang-option').forEach(option => {
      option.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newLang = option.getAttribute('data-lang');
        if (newLang && newLang !== this.userLanguage) {
          this.userLanguage = newLang;
          window.LBState.language = newLang;
          this.updateLanguageDisplay();
          if (isExtensionContextValid()) {
            try { await chrome.storage.sync.set({ defaultLanguage: newLang }); } catch (err) { /* non-fatal */ }
          }
          this.cachedTranslation = null;
          this.cachedOriginalText = null;
          this.hideTranslationTooltip();
          this.showStatus(`Language changed to ${this.getLanguageName()}`, 'success');
          window.dispatchEvent(new Event('lb-language-changed'));
          if (window.FloatingTranslator) window.FloatingTranslator.setStudentLanguage(newLang);
        }
        langDropdown.classList.remove('lb-lang-dropdown-visible');
      });
    });
  }

  setupTextInput() {
    const textInput = this.toolbar.querySelector('#lb-text-input');
    if (!textInput) return;

    textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const text = textInput.value.trim();
        if (text) { this.selectedText = text; window.LBState.selectedText = text; this.showStatus('Text ready', 'info'); }
      }
    });

    textInput.addEventListener('paste', () => {
      this.lastPasteTime = Date.now();
      setTimeout(() => {
        const text = textInput.value.trim();
        if (text) { this.selectedText = text; window.LBState.selectedText = text; this.showStatus('Text ready', 'info'); }
      }, 10);
    });
  }

  // --- Show / Hide / Toggle / Expand / Collapse ---

  show() {
    if (!this.toolbar) this.createToolbar();
    this.isActive = true;
    this.toolbar.style.display = '';
    this.updatePlaceholderForContext();
  }

  hide() { if (this.toolbar) this.toolbar.style.display = 'none'; this.isActive = false; }
  toggle() { this.isActive ? this.hide() : this.show(); }

  expand() {
    if (!this.toolbar) return;
    this.toolbar.classList.remove('collapsed');
    this.toolbar.classList.add('expanded');
    this.isExpanded = true;
    this.adjustPageLayout();
  }

  collapse() {
    if (!this.toolbar) return;
    this.toolbar.classList.remove('expanded');
    this.toolbar.classList.add('collapsed');
    this.isExpanded = false;
    this.adjustPageLayout();
    if (this.isReading) window.LBTTSService?.stop();
  }

  adjustPageLayout() {
    if (!this.toolbar) return;
    document.body.style.paddingBottom = this.isActive ? `${(this.toolbar.offsetHeight || 50) + 10}px` : '';
  }

  // --- Text Selection ---

  handleTextSelection(event) {
    if (event.target.closest('.lb-toolbar') || event.target.closest('.lb-translation-tooltip')) return;
    if (Date.now() - this.lastPasteTime < 500) return;

    clearTimeout(this._selectionTimeout);
    this._selectionTimeout = setTimeout(() => {
      let selected;
      if (window.LBGoogleDocsAdapter?.isGoogleDocs()) selected = window.LBGoogleDocsAdapter.getSelectedText();
      if (!selected) selected = window.getSelection().toString().trim();

      const MAX = window.CONFIG?.textLimits?.maxSelectionLength || 2000;
      if (!selected || !selected.length) return;
      if (selected.length > MAX) {
        selected = selected.substring(0, MAX);
        this.showStatus(`Selection limited to ${MAX} characters`, 'error');
      }

      this.selectedText = selected;
      window.LBState.selectedText = selected;
      this.expand();
      this.showStatus('Text selected \u2014 press Play or Book icon', 'info');
    }, 300);
  }

  // --- Language Helpers ---

  getLanguageName() {
    const lang = window.LB_LANGUAGES[this.userLanguage];
    return lang ? `${lang.nativeLabel} ${lang.label}` : 'Unknown';
  }

  updateLanguageDisplay() {
    const el = this.toolbar?.querySelector('#lb-lang-display');
    if (el) el.textContent = this.getLanguageName();
  }

  updatePlaceholderForContext() {
    const input = this.toolbar?.querySelector('#lb-text-input');
    if (!input) return;
    const h = window.location.hostname;
    if (h.includes('docs.google.com')) input.placeholder = 'Google Docs: Highlight \u2192 Ctrl+C \u2192 Ctrl+V here';
    else if (h.includes('classroom.google.com')) input.placeholder = 'Classroom: Copy text \u2192 Paste here';
    else if (window.location.pathname.endsWith('.pdf') || h.includes('drive.google.com')) input.placeholder = 'PDF: Highlight \u2192 Copy \u2192 Paste here';
    else input.placeholder = 'Select text \u2192 Copy (Ctrl+C) \u2192 Paste here (Ctrl+V)';
  }

  setupGoogleDocsIntegration() {
    this.updatePlaceholderForContext();
  }

  // --- Status Display ---

  showStatus(message, type) {
    const text = this.toolbar?.querySelector('.lb-status-text');
    const dot = this.toolbar?.querySelector('.lb-status-dot');
    if (text) text.textContent = message;
    if (dot) dot.classList.toggle('error', type === 'error');
  }
}

// Methods are added by toolbar-audio.js, toolbar-tooltip.js, toolbar-flag.js
// Instantiation happens at the end of toolbar-flag.js (last file in load order)
