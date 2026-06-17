// extension/content/services/lb-stt-service.js
// Speech-to-Text: captures microphone audio, converts to base64, sends to /speech-to-text API.

window.LBSTTService = {
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,
  _recordingTimer: null,
  MAX_RECORDING_MS: 60000,

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();

      // Auto-stop after 60 seconds to prevent oversized recordings
      this._recordingTimer = setTimeout(() => {
        if (this.isRecording) {
          LBLog.warn('Recording auto-stopped at 60s limit');
          this.stopRecording();
        }
      }, this.MAX_RECORDING_MS);

      LBLog.info('Recording started');
      return { success: true };
    } catch (err) {
      LBLog.error('Microphone access denied:', err);
      this.isRecording = false;
      return { error: 'Microphone access is required for Talk to Teacher.' };
    }
  },

  stopRecording() {
    return new Promise((resolve) => {
      if (this._recordingTimer) {
        clearTimeout(this._recordingTimer);
        this._recordingTimer = null;
      }

      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.isRecording = false;
        this.audioChunks = [];
        LBLog.info(`Recording stopped (${(audioBlob.size / 1024).toFixed(1)} KB)`);
        resolve(audioBlob);
      };

      try {
        this.mediaRecorder.stop();
        this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        LBLog.warn('Error stopping MediaRecorder:', err);
        this.isRecording = false;
        this.audioChunks = [];
        resolve(null);
      }
    });
  },

  _cleanupStream() {
    try {
      if (this.mediaRecorder?.stream) {
        this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
      }
    } catch (e) { /* already stopped */ }
  },

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  // Wraps chrome.runtime.sendMessage with a timeout to prevent hanging forever
  _sendWithTimeout(message, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Message to background timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  },

  async transcribe(audioBlob, language) {
    if (!navigator.onLine) {
      return { error: 'You appear to be offline.' };
    }
    if (!window.LBState.studentCode) {
      return { error: 'Not enrolled yet. Please complete onboarding first.' };
    }
    if (!window.LBRateLimiter.check('stt', window.CONFIG.rateLimits.sttPerMinute)) {
      return { error: 'Speech recognition rate limit reached. Please wait.' };
    }

    const maxSize = 4 * 1024 * 1024;
    if (audioBlob.size > maxSize) {
      return { error: 'Recording too long (max ~60 seconds). Try a shorter phrase.' };
    }

    try {
      const audioBase64 = await this.blobToBase64(audioBlob);
      LBLog.info(`Sending ${(audioBlob.size / 1024).toFixed(1)} KB audio to speech-to-text (${language})`);

      let res;
      try {
        res = await this._sendWithTimeout({
          action: 'api-fetch',
          endpoint: 'speech-to-text',
          body: {
            audioBase64,
            audioFormat: 'webm',
            language,
            studentCode: window.LBState.studentCode,
          },
        }, 30000);
      } catch (msgErr) {
        LBLog.error('STT message failed:', msgErr.message);
        return { error: 'Connection to extension lost. Try reloading the page.' };
      }

      LBLog.info('STT raw response:', JSON.stringify(res));

      if (!res) return { error: 'No response from extension. Try reloading.' };

      if (!res.ok) {
        const errCode = res.data?.error || res.error || '';
        const errDetail = res.data?.details || '';
        LBLog.warn('STT error:', errCode, errDetail);
        if (errCode === 'UNSUPPORTED_LANGUAGE') {
          return { error: 'Speech recognition not available for this language yet.' };
        }
        if (errCode === 'AUDIO_TOO_SHORT') {
          return { error: 'Recording too short. Try speaking a bit longer.' };
        }
        if (errCode === 'REQUEST_TIMEOUT') {
          return { error: 'Speech recognition timed out. Try a shorter phrase.' };
        }
        return { error: errDetail || errCode || 'Speech recognition failed.' };
      }

      const text = res.data?.transcribedText || res.data?.text || res.data?.transcript || '';
      if (!text) {
        LBLog.warn('STT returned no text. Full data:', JSON.stringify(res.data));
        return { error: 'Could not understand the audio. Try speaking more clearly.' };
      }

      LBLog.info(`STT result: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      return { text };
    } catch (err) {
      LBLog.error('STT failed:', err);
      this._cleanupStream();
      return { error: 'Speech recognition failed. Please try again.' };
    }
  },
};

window.addEventListener('beforeunload', () => {
  if (window.LBSTTService.mediaRecorder?.stream) {
    window.LBSTTService.mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
});
