/**
 * LanguageBridge - Talk to Teacher (face-to-face voice translator)
 *
 * Vertical, two-zone layout meant to sit flat between two people: the TOP zone
 * is rotated 180° for the person across the table. Tap anywhere in a zone to
 * record, tap again (or STOP) to translate. Up to 45s per turn. Each zone has
 * its own on-face language picker — no settings menu. Built for a child to use.
 */
(function () {
  const MAX_RECORD_MS = 45000;

  // Languages: bottom = "me" (student), top = "partner" (teacher/parent).
  let myLang = window.LBState?.language || 'dari';
  let partnerLang = 'english';

  let recording = false;
  let processing = false;
  let activeZone = null;      // 'top' | 'bottom'
  let autoStopTimer = null;
  let countdownTimer = null;

  const panel = document.createElement('div');
  panel.id = 'lb-floating-translator';
  panel.className = 'lb-ttt-panel';
  panel.style.display = 'none';

  const MIC_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" width="44" height="44">' +
    '<path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>';

  function zoneHTML(zoneKey) {
    return (
      '<div class="lb-ttt-zone lb-ttt-' + zoneKey + '" data-zone="' + zoneKey + '">' +
        '<button class="lb-ttt-lang-pill" data-zone="' + zoneKey + '" type="button">' +
          '<span class="lb-ttt-lang-native"></span><span class="lb-ttt-lang-name"></span><span class="lb-ttt-chev">▾</span>' +
        '</button>' +
        '<button class="lb-ttt-stage" data-zone="' + zoneKey + '" type="button">' +
          '<div class="lb-ttt-status">TAP TO TALK</div>' +
          '<div class="lb-ttt-visual"><span class="lb-ttt-ring"></span><span class="lb-ttt-mic">' + MIC_SVG + '</span></div>' +
          '<div class="lb-ttt-spinner"></div>' +
          '<div class="lb-ttt-timer"></div>' +
        '</button>' +
        '<button class="lb-ttt-stop" data-zone="' + zoneKey + '" type="button">■ STOP</button>' +
        '<button class="lb-ttt-micfix" data-zone="' + zoneKey + '" type="button">Turn on microphone</button>' +
        '<div class="lb-ttt-picker" data-zone="' + zoneKey + '"></div>' +
      '</div>'
    );
  }

  panel.innerHTML =
    zoneHTML('top') +
    '<div class="lb-ttt-divider"><span class="lb-ttt-brand">LanguageBridge</span>' +
      '<button class="lb-ttt-close" id="lb-ttt-close" type="button" title="Close">×</button></div>' +
    zoneHTML('bottom');

  document.body.appendChild(panel);

  // ── Helpers ────────────────────────────────────────────────────────
  const zoneEl = (z) => panel.querySelector('.lb-ttt-' + z);
  const langOf = (z) => (z === 'bottom' ? myLang : partnerLang);
  const otherZone = (z) => (z === 'bottom' ? 'top' : 'bottom');

  function langInfo(code) {
    return window.LB_LANGUAGES[code] || { label: code, nativeLabel: code, rtl: false };
  }

  function renderPill(z) {
    const info = langInfo(langOf(z));
    const pill = zoneEl(z).querySelector('.lb-ttt-lang-pill');
    pill.querySelector('.lb-ttt-lang-native').textContent = info.nativeLabel;
    pill.querySelector('.lb-ttt-lang-name').textContent = info.label;
  }

  function buildPicker(z) {
    const picker = zoneEl(z).querySelector('.lb-ttt-picker');
    const current = langOf(z);
    picker.innerHTML = Object.entries(window.LB_LANGUAGES).map(([code, info]) =>
      '<button class="lb-ttt-picker-opt' + (code === current ? ' selected' : '') + '" data-zone="' + z + '" data-code="' + code + '" type="button">' +
        '<span class="lb-ttt-lang-native">' + window.escapeHtml(info.nativeLabel) + '</span>' +
        '<span class="lb-ttt-lang-name">' + window.escapeHtml(info.label) + '</span>' +
      '</button>'
    ).join('');
  }

  function setStatus(z, text, opts) {
    opts = opts || {};
    const zEl = zoneEl(z);
    const statusEl = zEl.querySelector('.lb-ttt-status');
    statusEl.textContent = text;
    const info = langInfo(langOf(z));
    statusEl.setAttribute('dir', opts.translatedText && info.rtl ? 'rtl' : 'auto');
    statusEl.classList.toggle('lb-ttt-result', !!opts.result);
  }

  function setZoneMode(z, mode) {
    // mode: 'idle' | 'recording' | 'processing' | 'speaking'
    const zEl = zoneEl(z);
    zEl.classList.remove('recording', 'processing', 'speaking');
    if (mode !== 'idle') zEl.classList.add(mode);
  }

  function setOtherDisabled(z, disabled) {
    zoneEl(otherZone(z)).classList.toggle('disabled', disabled);
  }

  function showTimer(z, show) {
    zoneEl(z).querySelector('.lb-ttt-timer').style.display = show ? 'block' : 'none';
  }

  function showMicFix(z, show) {
    zoneEl(z).querySelector('.lb-ttt-micfix').style.display = show ? 'block' : 'none';
  }

  function resetZone(z) {
    setZoneMode(z, 'idle');
    showTimer(z, false);
    showMicFix(z, false);
    setStatus(z, 'TAP TO TALK');
  }

  function closeAllPickers() {
    panel.querySelectorAll('.lb-ttt-picker.open').forEach((p) => p.classList.remove('open'));
  }

  // ── Language picker ────────────────────────────────────────────────
  function togglePicker(z) {
    const picker = zoneEl(z).querySelector('.lb-ttt-picker');
    const isOpen = picker.classList.contains('open');
    closeAllPickers();
    if (!isOpen) { buildPicker(z); picker.classList.add('open'); }
  }

  function selectLanguage(z, code) {
    if (!window.LB_LANGUAGES[code]) return;
    if (z === 'bottom') {
      myLang = code;
      window.LBState.language = code;
      try { chrome.storage.sync.set({ defaultLanguage: code }); } catch (e) { /* noop */ }
      if (window.__lbToolbar) {
        window.__lbToolbar.userLanguage = code;
        window.__lbToolbar.updateLanguageDisplay?.();
      }
    } else {
      partnerLang = code;
      try { chrome.storage.sync.set({ tttPartnerLang: code }); } catch (e) { /* noop */ }
    }
    renderPill(z);
    closeAllPickers();
  }

  // ── Recording flow ─────────────────────────────────────────────────
  async function startFlow(z) {
    if (recording || processing) return;
    closeAllPickers();
    showMicFix(z, false);

    const start = await window.LBSTTService.startRecording();
    if (start.error) {
      setStatus(z, start.error);
      if (start.code === 'mic-permission' || start.code === 'no-mic') showMicFix(z, true);
      return;
    }

    recording = true;
    activeZone = z;
    setOtherDisabled(z, true);
    setZoneMode(z, 'recording');
    setStatus(z, 'Listening…  Tap to translate');

    // 45s countdown + auto-stop.
    const startedAt = Date.now();
    showTimer(z, true);
    const tick = () => {
      const left = Math.max(0, Math.ceil((MAX_RECORD_MS - (Date.now() - startedAt)) / 1000));
      const t = zoneEl(z).querySelector('.lb-ttt-timer');
      if (t) t.textContent = left + 's';
    };
    tick();
    countdownTimer = setInterval(tick, 250);
    autoStopTimer = setTimeout(() => stopFlow(), MAX_RECORD_MS);
  }

  async function stopFlow() {
    if (!recording || processing) return;
    const z = activeZone;
    recording = false;
    processing = true;
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    showTimer(z, false);

    const target = otherZone(z);
    const fromLang = langOf(z);
    const toLang = langOf(target);

    // Source zone: show we're working on the audio.
    setZoneMode(z, 'processing');
    setStatus(z, 'Got it…');

    const audio = await window.LBSTTService.stopRecording();
    if (audio.error) {
      finishWithError(z, audio);
      return;
    }

    // Silence / loudness diagnostics from the offscreen level analysis.
    if (audio.peak !== undefined && audio.peak < 0.02) {
      finishWithError(z, { error: "I didn't hear anything. Check your sound is on and speak toward the mic.", code: 'silence' });
      return;
    }
    const noisy = audio.clipRatio !== undefined && audio.clipRatio > 0.25;

    // Transcribe.
    const stt = await window.LBSTTService.transcribe(audio.wavBase64, fromLang);
    if (stt.error) {
      const msg = stt.code === 'empty'
        ? (noisy ? "Too much background noise — try somewhere quieter." : "I couldn't make that out. Try again.")
        : stt.error;
      finishWithError(z, { error: msg, code: stt.code });
      return;
    }

    // Source zone shows what was heard.
    setZoneMode(z, 'idle');
    setStatus(z, stt.text, { result: true });

    // Target zone: spinner while translating, then the result + audio.
    setOtherDisabled(z, false);
    setZoneMode(target, 'processing');
    setStatus(target, 'Translating…');

    const tr = await translateText(stt.text, fromLang, toLang);
    if (tr.error) {
      setZoneMode(target, 'idle');
      setStatus(target, tr.error);
      processing = false;
      return;
    }

    setZoneMode(target, 'speaking');
    setStatus(target, tr.text, { result: true, translatedText: true });

    try {
      await window.LBTTSService?.generateAndPlay(tr.text, toLang);
    } catch (e) {
      LBLog.warn('TTS playback failed (non-fatal):', e);
    }
    setZoneMode(target, 'idle');
    processing = false;
  }

  function finishWithError(z, res) {
    setZoneMode(z, 'idle');
    setOtherDisabled(z, false);
    setStatus(z, res.error);
    if (res.code === 'mic-permission' || res.code === 'no-mic') showMicFix(z, true);
    processing = false;
    activeZone = null;
  }

  async function translateText(text, fromLanguage, toLanguage) {
    if (!window.LBRateLimiter.check('translate', window.CONFIG.rateLimits.translatePerMinute)) {
      return { error: 'Slow down a moment, then try again.' };
    }
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'translate',
        body: { text, fromLanguage, toLanguage, studentCode: window.LBState.studentCode },
      });
      if (!res) return { error: 'No response. Try again.' };
      if (!res.ok) {
        const code = res.data?.error || res.error || '';
        LBLog.warn('Translate error:', code, res.data?.details || '');
        if (code === 'REQUEST_TIMEOUT') return { error: 'That took too long. Try again.' };
        return { error: 'Translation failed. Try again.' };
      }
      const out = (res.data?.translatedText || res.data?.translation || res.data?.text || '').trim();
      if (!out) return { error: 'No translation came back. Try again.' };
      return { text: out };
    } catch (err) {
      LBLog.error('Translate failed:', err);
      return { error: 'Translation failed. Try again.' };
    }
  }

  // ── Event wiring (delegated) ───────────────────────────────────────
  panel.addEventListener('click', (e) => {
    const pill = e.target.closest('.lb-ttt-lang-pill');
    if (pill) { e.stopPropagation(); togglePicker(pill.dataset.zone); return; }

    const opt = e.target.closest('.lb-ttt-picker-opt');
    if (opt) { e.stopPropagation(); selectLanguage(opt.dataset.zone, opt.dataset.code); return; }

    const stop = e.target.closest('.lb-ttt-stop');
    if (stop) { e.stopPropagation(); if (recording && activeZone === stop.dataset.zone) stopFlow(); return; }

    const micfix = e.target.closest('.lb-ttt-micfix');
    if (micfix) { e.stopPropagation(); window.LBSTTService.requestMicPermission(); setStatus(micfix.dataset.zone, 'Opening permission tab… then tap to talk.'); return; }

    const stage = e.target.closest('.lb-ttt-stage');
    if (stage) {
      const z = stage.dataset.zone;
      if (zoneEl(z).classList.contains('disabled')) return;
      if (recording && activeZone === z) stopFlow();
      else if (!recording && !processing) startFlow(z);
      return;
    }

    closeAllPickers();
  });

  panel.querySelector('#lb-ttt-close').addEventListener('click', () => hide());

  // ── Public API + toolbar/shortcut integration ──────────────────────
  function show() {
    myLang = window.LBState?.language || myLang;
    renderPill('top'); renderPill('bottom');
    resetZone('top'); resetZone('bottom');
    panel.style.display = 'flex';
  }
  function hide() {
    if (recording) { window.LBSTTService.stopRecording().catch(() => {}); }
    window.LBTTSService?.stop?.();
    recording = false; processing = false; activeZone = null;
    if (autoStopTimer) clearTimeout(autoStopTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    panel.style.display = 'none';
  }

  // Load saved partner language, then paint pills.
  try {
    chrome.storage.sync.get(['tttPartnerLang'], (d) => {
      if (d.tttPartnerLang && window.LB_LANGUAGES[d.tttPartnerLang]) partnerLang = d.tttPartnerLang;
      renderPill('top'); renderPill('bottom');
    });
  } catch (e) { renderPill('top'); renderPill('bottom'); }

  window.addEventListener('lb-language-changed', () => {
    myLang = window.LBState.language;
    renderPill('bottom');
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle-floating-translator') {
      panel.style.display === 'none' ? show() : hide();
    }
  });

  window.FloatingTranslator = {
    show,
    hide,
    setStudentLanguage(lang) { if (window.LB_LANGUAGES[lang]) { myLang = lang; renderPill('bottom'); } },
  };

  LBLog.info('Talk to Teacher (face-to-face) loaded');
})();
