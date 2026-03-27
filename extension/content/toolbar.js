/**
 * LanguageBridge - Toolbar (Rebuild v2.0)
 * Alpha look & feel + Vol3 guide architecture
 * Uses guide's service layer (LBTranslationService, LBTTSService) instead of direct Azure calls
 */

function isExtensionContextValid() {
  try {
    chrome.runtime.getURL('');
    return true;
  } catch (e) {
    return false;
  }
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

    this.init();
  }

  async init() {
    const settings = await chrome.storage.sync.get([
      'toolbarEnabled', 'defaultLanguage', 'speechRate'
    ]);

    if (settings.defaultLanguage) this.userLanguage = settings.defaultLanguage;
    if (settings.speechRate) this.readingSpeed = settings.speechRate;

    if (settings.toolbarEnabled !== false) {
      this.show();
    }

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
      <!-- Minimal View (Default) -->
      <div class="lb-toolbar-minimal">
        <img src="${logoUrl}" alt="LanguageBridge" class="lb-toolbar-logo">
        <span class="lb-toolbar-minimal-text">LanguageBridge\u2122</span>
        <span class="lb-status-dot" aria-hidden="true"></span>
      </div>

      <!-- Full View (On Text Highlight) -->
      <div class="lb-toolbar-inner">
        <div class="lb-toolbar-brand">
          <img src="${logoUrl}" alt="LanguageBridge" class="lb-toolbar-logo">
          <span class="lb-toolbar-title">LanguageBridge\u2122</span>
        </div>

        <div class="lb-toolbar-controls">
          <!-- Text Input -->
          <div class="lb-control-group" style="flex: 1; max-width: 350px; margin-right: 12px;">
            <input type="text" id="lb-text-input" class="lb-text-input"
              placeholder="Select text \u2192 Copy (Ctrl+C) \u2192 Paste here (Ctrl+V)"
              title="Highlight text, press Ctrl+C to copy, then Ctrl+V to paste here"
              style="width: 100%; padding: 8px 12px; border: 2px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.15); color: white; border-radius: 8px; font-size: 14px; outline: none;"
            />
          </div>

          <!-- Play/Pause and Show Translation -->
          <div class="lb-control-group">
            <button id="lb-play-pause" class="lb-toolbar-btn" title="Play audio translation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </button>
            <button id="lb-show-translation" class="lb-toolbar-btn" title="Show written translation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
              </svg>
            </button>
          </div>

          <!-- Talk to Teacher -->
          <div class="lb-control-group">
            <button id="lb-talk-teacher" class="lb-toolbar-btn" title="Talk to Teacher" style="width: auto; padding: 6px 16px; gap: 6px; display: flex; align-items: center;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
              </svg>
              <span style="font-size: 13px; white-space: nowrap; font-weight: 600;">TALK</span>
            </button>
          </div>

          <!-- Language Selector Dropdown -->
          <div class="lb-control-group" style="position: relative;">
            <button id="lb-lang-selector" class="lb-toolbar-btn" title="Change language" style="width: auto; padding: 6px 12px; display: flex; align-items: center; gap: 6px;">
              <span id="lb-lang-display" style="font-size: 13px; font-weight: 500; white-space: nowrap;">\u0641\u0627\u0631\u0633\u06CC Persian</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            </button>
            <div id="lb-lang-dropdown" class="lb-lang-dropdown"></div>
          </div>

          <!-- Status -->
          <div class="lb-status" id="lb-status" style="margin-left: auto;">
            <span class="lb-status-dot"></span>
            <span class="lb-status-text">Active</span>
          </div>

          <!-- Help -->
          <button id="lb-help-guide" class="lb-toolbar-btn" title="Open tutorial guide" style="color: #ffc755;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
          </button>

          <!-- Collapse -->
          <button id="lb-collapse" class="lb-toolbar-btn" title="Collapse toolbar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5"/>
            </svg>
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
    // Minimal tab click to expand
    const minimalTab = this.toolbar.querySelector('.lb-toolbar-minimal');
    if (minimalTab) minimalTab.addEventListener('click', () => this.expand());

    // Play/Pause
    const playPause = this.toolbar.querySelector('#lb-play-pause');
    if (playPause) {
      playPause.addEventListener('click', () => {
        if (this.isReading || this.isPaused) {
          this.toggleReading();
          return;
        }
        const now = Date.now();
        if (now - this.lastReadTime < 1000) {
          this.showStatus('Please wait before playing again', 'info');
          return;
        }
        this.toggleReading();
      });
    }

    // Show Translation (book icon)
    const showTranslation = this.toolbar.querySelector('#lb-show-translation');
    if (showTranslation) {
      showTranslation.addEventListener('click', () => this.showWrittenTranslation());
    }

    // Talk to Teacher
    const talkBtn = this.toolbar.querySelector('#lb-talk-teacher');
    if (talkBtn) {
      talkBtn.addEventListener('click', () => {
        const translator = document.getElementById('lb-floating-translator');
        if (translator) {
          translator.style.display = translator.style.display === 'none' ? 'block' : 'none';
        }
      });
    }

    // Help
    const helpBtn = this.toolbar.querySelector('#lb-help-guide');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        if (window.LanguageBridgeGuide) window.LanguageBridgeGuide.show(true);
      });
    }

    // Collapse
    const collapseBtn = this.toolbar.querySelector('#lb-collapse');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => this.collapse());
    }

    // Language selector dropdown
    this.setupLanguageDropdown();

    // Text input (paste/enter)
    this.setupTextInput();
  }

  setupLanguageDropdown() {
    const langSelector = this.toolbar.querySelector('#lb-lang-selector');
    const langDropdown = this.toolbar.querySelector('#lb-lang-dropdown');
    if (!langSelector || !langDropdown) return;

    langSelector.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
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
          // Sync Talk to Teacher
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
        if (text) {
          this.selectedText = text;
          window.LBState.selectedText = text;
          this.showStatus('Text ready - Click \u25B6 for audio or \uD83D\uDCD6 to read', 'info');
        }
      }
    });

    textInput.addEventListener('paste', () => {
      this.lastPasteTime = Date.now();
      setTimeout(() => {
        const text = textInput.value.trim();
        if (text) {
          this.selectedText = text;
          window.LBState.selectedText = text;
          this.showStatus('Text ready - Click \u25B6 for audio or \uD83D\uDCD6 to read', 'info');
        }
      }, 10);
    });

    textInput.addEventListener('focus', () => {
      textInput.style.borderColor = 'rgba(255,255,255,0.6)';
      textInput.style.background = 'rgba(255,255,255,0.25)';
    });
    textInput.addEventListener('blur', () => {
      textInput.style.borderColor = 'rgba(255,255,255,0.3)';
      textInput.style.background = 'rgba(255,255,255,0.15)';
    });
  }

  // --- Show / Hide / Toggle / Expand / Collapse ---

  show() {
    if (!this.toolbar) this.createToolbar();
    this.isActive = true;
    this.toolbar.style.display = '';
    this.updatePlaceholderForContext();
  }

  hide() {
    if (this.toolbar) this.toolbar.style.display = 'none';
    this.isActive = false;
  }

  toggle() {
    if (this.isActive) this.hide(); else this.show();
  }

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
    if (this.isReading) window.LBTTSService.stop();
  }

  adjustPageLayout() {
    if (!this.toolbar) return;
    const height = this.toolbar.offsetHeight || 50;
    document.body.style.paddingBottom = this.isActive ? `${height + 10}px` : '';
  }

  // --- Text Selection ---

  handleTextSelection(event) {
    if (event.target.closest('.lb-toolbar') || event.target.closest('.lb-translation-tooltip')) return;
    if (Date.now() - this.lastPasteTime < 500) return;

    clearTimeout(this._selectionTimeout);
    this._selectionTimeout = setTimeout(() => {
      let selected;
      if (window.LBGoogleDocsAdapter?.isGoogleDocs()) {
        selected = window.LBGoogleDocsAdapter.getSelectedText();
      }
      if (!selected) selected = window.getSelection().toString().trim();

      const MAX_CHARS = window.CONFIG?.textLimits?.maxSelectionLength || 2000;
      if (!selected || selected.length === 0) return;

      if (selected.length > MAX_CHARS) {
        selected = selected.substring(0, MAX_CHARS);
        this.showStatus(`Selection too large - limited to ${MAX_CHARS} characters`, 'error');
      }

      this.selectedText = selected;
      window.LBState.selectedText = selected;
      this.expand();
      this.showStatus('Text selected - Click \u25B6 for audio or \uD83D\uDCD6 to read', 'info');
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
    const textInput = this.toolbar?.querySelector('#lb-text-input');
    if (!textInput) return;
    const hostname = window.location.hostname;
    if (hostname.includes('docs.google.com')) {
      textInput.placeholder = '\uD83D\uDCC4 Google Docs: Highlight \u2192 Ctrl+C \u2192 Ctrl+V here';
    } else if (hostname.includes('classroom.google.com')) {
      textInput.placeholder = '\uD83D\uDCDA Classroom: Copy text \u2192 Paste here (Ctrl+V)';
    } else if (window.location.pathname.endsWith('.pdf') || hostname.includes('drive.google.com')) {
      textInput.placeholder = '\uD83D\uDCD1 PDF: Highlight \u2192 Copy (Ctrl+C) \u2192 Paste here';
    } else {
      textInput.placeholder = 'Select text \u2192 Copy (Ctrl+C) \u2192 Paste here (Ctrl+V)';
    }
  }

  setupGoogleDocsIntegration() {
    this.updatePlaceholderForContext();
    if (window.LBGoogleDocsAdapter?.isGoogleDocs()) {
      window.LBGoogleDocsAdapter.onTextSelected?.((text) => {
        this.selectedText = text;
        window.LBState.selectedText = text;
        this.expand();
        this.showStatus('Text selected - Click \u25B6 for audio or \uD83D\uDCD6 to read', 'info');
      });
    }
  }

  // --- Play / Pause / Stop ---

  toggleReading() {
    if (this.isReading) {
      this.pauseReading();
    } else if (this.isPaused && this.cachedTranslation) {
      this.resumeReading();
    } else if (this.selectedText) {
      this.readText(this.selectedText);
    } else {
      this.showStatus('Please select some text first', 'error');
    }
  }

  // Split text into sentences at period/question/exclamation boundaries
  splitSentences(text) {
    return (text.match(/[^.!?\u061F]+[.!?\u061F]+/g) || [text]).map(s => s.trim()).filter(s => s.length > 0);
  }

  async readText(text) {
    if (this.isTranslating) {
      this.showStatus('Please wait - translation in progress', 'info');
      return;
    }
    if (this.isReading) {
      window.LBTTSService.stop();
    }

    this.isTranslating = true;
    this.isReading = true;
    this.isPaused = false;
    this.lastReadTime = Date.now();
    this.updatePlayPauseButton(true);

    try {
      const result = await window.LBTranslationService.translate(text, this.userLanguage);

      if (result.error) {
        this.showStatus(result.error, 'error');
        return;
      }

      this.cachedTranslation = result;
      this.cachedOriginalText = text;

      // Show translation tooltip
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        this.showTranslationTooltip(result, selection);
      }

      // Split the cognate/translation into sentences for pause support
      const fullText = result.cognate || result.bridgeScaffold || result.bridgeAnchor || text;
      this.sentences = this.splitSentences(fullText);
      this.currentSentenceIndex = 0;

      // Play sentence by sentence with natural pauses
      await this.playSentences();

      // Analytics
      chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'analytics-writer',
        body: {
          eventType: 'tts_request', language: this.userLanguage,
          studentCode: window.LBState.studentCode,
          timestamp: new Date().toISOString(),
          extensionVersion: window.CONFIG.version,
        },
      }).catch(() => {});

    } catch (err) {
      if (err.message !== 'Paused') {
        LBLog.error('Read failed:', err);
        this.showStatus('Error reading text', 'error');
      }
    } finally {
      if (!this.isPaused) {
        this.isReading = false;
        this.isTranslating = false;
        this.updatePlayPauseButton(false);
        if (!this.isPaused) this.showStatus('Active', 'info');
      }
    }
  }

  async playSentences() {
    while (this.currentSentenceIndex < this.sentences.length) {
      if (this.isPaused) throw new Error('Paused');

      const sentence = this.sentences[this.currentSentenceIndex];
      const remaining = this.sentences.length - this.currentSentenceIndex;
      this.showStatus(`Playing sentence ${this.currentSentenceIndex + 1}/${this.sentences.length}`, 'info');

      // Generate and play this sentence
      if (this.cachedTranslation?.audioUrl && this.sentences.length === 1) {
        await window.LBTTSService.play(this.cachedTranslation.audioUrl);
      } else {
        await window.LBTTSService.generateAndPlay(sentence, this.userLanguage);
      }

      this.currentSentenceIndex++;

      if (this.isPaused) throw new Error('Paused');

      // Natural pause between sentences (600ms)
      if (this.currentSentenceIndex < this.sentences.length) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }
    this.showStatus('Completed', 'info');
  }

  pauseReading() {
    window.LBTTSService.stop();
    this.isReading = false;
    this.isPaused = true;
    this.isTranslating = false;
    this.updatePlayPauseButton(false);
    const remaining = (this.sentences?.length || 0) - (this.currentSentenceIndex || 0);
    this.showStatus(`Paused \u2014 ${remaining} sentence${remaining !== 1 ? 's' : ''} remaining`, 'info');
  }

  async resumeReading() {
    if (!this.sentences || this.currentSentenceIndex >= this.sentences.length) return;
    this.isReading = true;
    this.isPaused = false;
    this.isTranslating = true;
    this.lastReadTime = Date.now();
    this.updatePlayPauseButton(true);
    const remaining = this.sentences.length - this.currentSentenceIndex;
    this.showStatus(`Resuming \u2014 ${remaining} sentence${remaining !== 1 ? 's' : ''} left`, 'info');

    try {
      await this.playSentences();
    } catch (err) {
      if (err.message !== 'Paused') {
        LBLog.error('Resume failed:', err);
      }
    } finally {
      if (!this.isPaused) {
        this.isReading = false;
        this.isTranslating = false;
        this.updatePlayPauseButton(false);
      }
    }
  }

  updatePlayPauseButton(isPlaying) {
    const btn = this.toolbar?.querySelector('#lb-play-pause');
    if (!btn) return;
    const svg = btn.querySelector('svg');
    if (!svg) return;
    svg.innerHTML = '';
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', isPlaying ? 'M6 4h4v16H6V4zm8 0h4v16h-4V4z' : 'M8 5v14l11-7z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
  }

  // --- Show Written Translation (book button) ---

  async showWrittenTranslation() {
    if (!this.selectedText) {
      this.showStatus('Please select some text first', 'error');
      return;
    }
    this.showStatus('Translating...', 'info');
    try {
      const result = await window.LBTranslationService.translate(this.selectedText, this.userLanguage);
      if (result.error) {
        this.showStatus(result.error, 'error');
        return;
      }
      this.cachedTranslation = result;
      this.cachedOriginalText = this.selectedText;

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        this.showTranslationTooltip(result, selection);
      } else {
        this.showTranslationTooltipCentered(result);
      }
      this.showStatus('Translation shown', 'info');
    } catch (err) {
      LBLog.error('Translation display failed:', err);
      this.showStatus('Error translating text', 'error');
    }
  }

  // --- Flag (Report Problem) ---

  populateFlagTab(tooltip) {
    const container = tooltip.querySelector('#lb-flag-words');
    if (!container) return;

    const words = this.selectedText.split(/\s+/).filter(w => w.length > 2);
    const unique = [...new Set(words.map(w => w.replace(/[^a-zA-Z'-]/g, '').toLowerCase()))].filter(w => w.length > 2);

    unique.forEach(word => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: rgba(255,255,255,0.08); border-radius: 8px;';
      row.innerHTML = `
        <span style="flex: 1; font-size: 14px;">${window.escapeHtml(word)}</span>
        <button class="lb-flag-word-audio" data-word="${window.escapeHtml(word)}" style="
          background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2);
          border-radius: 6px; padding: 4px 8px; color: white; cursor: pointer; font-size: 13px;
        ">&#9654;</button>
        <button class="lb-flag-word-btn" data-word="${window.escapeHtml(word)}" style="
          background: rgba(239,68,68,0.3); border: 1px solid rgba(239,68,68,0.4);
          border-radius: 6px; padding: 4px 10px; color: white; cursor: pointer; font-size: 12px; font-weight: 600;
        ">FLAG</button>
      `;
      container.appendChild(row);
    });

    // Audio play buttons
    container.querySelectorAll('.lb-flag-word-audio').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.textContent = '...';
        await window.LBTTSService.generateAndPlay(btn.dataset.word, this.userLanguage);
        btn.innerHTML = '&#9654;';
      });
    });

    // Flag individual word buttons
    container.querySelectorAll('.lb-flag-word-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.textContent = '...';
        await this.reportProblem(btn.dataset.word, null);
        btn.textContent = 'FLAGGED';
        btn.style.background = 'rgba(16,185,129,0.4)';
        btn.style.borderColor = 'rgba(16,185,129,0.5)';
      });
    });
  }

  async reportProblem(flagText, flagAudioUrl) {
    const word = flagText || this.selectedText || window.LBState.selectedText;
    if (!word) {
      this.showStatus('Select text to flag', 'error');
      return;
    }

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'flag-handler',
        body: {
          word, language: this.userLanguage,
          studentCode: window.LBState.studentCode,
          timestamp: new Date().toISOString(),
          audioUrl: flagAudioUrl || this.cachedTranslation?.audioUrl || null,
        },
      });

      if (res.ok && res.data) {
        const count = res.data.flagCount || 1;
        this.showStatus(`Flagged! (${count} student${count > 1 ? 's' : ''} flagged this)`, 'success');
      } else {
        this.showStatus('Flagged! Thank you.', 'success');
      }
    } catch (err) {
      LBLog.warn('Flag failed (non-fatal):', err);
      this.showStatus('Flag sent', 'success');
    }
  }

  // --- Status Display ---

  showStatus(message, type) {
    const statusText = this.toolbar?.querySelector('.lb-status-text');
    const statusDot = this.toolbar?.querySelector('.lb-status-dot');
    if (statusText) statusText.textContent = message;
    if (statusDot) {
      statusDot.classList.toggle('error', type === 'error');
    }
  }

  // --- Translation Tooltip ---

  showTranslationTooltip(result, selection) {
    this.hideTranslationTooltip();
    const langInfo = window.LB_LANGUAGES[this.userLanguage];
    const isRTL = langInfo?.rtl || false;
    const textDir = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';

    // result can be a string (old path) or an object (new lexicon response)
    const isLexiconResult = typeof result === 'object' && result !== null;
    const bridgeAnchor = isLexiconResult ? result.bridgeAnchor : null;
    const bridgeScaffold = isLexiconResult ? result.bridgeScaffold : null;
    const cognate = isLexiconResult ? result.cognate : null;
    const forms = isLexiconResult ? result.grammaticalForms : null;
    const subject = isLexiconResult ? result.subject : null;
    const gradeBand = isLexiconResult ? result.gradeBand : null;
    const source = isLexiconResult ? result.source : null;
    const displayText = bridgeAnchor || (isLexiconResult ? result.translatedText : result) || '';

    const tooltip = document.createElement('div');
    tooltip.className = 'lb-translation-tooltip';
    tooltip.id = 'lb-translation-tooltip';
    tooltip.setAttribute('data-lang', this.userLanguage);

    // Header
    const header = document.createElement('div');
    header.className = 'lb-tooltip-header';
    const dragHandle = document.createElement('span');
    dragHandle.className = 'lb-tooltip-drag-handle';
    dragHandle.textContent = '\u22EE\u22EE';
    const langLabel = document.createElement('span');
    langLabel.className = 'lb-tooltip-language';
    langLabel.style.cssText = 'flex: 1; font-weight: 600;';
    langLabel.textContent = `${this.getLanguageName()} Translation`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'lb-tooltip-close';
    closeBtn.textContent = '\u00D7';
    header.appendChild(dragHandle);
    header.appendChild(langLabel);
    header.appendChild(closeBtn);

    // Body with tabs
    const body = document.createElement('div');
    body.className = 'lb-tooltip-body';

    // Tab 1: Translation (bridge phrases layout)
    const tab1 = document.createElement('div');
    tab1.className = 'lb-tooltip-tab-content active';
    tab1.setAttribute('data-tab', '0');

    // Bridge Anchor (always show — short headline)
    if (bridgeAnchor) {
      const anchor = document.createElement('div');
      anchor.style.cssText = 'font-size: 18px; font-weight: 700; margin-bottom: 12px; line-height: 1.4;';
      anchor.textContent = bridgeAnchor;
      tab1.appendChild(anchor);
    }

    // Bridge Scaffold (expanded definition)
    if (bridgeScaffold && bridgeScaffold !== bridgeAnchor) {
      const scaffold = document.createElement('div');
      scaffold.className = 'lb-tooltip-simplified';
      scaffold.textContent = bridgeScaffold;
      tab1.appendChild(scaffold);
    }

    // Cognate (native script)
    if (cognate) {
      const cognateEl = document.createElement('div');
      cognateEl.className = 'lb-tooltip-text';
      cognateEl.setAttribute('dir', textDir);
      cognateEl.style.textAlign = textAlign;
      cognateEl.style.cssText += 'margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 8px;';
      cognateEl.textContent = cognate;
      tab1.appendChild(cognateEl);
    }

    // Grammatical forms (noun/verb/adj tabs)
    if (forms && (forms.noun || forms.verb || forms.adjective)) {
      const formsEl = document.createElement('div');
      formsEl.style.cssText = 'margin-top: 12px; display: flex; flex-direction: column; gap: 6px;';
      ['noun', 'verb', 'adjective'].forEach(type => {
        if (forms[type]) {
          const pill = document.createElement('div');
          pill.style.cssText = 'padding: 6px 10px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 13px;';
          pill.innerHTML = `<strong style="opacity: 0.7; text-transform: uppercase; font-size: 10px;">${type}</strong><br>${window.escapeHtml(forms[type])}`;
          formsEl.appendChild(pill);
        }
      });
      tab1.appendChild(formsEl);
    }

    // Subject + grade band tags
    if (subject || gradeBand) {
      const meta = document.createElement('div');
      meta.style.cssText = 'margin-top: 12px; display: flex; gap: 8px; font-size: 12px; opacity: 0.8;';
      if (subject) meta.innerHTML += `<span class="lb-subject-tag lb-subject-${subject}">${window.escapeHtml(subject)}</span>`;
      if (gradeBand) meta.innerHTML += `<span class="lb-subject-tag">grades ${window.escapeHtml(gradeBand)}</span>`;
      tab1.appendChild(meta);
    }

    // Fallback notice if translator_fallback
    if (source === 'translator_fallback') {
      const notice = document.createElement('div');
      notice.style.cssText = 'margin-top: 10px; font-size: 11px; opacity: 0.7; font-style: italic;';
      notice.textContent = 'Machine translation \u2014 may not be perfect';
      tab1.appendChild(notice);
    }

    // If nothing from lexicon, show plain text
    if (!bridgeAnchor && !cognate && displayText) {
      const transText = document.createElement('div');
      transText.className = 'lb-tooltip-text';
      transText.setAttribute('dir', textDir);
      transText.style.textAlign = textAlign;
      transText.textContent = displayText;
      tab1.appendChild(transText);
    }

    // Tab 2: Glossary
    const tab2 = document.createElement('div');
    tab2.className = 'lb-tooltip-tab-content';
    tab2.setAttribute('data-tab', '1');
    const glossaryContent = document.createElement('div');
    glossaryContent.className = 'lb-tooltip-glossary';

    // Grade band tier selector + lazy-loaded lexicon glossary
    const tierBands = [
      { band: 'K-2', label: 'K-2 Elementary', color: '#6b7280' },
      { band: '3-5', label: '3-5 Intermediate', color: '#10b981' },
      { band: '6-8', label: '6-8 Middle School', color: '#f37030' },
      { band: '9-12', label: '9-12 High School', color: '#ffc755' },
    ];

    // Tier selector buttons
    const tierSelector = document.createElement('div');
    tierSelector.style.cssText = 'display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap;';
    tierBands.forEach((tier, i) => {
      const btn = document.createElement('button');
      btn.className = 'lb-tier-select-btn';
      btn.dataset.band = tier.band;
      btn.style.cssText = `padding: 6px 12px; border-radius: 8px; border: 2px solid ${tier.color}; background: ${i === 0 ? tier.color : 'transparent'}; color: white; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;`;
      btn.textContent = tier.label;
      tierSelector.appendChild(btn);
    });
    glossaryContent.appendChild(tierSelector);

    // Glossary word list container
    const wordList = document.createElement('div');
    wordList.id = 'lb-glossary-word-list';
    wordList.innerHTML = '<div class="lb-glossary-empty">Select a tier to load vocabulary...</div>';
    glossaryContent.appendChild(wordList);

    // Audio cache for glossary (avoid repeat API calls)
    const audioCache = {};

    // Load glossary for a tier
    const loadTier = async (band) => {
      wordList.innerHTML = '<div class="lb-tooltip-loading"><div class="lb-tooltip-spinner"></div><span>Loading vocabulary...</span></div>';

      const stopWords = new Set(['a','an','the','is','are','was','were','be','been','being','in','on','at','to','for','of','and','or','but','not','with','by','from','as','it','its','this','that','these','those','he','she','they','we','i','you','my','his','her','our','their']);
      const words = this.selectedText.split(/\s+/)
        .map(w => w.replace(/[^a-zA-Z'-]/g, '').toLowerCase())
        .filter(w => w.length > 2 && !stopWords.has(w));
      const unique = [...new Set(words)];

      wordList.innerHTML = '';
      let foundAny = false;

      for (const word of unique.slice(0, 15)) {
        try {
          const res = await window.LBTranslationService.translate(word, this.userLanguage);
          if (res.error) continue;

          // Filter by grade_band if available, otherwise show all
          const wordBand = res.gradeBand || '6-8';
          if (wordBand !== band) continue;

          foundAny = true;
          const row = document.createElement('div');
          row.className = 'lb-glossary-item';
          row.style.cssText = `border-left-color: ${tierBands.find(t => t.band === band)?.color || '#10b981'};`;

          const cognateText = res.cognate || '';
          const langInfo = window.LB_LANGUAGES[this.userLanguage];
          const dir = langInfo?.rtl ? 'rtl' : 'ltr';

          row.innerHTML = `
            <div class="lb-vocab-pair">
              <div class="lb-vocab-english">
                <span class="lb-vocab-word">${window.escapeHtml(word)}</span>
                <button class="lb-vocab-audio lb-en-audio" data-word="${window.escapeHtml(word)}" data-lang="english" title="Listen in English">&#9654;</button>
                <button class="lb-vocab-audio lb-vocab-slow lb-en-slow" data-word="${window.escapeHtml(word)}" data-lang="english" title="Slow pronunciation">&#9202;</button>
              </div>
              <span class="lb-vocab-arrow">\u2192</span>
              <div class="lb-vocab-translated">
                <span class="lb-vocab-word" dir="${dir}" style="text-align: ${dir === 'rtl' ? 'right' : 'left'};">${window.escapeHtml(cognateText)}</span>
                <button class="lb-vocab-audio lb-cognate-audio" data-word="${window.escapeHtml(cognateText)}" data-lang="${this.userLanguage}" title="Listen in ${langInfo?.label || ''}">&#9654;</button>
              </div>
            </div>
            ${res.bridgeAnchor ? `<div style="font-size: 12px; opacity: 0.8; margin-top: 6px; padding-left: 4px;">${window.escapeHtml(res.bridgeAnchor)}</div>` : ''}
          `;
          wordList.appendChild(row);

          // Cache audio URL if available
          if (res.audioUrl) audioCache[cognateText] = res.audioUrl;
        } catch (err) {
          // Skip failed lookups
        }
      }

      if (!foundAny) {
        wordList.innerHTML = `<div class="lb-glossary-empty">No ${band} vocabulary found in this text. Try another tier.</div>`;
      }

      // Wire up audio buttons
      wordList.querySelectorAll('.lb-en-audio').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          btn.textContent = '...';
          await window.LBTTSService.generateAndPlay(btn.dataset.word, 'english');
          btn.innerHTML = '&#9654;';
        });
      });

      wordList.querySelectorAll('.lb-en-slow').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          btn.textContent = '...';
          // Slow = add spaces between syllables for slower speech
          const slowText = btn.dataset.word.split('').join(' ');
          await window.LBTTSService.generateAndPlay(slowText, 'english');
          btn.innerHTML = '&#9202;';
        });
      });

      wordList.querySelectorAll('.lb-cognate-audio').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          btn.textContent = '...';
          const cached = audioCache[btn.dataset.word];
          if (cached) {
            await window.LBTTSService.play(cached);
          } else {
            const result = await window.LBTTSService.generateAndPlay(btn.dataset.word, btn.dataset.lang);
            if (result?.audioUrl) audioCache[btn.dataset.word] = result.audioUrl;
          }
          btn.innerHTML = '&#9654;';
        });
      });
    };

    // Tier selector click handlers
    tierSelector.querySelectorAll('.lb-tier-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active style
        tierSelector.querySelectorAll('.lb-tier-select-btn').forEach(b => {
          const tier = tierBands.find(t => t.band === b.dataset.band);
          b.style.background = 'transparent';
          b.style.borderColor = tier?.color || '#10b981';
        });
        const activeTier = tierBands.find(t => t.band === btn.dataset.band);
        btn.style.background = activeTier?.color || '#10b981';
        loadTier(btn.dataset.band);
      });
    });

    // Auto-load first tier
    loadTier('K-2');
    tab2.appendChild(glossaryContent);

    // Tab 3: Flag
    const tab3 = document.createElement('div');
    tab3.className = 'lb-tooltip-tab-content';
    tab3.setAttribute('data-tab', '2');
    tab3.innerHTML = `
      <div style="padding: 8px 0;">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Flag a problem with this translation</div>
        <div id="lb-flag-words" style="display: flex; flex-direction: column; gap: 8px;"></div>
        <button id="lb-flag-all-btn" style="
          margin-top: 16px; width: 100%; padding: 12px; border: none; border-radius: 8px;
          background: rgba(239,68,68,0.3); color: white; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
        ">Flag Entire Translation</button>
      </div>
    `;

    body.appendChild(tab1);
    body.appendChild(tab2);
    body.appendChild(tab3);

    // Tab navigation
    const pagination = document.createElement('div');
    pagination.className = 'lb-tooltip-pagination';
    [
      { icon: '\uD83C\uDF0D', label: 'Translation', index: 0, active: true },
      { icon: '\uD83D\uDCDA', label: 'Glossary', index: 1, active: false },
      { icon: '\uD83D\uDEA9', label: 'Flag', index: 2, active: false },
    ].forEach(tab => {
      const dot = document.createElement('div');
      dot.className = tab.active ? 'lb-pagination-dot active' : 'lb-pagination-dot';
      dot.setAttribute('data-tab', tab.index.toString());
      dot.innerHTML = `<span class="lb-tab-icon">${tab.icon}</span><span class="lb-tab-label">${tab.label}</span>`;
      pagination.appendChild(dot);
    });

    tooltip.appendChild(header);
    tooltip.appendChild(body);
    tooltip.appendChild(pagination);

    // Position near selection
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    let top = rect.top + window.scrollY - 410;
    if (top < 10) top = rect.bottom + window.scrollY + 10;
    if (left + 500 > window.innerWidth) left = window.innerWidth - 520;
    tooltip.style.left = `${Math.max(10, left)}px`;
    tooltip.style.top = `${top}px`;

    document.body.appendChild(tooltip);

    // Make draggable
    this.makeTooltipDraggable(tooltip);

    // Close button
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideTranslationTooltip();
    });

    // Tab switching
    this.setupTabNavigation(tooltip);

    // Populate flag tab with individual words
    this.populateFlagTab(tooltip);

    // Flag entire translation button
    const flagAllBtn = tooltip.querySelector('#lb-flag-all-btn');
    if (flagAllBtn) {
      flagAllBtn.addEventListener('click', async () => {
        flagAllBtn.textContent = 'Sending...';
        await this.reportProblem(this.selectedText, this.cachedTranslation?.audioUrl);
        flagAllBtn.textContent = 'Flagged! Thank you';
        flagAllBtn.style.background = 'rgba(16,185,129,0.4)';
      });
    }
  }

  showTranslationTooltipCentered(translatedText) {
    // Fake a centered selection for the tooltip
    const fakeSelection = {
      rangeCount: 1,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          left: window.innerWidth / 2 - 250,
          top: window.innerHeight / 2,
          bottom: window.innerHeight / 2 + 20,
        }),
      }),
    };
    this.showTranslationTooltip(translatedText, fakeSelection);
  }

  hideTranslationTooltip() {
    const tooltip = document.getElementById('lb-translation-tooltip');
    if (tooltip) tooltip.remove();
  }

  setupTabNavigation(tooltip) {
    const dots = tooltip.querySelectorAll('.lb-pagination-dot');
    const tabs = tooltip.querySelectorAll('.lb-tooltip-tab-content');

    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const tabIndex = dot.getAttribute('data-tab');
        tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === tabIndex));
        dots.forEach(d => d.classList.toggle('active', d.getAttribute('data-tab') === tabIndex));
      });
    });
  }

  makeTooltipDraggable(tooltip) {
    const header = tooltip.querySelector('.lb-tooltip-header');
    if (!header) return;
    let isDragging = false, startX, startY, origLeft, origTop;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = tooltip.offsetLeft;
      origTop = tooltip.offsetTop;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      tooltip.style.left = `${origLeft + (e.clientX - startX)}px`;
      tooltip.style.top = `${origTop + (e.clientY - startY)}px`;
    });

    document.addEventListener('mouseup', () => { isDragging = false; });
  }
}

// --- Instantiate (per guide: attach to window.__lbToolbar) ---
window.__lbToolbar = new LanguageBridgeToolbar();
LBLog.info('Toolbar loaded');
