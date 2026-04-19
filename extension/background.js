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

// Message handler — API proxy + tab ID relay
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'get-tab-id') {
    sendResponse({ tabId: sender.tab?.id });
    return false;
  }

  // API POST proxy
  if (msg.action === 'api-fetch') {
    getApiKey().then(apiKey => {
      const url = `${API_BASE}/${msg.endpoint}`;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-lb-api-key': apiKey },
        body: JSON.stringify(msg.body),
      });
    })
      .then(async (res) => {
        let data;
        try { data = await res.json(); } catch { data = { error: 'Invalid response from server' }; }
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  // API GET proxy
  if (msg.action === 'api-fetch-get') {
    getApiKey().then(apiKey => {
      const url = `${API_BASE}/${msg.endpoint}`;
      return fetch(url, {
        method: 'GET',
        headers: { 'x-lb-api-key': apiKey },
      });
    })
      .then(async (res) => {
        let data;
        try { data = await res.json(); } catch { data = { error: 'Invalid response from server' }; }
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
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
