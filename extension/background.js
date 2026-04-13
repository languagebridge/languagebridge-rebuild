// extension/background.js
// Service Worker (World 1). Handles install, shortcuts, message relay, and API proxy.
// API calls go through here to avoid CORS issues in content scripts.

const API_BASE = 'https://languagebridge-api.azurewebsites.net/api';
const API_KEY = '02dd1fc2301b6277cd7aed4357ea09990373078409a11942707d760726ec58e3';

// On first install: generate session token
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const token = crypto.randomUUID();
    await chrome.storage.sync.set({ lb_session_token: token });
    console.log('LanguageBridge installed. Session token generated.');
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

  // API proxy: content script sends { action: 'api-fetch', endpoint, body }
  // Background makes the fetch (no CORS) and sends the response back
  if (msg.action === 'api-fetch') {
    const url = `${API_BASE}/${msg.endpoint}`;
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lb-api-key': API_KEY,
      },
      body: JSON.stringify(msg.body),
    })
      .then(async (res) => {
        let data;
        try { data = await res.json(); } catch { data = { error: 'Invalid response from server' }; }
        sendResponse({ ok: res.ok, status: res.status, data });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  // API GET proxy: for endpoints like /onboarding/schools
  if (msg.action === 'api-fetch-get') {
    const url = `${API_BASE}/${msg.endpoint}`;
    fetch(url, {
      method: 'GET',
      headers: { 'x-lb-api-key': API_KEY },
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

  // Audio proxy: content script sends { action: 'fetch-audio', url }
  // Background fetches the audio blob and sends it back as a base64 data URL
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

  return false; // Don't keep channel open for unhandled messages
});
