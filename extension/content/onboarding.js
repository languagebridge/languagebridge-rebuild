// extension/content/onboarding.js
// 3-step onboarding: School → Grade Band → Language → Enroll via API to get studentCode.

(function () {
  let _onboardingStarted = false;
  function startOnboardingOnce() {
    if (_onboardingStarted) return;
    _onboardingStarted = true;
    startOnboarding();
  }

  // Register the consent listener SYNCHRONOUSLY so we can't miss the event while
  // an async storage read is still in flight (previously caused new users to get
  // stuck after agreeing).
  window.addEventListener('lb-consent-given', startOnboardingOnce);

  chrome.storage.local.get(['studentCode'], (local) => {
    if (local.studentCode) {
      window.LBState.studentCode = local.studentCode;
      window.removeEventListener('lb-consent-given', startOnboardingOnce);
      return; // Already enrolled
    }

    chrome.storage.sync.get(['consentGiven'], (sync) => {
      if (sync.consentGiven) {
        window.LBState.consentGiven = true;
        startOnboardingOnce();
      }
      // Otherwise the synchronously-registered listener above starts it on consent.
    });
  });

  function startOnboarding() {

  const panel = document.createElement('div');
  panel.id = 'lb-onboarding';
  panel.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 999998; background: white; border-radius: 20px; padding: 32px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 420px; width: 90%; max-height: 80vh; overflow-y: auto;
  `;

  let schools = [];
  let selectedSchool = null;
  let selectedGradeBand = null;

  // Step 1: Load schools from API and show school selection
  async function loadSchools() {
    panel.innerHTML = `
      <h2 style="color: #742a69; margin: 0 0 8px 0;">Welcome to LanguageBridge!</h2>
      <p style="color: #666; font-size: 14px; margin-bottom: 20px;">Let's get you set up. First, select your school.</p>
      <div id="lb-onboard-content" style="text-align: center; padding: 20px;">
        <div style="color: #999;">Loading schools...</div>
      </div>
    `;
    document.body.appendChild(panel);

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch-get',
        endpoint: 'onboarding/schools',
      });

      if (!res.ok || !res.data?.schools) {
        document.getElementById('lb-onboard-content').innerHTML =
          '<div style="color: #ef4444;">Could not load schools. Please reload the page.</div>';
        return;
      }

      schools = res.data.schools;
      showSchoolSelection();
    } catch (err) {
      LBLog.error('Onboarding failed to load schools:', err);
      document.getElementById('lb-onboard-content').innerHTML =
        '<div style="color: #ef4444;">Connection error. Please reload.</div>';
    }
  }

  function showSchoolSelection() {
    const content = document.getElementById('lb-onboard-content');
    content.innerHTML = schools.map(s => `
      <button class="lb-onboard-btn" data-school="${window.escapeHtml(s.schoolCode)}" style="
        display: block; width: 100%; padding: 14px 16px; margin: 6px 0;
        border: 2px solid #e0e0e0; border-radius: 10px; background: white;
        cursor: pointer; text-align: left; font-size: 15px; font-weight: 500;
        color: #333; transition: all 0.2s;
      ">${window.escapeHtml(s.schoolName)}</button>
    `).join('');

    content.querySelectorAll('.lb-onboard-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#742a69'; btn.style.background = '#f5eaf4'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#e0e0e0'; btn.style.background = 'white'; });
      btn.addEventListener('click', () => {
        selectedSchool = schools.find(s => s.schoolCode === btn.dataset.school);
        showGradeBandSelection();
      });
    });
  }

  // Step 2: Grade band selection
  function showGradeBandSelection() {
    panel.querySelector('h2').textContent = 'Select Your Grade';
    panel.querySelector('p').textContent = `${selectedSchool.schoolName} — choose your grade band.`;

    const content = document.getElementById('lb-onboard-content');
    content.innerHTML = selectedSchool.gradeBands.map(gb => `
      <button class="lb-onboard-btn" data-grade="${window.escapeHtml(gb)}" style="
        display: block; width: 100%; padding: 14px 16px; margin: 6px 0;
        border: 2px solid #e0e0e0; border-radius: 10px; background: white;
        cursor: pointer; text-align: center; font-size: 16px; font-weight: 600;
        color: #333; transition: all 0.2s;
      ">Grades ${window.escapeHtml(gb)}</button>
    `).join('');

    content.querySelectorAll('.lb-onboard-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#742a69'; btn.style.background = '#f5eaf4'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#e0e0e0'; btn.style.background = 'white'; });
      btn.addEventListener('click', () => {
        selectedGradeBand = btn.dataset.grade;
        showLanguageSelection();
      });
    });
  }

  // Step 3: Language selection
  function showLanguageSelection() {
    panel.querySelector('h2').textContent = 'What Language Do You Speak?';
    panel.querySelector('p').textContent = 'Choose your home language. You can change this anytime.';

    const content = document.getElementById('lb-onboard-content');
    content.innerHTML = '';

    Object.entries(window.LB_LANGUAGES).forEach(([code, lang]) => {
      if (code === 'english') return;
      const btn = document.createElement('button');
      btn.className = 'lb-onboard-btn';
      btn.style.cssText = `
        display: block; width: 100%; padding: 12px 16px; margin: 4px 0;
        border: 2px solid #e0e0e0; border-radius: 10px; background: white;
        cursor: pointer; text-align: left; font-size: 14px; color: #333;
        transition: all 0.2s;
      `;
      btn.textContent = `${lang.nativeLabel} — ${lang.label}`;
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#742a69'; btn.style.background = '#f5eaf4'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#e0e0e0'; btn.style.background = 'white'; });
      btn.addEventListener('click', () => enrollStudent(code));
      content.appendChild(btn);
    });
  }

  // Step 4: Enroll via API
  async function enrollStudent(language) {
    const content = document.getElementById('lb-onboard-content');
    content.innerHTML = '<div style="text-align: center; padding: 30px; color: #742a69;">Enrolling...</div>';

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'onboarding/enroll',
        body: {
          schoolCode: selectedSchool.schoolCode,
          gradeBand: selectedGradeBand,
          language: language,
        },
      });

      if (!res.ok || !res.data?.studentCode) {
        content.innerHTML = `<div style="color: #ef4444;">Enrollment failed: ${res.data?.details || 'Unknown error'}. Please try again.</div>`;
        return;
      }

      const studentCode = res.data.studentCode;

      // Save everything
      window.LBState.studentCode = studentCode;
      window.LBState.schoolCode = selectedSchool.schoolCode;
      window.LBState.gradeBand = selectedGradeBand;
      window.LBState.language = language;
      window.LBState.onboardingComplete = true;

      await chrome.storage.local.set({
        studentCode: studentCode,
        schoolCode: selectedSchool.schoolCode,
        gradeBand: selectedGradeBand,
      });
      await chrome.storage.sync.set({
        defaultLanguage: language,
        onboardingComplete: true,
      });

      // Show success
      content.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
          <h3 style="color: #742a69; margin: 0 0 8px 0;">You're all set!</h3>
          <p style="color: #666; font-size: 14px;">Student code: <strong>${studentCode}</strong></p>
          <p style="color: #666; font-size: 13px;">Highlight any word on a webpage to translate it.</p>
        </div>
      `;

      setTimeout(() => panel.remove(), 3000);
      LBLog.info('Onboarding complete. studentCode:', studentCode);

    } catch (err) {
      LBLog.error('Enrollment failed:', err);
      content.innerHTML = '<div style="color: #ef4444;">Connection error. Please reload.</div>';
    }
  }

  loadSchools();
  } // end startOnboarding
})();
