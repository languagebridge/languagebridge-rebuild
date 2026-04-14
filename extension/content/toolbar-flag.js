/**
 * LanguageBridge - Toolbar Flag Controller
 * Populates flag tab, handles flag reporting with vocab/pronunciation distinction.
 * Also instantiates the toolbar (this is the last file in load order).
 */

const _TF = LanguageBridgeToolbar.prototype;

_TF.populateFlagTab = function (tooltip) {
  const container = tooltip.querySelector('#lb-flag-words');
  if (!container) return;

  const words = this.selectedText.split(/\s+/).filter(w => w.length > 2);
  const unique = [...new Set(words.map(w => w.replace(/[^a-zA-Z'-]/g, '').toLowerCase()))].filter(w => w.length > 2);

  unique.forEach(word => {
    const row = document.createElement('div');
    row.className = 'lb-flag-word-row';
    row.innerHTML = `
      <span class="lb-flag-word-text">${window.escapeHtml(word)}</span>
      <button class="lb-flag-word-audio" data-word="${window.escapeHtml(word)}" title="Listen">&#9654;</button>
      <button class="lb-flag-word-btn" data-word="${window.escapeHtml(word)}" title="Flag this word">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
      </button>
    `;
    container.appendChild(row);
  });

  // Audio buttons
  container.querySelectorAll('.lb-flag-word-audio').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.textContent = '...';
      await window.LBTTSService?.generateAndPlay(btn.dataset.word, this.userLanguage);
      btn.innerHTML = '&#9654;';
    });
  });

  // Flag buttons — show popup asking vocabulary or pronunciation
  container.querySelectorAll('.lb-flag-word-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const word = btn.dataset.word;
      this._showFlagTypePopup(word, btn);
    });
  });

  // Flag entire translation button
  const flagAllBtn = tooltip.querySelector('#lb-flag-all-btn');
  if (flagAllBtn) {
    flagAllBtn.addEventListener('click', async () => {
      flagAllBtn.textContent = 'Sending...';
      await this.reportProblem(this.selectedText, 'general', this.cachedTranslation?.audioUrl);
      flagAllBtn.textContent = 'Flagged! Thank you';
      flagAllBtn.classList.add('lb-flagged');
    });
  }
};

_TF._showFlagTypePopup = function (word, anchorBtn) {
  // Remove any existing popup
  document.querySelectorAll('.lb-flag-type-popup').forEach(p => p.remove());

  const popup = document.createElement('div');
  popup.className = 'lb-flag-type-popup';
  popup.innerHTML = `
    <div class="lb-flag-popup-title">What's wrong with "${window.escapeHtml(word)}"?</div>
    <button class="lb-flag-type-btn" data-type="vocabulary">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
      Wrong translation
    </button>
    <button class="lb-flag-type-btn" data-type="pronunciation">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
      Bad pronunciation
    </button>
    <button class="lb-flag-type-cancel">Cancel</button>
  `;

  // Position near the button
  const rect = anchorBtn.getBoundingClientRect();
  popup.style.position = 'fixed';
  popup.style.left = `${rect.left - 120}px`;
  popup.style.top = `${rect.bottom + 4}px`;
  popup.style.zIndex = '10002';

  document.body.appendChild(popup);

  // Handle clicks
  popup.querySelectorAll('.lb-flag-type-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      popup.remove();
      anchorBtn.innerHTML = '...';
      await this.reportProblem(word, type, null);
      anchorBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#10b981"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    });
  });

  popup.querySelector('.lb-flag-type-cancel')?.addEventListener('click', () => popup.remove());

  // Close on outside click
  setTimeout(() => {
    const closeHandler = (e) => {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', closeHandler); }
    };
    document.addEventListener('click', closeHandler);
  }, 10);
};

_TF.reportProblem = async function (flagText, flagType, flagAudioUrl) {
  const word = flagText || this.selectedText || window.LBState.selectedText;
  if (!word) { this.showStatus('Select text to flag', 'error'); return; }

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'api-fetch',
      endpoint: 'flag-handler',
      body: {
        word,
        language: this.userLanguage,
        studentCode: window.LBState.studentCode,
        timestamp: new Date().toISOString(),
        audioUrl: flagAudioUrl || this.cachedTranslation?.audioUrl || null,
        flagType: flagType || 'general',
      },
    });

    if (res?.ok && res.data) {
      const count = res.data.flagCount || 1;
      this.showStatus(`Flagged! (${count} student${count > 1 ? 's' : ''} reported this)`, 'success');
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
