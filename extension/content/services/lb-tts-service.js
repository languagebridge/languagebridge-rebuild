// extension/content/services/lb-tts-service.js
// Text-to-Speech: plays audio from URL. Generates via background proxy if needed.
// A generation token (_gen) lets stop() cancel playback even while audio is still
// loading (generate → fetch → decode), so the pause/stop button always works.

window.LBTTSService = {
  audioContext: null,
  currentSource: null,   // WebAudio buffer source
  currentAudio: null,    // HTML5 <audio> fallback
  _gen: 0,
  _retrying: false,

  _stopSources() {
    if (this.currentSource) { try { this.currentSource.stop(); } catch (e) { /* already stopped */ } this.currentSource = null; }
    if (this.currentAudio) { try { this.currentAudio.pause(); this.currentAudio.currentTime = 0; } catch (e) { /* noop */ } this.currentAudio = null; }
  },

  async play(audioUrl, gen) {
    if (gen === undefined) gen = this._gen;
    try {
      if (!this.audioContext) this.audioContext = new AudioContext();
      if (this.audioContext.state === 'suspended') {
        LBLog.info('AudioContext suspended, resuming...');
        await this.audioContext.resume();
      }

      this._stopSources(); // never overlap two clips

      // Fetch audio through background proxy to avoid CORS
      const res = await chrome.runtime.sendMessage({ action: 'fetch-audio', url: audioUrl });
      if (!res || !res.ok) { LBLog.error('Audio fetch failed:', res?.error || 'no response'); return; }
      if (gen !== this._gen) return; // stopped during fetch

      const response = await fetch(res.dataUrl);
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) { LBLog.error('Audio data is empty'); return; }
      if (gen !== this._gen) return; // stopped during fetch

      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      if (gen !== this._gen) return; // stopped during decode

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = window.LBState?.readingSpeed || 1.0;
      source.connect(this.audioContext.destination);
      source.start(0);
      this.currentSource = source;
      LBLog.info(`Audio playing (${audioBuffer.duration.toFixed(1)}s)`);

      return new Promise((resolve) => {
        source.onended = () => { if (this.currentSource === source) this.currentSource = null; resolve(); };
      });
    } catch (err) {
      LBLog.error('TTS playback via WebAudio failed, trying HTML5 Audio fallback:', err);
      try {
        const res = await chrome.runtime.sendMessage({ action: 'fetch-audio', url: audioUrl });
        if (res?.ok && res.dataUrl) {
          if (gen !== this._gen) return; // stopped during fetch
          const audio = new Audio(res.dataUrl);
          audio.playbackRate = window.LBState?.readingSpeed || 1.0;
          this.currentAudio = audio;
          await audio.play();
          return new Promise(resolve => { audio.onended = () => { if (this.currentAudio === audio) this.currentAudio = null; resolve(); }; });
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
    const gen = ++this._gen; // this request supersedes any earlier one
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'tts-router',
        body: { text, language, studentCode: window.LBState.studentCode },
      });
      if (gen !== this._gen) return null; // stopped while generating
      if (!res) { LBLog.warn('TTS: no response from background'); return null; }
      LBLog.info('TTS response:', JSON.stringify(res.data));

      const audioUrl = res.data?.audioUrl || res.data?.audio_url;
      if (res.ok && audioUrl) {
        await this.play(audioUrl, gen);
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
        if (gen !== this._gen) return null; // stopped while generating fallback
        const fallbackUrl = fallback.data?.audioUrl || fallback.data?.audio_url;
        if (fallback.ok && fallbackUrl) {
          await this.play(fallbackUrl, gen);
          return fallback.data;
        }
      }

      // Retry once on INTERNAL_ERROR
      if (res.data?.error === 'INTERNAL_ERROR' && !this._retrying) {
        this._retrying = true;
        LBLog.info('TTS INTERNAL_ERROR — retrying once...');
        await new Promise(r => setTimeout(r, 500));
        if (gen !== this._gen) { this._retrying = false; return null; }
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
    this._gen++;        // invalidate any in-flight generation/playback (cancels load-in-progress)
    this._stopSources();
  },
};
