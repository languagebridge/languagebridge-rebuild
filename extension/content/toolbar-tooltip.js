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
  const displayText = cognate || (isObj ? result.translatedText : result) || '';

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

  // Tab 2: Glossary + Flag (merged)
  const tab2 = this._buildGlossaryTab();

  body.appendChild(tab1);
  body.appendChild(tab2);

  // --- Tab Navigation (2 tabs) ---
  const pagination = document.createElement('div');
  pagination.className = 'lb-tooltip-pagination';
  [
    { icon: '\uD83C\uDF0D', label: 'Translation', index: 0, active: true },
    { icon: '\uD83D\uDCDA', label: 'Glossary',    index: 1, active: false },
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
};

// ---------- Tab Builders ----------

_TT._buildTranslationTab = function (bridgeAnchor, bridgeScaffold, cognate, forms, subject, gradeBand, source, displayText, textDir, textAlign) {
  const tab = document.createElement('div');
  tab.className = 'lb-tooltip-tab-content active';
  tab.setAttribute('data-tab', '0');
  const self = this;

  // 1) PRIMARY — the native translation (largest, correct direction, with audio).
  if (cognate) {
    const label = document.createElement('div');
    label.className = 'lb-tooltip-field-label';
    label.textContent = 'Translation';
    tab.appendChild(label);

    const row = document.createElement('div');
    row.className = 'lb-cognate-row';

    const el = document.createElement('div');
    el.className = 'lb-tooltip-text lb-cognate-display';
    el.setAttribute('dir', textDir);
    el.style.textAlign = textAlign;
    el.textContent = cognate;
    row.appendChild(el);

    const SPEAKER = '&#128266;', PAUSE = '&#9208;';  // 🔊 / ⏸
    const audioBtn = document.createElement('button');
    audioBtn.className = 'lb-cognate-audio-btn';
    audioBtn.title = 'Listen';
    audioBtn.innerHTML = SPEAKER;
    let playing = false;
    audioBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Toggle: click to play, click again to stop — right here, no toolbar needed.
      if (playing) {
        window.LBTTSService?.stop();
        playing = false;
        audioBtn.innerHTML = SPEAKER;
        audioBtn.title = 'Listen';
        return;
      }
      playing = true;
      audioBtn.innerHTML = PAUSE;
      audioBtn.title = 'Stop';
      try { await window.LBTTSService?.generateAndPlay(cognate, self.userLanguage); } catch (err) { /* noop */ }
      // Reset when playback finishes naturally (or after stop()).
      playing = false;
      audioBtn.innerHTML = SPEAKER;
      audioBtn.title = 'Listen';
    });
    row.appendChild(audioBtn);
    tab.appendChild(row);
  } else {
    // No native translation available — be honest and invite a flag.
    const notice = document.createElement('div');
    notice.className = 'lb-fallback-notice';
    notice.textContent = 'No translation available yet — please report it below.';
    tab.appendChild(notice);
  }

  // 2) SECONDARY — simple-English aid (the bridge gloss). Clearly labeled so it is
  //    never mistaken for the translation.
  if (bridgeAnchor || bridgeScaffold) {
    const label = document.createElement('div');
    label.className = 'lb-tooltip-field-label';
    label.textContent = 'In simple English';
    tab.appendChild(label);

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

  // One-tap flag, right where the student saw the result.
  tab.appendChild(this._buildFlagRow());

  return tab;
};

// One-tap flag with reason chips. Maps each reason to the backend flagType
// ('translation' | 'pronunciation') that drives the improvement/bounty pipeline.
_TT._buildFlagRow = function () {
  const self = this;
  const wrap = document.createElement('div');
  wrap.className = 'lb-flag-row';

  const q = document.createElement('span');
  q.className = 'lb-flag-q';
  q.textContent = 'Was this wrong?';
  wrap.appendChild(q);

  const chips = [
    { label: 'Wrong translation', type: 'translation' },
    { label: 'Bad audio', type: 'pronunciation' },
    { label: 'Still in English', type: 'translation' },
  ];

  chips.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'lb-flag-chip';
    b.textContent = c.label;
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      wrap.querySelectorAll('.lb-flag-chip').forEach((x) => { x.disabled = true; });
      b.textContent = '\u2026';
      const r = await self.reportProblem(self.selectedText, c.type);
      wrap.innerHTML = '';
      const done = document.createElement('span');
      done.className = r && r.ok ? 'lb-flag-done' : 'lb-flag-fail';
      if (r && r.ok) {
        done.textContent = r.count > 1
          ? `Thanks \u2014 ${r.count} students reported this`
          : "Thanks \u2014 reported. We'll fix it.";
      } else {
        done.textContent = 'Could not send \u2014 please try again';
      }
      wrap.appendChild(done);
    });
    wrap.appendChild(b);
  });

  return wrap;
};

// Estimate English syllables — used to tier words by complexity when the lexicon
// has no grade_band for them (multisyllabic = higher grade).
function _countSyllables(word) {
  word = (word || '').toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = word.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}
function _bandFromSyllables(n) {
  if (n <= 2) return '3-5';
  if (n === 3) return '6-8';
  return '9-12';
}
const _VALID_BANDS = new Set(['3-5', '6-8', '9-12']);

_TT._buildGlossaryTab = function () {
  const tab = document.createElement('div');
  tab.className = 'lb-tooltip-tab-content';
  tab.setAttribute('data-tab', '1');

  const glossary = document.createElement('div');
  glossary.className = 'lb-tooltip-glossary';

  // Tier selector with loading state
  const tierSelector = document.createElement('div');
  tierSelector.className = 'lb-tier-selector';
  TIER_BANDS.forEach((tier, i) => {
    const btn = document.createElement('button');
    btn.className = `lb-tier-select-btn${i === 0 ? ' active' : ''}`;
    btn.dataset.band = tier.band;
    btn.style.borderColor = tier.color;
    if (i === 0) btn.style.background = tier.color;
    btn.innerHTML = `<span class="lb-tier-label">${tier.label}</span>`;
    tierSelector.appendChild(btn);
  });
  glossary.appendChild(tierSelector);

  // Word list container
  const wordList = document.createElement('div');
  wordList.id = 'lb-glossary-word-list';
  wordList.innerHTML = '<div class="lb-glossary-empty">Loading vocabulary...</div>';
  glossary.appendChild(wordList);

  // Audio cache + flagged words tracker
  const audioCache = {};
  const flaggedWords = new Set();

  const FLAG_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>';
  const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#10b981"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

  // Candidate words for this selection (computed once).
  const _glossWords = [...new Set(
    this.selectedText.split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z'-]/g, '').toLowerCase())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )].slice(0, 12);

  // Fetch each word ONCE; tier switches then just filter this cache (instant).
  const wordCache = {};
  const loadAllWords = async () => {
    // Wait a tick so showTranslationTooltip finishes inserting the tooltip into
    // the DOM — otherwise the "still open?" guard below is false on the first
    // pass and nothing gets fetched.
    await new Promise(r => setTimeout(r, 0));
    for (const word of _glossWords) {
      if (!wordList.isConnected) return; // tooltip was closed mid-fetch
      try {
        const res = await window.LBTranslationService.translate(word, this.userLanguage);
        if (res && !res.error) wordCache[word] = res;
      } catch (err) { /* skip */ }
      await new Promise(r => setTimeout(r, 150));
    }
  };

  // Render a tier from the cache — instant, no network.
  const loadTier = (band) => {
    wordList.innerHTML = '';
    let found = false;

    for (const word of _glossWords) {
      try {
        const res = wordCache[word];
        if (!res || res.error) continue;

        // Tier by the lexicon grade_band when this word is a known academic term;
        // otherwise fall back to syllable complexity so every tier gets words
        // (multisyllabic → higher grade). This fixes the empty 3-5 tier.
        const lexBand = _VALID_BANDS.has(res.gradeBand) ? res.gradeBand : null;
        const wordBand = lexBand || _bandFromSyllables(_countSyllables(word));
        if (wordBand !== band) continue;

        found = true;
        const langInfo = window.LB_LANGUAGES[this.userLanguage];
        const dir = langInfo?.rtl ? 'rtl' : 'ltr';
        const cognateText = res.cognate || '';
        const isFlagged = flaggedWords.has(word);

        const row = document.createElement('div');
        row.className = 'lb-glossary-item';
        row.style.borderLeftColor = TIER_BANDS.find(t => t.band === band)?.color || '#10b981';
        row.innerHTML = `
          <div class="lb-vocab-pair">
            <div class="lb-vocab-english">
              <span class="lb-vocab-word">${window.escapeHtml(word)}</span>
              <button class="lb-vocab-audio lb-en-audio" data-word="${window.escapeHtml(word)}" data-lang="english" title="Listen in English">&#9654;</button>
            </div>
            <span class="lb-vocab-arrow">\u2192</span>
            <div class="lb-vocab-translated">
              <span class="lb-vocab-word" dir="${dir}">${window.escapeHtml(cognateText)}</span>
              <button class="lb-vocab-audio lb-cognate-audio" data-word="${window.escapeHtml(cognateText)}" data-lang="${this.userLanguage}" title="Listen">&#9654;</button>
              <button class="lb-vocab-flag" data-word="${window.escapeHtml(word)}" title="Flag this word" ${isFlagged ? 'disabled' : ''}>
                ${isFlagged ? CHECK_SVG : FLAG_SVG}
              </button>
            </div>
          </div>
          ${res.bridgeAnchor ? `<div class="lb-vocab-bridge">${window.escapeHtml(res.bridgeAnchor)}</div>` : ''}
        `;
        wordList.appendChild(row);
        if (res.audioUrl) audioCache[cognateText] = res.audioUrl;
      } catch (err) { /* skip */ }
    }

    if (!found) wordList.innerHTML = `<div class="lb-glossary-empty">No words at this grade. Try another tier.</div>`;

    // Wire audio buttons
    wordList.querySelectorAll('.lb-en-audio').forEach(btn => {
      btn.addEventListener('click', async (e) => { e.stopPropagation(); btn.textContent = '...'; await window.LBTTSService?.generateAndPlay(btn.dataset.word, 'english'); btn.innerHTML = '&#9654;'; });
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

    // Wire flag buttons
    wordList.querySelectorAll('.lb-vocab-flag').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const word = btn.dataset.word;
        btn.innerHTML = '...';
        btn.disabled = true;
        await this.reportProblem(word, 'translation');
        flaggedWords.add(word);
        btn.innerHTML = CHECK_SVG;
        btn.title = 'Flagged';
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

  // Flag entire translation button at bottom
  const flagAllBtn = document.createElement('button');
  flagAllBtn.className = 'lb-flag-all-btn';
  flagAllBtn.textContent = 'Flag Entire Translation';
  flagAllBtn.addEventListener('click', async () => {
    flagAllBtn.textContent = 'Sending...';
    flagAllBtn.disabled = true;
    const r = await this.reportProblem(this.selectedText, 'translation');
    flagAllBtn.textContent = (r && r.ok) ? 'Flagged! Thank you' : 'Could not send — try again';
    if (r && r.ok) flagAllBtn.classList.add('lb-flagged'); else flagAllBtn.disabled = false;
  });
  glossary.appendChild(flagAllBtn);

  // Fetch all words once, then show the first tier. Switching tiers is instant after.
  (async () => { await loadAllWords(); loadTier(TIER_BANDS[0].band); })();

  tab.appendChild(glossary);
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
