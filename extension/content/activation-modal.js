// extension/content/activation-modal.js
// First-run consent modal. Shows once, then never again.

(function () {
  if (window.LBState.consentGiven) return; // Already consented

  const overlay = document.createElement('div');
  overlay.id = 'lb-consent-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 999999;
    display: flex; align-items: center; justify-content: center;
  `;

  overlay.innerHTML = `
    <div style="background: white; border-radius: 16px; padding: 32px; max-width: 420px; text-align: center; font-family: Arial, sans-serif;">
      <h2 style="color: #742a69; margin-top: 0;">Welcome to LanguageBridge&#8482;!</h2>
      <p style="color: #333; line-height: 1.6;">
        LanguageBridge helps you understand English by translating text and reading it aloud in your language.
      </p>
      <p style="color: #666; font-size: 14px; line-height: 1.5;">
        We collect anonymous usage data to improve the tool. No personal information is ever collected.
      </p>
      <button id="lb-consent-btn" style="
        background: linear-gradient(135deg, #742a69, #f37030);
        color: white; border: none; padding: 12px 32px; border-radius: 8px;
        font-size: 16px; cursor: pointer; margin-top: 16px;
      ">I Agree — Let's Go!</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('lb-consent-btn').addEventListener('click', () => {
    window.LBState.consentGiven = true;
    chrome.storage.sync.set({
      consentGiven: true,
      consentTimestamp: new Date().toISOString(),
    });
    overlay.remove();
    LBLog.info('Consent given');

    // Trigger onboarding now that consent is given
    // Small delay to let state propagate
    setTimeout(() => {
      if (!window.LBState.studentCode) {
        // Re-run onboarding script by dispatching a custom event
        window.dispatchEvent(new Event('lb-consent-given'));
      }
    }, 500);
  });
})();