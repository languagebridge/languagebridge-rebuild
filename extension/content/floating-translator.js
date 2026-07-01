/**
 * LanguageBridge - Talk to Teacher (one-computer, two-person voice translator)
 *
 * Upright, same-orientation conversation UI for two people sharing one screen:
 * a scrolling chat transcript plus two labeled mic buttons (one per language).
 * Each person taps THEIR language, speaks, and the app transcribes → translates
 * → shows it in the transcript and reads it aloud in the other language.
 * Manual turn-taking (no language auto-detection). Built for a child to use.
 */
(function () {
  const MAX_RECORD_MS = 45000;

  // Two sides. A defaults to English (teacher/partner), B to the student's language.
  let langA = 'english';
  let langB = window.LBState?.language || 'dari';

  let recording = false;
  let processing = false;
  let activeSide = null;       // 'A' | 'B'
  let autoStopTimer = null;
  let countdownTimer = null;

  const panel = document.createElement('div');
  panel.id = 'lb-floating-translator';
  panel.className = 'lb-ttt-panel';
  panel.style.display = 'none';

  const MIC_SVG =
    '<svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26">' +
    '<path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>';

  function sideHTML(side) {
    return (
      '<div class="lb-ttt-side" data-side="' + side + '">' +
        '<button class="lb-ttt-langchip" data-side="' + side + '" type="button">' +
          '<span class="lb-ttt-langname"></span><span class="lb-ttt-chev">▾</span>' +
        '</button>' +
        '<button class="lb-ttt-mic" data-side="' + side + '" type="button">' + MIC_SVG +
          '<span class="lb-ttt-mic-label">Tap to talk</span>' +
        '</button>' +
      '</div>'
    );
  }

  panel.innerHTML =
    '<div class="lb-ttt-header">' +
      '<span class="lb-ttt-title">Talk to Teacher</span>' +
      '<button class="lb-ttt-close" id="lb-ttt-close" type="button" title="Close">×</button>' +
    '</div>' +
    '<div class="lb-ttt-transcript" id="lb-ttt-transcript">' +
      '<div class="lb-ttt-empty">Tap a language below and start talking.</div>' +
    '</div>' +
    '<div class="lb-ttt-statusbar" id="lb-ttt-statusbar"></div>' +
    '<button class="lb-ttt-stop" id="lb-ttt-stop" type="button">■ Stop &amp; translate</button>' +
    '<div class="lb-ttt-footer">' + sideHTML('A') + sideHTML('B') + '</div>' +
    '<div class="lb-ttt-picker" id="lb-ttt-picker"></div>';

  document.body.appendChild(panel);

  // ── Helpers ────────────────────────────────────────────────────────
  const $ = (sel) => panel.querySelector(sel);
  const sideLang = (side) => (side === 'A' ? langA : langB);
  const otherLang = (side) => (side === 'A' ? langB : langA);
  const langInfo = (code) => window.LB_LANGUAGES[code] || { label: code, nativeLabel: code, rtl: false };

  function renderLangChips() {
    [['A', langA], ['B', langB]].forEach(([side, code]) => {
      const info = langInfo(code);
      const chip = panel.querySelector('.lb-ttt-langchip[data-side="' + side + '"] .lb-ttt-langname');
      if (chip) chip.textContent = info.nativeLabel === info.label ? info.label : `${info.nativeLabel} ${info.label}`;
    });
  }

  function setStatus(text, kind) {
    const bar = $('#lb-ttt-statusbar');
    bar.textContent = text || '';
    bar.className = 'lb-ttt-statusbar' + (kind ? ' lb-ttt-' + kind : '');
    bar.style.display = text ? 'block' : 'none';
  }

  function clearEmpty() {
    const empty = $('.lb-ttt-empty');
    if (empty) empty.remove();
  }

  // Append a conversation bubble. side decides alignment (A left, B right).
  function appendBubble(side, originalText, translatedText, fromLang, toLang) {
    clearEmpty();
    const transcript = $('#lb-ttt-transcript');
    const wrap = document.createElement('div');
    wrap.className = 'lb-ttt-bubble lb-ttt-bubble-' + side;

    const orig = document.createElement('div');
    orig.className = 'lb-ttt-orig';
    orig.setAttribute('dir', langInfo(fromLang).rtl ? 'rtl' : 'ltr');
    orig.textContent = originalText;

    const trans = document.createElement('div');
    trans.className = 'lb-ttt-trans';
    trans.setAttribute('dir', langInfo(toLang).rtl ? 'rtl' : 'ltr');
    trans.textContent = translatedText;

    wrap.appendChild(orig);
    wrap.appendChild(trans);
    transcript.appendChild(wrap);
    transcript.scrollTop = transcript.scrollHeight;
    return wrap;
  }

  // A temporary "working" bubble shown while transcribing/translating.
  function appendPending(side) {
    clearEmpty();
    const transcript = $('#lb-ttt-transcript');
    const wrap = document.createElement('div');
    wrap.className = 'lb-ttt-bubble lb-ttt-bubble-' + side + ' lb-ttt-pending';
    wrap.innerHTML = '<span class="lb-ttt-spinner"></span><span>Translating…</span>';
    transcript.appendChild(wrap);
    transcript.scrollTop = transcript.scrollHeight;
    return wrap;
  }

  function setRecordingUI(side, on) {
    panel.querySelectorAll('.lb-ttt-side').forEach((s) => {
      s.classList.toggle('disabled', on && s.dataset.side !== side);
    });
    const mic = panel.querySelector('.lb-ttt-mic[data-side="' + side + '"]');
    if (mic) mic.classList.toggle('recording', on);
    $('#lb-ttt-stop').style.display = on ? 'block' : 'none';
  }

  // ── Language picker ────────────────────────────────────────────────
  function openPicker(side) {
    const picker = $('#lb-ttt-picker');
    const current = sideLang(side);
    picker.innerHTML = Object.entries(window.LB_LANGUAGES).map(([code, info]) =>
      '<button class="lb-ttt-picker-opt' + (code === current ? ' selected' : '') + '" data-code="' + code + '" type="button">' +
        '<span class="lb-ttt-langname">' + window.escapeHtml(info.nativeLabel) + '</span>' +
        '<span class="lb-ttt-picker-en">' + window.escapeHtml(info.label) + '</span>' +
      '</button>'
    ).join('');
    picker.dataset.side = side;
    picker.classList.add('open');
  }
  function closePicker() { $('#lb-ttt-picker').classList.remove('open'); }

  function selectLanguage(side, code) {
    if (!window.LB_LANGUAGES[code]) return;
    if (side === 'B') {
      langB = code;
      window.LBState.language = code;
      try { chrome.storage.sync.set({ defaultLanguage: code }); } catch (e) { /* noop */ }
      if (window.__lbToolbar) { window.__lbToolbar.userLanguage = code; window.__lbToolbar.updateLanguageDisplay?.(); }
    } else {
      langA = code;
      try { chrome.storage.sync.set({ tttPartnerLang: code }); } catch (e) { /* noop */ }
    }
    renderLangChips();
    closePicker();
  }

  // ── Recording flow ─────────────────────────────────────────────────
  async function startSide(side) {
    if (recording || processing) return;
    closePicker();
    const start = await window.LBSTTService.startRecording();
    if (start.error) {
      setStatus(start.error, 'error');
      if (start.code === 'mic-permission' || start.code === 'no-mic') showMicFix();
      return;
    }
    recording = true;
    activeSide = side;
    setRecordingUI(side, true);

    const startedAt = Date.now();
    const tick = () => {
      const left = Math.max(0, Math.ceil((MAX_RECORD_MS - (Date.now() - startedAt)) / 1000));
      setStatus(`Listening… ${left}s  (tap Stop when done)`, 'listening');
    };
    tick();
    countdownTimer = setInterval(tick, 250);
    autoStopTimer = setTimeout(() => stopAndProcess(), MAX_RECORD_MS);
  }

  async function stopAndProcess() {
    if (!recording || processing) return;
    const side = activeSide;
    recording = false;
    processing = true;
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    setRecordingUI(side, false);
    setStatus('Got it…', 'listening');

    const fromLang = sideLang(side);
    const toLang = otherLang(side);

    const audio = await window.LBSTTService.stopRecording();
    if (audio.error) { finishError(audio); return; }
    if (audio.peak !== undefined && audio.peak < 0.02) {
      finishError({ error: "I didn't hear anything. Check your sound is on and speak toward the mic.", code: 'silence' });
      return;
    }
    const noisy = audio.clipRatio !== undefined && audio.clipRatio > 0.25;

    const pending = appendPending(side);

    const stt = await window.LBSTTService.transcribe(audio.wavBase64, fromLang);
    if (stt.error) {
      pending.remove();
      const msg = stt.code === 'empty'
        ? (noisy ? 'Too much background noise — try somewhere quieter.' : "I couldn't make that out. Try again.")
        : stt.error;
      finishError({ error: msg, code: stt.code });
      return;
    }

    const tr = await translateText(stt.text, fromLang, toLang);
    pending.remove();
    if (tr.error) { finishError(tr); return; }

    appendBubble(side, stt.text, tr.text, fromLang, toLang);
    setStatus('');
    processing = false;
    activeSide = null;

    try { await window.LBTTSService?.generateAndPlay(tr.text, toLang); } catch (e) { LBLog.warn('TTS failed:', e); }
  }

  function finishError(res) {
    setRecordingUI(activeSide, false);
    panel.querySelectorAll('.lb-ttt-side').forEach((s) => s.classList.remove('disabled'));
    setStatus(res.error, 'error');
    if (res.code === 'mic-permission' || res.code === 'no-mic') showMicFix();
    processing = false;
    recording = false;
    activeSide = null;
  }

  function showMicFix() {
    const bar = $('#lb-ttt-statusbar');
    const btn = document.createElement('button');
    btn.className = 'lb-ttt-micfix';
    btn.textContent = 'Turn on microphone';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.LBSTTService.requestMicPermission();
      setStatus('Opening permission tab… then tap a language to talk.', 'listening');
    });
    bar.appendChild(document.createElement('br'));
    bar.appendChild(btn);
    bar.style.display = 'block';
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
        LBLog.warn('Translate error:', res.data?.error, res.data?.details || '');
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
    const chip = e.target.closest('.lb-ttt-langchip');
    if (chip) { e.stopPropagation(); openPicker(chip.dataset.side); return; }

    const opt = e.target.closest('.lb-ttt-picker-opt');
    if (opt) { e.stopPropagation(); selectLanguage($('#lb-ttt-picker').dataset.side, opt.dataset.code); return; }

    const stop = e.target.closest('#lb-ttt-stop');
    if (stop) { e.stopPropagation(); if (recording) stopAndProcess(); return; }

    const mic = e.target.closest('.lb-ttt-mic');
    if (mic) {
      const side = mic.dataset.side;
      if (panel.querySelector('.lb-ttt-side[data-side="' + side + '"]').classList.contains('disabled')) return;
      if (recording && activeSide === side) stopAndProcess();
      else if (!recording && !processing) startSide(side);
      return;
    }
    closePicker();
  });

  $('#lb-ttt-close').addEventListener('click', () => hide());

  // ── Public API + integration ───────────────────────────────────────
  function show() {
    langB = window.LBState?.language || langB;
    renderLangChips();
    setStatus('');
    panel.style.display = 'flex';
  }
  function hide() {
    if (recording) window.LBSTTService.stopRecording().catch(() => {});
    window.LBTTSService?.stop?.();
    recording = false; processing = false; activeSide = null;
    if (autoStopTimer) clearTimeout(autoStopTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    setRecordingUI('A', false); setRecordingUI('B', false);
    panel.style.display = 'none';
  }

  try {
    chrome.storage.sync.get(['tttPartnerLang'], (d) => {
      if (d.tttPartnerLang && window.LB_LANGUAGES[d.tttPartnerLang]) langA = d.tttPartnerLang;
      renderLangChips();
    });
  } catch (e) { renderLangChips(); }

  window.addEventListener('lb-language-changed', () => { langB = window.LBState.language; renderLangChips(); });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle-floating-translator') {
      panel.style.display === 'none' ? show() : hide();
    }
  });

  window.FloatingTranslator = {
    show,
    hide,
    setStudentLanguage(lang) { if (window.LB_LANGUAGES[lang]) { langB = lang; renderLangChips(); } },
  };

  LBLog.info('Talk to Teacher (conversation) loaded');
})();
