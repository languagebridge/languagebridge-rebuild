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

  // Split text into <=max-char pieces (backend TTS caps at 500). Breaks on
  // sentence boundaries; hard-splits any single sentence longer than max.
  _chunkText(text, max) {
    text = (text || '').trim();
    if (!text) return [];
    if (text.length <= max) return [text];
    const sentences = text.match(/[^.!?؟۔。]+[.!?؟۔。]*\s*/g) || [text];
    const chunks = [];
    let cur = '';
    const flush = () => { if (cur.trim()) { chunks.push(cur.trim()); cur = ''; } };
    for (const s of sentences) {
      if (s.length > max) {
        flush();
        let part = '';
        for (const w of s.split(/\s+/)) {
          if ((part + ' ' + w).trim().length > max) { if (part) chunks.push(part.trim()); part = w; }
          else part = part ? part + ' ' + w : w;
        }
        if (part) cur = part;
      } else if ((cur + s).length > max) {
        flush();
        cur = s;
      } else {
        cur += s;
      }
    }
    flush();
    return chunks;
  },

  // Generate audio via tts-router and play it — chunking long text so it never
  // exceeds the backend's 500-char TTS limit. Chunks play in sequence.
  async generateAndPlay(text, language) {
    if (!window.LBRateLimiter.check('tts', window.CONFIG.rateLimits.ttsPerMinute)) {
      LBLog.warn('TTS rate limit reached');
      return null;
    }
    const gen = ++this._gen; // this request supersedes any earlier one
    const chunks = this._chunkText(text, 480);
    if (!chunks.length) return null;
    let last = null;
    for (const chunk of chunks) {
      if (gen !== this._gen) return last; // stopped
      last = await this._genPlayChunk(chunk, language, gen);
    }
    return last;
  },

  // Generate + play a single (<=500 char) chunk under an existing generation token.
  async _genPlayChunk(text, language, gen) {
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'tts-router',
        body: { text, language, studentCode: window.LBState.studentCode },
      });
      if (gen !== this._gen) return null;
      if (!res) { LBLog.warn('TTS: no response from background'); return null; }

      const audioUrl = res.data?.audioUrl || res.data?.audio_url;
      if (res.ok && audioUrl) { await this.play(audioUrl, gen); return res.data; }

      // Dari often fails server-side — fall back to Persian (closely related).
      if (language === 'dari' && res.data?.error === 'AZURE_SERVICE_ERROR') {
        const fb = await chrome.runtime.sendMessage({
          action: 'api-fetch',
          endpoint: 'tts-router',
          body: { text, language: 'persian', studentCode: window.LBState.studentCode },
        });
        if (gen !== this._gen) return null;
        const fbUrl = fb.data?.audioUrl || fb.data?.audio_url;
        if (fb.ok && fbUrl) { await this.play(fbUrl, gen); return fb.data; }
      }

      // Retry once on INTERNAL_ERROR.
      if (res.data?.error === 'INTERNAL_ERROR' && !this._retrying) {
        this._retrying = true;
        await new Promise(r => setTimeout(r, 500));
        const result = (gen === this._gen) ? await this._genPlayChunk(text, language, gen) : null;
        this._retrying = false;
        return result;
      }

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
