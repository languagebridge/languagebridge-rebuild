/**
 * LanguageBridge - Popup Script
 * Controls the extension popup UI (alpha look + guide architecture)
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings
  const settings = await chrome.storage.sync.get([
    'toolbarEnabled', 'floatingTranslatorEnabled'
  ]);
  const stats = await chrome.storage.local.get(['usageStats']);
  const usageStats = stats.usageStats || { translations: 0, speechRecognitions: 0 };

  // Initialize toggle switches
  const toolbarSwitch = document.getElementById('toolbar-switch');
  const translatorSwitch = document.getElementById('translator-switch');

  if (settings.toolbarEnabled !== false) toolbarSwitch.classList.add('active');
  if (settings.floatingTranslatorEnabled) translatorSwitch.classList.add('active');

  // Display usage stats
  document.getElementById('translations-count').textContent = usageStats.translations;
  document.getElementById('speech-count').textContent = usageStats.speechRecognitions;

  // Display student code
  const localData = await chrome.storage.local.get(['studentCode']);
  if (localData.studentCode) {
    document.getElementById('student-code').textContent = localData.studentCode;
  }

  document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

  // Chrome keeps extensions off some pages (a new empty tab, the Chrome Web Store,
  // chrome:// and reader pages), and a tab opened before install has no content
  // script yet. On those the page never answers, so say so instead of failing
  // silently — settings still save and apply on the next page.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let pageReachable = false;
  if (tab?.id) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'lb-ping' });
      pageReachable = !!(res && res.ok);
    } catch (err) { /* no content script on this page */ }
  }
  if (!pageReachable) document.getElementById('page-note').hidden = false;

  const HELP_URL = chrome.runtime.getURL('help/help.html');

  // Toolbar toggle
  document.getElementById('toolbar-toggle').addEventListener('click', async () => {
    const isActive = toolbarSwitch.classList.contains('active');
    toolbarSwitch.classList.toggle('active');
    await chrome.storage.sync.set({ toolbarEnabled: !isActive });
    if (pageReachable) chrome.tabs.sendMessage(tab.id, { action: 'toggle-toolbar' }).catch(() => {});
  });

  // Floating translator toggle
  document.getElementById('translator-toggle').addEventListener('click', async () => {
    const isActive = translatorSwitch.classList.contains('active');
    translatorSwitch.classList.toggle('active');
    await chrome.storage.sync.set({ floatingTranslatorEnabled: !isActive });
    if (pageReachable) chrome.tabs.sendMessage(tab.id, { action: 'toggle-floating-translator' }).catch(() => {});
  });

  // Help button — the in-page guide where the page can show it, otherwise the
  // bundled help page (which opens anywhere).
  document.getElementById('help-btn').addEventListener('click', async () => {
    let shown = false;
    if (pageReachable) {
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { action: 'show-tutorial' });
        shown = !!(res && res.success);
      } catch (err) { /* fall through to the help page */ }
    }
    if (!shown) chrome.tabs.create({ url: HELP_URL });
    window.close();
  });

  // Privacy link
  document.getElementById('privacy-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://languagebridge.app/privacy' });
    window.close();
  });

  // Support link — opens the help page's support section rather than jumping
  // straight into the OS mail app; emailing is offered from there.
  document.getElementById('support-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${HELP_URL}#support` });
    window.close();
  });
});
