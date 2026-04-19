/**
 * LanguageBridge - Toolbar Tooltip
 * Translation tooltip with bridge phrases, glossary (grade_band tiers), and tab navigation.
 * Adds methods to LanguageBridgeToolbar.prototype.
 */

const _TT = LanguageBridgeToolbar.prototype;

// ---------- Constants ----------

const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','in','on','at','to',
  'for','of','and','or','but','not','with','by','from','as','it','its','this',
  'that','these','those','he','she','they','we','i','you','my','his','her','our','their',
]);

const TIER_BANDS = [
  { band: '3-5',  label: '3-5 Intermediate',   color: '#10b981' },
  { band: '6-8',  label: '6-8 Middle School',   color: '#f37030' },
  { band: '9-12', label: '9-12 High School',    color: '#ffc755' },
];

// ---------- Main Tooltip ----------

_TT.showTranslationTooltip = function (result, selection) {
  this.hideTranslationTooltip();
  const langInfo = window.LB_LANGUAGES[this.userLanguage];
  const isRTL = langInfo?.rtl || false;
  const textDir = isRTL ? 'rtl' : 'ltr';
  const textAlign = isRTL ? 'right' : 'left';

  const isObj = typeof result === 'object' && result !== null;
  const bridgeAnchor = isObj ? result.bridgeAnchor : null;
  const bridgeScaffold = isObj ? result.bridgeScaffold : null;
  const cognate = isObj ? result.cognate : null;
  const forms = isObj ? result.grammaticalForms : null;
  const subject = isObj ? result.subject : null;
  const gradeBand = isObj ? result.gradeBand : null;
  const source = isObj ? result.source : null;
  const displayText = bridgeAnchor || (isObj ? result.translatedText : result) || '';

  const tooltip = document.createElement('div');
  tooltip.className = 'lb-translation-tooltip';
  tooltip.id = 'lb-translation-tooltip';
  tooltip.setAttribute('data-lang', this.userLanguage);

  // --- Header ---
  const header = document.createElement('div');
  header.className = 'lb-tooltip-header';
  header.innerHTML = `
    <span class="lb-tooltip-drag-handle">\u22EE\u22EE</span>
    <span class="lb-tooltip-language" style="flex:1;font-weight:600;">${this.getLanguageName()} Translation</span>
  `;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'lb-tooltip-close';
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.hideTranslationTooltip(); });
  header.appendChild(closeBtn);

  // --- Body ---
  const body = document.createElement('div');
  body.className = 'lb-tooltip-body';

  // Tab 1: Translation
  const tab1 = this._buildTranslationTab(bridgeAnchor, bridgeScaffold, cognate, forms, subject, gradeBand, source, displayText, textDir, textAlign);

  // Tab 2: Glossary
  const tab2 = this._buildGlossaryTab();

  // Tab 3: Flag
  const tab3 = this._buildFlagTab();

  body.appendChild(tab1);
  body.appendChild(tab2);
  body.appendChild(tab3);

  // --- Tab Navigation ---
  const pagination = document.createElement('div');
  pagination.className = 'lb-tooltip-pagination';
  [
    { icon: '\uD83C\uDF0D', label: 'Translation', index: 0, active: true },
    { icon: '\uD83D\uDCDA', label: 'Glossary',    index: 1, active: false },
    { icon: '\uD83D\uDEA9', label: 'Flag',        index: 2, active: false },
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

  // --- Position ---
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  let left = rect.left + window.scrollX;
  let top = rect.top + window.scrollY - 410;
  if (top < 10) top = rect.bottom + window.scrollY + 10;
  if (left + 500 > window.innerWidth) left = window.innerWidth - 520;
  tooltip.style.left = `${Math.max(10, left)}px`;
  tooltip.style.top = `${top}px`;

  document.body.appendChild(tooltip);

  this.makeTooltipDraggable(tooltip);
  this.setupTabNavigation(tooltip);
  this.populateFlagTab(tooltip);
};

// ---------- Tab Builders ----------

_TT._buildTranslationTab = function (bridgeAnchor, bridgeScaffold, cognate, forms, subject, gradeBand, source, displayText, textDir, textAlign) {
  const tab = document.createElement('div');
  tab.className = 'lb-tooltip-tab-content active';
  tab.setAttribute('data-tab', '0');

  if (bridgeAnchor) {
    const el = document.createElement('div');
    el.className = 'lb-bridge-anchor';
    el.textContent = bridgeAnchor;
    tab.appendChild(el);
  }

  if (bridgeScaffold && bridgeScaffold !== bridgeAnchor) {
    const el = document.createElement('div');
    el.className = 'lb-tooltip-simplified';
    el.textContent = bridgeScaffold;
    tab.appendChild(el);
  }

  if (cognate) {
    const el = document.createElement('div');
    el.className = 'lb-tooltip-text lb-cognate-display';
    el.setAttribute('dir', textDir);
    el.style.textAlign = textAlign;
    el.textContent = cognate;
    tab.appendChild(el);
  }

  if (forms && (forms.noun || forms.verb || forms.adjective)) {
    const el = document.createElement('div');
    el.className = 'lb-grammatical-forms';
    ['noun', 'verb', 'adjective'].forEach(type => {
      if (!forms[type]) return;
      const pill = document.createElement('div');
      pill.className = 'lb-form-pill';
      pill.innerHTML = `<strong class="lb-form-label">${type}</strong><br>${window.escapeHtml(forms[type])}`;
      el.appendChild(pill);
    });
    tab.appendChild(el);
  }

  if (subject || gradeBand) {
    const el = document.createElement('div');
    el.className = 'lb-tooltip-meta';
    if (subject) el.innerHTML += `<span class="lb-subject-tag lb-subject-${subject}">${window.escapeHtml(subject)}</span>`;
    if (gradeBand) el.innerHTML += `<span class="lb-subject-tag">grades ${window.escapeHtml(gradeBand)}</span>`;
    tab.appendChild(el);
  }

  if (source === 'translator_fallback') {
    const el = document.createElement('div');
    el.className = 'lb-fallback-notice';
    el.textContent = 'Machine translation \u2014 may not be perfect';
    tab.appendChild(el);
  }

  if (!bridgeAnchor && !cognate && displayText) {
    const el = document.createElement('div');
    el.className = 'lb-tooltip-text';
    el.setAttribute('dir', textDir);
    el.style.textAlign = textAlign;
    el.textContent = displayText;
    tab.appendChild(el);
  }

  return tab;
};

_TT._buildGlossaryTab = function () {
  const tab = document.createElement('div');
  tab.className = 'lb-tooltip-tab-content';
  tab.setAttribute('data-tab', '1');

  const glossary = document.createElement('div');
  glossary.className = 'lb-tooltip-glossary';

  // Tier selector
  const tierSelector = document.createElement('div');
  tierSelector.className = 'lb-tier-selector';
  TIER_BANDS.forEach((tier, i) => {
    const btn = document.createElement('button');
    btn.className = `lb-tier-select-btn${i === 0 ? ' active' : ''}`;
    btn.dataset.band = tier.band;
    btn.style.borderColor = tier.color;
    if (i === 0) btn.style.background = tier.color;
    btn.textContent = tier.label;
    tierSelector.appendChild(btn);
  });
  glossary.appendChild(tierSelector);

  // Word list container
  const wordList = document.createElement('div');
  wordList.id = 'lb-glossary-word-list';
  wordList.innerHTML = '<div class="lb-glossary-empty">Loading vocabulary...</div>';
  glossary.appendChild(wordList);

  // Audio cache
  const audioCache = {};

  // Load tier
  const loadTier = async (band) => {
    wordList.innerHTML = '<div class="lb-tooltip-loading"><div class="lb-tooltip-spinner"></div><span>Loading vocabulary...</span></div>';

    const words = this.selectedText.split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z'-]/g, '').toLowerCase())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const unique = [...new Set(words)];

    wordList.innerHTML = '';
    let found = false;

    for (const word of unique.slice(0, 12)) {
      // Check if tooltip was closed (early exit)
      if (!document.getElementById('lb-translation-tooltip')) return;
      try {
        const res = await window.LBTranslationService.translate(word, this.userLanguage);
        if (!res || res.error) continue;

        const wordBand = res.gradeBand || '6-8';
        if (wordBand !== band) continue;

        found = true;
        const langInfo = window.LB_LANGUAGES[this.userLanguage];
        const dir = langInfo?.rtl ? 'rtl' : 'ltr';
        const cognateText = res.cognate || '';

        const row = document.createElement('div');
        row.className = 'lb-glossary-item';
        row.style.borderLeftColor = TIER_BANDS.find(t => t.band === band)?.color || '#10b981';
        row.innerHTML = `
          <div class="lb-vocab-pair">
            <div class="lb-vocab-english">
              <span class="lb-vocab-word">${window.escapeHtml(word)}</span>
              <button class="lb-vocab-audio lb-en-audio" data-word="${window.escapeHtml(word)}" data-lang="english" title="Listen in English">&#9654;</button>
              <button class="lb-vocab-audio lb-vocab-slow" data-word="${window.escapeHtml(word)}" title="Slow">&#9202;</button>
            </div>
            <span class="lb-vocab-arrow">\u2192</span>
            <div class="lb-vocab-translated">
              <span class="lb-vocab-word" dir="${dir}">${window.escapeHtml(cognateText)}</span>
              <button class="lb-vocab-audio lb-cognate-audio" data-word="${window.escapeHtml(cognateText)}" data-lang="${this.userLanguage}" title="Listen">&#9654;</button>
            </div>
          </div>
          ${res.bridgeAnchor ? `<div class="lb-vocab-bridge">${window.escapeHtml(res.bridgeAnchor)}</div>` : ''}
        `;
        wordList.appendChild(row);
        if (res.audioUrl) audioCache[cognateText] = res.audioUrl;
      } catch (err) { /* skip */ }
      // Small delay between lookups to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    if (!found) wordList.innerHTML = `<div class="lb-glossary-empty">No ${band} vocabulary found. Try another tier.</div>`;

    // Wire audio
    wordList.querySelectorAll('.lb-en-audio').forEach(btn => {
      btn.addEventListener('click', async (e) => { e.stopPropagation(); btn.textContent = '...'; await window.LBTTSService?.generateAndPlay(btn.dataset.word, 'english'); btn.innerHTML = '&#9654;'; });
    });
    wordList.querySelectorAll('.lb-vocab-slow').forEach(btn => {
      btn.addEventListener('click', async (e) => { e.stopPropagation(); btn.textContent = '...'; await window.LBTTSService?.generateAndPlay(btn.dataset.word.split('').join(' '), 'english'); btn.innerHTML = '&#9202;'; });
    });
    wordList.querySelectorAll('.lb-cognate-audio').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); btn.textContent = '...';
        const cached = audioCache[btn.dataset.word];
        if (cached) await window.LBTTSService?.play(cached);
        else { const r = await window.LBTTSService?.generateAndPlay(btn.dataset.word, btn.dataset.lang); if (r?.audioUrl) audioCache[btn.dataset.word] = r.audioUrl; }
        btn.innerHTML = '&#9654;';
      });
    });
  };

  // Tier click handlers
  tierSelector.querySelectorAll('.lb-tier-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tierSelector.querySelectorAll('.lb-tier-select-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
      });
      btn.classList.add('active');
      btn.style.background = TIER_BANDS.find(t => t.band === btn.dataset.band)?.color || '#10b981';
      loadTier(btn.dataset.band);
    });
  });

  // Auto-load first tier
  loadTier(TIER_BANDS[0].band);

  tab.appendChild(glossary);
  return tab;
};

_TT._buildFlagTab = function () {
  const tab = document.createElement('div');
  tab.className = 'lb-tooltip-tab-content';
  tab.setAttribute('data-tab', '2');
  tab.innerHTML = `
    <div class="lb-flag-container">
      <div class="lb-flag-title">Flag a problem with this translation</div>
      <div id="lb-flag-words" class="lb-flag-words"></div>
      <button id="lb-flag-all-btn" class="lb-flag-all-btn">Flag Entire Translation</button>
    </div>
  `;
  return tab;
};

// ---------- Tooltip Utilities ----------

_TT.showTranslationTooltipCentered = function (result) {
  const fake = {
    rangeCount: 1,
    getRangeAt: () => ({
      getBoundingClientRect: () => ({
        left: window.innerWidth / 2 - 250,
        top: window.innerHeight / 2,
        bottom: window.innerHeight / 2 + 20,
      }),
    }),
  };
  this.showTranslationTooltip(result, fake);
};

_TT.hideTranslationTooltip = function () {
  const tooltip = document.getElementById('lb-translation-tooltip');
  if (tooltip) {
    if (tooltip._dragController) tooltip._dragController.abort();
    tooltip.remove();
  }
};

_TT.setupTabNavigation = function (tooltip) {
  const dots = tooltip.querySelectorAll('.lb-pagination-dot');
  const tabs = tooltip.querySelectorAll('.lb-tooltip-tab-content');
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = dot.getAttribute('data-tab');
      tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === idx));
      dots.forEach(d => d.classList.toggle('active', d.getAttribute('data-tab') === idx));
      // Analytics: track glossary and scaffold views
      if (idx === '1') window.LBAnalytics?.glossaryView();
      if (idx === '0') window.LBAnalytics?.scaffoldView(this.selectedText);
    });
  });
};

_TT.makeTooltipDraggable = function (tooltip) {
  const header = tooltip.querySelector('.lb-tooltip-header');
  if (!header) return;
  let isDragging = false, startX, startY, origLeft, origTop;
  const controller = new AbortController();
  tooltip._dragController = controller;

  header.addEventListener('mousedown', (e) => {
    isDragging = true; startX = e.clientX; startY = e.clientY;
    origLeft = tooltip.offsetLeft; origTop = tooltip.offsetTop;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    tooltip.style.left = `${origLeft + (e.clientX - startX)}px`;
    tooltip.style.top = `${origTop + (e.clientY - startY)}px`;
  }, { signal: controller.signal });
  document.addEventListener('mouseup', () => { isDragging = false; }, { signal: controller.signal });
};
