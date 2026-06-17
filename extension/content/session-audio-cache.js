// extension/content/session-audio-cache.js
// In-memory cache for translations and audio. Clears on page reload.

window.LBSessionCache = {
  _store: {},

  _key(text, lang, type) {
    return `${type}:${lang}:${text}`;
  },

  get(text, lang, type) {
    return this._store[this._key(text, lang, type)] || null;
  },

  set(text, lang, type, data) {
    this._store[this._key(text, lang, type)] = data;
  },

  clear() {
    this._store = {};
  },
};