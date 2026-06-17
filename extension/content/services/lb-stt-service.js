// extension/content/services/lb-stt-service.js
// Speech-to-Text client for Talk to Teacher.
// Recording happens in the extension's offscreen document (reliable mic capture
// on any page); this service drives it via the background worker, then sends the
// transcoded 16kHz mono WAV to the /speech-to-text API.

window.LBSTTService = {
  isRecording: false,

  // Wrap chrome.runtime.sendMessage in a promise with a timeout.
  _send(message, timeoutMs = 40000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`message timed out after ${timeoutMs / 1000}s`)), timeoutMs);
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });
  },

  // Begin microphone capture in the offscreen document.
  // Returns { success: true } or { error, code }.
  async startRecording() {
    try {
      const r = await this._send({ action: 'ttt-record-start' }, 15000);
      if (r && r.ok) { this.isRecording = true; return { success: true }; }
      this.isRecording = false;
      return { error: this._captureMessage(r && r.errorCode), code: r && r.errorCode };
    } catch (err) {
      LBLog.error('startRecording failed:', err.message);
      this.isRecording = false;
      return { error: 'Could not start the microphone. Try reloading the page.', code: 'offscreen-unavailable' };
    }
  },

  // Stop capture and get the WAV + audio level stats.
  // Returns { wavBase64, durationMs, peak, clipRatio } or { error, code }.
  async stopRecording() {
    this.isRecording = false;
    try {
      const r = await this._send({ action: 'ttt-record-stop' }, 20000);
      if (r && r.ok && r.wavBase64) return r;
      return { error: this._captureMessage(r && r.errorCode), code: (r && r.errorCode) || 'no-audio' };
    } catch (err) {
      LBLog.error('stopRecording failed:', err.message);
      return { error: 'Lost the recording. Please try again.', code: 'offscreen-unavailable' };
    }
  },

  // Open the one-time microphone permission page.
  requestMicPermission() {
    try { chrome.runtime.sendMessage({ action: 'ttt-open-mic-permission' }); } catch (e) { /* noop */ }
  },

  // Map an offscreen capture errorCode to a kid-friendly message.
  _captureMessage(code) {
    switch (code) {
      case 'mic-permission': return 'The microphone is off. Tap "Turn on microphone".';
      case 'no-mic': return 'No microphone found. Plug one in and try again.';
      case 'no-audio': return "I didn't hear anything. Check your sound is on, then speak toward the mic.";
      case 'decode-failed': return "I couldn't read that audio. Try again.";
      case 'offscreen-unavailable': return 'Microphone is not ready. Try reloading the page.';
      default: return 'Microphone problem. Please try again.';
    }
  },

  // Send WAV audio to the backend for transcription.
  // Returns { text } or { error, code }.
  async transcribe(wavBase64, language) {
    if (!navigator.onLine) return { error: 'You appear to be offline.', code: 'offline' };
    if (!window.LBState.studentCode) return { error: 'Not enrolled yet. Finish onboarding first.', code: 'not-enrolled' };
    if (!window.LBRateLimiter.check('stt', window.CONFIG.rateLimits.sttPerMinute)) {
      return { error: 'Slow down a moment, then try again.', code: 'rate-limited' };
    }

    try {
      let res;
      try {
        res = await this._send({
          action: 'api-fetch',
          endpoint: 'speech-to-text',
          body: { audioBase64: wavBase64, audioFormat: 'wav', language, studentCode: window.LBState.studentCode },
        }, 40000);
      } catch (msgErr) {
        LBLog.error('STT message failed:', msgErr.message);
        return { error: 'Connection to the extension was lost. Reload the page.', code: 'no-channel' };
      }

      if (!res) return { error: 'No response. Try reloading.', code: 'no-response' };

      if (!res.ok) {
        const errCode = res.data?.error || res.error || '';
        LBLog.warn('STT error:', errCode, res.data?.details || '');
        switch (errCode) {
          case 'LANGUAGE_NOT_SUPPORTED': return { error: 'Speech input is not available for this language yet.', code: errCode };
          case 'TRANSCRIPTION_FAILED': return { error: "I couldn't understand that. Try speaking clearly into the mic.", code: errCode };
          case 'AUDIO_TOO_LARGE': return { error: 'That was a bit long. Keep it under 45 seconds.', code: errCode };
          case 'INVALID_STUDENT_CODE': return { error: 'Session problem. Reopen the extension.', code: errCode };
          case 'RATE_LIMITED': return { error: 'Slow down a moment, then try again.', code: errCode };
          case 'REQUEST_TIMEOUT': return { error: 'That took too long. Try a shorter phrase.', code: errCode };
          default: return { error: 'Speech recognition failed. Please try again.', code: errCode || 'unknown' };
        }
      }

      const text = (res.data?.text || res.data?.transcribedText || res.data?.transcript || '').trim();
      if (!text) return { error: 'empty', code: 'empty' };
      return { text };
    } catch (err) {
      LBLog.error('STT failed:', err);
      return { error: 'Speech recognition failed. Please try again.', code: 'unknown' };
    }
  },
};
