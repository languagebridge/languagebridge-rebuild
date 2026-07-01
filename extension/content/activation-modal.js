// extension/content/activation-modal.js
// First-run privacy & consent modal. Shows once. FERPA/COPPA-aware: spells out
// exactly what is and isn't collected, offers Accept or Decline (limited
// features), links the full policy, and records a consent timestamp.

(function () {
  chrome.storage.sync.get(['consentGiven'], (data) => {
    if (data.consentGiven) {
      window.LBState.consentGiven = true;
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'lb-consent-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); z-index: 2147483646;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    // All content below is static (no interpolated/untrusted data) — safe innerHTML.
    overlay.innerHTML = `
      <div style="background:#fff; border-radius:18px; padding:28px; max-width:460px; width:92%; max-height:86vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.35);">
        <h2 style="color:#742a69; margin:0 0 6px;">Welcome to LanguageBridge&#8482;</h2>
        <p style="color:#333; line-height:1.55; margin:0 0 16px;">
          LanguageBridge helps you understand English by translating words and reading them aloud in your language. Please read how we protect your privacy.
        </p>

        <div style="display:flex; gap:12px; margin-bottom:16px;">
          <div style="flex:1; background:#f0f8f0; border:1px solid #cdeccd; border-radius:12px; padding:12px;">
            <div style="font-weight:700; color:#177a17; font-size:13px; margin-bottom:6px;">We collect</div>
            <ul style="margin:0; padding-left:18px; color:#444; font-size:13px; line-height:1.5;">
              <li>Anonymous usage counts</li>
              <li>Your language choice</li>
              <li>A random anonymous code</li>
            </ul>
          </div>
          <div style="flex:1; background:#fdf0f0; border:1px solid #f3cccc; border-radius:12px; padding:12px;">
            <div style="font-weight:700; color:#b32424; font-size:13px; margin-bottom:6px;">We never collect</div>
            <ul style="margin:0; padding-left:18px; color:#444; font-size:13px; line-height:1.5;">
              <li>Your name or email</li>
              <li>The text you translate</li>
              <li>Your browsing history or IP</li>
            </ul>
          </div>
        </div>

        <p style="color:#555; font-size:12px; line-height:1.5; background:#f5eaf4; border-radius:10px; padding:10px 12px; margin:0 0 16px;">
          Built for schools and compliant with <strong>FERPA</strong>, <strong>COPPA</strong>, and <strong>GDPR</strong>. No personally identifiable information is ever stored.
          <a id="lb-consent-policy" href="#" style="color:#742a69; font-weight:600;">Read our full privacy policy</a>.
        </p>

        <button id="lb-consent-accept" style="
          width:100%; background:linear-gradient(135deg,#742a69,#f37030); color:#fff; border:none;
          padding:13px; border-radius:12px; font-size:16px; font-weight:700; cursor:pointer; margin-bottom:8px;
        ">I Agree &#8212; Let's Go</button>
        <button id="lb-consent-decline" style="
          width:100%; background:transparent; color:#777; border:none; padding:8px; font-size:13px; cursor:pointer;
        ">Continue with limited features (no usage data)</button>
      </div>
    `;

    document.body.appendChild(overlay);

    function finish(analyticsEnabled) {
      window.LBState.consentGiven = true;
      window.LBState.analyticsEnabled = analyticsEnabled;
      chrome.storage.sync.set({
        consentGiven: true,
        analyticsEnabled,
        consentTimestamp: new Date().toISOString(),
      });
      overlay.remove();
      LBLog.info(`Consent given (analytics ${analyticsEnabled ? 'enabled' : 'disabled'})`);
      // Start enrollment immediately — the onboarding listener is registered
      // synchronously, so no timing workaround is needed.
      if (!window.LBState.studentCode) {
        window.dispatchEvent(new Event('lb-consent-given'));
      }
    }

    document.getElementById('lb-consent-policy').addEventListener('click', (e) => {
      e.preventDefault();
      window.open('https://languagebridge.app/privacy', '_blank', 'noopener');
    });
    document.getElementById('lb-consent-accept').addEventListener('click', () => finish(true));
    document.getElementById('lb-consent-decline').addEventListener('click', () => finish(false));
  });
})();
