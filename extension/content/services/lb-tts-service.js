// extension/content/services/lb-tts-service.js
// Text-to-Speech: plays audio from URL. Generates via background proxy if needed.

window.LBTTSService = {
  audioContext: null,
  currentSource: null,

  async play(audioUrl) {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      // Resume AudioContext if suspended (Chrome blocks audio until user gesture)
      if (this.audioContext.state === 'suspended') {
        LBLog.info('AudioContext suspended, resuming...');
        await this.audioContext.resume();
      }

      if (this.currentSource) {
        try { this.currentSource.stop(); } catch (e) { /* already stopped */ }
      }

      // Fetch audio through background proxy to avoid CORS
      const res = await chrome.runtime.sendMessage({ action: 'fetch-audio', url: audioUrl });
      if (!res || !res.ok) {
        LBLog.error('Audio fetch failed:', res?.error || 'no response');
        return;
      }

      const response = await fetch(res.dataUrl);
      const arrayBuffer = await response.arrayBuffer();

      if (arrayBuffer.byteLength === 0) {
        LBLog.error('Audio data is empty');
        return;
      }

      LBLog.info(`Audio data: ${arrayBuffer.byteLength} bytes, context state: ${this.audioContext.state}`);

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = window.LBState?.readingSpeed || 1.0;
      source.connect(this.audioContext.destination);
      source.start(0);

      this.currentSource = source;
      LBLog.info(`Audio playing (${audioBuffer.duration.toFixed(1)}s)`);

      return new Promise((resolve) => {
        source.onended = () => {
          this.currentSource = null;
          resolve();
        };
      });
    } catch (err) {
      LBLog.error('TTS playback via WebAudio failed, trying HTML5 Audio fallback:', err);
      // Fallback: try HTML5 Audio with data URL
      try {
        const res = await chrome.runtime.sendMessage({ action: 'fetch-audio', url: audioUrl });
        if (res?.ok && res.dataUrl) {
          const audio = new Audio(res.dataUrl);
          audio.playbackRate = window.LBState?.readingSpeed || 1.0;
          await audio.play();
          return new Promise(resolve => { audio.onended = resolve; });
        }
      } catch (fallbackErr) {
        LBLog.error('HTML5 Audio fallback also failed:', fallbackErr);
      }
    }
  },

  // Generate audio via tts-router (through background proxy) then play it
  async generateAndPlay(text, language) {
    if (!window.LBRateLimiter.check('tts', window.CONFIG.rateLimits.ttsPerMinute)) {
      LBLog.warn('TTS rate limit reached');
      return null;
    }
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'tts-router',
        body: {
          text,
          language,
          studentCode: window.LBState.studentCode,
        },
      });

      if (!res) { LBLog.warn('TTS: no response from background'); return null; }
      LBLog.info('TTS response:', JSON.stringify(res.data));

      const audioUrl = res.data?.audioUrl || res.data?.audio_url;
      if (res.ok && audioUrl) {
        await this.play(audioUrl);
        return res.data;
      }
      // Fallback: if Dari fails, try Persian (closely related)
      if (language === 'dari' && res.data?.error === 'AZURE_SERVICE_ERROR') {
        LBLog.info('Dari TTS failed, falling back to Persian...');
        const fallback = await chrome.runtime.sendMessage({
          action: 'api-fetch',
          endpoint: 'tts-router',
          body: { text, language: 'persian', studentCode: window.LBState.studentCode },
        });
        const fallbackUrl = fallback.data?.audioUrl || fallback.data?.audio_url;
        if (fallback.ok && fallbackUrl) {
          await this.play(fallbackUrl);
          return fallback.data;
        }
      }

      // Retry once on INTERNAL_ERROR
      if (res.data?.error === 'INTERNAL_ERROR' && !this._retrying) {
        this._retrying = true;
        LBLog.info('TTS INTERNAL_ERROR — retrying once...');
        await new Promise(r => setTimeout(r, 500));
        const result = await this.generateAndPlay(text, language);
        this._retrying = false;
        return result;
      }
      this._retrying = false;

      LBLog.warn('TTS generation returned no audio:', JSON.stringify(res.data));
      return null;
    } catch (err) {
      LBLog.error('TTS generation failed:', err);
      return null;
    }
  },

  stop() {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch (e) { /* already stopped */ }
      this.currentSource = null;
    }
  },
};
