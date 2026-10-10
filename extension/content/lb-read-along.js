// extension/content/lb-read-along.js
// Read-along glow: lights up each word of the translation as its audio plays.
//
// The TTS backends return audio only (no word timestamps), so timing is estimated:
// LBTTSService reports each clip's length with its leading/trailing silence
// trimmed, and the speech in between is shared out across the words by length,
// with a little extra after punctuation. It re-syncs on every sentence/chunk, so
// drift never builds up. If the spoken text can't be matched to the words on
// screen, nothing glows — a wrong highlight is worse than none.

window.LBReadAlong = {
  _main: null,       // the translation shown in the open card
  _focused: null,    // one-shot target (a glossary word), set just before playing
  _focusedAt: 0,
  _raf: 0,
  _lit: null,

  _segmenter: (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null,

  // Split text into word / non-word pieces. Intl.Segmenter handles scripts that
  // don't put spaces between words (Burmese); whitespace split is the fallback.
  _segment(text) {
    text = String(text || '');
    if (this._segmenter) {
      return [...this._segmenter.segment(text)].map(s => ({ text: s.segment, isWord: !!s.isWordLike }));
    }
    return text.split(/(\s+)/).filter(Boolean).map(t => ({ text: t, isWord: !/^\s+$/.test(t) }));
  },

  // Rebuild `el` as one <span> per word (punctuation and spaces stay as text).
  _prepare(el, text) {
    el.textContent = '';
    const words = [];
    for (const seg of this._segment(text)) {
      if (seg.isWord) {
        const span = document.createElement('span');
        span.className = 'lb-ra-word';
        span.textContent = seg.text;
        el.appendChild(span);
        const size = Math.max(1, [...seg.text].length);
        words.push({ el: span, text: seg.text, base: size, weight: size });
      } else {
        el.appendChild(document.createTextNode(seg.text));
        // Voices pause at punctuation — give that time to the word before it.
        const last = words[words.length - 1];
        if (last) {
          if (/[.!?؟۔။。]/.test(seg.text)) last.weight += 4;
          else if (/[,;:،၊、]/.test(seg.text)) last.weight += 2;
        }
      }
    }
    el._lbWords = words;
    el._lbCursor = 0;
  },

  // Register the card's translation text as the default read-along target.
  attach(el, text) {
    if (!el) return;
    this._prepare(el, text);
    this._main = el;
  },

  // Aim the next clip at a specific element (e.g. one glossary word).
  focus(el) {
    if (!el) return;
    if (!el._lbWords) this._prepare(el, el.textContent);
    this._focused = el;
    this._focusedAt = Date.now();
  },

  _usable(el) {
    return !!(el && el.isConnected && el.offsetParent !== null && el._lbWords && el._lbWords.length);
  },

  // Index in `words` where the spoken words begin, or -1. Looks forward from the
  // cursor first so a repeated sentence highlights the right occurrence.
  _find(words, want, cursor) {
    const n = Math.min(want.length, 6);
    const matchesAt = (i) => {
      for (let j = 0; j < n; j++) if (!words[i + j] || words[i + j].text !== want[j]) return false;
      return true;
    };
    for (let i = cursor; i < words.length; i++) if (matchesAt(i)) return i;
    for (let i = 0; i < cursor; i++) if (matchesAt(i)) return i;
    return -1;
  },

  // Called by LBTTSService when a clip starts. duration/lead/tail are seconds of
  // audio; rate is the playback speed.
  start({ text, duration, lead = 0, tail = 0, rate = 1 }) {
    this.stop();
    if (!text || !(duration > 0)) return;

    const want = this._segment(text).filter(s => s.isWord).map(s => s.text);
    if (!want.length) return;

    const candidates = [];
    if (this._focused && Date.now() - this._focusedAt < 15000) candidates.push(this._focused);
    this._focused = null;
    candidates.push(this._main);

    let words = null;
    for (const el of candidates) {
      if (!this._usable(el)) continue;
      const from = this._find(el._lbWords, want, el._lbCursor);
      if (from < 0) continue;
      words = el._lbWords.slice(from, from + want.length);
      el._lbCursor = from + words.length >= el._lbWords.length ? 0 : from + words.length;
      break;
    }
    if (!words) return;

    // The pause after the clip's last word is the trailing silence, already
    // trimmed off — so that word counts by its length alone.
    const weights = words.map((w, k) => (k === words.length - 1 ? w.base : w.weight));
    const total = weights.reduce((sum, w) => sum + w, 0);
    const speech = Math.max(0.05, duration - lead - tail);
    let acc = 0;
    const ends = weights.map((w) => { acc += w; return lead + speech * (acc / total); });

    const t0 = performance.now();
    let i = 0;
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) * rate; // position in the audio
      if (t >= duration) { this.stop(); return; }
      while (i < ends.length - 1 && t >= ends[i]) i++;
      const el = words[i].el;
      if (this._lit !== el) {
        if (this._lit) this._lit.classList.remove('lb-ra-glow');
        el.classList.add('lb-ra-glow');
        this._lit = el;
      }
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  },

  stop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    if (this._lit) { this._lit.classList.remove('lb-ra-glow'); this._lit = null; }
  },
};
