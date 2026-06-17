/**
 * LanguageBridge - Floating Translator (Talk to Teacher)
 * Full-featured: student/teacher zones, conversation history, language controls,
 * clear, stop, and auto-sync with toolbar language.
 */
(function () {
  // State
  let studentLang = window.LBState?.language || 'dari';
  let teacherLang = 'english';
  let conversationHistory = [];
  let isRecording = false;
  let activeZone = null;

  const panel = document.createElement('div');
  panel.id = 'lb-floating-translator';
  panel.className = 'lb-floating-translator';
  panel.style.cssText = 'display: none; top: 20px; right: 20px;';

  function buildLanguageOptions(selectedLang) {
    return Object.entries(window.LB_LANGUAGES).map(([code, lang]) =>
      `<option value="${code}" ${code === selectedLang ? 'selected' : ''}>${lang.nativeLabel} ${lang.label}</option>`
    ).join('');
  }

  panel.innerHTML = `
    <div class="lb-float-header">
      <span class="lb-float-drag-handle">\u22EE\u22EE</span>
      <span class="lb-header-title">Talk to Teacher</span>
      <button class="lb-float-close" id="lb-float-close">\u00D7</button>
    </div>
    <div class="lb-float-body">
      <button class="lb-speaker-zone lb-student-zone" id="lb-student-zone">
        <div class="lb-speaker-header">
          <span class="lb-speaker-icon">\uD83D\uDC66</span>
          <span class="lb-speaker-label">Student</span>
        </div>
        <div class="lb-speaker-content">
          <div class="lb-speaker-text" id="lb-student-text">Tap to speak in your language</div>
          <div class="lb-speaker-lang" id="lb-student-lang-label"></div>
        </div>
        <svg class="lb-speaker-mic" width="48" height="48" viewBox="0 0 24 24" fill="white">
          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
        </svg>
      </button>
      <button class="lb-speaker-zone lb-teacher-zone" id="lb-teacher-zone">
        <div class="lb-speaker-header">
          <span class="lb-speaker-icon">\uD83D\uDC69\u200D\uD83C\uDFEB</span>
          <span class="lb-speaker-label">Teacher</span>
        </div>
        <div class="lb-speaker-content">
          <div class="lb-speaker-text" id="lb-teacher-text">Tap to speak in English</div>
          <div class="lb-speaker-lang" id="lb-teacher-lang-label">English</div>
        </div>
        <svg class="lb-speaker-mic" width="48" height="48" viewBox="0 0 24 24" fill="white">
          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
        </svg>
      </button>
    </div>
    <div class="lb-conversation-controls">
      <button class="lb-control-btn" id="lb-ttt-stop" title="Stop recording">\u23F9</button>
      <button class="lb-control-btn" id="lb-ttt-history" title="View conversation">\uD83D\uDCDC</button>
      <button class="lb-control-btn" id="lb-ttt-clear" title="Clear conversation">\uD83D\uDDD1</button>
      <button class="lb-control-btn" id="lb-ttt-settings" title="Language settings">\u2699\uFE0F</button>
    </div>
    <!-- Language Settings Panel (hidden) -->
    <div id="lb-ttt-lang-panel" style="display: none; padding: 16px; background: rgba(0,0,0,0.2); border-top: 1px solid rgba(255,255,255,0.1);">
      <div style="margin-bottom: 12px;">
        <label style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 6px; color: rgba(255,255,255,0.8);">Student Language</label>
        <select id="lb-ttt-student-lang" style="width: 100%; padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); color: white; font-size: 14px;">
        </select>
      </div>
      <div>
        <label style="font-size: 12px; font-weight: 600; display: block; margin-bottom: 6px; color: rgba(255,255,255,0.8);">Teacher Language</label>
        <select id="lb-ttt-teacher-lang" style="width: 100%; padding: 8px; border-radius: 8px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.2); color: white; font-size: 14px;">
        </select>
      </div>
    </div>
    <!-- Conversation History Panel (hidden) -->
    <div id="lb-ttt-history-panel" class="lb-history-modal" style="display: none;">
      <div class="lb-history-header">
        <h3>Conversation</h3>
        <button class="lb-history-close" id="lb-ttt-history-close">\u00D7</button>
      </div>
      <div class="lb-history-body" id="lb-ttt-history-body">
        <div class="lb-history-empty">No conversation yet. Tap a mic to start.</div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  // Populate language selects
  const studentSelect = panel.querySelector('#lb-ttt-student-lang');
  const teacherSelect = panel.querySelector('#lb-ttt-teacher-lang');
  studentSelect.innerHTML = buildLanguageOptions(studentLang);
  teacherSelect.innerHTML = buildLanguageOptions(teacherLang);

  // Style select options for dark background
  [studentSelect, teacherSelect].forEach(sel => {
    sel.querySelectorAll('option').forEach(opt => {
      opt.style.background = '#4a1a45';
      opt.style.color = 'white';
    });
  });

  function updateLabels() {
    const sLang = window.LB_LANGUAGES[studentLang];
    const tLang = window.LB_LANGUAGES[teacherLang];
    const sLabel = panel.querySelector('#lb-student-lang-label');
    const tLabel = panel.querySelector('#lb-teacher-lang-label');
    if (sLabel && sLang) sLabel.textContent = `${sLang.nativeLabel} ${sLang.label}`;
    if (tLabel && tLang) tLabel.textContent = `${tLang.nativeLabel} ${tLang.label}`;
  }
  updateLabels();

  // Language change handlers
  studentSelect.addEventListener('change', () => {
    studentLang = studentSelect.value;
    updateLabels();
    // Also update toolbar language
    if (window.__lbToolbar) {
      window.__lbToolbar.userLanguage = studentLang;
      window.__lbToolbar.updateLanguageDisplay();
      window.LBState.language = studentLang;
      chrome.storage.sync.set({ defaultLanguage: studentLang });
    }
  });

  teacherSelect.addEventListener('change', () => {
    teacherLang = teacherSelect.value;
    updateLabels();
  });

  // Sync when toolbar language changes
  window.addEventListener('lb-language-changed', (e) => {
    studentLang = window.LBState.language;
    studentSelect.value = studentLang;
    updateLabels();
  });

  // Close
  panel.querySelector('#lb-float-close').addEventListener('click', () => { panel.style.display = 'none'; });

  // Draggable
  const header = panel.querySelector('.lb-float-header');
  let isDragging = false, startX, startY, origLeft, origTop;
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.lb-float-close')) return;
    isDragging = true; startX = e.clientX; startY = e.clientY;
    origLeft = panel.offsetLeft; origTop = panel.offsetTop; e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    panel.style.left = `${origLeft + (e.clientX - startX)}px`;
    panel.style.top = `${origTop + (e.clientY - startY)}px`;
    panel.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { isDragging = false; });

  // Add message to conversation
  function addMessage(speaker, originalText, translatedText) {
    const entry = { speaker, originalText, translatedText, time: new Date().toLocaleTimeString() };
    conversationHistory.push(entry);
    updateHistoryPanel();
  }

  function updateHistoryPanel() {
    const body = panel.querySelector('#lb-ttt-history-body');
    if (!conversationHistory.length) {
      body.innerHTML = '<div class="lb-history-empty">No conversation yet. Tap a mic to start.</div>';
      return;
    }
    body.innerHTML = conversationHistory.map(e => `
      <div class="lb-history-entry ${e.translatedText ? 'translated' : 'original'}">
        <div class="lb-history-entry-header">
          <span class="lb-history-entry-icon">${e.speaker === 'student' ? '\uD83D\uDC66' : '\uD83D\uDC69\u200D\uD83C\uDFEB'}</span>
          <span class="lb-history-entry-lang">${e.speaker === 'student' ? 'Student' : 'Teacher'}</span>
          <span class="lb-history-entry-time">${e.time}</span>
        </div>
        <div class="lb-history-entry-text">${window.escapeHtml(e.originalText)}</div>
        ${e.translatedText ? `<div class="lb-history-entry-text" style="opacity: 0.8; font-style: italic; margin-top: 4px;">\u2192 ${window.escapeHtml(e.translatedText)}</div>` : ''}
      </div>
    `).join('');
    body.scrollTop = body.scrollHeight;
  }

  // Translate text via /translate endpoint (not lexicon-lookup \u2014 this is plain translation)
  async function translateText(text, fromLanguage, toLanguage) {
    if (!window.LBRateLimiter.check('translate', window.CONFIG.rateLimits.translatePerMinute)) {
      return { error: 'Translation rate limit reached. Please wait.' };
    }
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'translate',
        body: {
          text,
          fromLanguage,
          toLanguage,
          studentCode: window.LBState.studentCode,
        },
      });
      if (!res) return { error: 'No response from extension.' };
      if (!res.ok) {
        const errCode = res.data?.error || res.error || '';
        LBLog.warn('Translate error:', errCode, res.data?.details);
        if (errCode === 'REQUEST_TIMEOUT') return { error: 'Translation timed out. Try again.' };
        return { error: res.data?.details || errCode || 'Translation failed.' };
      }
      const translated = res.data?.translation || res.data?.translatedText || res.data?.text || '';
      if (!translated) {
        LBLog.warn('Translate returned empty. Full data:', JSON.stringify(res.data));
        return { error: 'No translation returned. Try again.' };
      }
      return { text: translated };
    } catch (err) {
      LBLog.error('Translate failed:', err);
      return { error: 'Translation failed.' };
    }
  }

  let isProcessing = false;

  // Full pipeline: record \u2192 transcribe \u2192 translate \u2192 display \u2192 speak
  async function processSpeech(zone, textEl, speakerType) {
    if (isProcessing) return;
    isProcessing = true;

    zone.classList.remove('listening');
    zone.classList.add('translating');
    isRecording = false;
    activeZone = null;

    const fromLang = speakerType === 'student' ? studentLang : teacherLang;
    const toLang = speakerType === 'student' ? teacherLang : studentLang;
    const defaultPrompt = speakerType === 'student' ? 'Tap to speak in your language' : 'Tap to speak in English';

    function done(message, delay) {
      zone.classList.remove('translating');
      isProcessing = false;
      if (message) {
        textEl.textContent = message;
        if (delay) setTimeout(() => { textEl.textContent = defaultPrompt; }, delay);
      }
    }

    try {
      // Step 1: Stop recording and get audio blob
      textEl.textContent = 'Processing audio...';
      LBLog.info(`TTT Step 1: stopping recording (${speakerType}, ${fromLang} \u2192 ${toLang})`);
      const audioBlob = await window.LBSTTService?.stopRecording();
      if (!audioBlob || audioBlob.size < 100) {
        done('No audio captured. Try again.', 3000);
        return;
      }
      LBLog.info(`TTT Step 1 done: ${(audioBlob.size / 1024).toFixed(1)} KB`);

      // Step 2: Transcribe audio \u2192 text
      textEl.textContent = 'Recognizing speech...';
      LBLog.info('TTT Step 2: transcribing...');
      const sttResult = await window.LBSTTService.transcribe(audioBlob, fromLang);
      LBLog.info('TTT Step 2 result:', JSON.stringify(sttResult));
      if (sttResult.error) {
        done(sttResult.error, 4000);
        return;
      }

      const spokenText = sttResult.text;
      textEl.textContent = spokenText;

      // Step 3: Translate to the other language
      const otherTextEl = panel.querySelector(speakerType === 'student' ? '#lb-teacher-text' : '#lb-student-text');
      otherTextEl.textContent = 'Translating...';
      LBLog.info(`TTT Step 3: translating "${spokenText.substring(0, 30)}..." (${fromLang} \u2192 ${toLang})`);
      const translateResult = await translateText(spokenText, fromLang, toLang);
      LBLog.info('TTT Step 3 result:', JSON.stringify(translateResult));
      if (translateResult.error) {
        otherTextEl.textContent = translateResult.error;
        addMessage(speakerType, spokenText, null);
        done(null);
        setTimeout(() => { otherTextEl.textContent = speakerType === 'student' ? 'Tap to speak in English' : 'Tap to speak in your language'; }, 4000);
        return;
      }

      const translatedText = translateResult.text;
      otherTextEl.textContent = translatedText;
      addMessage(speakerType, spokenText, translatedText);
      done(null);

      // Step 4: Play translated text as audio
      LBLog.info(`TTT Step 4: playing TTS for "${translatedText.substring(0, 30)}..." in ${toLang}`);
      try {
        await window.LBTTSService?.generateAndPlay(translatedText, toLang);
      } catch (ttsErr) {
        LBLog.warn('TTS playback failed (non-fatal):', ttsErr);
      }
    } catch (err) {
      LBLog.error('TTT pipeline error:', err);
      done('Something went wrong. Try again.', 4000);
    }
  }

  // Student mic zone
  panel.querySelector('#lb-student-zone').addEventListener('click', async () => {
    if (isProcessing) return;
    const zone = panel.querySelector('#lb-student-zone');
    const textEl = panel.querySelector('#lb-student-text');

    if (isRecording && activeZone === 'student') {
      await processSpeech(zone, textEl, 'student');
    } else if (!isRecording) {
      const result = await window.LBSTTService?.startRecording();
      if (result?.error) { textEl.textContent = result.error; return; }
      isRecording = true;
      activeZone = 'student';
      zone.classList.add('listening');
      textEl.textContent = 'Listening... Tap to stop';
    }
  });

  // Teacher mic zone
  panel.querySelector('#lb-teacher-zone').addEventListener('click', async () => {
    if (isProcessing) return;
    const zone = panel.querySelector('#lb-teacher-zone');
    const textEl = panel.querySelector('#lb-teacher-text');

    if (isRecording && activeZone === 'teacher') {
      await processSpeech(zone, textEl, 'teacher');
    } else if (!isRecording) {
      const result = await window.LBSTTService?.startRecording();
      if (result?.error) { textEl.textContent = result.error; return; }
      isRecording = true;
      activeZone = 'teacher';
      zone.classList.add('listening');
      textEl.textContent = 'Listening... Tap to stop';
    }
  });

  // Stop button
  panel.querySelector('#lb-ttt-stop').addEventListener('click', async () => {
    if (isRecording) {
      await window.LBSTTService?.stopRecording();
      isRecording = false;
      isProcessing = false;
      const zone = panel.querySelector(activeZone === 'student' ? '#lb-student-zone' : '#lb-teacher-zone');
      zone?.classList.remove('listening', 'translating');
      panel.querySelector('#lb-student-text').textContent = 'Tap to speak in your language';
      panel.querySelector('#lb-teacher-text').textContent = 'Tap to speak in English';
      activeZone = null;
    }
    window.LBTTSService?.stop();
  });

  // History button
  panel.querySelector('#lb-ttt-history').addEventListener('click', () => {
    const histPanel = panel.querySelector('#lb-ttt-history-panel');
    histPanel.style.display = histPanel.style.display === 'none' ? 'flex' : 'none';
  });

  panel.querySelector('#lb-ttt-history-close').addEventListener('click', () => {
    panel.querySelector('#lb-ttt-history-panel').style.display = 'none';
  });

  // Clear button
  panel.querySelector('#lb-ttt-clear').addEventListener('click', () => {
    conversationHistory = [];
    updateHistoryPanel();
    panel.querySelector('#lb-student-text').textContent = 'Tap to speak in your language';
    panel.querySelector('#lb-teacher-text').textContent = 'Tap to speak in English';
  });

  // Settings (language) toggle
  panel.querySelector('#lb-ttt-settings').addEventListener('click', () => {
    const langPanel = panel.querySelector('#lb-ttt-lang-panel');
    langPanel.style.display = langPanel.style.display === 'none' ? 'block' : 'none';
  });

  // Listen for toggle from toolbar/popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle-floating-translator') {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      studentLang = window.LBState?.language || studentLang;
      studentSelect.value = studentLang;
      updateLabels();
    }
  });

  // Expose for toolbar's Talk button
  window.FloatingTranslator = {
    show() {
      panel.style.display = 'flex';
      studentLang = window.LBState?.language || studentLang;
      studentSelect.value = studentLang;
      updateLabels();
    },
    hide() { panel.style.display = 'none'; },
    setStudentLanguage(lang) {
      studentLang = lang;
      studentSelect.value = lang;
      updateLabels();
    },
  };

  LBLog.info('Floating translator loaded');
})();
