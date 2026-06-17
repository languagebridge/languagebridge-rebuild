// extension/background.js
// Service Worker (World 1). Handles install, shortcuts, message relay, and API proxy.
// API key is stored in chrome.storage.local, not hardcoded.

const API_BASE = 'https://languagebridge-api.azurewebsites.net/api';

// Get API key from storage (set on install)
async function getApiKey() {
  const { lbApiKey } = await chrome.storage.local.get('lbApiKey');
  return lbApiKey || '';
}

// On first install: store API key and generate session token
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      lbApiKey: '02dd1fc2301b6277cd7aed4357ea09990373078409a11942707d760726ec58e3',
    });
    const token = crypto.randomUUID();
    await chrome.storage.sync.set({ lb_session_token: token });
    console.log('LanguageBridge installed. API key and session token stored.');
  }
  // Also set key on update (in case user had old version without it)
  const { lbApiKey } = await chrome.storage.local.get('lbApiKey');
  if (!lbApiKey) {
    await chrome.storage.local.set({
      lbApiKey: '02dd1fc2301b6277cd7aed4357ea09990373078409a11942707d760726ec58e3',
    });
  }
});

// Keyboard shortcut handlers
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      if (command === 'toggle-toolbar') {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle-toolbar' });
      }
      if (command === 'toggle-floating-translator') {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle-floating-translator' });
      }
    }
  });
});

// ── Offscreen document (microphone capture for Talk to Teacher) ──────
// MV3 content scripts can't reliably capture the mic (the host page's
// permission policy governs them). We capture in an extension-owned
// offscreen document instead, so it works on any page.
let _creatingOffscreen = null;

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  if (_creatingOffscreen) { await _creatingOffscreen; return; }
  _creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Record microphone audio for Talk to Teacher voice translation.',
  });
  try { await _creatingOffscreen; } finally { _creatingOffscreen = null; }
}

// Relay a command to the offscreen document and return its response.
function sendToOffscreen(cmd) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ target: 'offscreen', cmd }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, errorCode: 'offscreen-unavailable' });
      } else {
        resolve(resp || { ok: false, errorCode: 'no-response' });
      }
    });
  });
}

// Message handler — API proxy + tab ID relay
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages addressed to the offscreen document are handled there, not here.
  if (msg.target === 'offscreen') return false;

  if (msg.action === 'get-tab-id') {
    sendResponse({ tabId: sender.tab?.id });
    return false;
  }

  // Talk to Teacher: start microphone recording (offscreen)
  if (msg.action === 'ttt-record-start') {
    ensureOffscreenDocument()
      .then(() => sendToOffscreen('start'))
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, errorCode: 'offscreen-unavailable', details: err.message }));
    return true;
  }

  // Talk to Teacher: stop recording, get transcoded 16kHz mono WAV + audio stats
  if (msg.action === 'ttt-record-stop') {
    sendToOffscreen('stop').then(sendResponse).catch(() => sendResponse({ ok: false, errorCode: 'offscreen-unavailable' }));
    return true;
  }

  // Talk to Teacher: open the one-time microphone permission page in a tab
  if (msg.action === 'ttt-open-mic-permission') {
    chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') });
    sendResponse({ ok: true });
    return false;
  }

  // API POST proxy
  if (msg.action === 'api-fetch') {
    const controller = new AbortController();
    const timeout = msg.endpoint === 'speech-to-text' ? 35000 : 15000;
    const timer = setTimeout(() => controller.abort(), timeout);

    getApiKey().then(apiKey => {
      const url = `${API_BASE}/${msg.endpoint}`;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lb-api-key': apiKey },
        body: JSON.stringify(msg.body),
        signal: controller.signal,
      });
    })
      .then(async (res) => {
        clearTimeout(timer);
        let data;
        try { data = await res.json(); } catch { data = { error: 'Invalid response from server' }; }
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        clearTimeout(timer);
        const isTimeout = err.name === 'AbortError';
        sendResponse({
          ok: false,
          data: { error: isTimeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', details: err.message },
        });
      });
    return true;
  }

  // API GET proxy
  if (msg.action === 'api-fetch-get') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    getApiKey().then(apiKey => {
      const url = `${API_BASE}/${msg.endpoint}`;
      return fetch(url, {
        method: 'GET',
        headers: { 'x-lb-api-key': apiKey },
        signal: controller.signal,
      });
    })
      .then(async (res) => {
        clearTimeout(timer);
        let data;
        try { data = await res.json(); } catch { data = { error: 'Invalid response from server' }; }
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        clearTimeout(timer);
        const isTimeout = err.name === 'AbortError';
        sendResponse({
          ok: false,
          data: { error: isTimeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', details: err.message },
        });
      });
    return true;
  }

  // Audio proxy
  if (msg.action === 'fetch-audio') {
    fetch(msg.url)
      .then(res => res.arrayBuffer())
      .then(buffer => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const mimeType = msg.url.includes('.wav') ? 'audio/wav' : 'audio/mpeg';
        sendResponse({ ok: true, dataUrl: `data:${mimeType};base64,${base64}` });
      })
      .catch(err => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  return false;
});
