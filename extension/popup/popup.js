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

  // Toolbar toggle
  document.getElementById('toolbar-toggle').addEventListener('click', async () => {
    const isActive = toolbarSwitch.classList.contains('active');
    toolbarSwitch.classList.toggle('active');
    await chrome.storage.sync.set({ toolbarEnabled: !isActive });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'toggle-toolbar' }).catch(() => {
        toolbarSwitch.classList.toggle('active');
      });
    }
  });

  // Floating translator toggle
  document.getElementById('translator-toggle').addEventListener('click', async () => {
    const isActive = translatorSwitch.classList.contains('active');
    translatorSwitch.classList.toggle('active');
    await chrome.storage.sync.set({ floatingTranslatorEnabled: !isActive });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'toggle-floating-translator' }).catch(() => {
        translatorSwitch.classList.toggle('active');
      });
    }
  });

  // Help button
  document.getElementById('help-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'show-tutorial' }).catch(() => {});
      window.close();
    }
  });

  // Privacy link
  document.getElementById('privacy-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://languagebridge.app/privacy' });
    window.close();
  });

  // Support link
  document.getElementById('support-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'mailto:support@languagebridge.app' });
    window.close();
  });
});
