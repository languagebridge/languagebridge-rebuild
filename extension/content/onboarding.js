// extension/content/onboarding.js
// Language-first onboarding: Language → School → Grade → enroll → Ready.
// The student picks their language first; a demo path (LB-DEMO sandbox) skips
// school + grade. Enroll contract is unchanged: { schoolCode, gradeBand, language }.
//
// Localization scaffold: UI copy runs through t(); English is complete and every
// other language falls back to English until a reviewed translation bundle is
// dropped into STRINGS. Language NAMES always render in their native script.

(function () {
  // Simplified flag chips (CSS backgrounds) — placeholders, not official flags.
  const FLAG = {
    arabic: '#007a3d',
    dari: 'linear-gradient(90deg,#000 0 33%,#be0d1a 33% 66%,#007a36 66% 100%)',
    pashto: 'linear-gradient(90deg,#000 0 33%,#be0d1a 33% 66%,#007a36 66% 100%)',
    persian: 'linear-gradient(#239f40 0 33%,#fff 33% 66%,#da0000 66% 100%)',
    urdu: 'linear-gradient(90deg,#fff 0 25%,#01411c 25% 100%)',
    somali: '#4189dd',
    swahili: 'linear-gradient(135deg,#1eb53a 0 40%,#000 40% 60%,#00a3dd 60% 100%)',
    ukrainian: 'linear-gradient(#005bbb 0 50%,#ffd500 50% 100%)',
    spanish: 'linear-gradient(#aa151b 0 25%,#f1bf00 25% 75%,#aa151b 75% 100%)',
    french: 'linear-gradient(90deg,#0055a4 0 33%,#fff 33% 66%,#ef4135 66% 100%)',
    portuguese: 'linear-gradient(90deg,#046a38 0 40%,#da291c 40% 100%)',
    vietnamese: '#da251d',
    nepali: '#dc143c',
    burmese: 'linear-gradient(#fecb00 0 33%,#34b233 33% 66%,#ea2839 66% 100%)',
    tagalog: 'linear-gradient(#0038a8 0 50%,#ce1126 50% 100%)',
    english: '#00247d',
  };
  // Order: underserved/RTL first, English last (included, never the default).
  const LANG_ORDER = ['arabic', 'dari', 'pashto', 'persian', 'urdu', 'somali', 'swahili',
    'ukrainian', 'spanish', 'french', 'portuguese', 'vietnamese', 'nepali', 'burmese', 'tagalog', 'english'];

  // UI strings. English is authoritative; other languages fall back until a
  // reviewed bundle is added (see company/PROVISIONING-AND-LICENSING.md notes).
  const STRINGS = {
    english: {
      chooseLang: 'Choose your language',
      welcomeMulti: 'اختر لغتك · دری · Español · Tiếng Việt',
      findSchool: 'Find your school',
      searchSchools: 'Search your district…',
      onlyYourSchools: "Only your district's schools appear here.",
      gradeQ: 'What grade are you in?',
      changeLater: 'You can change this later.',
      ready: "You're ready!",
      readyTip: 'Highlight any word on a page to see it in your language — and hear it out loud.',
      privacy: 'We never ask your name. You stay private.',
      classCode: 'Your class code',
      tryDemo: 'Try a demo',
      loading: 'Loading…',
      enrolling: 'Getting things ready…',
      connError: 'Connection problem. Please reload the page.',
    },
  };
  function t(key) {
    const lang = (state.language && STRINGS[state.language]) ? state.language : 'english';
    return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.english[key] || key;
  }
  const langInfo = (code) => window.LB_LANGUAGES[code] || { label: code, nativeLabel: code, rtl: false };

  const state = { language: null, school: null, gradeBand: null, schools: [], isDemo: false };

  // ── Start machinery (unchanged) ────────────────────────────────────
  let _onboardingStarted = false;
  function startOnboardingOnce() {
    if (_onboardingStarted) return;
    _onboardingStarted = true;
    startOnboarding();
  }
  window.addEventListener('lb-consent-given', startOnboardingOnce);
  chrome.storage.local.get(['studentCode'], (local) => {
    if (local.studentCode) {
      window.LBState.studentCode = local.studentCode;
      window.removeEventListener('lb-consent-given', startOnboardingOnce);
      return; // already enrolled
    }
    chrome.storage.sync.get(['consentGiven'], (sync) => {
      if (sync.consentGiven) { window.LBState.consentGiven = true; startOnboardingOnce(); }
    });
  });

  let panel, body;

  function startOnboarding() {
    panel = document.createElement('div');
    panel.id = 'lb-onboarding';
    panel.style.cssText = `
      position: fixed; inset: 0; z-index: 2147483600; display: flex;
      align-items: flex-start; justify-content: center; overflow-y: auto;
      background: rgba(41,24,38,0.45); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Nunito, sans-serif;`;
    const card = document.createElement('div');
    card.id = 'lb-onboard-card';
    card.style.cssText = `
      width: 440px; max-width: calc(100vw - 32px); margin: 40px 0 40px;
      background: #fff; border-radius: 24px; box-shadow: 0 24px 70px rgba(0,0,0,0.4); overflow: hidden;`;
    card.innerHTML = '<div style="height:6px;background:linear-gradient(90deg,#742a69 0%,#f37030 78%,#ffc755 100%);"></div>'
      + '<div id="lb-onboard-body" style="padding:24px 22px 22px;"></div>';
    panel.appendChild(card);
    document.body.appendChild(panel);
    body = card.querySelector('#lb-onboard-body');
    showLanguage();
  }

  function progress(step) {
    // step: 1 language, 2 school/grade, 3 ready
    const cells = [1, 2, 3].map((n) => {
      const on = n === step;
      const c = (n <= step) ? '#742a69' : '#e2d3dd';
      return `<div style="width:${on ? 22 : 7}px;height:7px;border-radius:4px;background:${c};"></div>`;
    }).join('');
    return `<div style="display:flex;align-items:center;justify-content:center;gap:7px;margin-top:20px;">${cells}</div>`;
  }

  function backBtn(onClick) {
    const b = document.createElement('div');
    b.style.cssText = 'width:38px;height:38px;border-radius:50%;border:2px solid #ece3e9;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#742a69" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>';
    b.addEventListener('click', onClick);
    return b;
  }

  function wireBack(onClick) {
    const h = body.querySelector('#lb-ob-head');
    if (h) h.appendChild(backBtn(onClick));
  }

  // ── Screen 1: Language ─────────────────────────────────────────────
  function showLanguage() {
    const tiles = LANG_ORDER.filter((c) => window.LB_LANGUAGES[c]).map((code) => {
      const info = langInfo(code);
      const rtl = info.rtl ? ' dir="rtl"' : '';
      const align = info.rtl ? 'right' : 'left';
      const nativeSame = info.nativeLabel === info.label;
      return `<button class="lb-ob-tile" data-code="${window.escapeHtml(code)}" style="display:flex;align-items:center;gap:11px;padding:11px 12px;min-height:58px;border:2px solid #ece3e9;border-radius:14px;background:#fff;cursor:pointer;">
        <span style="width:34px;height:24px;border-radius:5px;background:${FLAG[code] || '#ccc'};box-shadow:inset 0 0 0 1px rgba(0,0,0,0.09);flex:0 0 auto;"></span>
        <span${rtl} style="text-align:${align};flex:1 1 auto;min-width:0;"><span style="display:block;font-size:16px;font-weight:800;color:#2a1f28;">${window.escapeHtml(info.nativeLabel)}</span>${nativeSame ? '' : `<span style="display:block;font-size:11px;color:#9a8a95;font-weight:600;">${window.escapeHtml(info.label)}</span>`}</span>
      </button>`;
    }).join('');

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;">
        <div style="width:52px;height:52px;border-radius:50%;background:#f4e9f1;display:flex;align-items:center;justify-content:center;">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#742a69" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"></path></svg>
        </div>
        <div style="font-size:20px;font-weight:800;color:#2a1f28;">${t('chooseLang')}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px;">${tiles}</div>
      ${progress(1)}
      <div style="text-align:center;margin-top:14px;"><span id="lb-ob-demo" style="font-size:12px;color:#9a8a95;font-weight:700;cursor:pointer;text-decoration:underline;">${t('tryDemo')}</span></div>`;

    body.querySelectorAll('.lb-ob-tile').forEach((btn) => {
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#742a69'; btn.style.background = '#faf4f8'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#ece3e9'; btn.style.background = '#fff'; });
      btn.addEventListener('click', () => { state.language = btn.dataset.code; state.isDemo ? enrollStudent() : showSchool(); });
    });
    body.querySelector('#lb-ob-demo').addEventListener('click', () => {
      state.isDemo = true; state.school = 'LB-DEMO'; state.gradeBand = '6-8';
      // still let them pick a language so the demo shows their experience
      body.querySelector('#lb-ob-demo').textContent = '↑ pick a language to start the demo';
    });
  }

  // ── Screen 2: School (search over provisioned; demo hidden) ─────────
  async function showSchool() {
    body.innerHTML = headerRow(t('findSchool'))
      + `<div id="lb-ob-list" style="margin-top:16px;text-align:center;color:#9a8a95;font-weight:600;">${t('loading')}</div>${progress(2)}`;
    wireBack(() => showLanguage());

    if (!state.schools.length) {
      try {
        const res = await chrome.runtime.sendMessage({ action: 'api-fetch-get', endpoint: 'onboarding/schools' });
        state.schools = (res && res.ok && res.data && res.data.schools) ? res.data.schools : [];
      } catch (err) { LBLog.error('schools load failed:', err); }
    }
    // Hide the demo sandbox from the student picker.
    const list = state.schools.filter((s) => String(s.schoolCode).toUpperCase() !== 'LB-DEMO');
    renderSchoolList(list, '');
  }

  function renderSchoolList(list, query) {
    const el = document.getElementById('lb-ob-list');
    if (!el) return;
    const filtered = query ? list.filter((s) => (s.schoolName || '').toLowerCase().includes(query.toLowerCase())) : list;
    const rows = filtered.map((s) => `
      <button class="lb-ob-school" data-code="${window.escapeHtml(s.schoolCode)}" style="display:flex;align-items:center;gap:12px;padding:14px;width:100%;border:2px solid #ece3e9;border-radius:14px;background:#fff;cursor:pointer;text-align:left;">
        <span style="width:40px;height:40px;border-radius:11px;background:#f4e9f1;display:flex;align-items:center;justify-content:center;flex:0 0 auto;"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#742a69" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M6 21V8l6-4 6 4v13"></path></svg></span>
        <span style="flex:1 1 auto;min-width:0;font-size:15px;font-weight:800;color:#2a1f28;">${window.escapeHtml(s.schoolName)}</span>
      </button>`).join('') || `<div style="color:#9a8a95;font-weight:600;text-align:center;padding:12px;">No matching schools.</div>`;

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:9px;padding:12px 14px;border:2px solid #ece3e9;border-radius:14px;background:#faf7f9;">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#9a8a95" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4-4"></path></svg>
        <input id="lb-ob-search" placeholder="${t('searchSchools')}" value="${window.escapeHtml(query)}" style="border:none;outline:none;background:transparent;font-size:15px;font-weight:600;color:#2a1f28;width:100%;" />
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">${rows}</div>
      <div style="display:flex;align-items:center;gap:9px;margin-top:14px;padding:11px 13px;border-radius:12px;background:#fdf2e8;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#c25a1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
        <span style="font-size:12px;color:#a1521c;font-weight:700;">${t('onlyYourSchools')}</span>
      </div>`;

    const search = document.getElementById('lb-ob-search');
    search.addEventListener('input', () => renderSchoolListPreserveFocus(list, search.value));
    el.querySelectorAll('.lb-ob-school').forEach((btn) => {
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#742a69'; btn.style.background = '#faf4f8'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#ece3e9'; btn.style.background = '#fff'; });
      btn.addEventListener('click', () => {
        state.school = btn.dataset.code;
        state.schoolObj = list.find((s) => s.schoolCode === btn.dataset.code);
        showGrade();
      });
    });
  }
  function renderSchoolListPreserveFocus(list, query) {
    renderSchoolList(list, query);
    const s = document.getElementById('lb-ob-search');
    if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  // ── Screen 3: Grade (bands from the chosen school) ─────────────────
  function showGrade() {
    const bands = (state.schoolObj && state.schoolObj.gradeBands && state.schoolObj.gradeBands.length)
      ? state.schoolObj.gradeBands : ['K-2', '3-5', '6-8', '9-12'];
    const label = (b) => b === 'K-2' ? 'Grades K–2' : `Grades ${b.replace('-', '–')}`;
    const big = (b) => b === 'K-2' ? 'K–2' : b.replace('-', '–');
    const tiles = bands.map((b, i) => {
      const full = (bands.length % 2 === 1 && i === bands.length - 1) ? 'grid-column:1 / -1;' : '';
      return `<button class="lb-ob-grade" data-band="${window.escapeHtml(b)}" style="${full}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:92px;border:2px solid #ece3e9;border-radius:16px;background:#fff;cursor:pointer;">
        <span style="font-size:28px;font-weight:800;color:#742a69;">${big(b)}</span>
        <span style="font-size:12px;font-weight:700;color:#6d5c67;">${label(b)}</span>
      </button>`;
    }).join('');

    body.innerHTML = headerRow(t('gradeQ'), t('changeLater'))
      + `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:20px;">${tiles}</div>${progress(2)}`;
    wireBack(() => showSchool());

    body.querySelectorAll('.lb-ob-grade').forEach((btn) => {
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#742a69'; btn.style.background = '#faf4f8'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#ece3e9'; btn.style.background = '#fff'; });
      btn.addEventListener('click', () => { state.gradeBand = btn.dataset.band; enrollStudent(); });
    });
  }

  function headerRow(title, sub) {
    return `<div id="lb-ob-head" style="display:flex;align-items:center;gap:12px;min-height:38px;"></div>
      <div style="text-align:center;margin-top:12px;">
        <div style="font-size:21px;font-weight:800;color:#2a1f28;">${window.escapeHtml(title)}</div>
        ${sub ? `<div style="font-size:13px;color:#8a7885;font-weight:600;margin-top:4px;">${window.escapeHtml(sub)}</div>` : ''}
      </div>`;
  }

  // ── Enroll ─────────────────────────────────────────────────────────
  async function enrollStudent() {
    body.innerHTML = `<div style="text-align:center;padding:40px 10px;color:#742a69;font-weight:700;">${t('enrolling')}</div>`;
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch', endpoint: 'onboarding/enroll',
        body: { schoolCode: state.school, gradeBand: state.gradeBand, language: state.language },
      });
      if (!res || !res.ok || !res.data || !res.data.studentCode) {
        body.innerHTML = `<div style="text-align:center;padding:30px 12px;color:#c53f38;font-weight:700;">${(res && res.data && res.data.details) || t('connError')}</div>`;
        return;
      }
      const code = res.data.studentCode;
      window.LBState.studentCode = code;
      window.LBState.schoolCode = state.school;
      window.LBState.gradeBand = state.gradeBand;
      window.LBState.language = state.language;
      window.LBState.onboardingComplete = true;
      await chrome.storage.local.set({ studentCode: code, schoolCode: state.school, gradeBand: state.gradeBand });
      await chrome.storage.sync.set({ defaultLanguage: state.language, onboardingComplete: true });
      showFinish(code);
      LBLog.info('Onboarding complete:', code, state.isDemo ? '(demo)' : '');
    } catch (err) {
      LBLog.error('Enroll failed:', err);
      body.innerHTML = `<div style="text-align:center;padding:30px 12px;color:#c53f38;font-weight:700;">${t('connError')}</div>`;
    }
  }

  // ── Finish ─────────────────────────────────────────────────────────
  function showFinish(code) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;">
        <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#742a69,#f37030);display:flex;align-items:center;justify-content:center;">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>
        </div>
        <div style="font-size:22px;font-weight:800;color:#2a1f28;">${t('ready')}</div>
        <div style="font-size:14px;color:#6d5c67;font-weight:600;max-width:30ch;">${t('readyTip')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:9px;margin-top:18px;padding:11px 13px;border-radius:12px;background:#eef4ee;">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#2f8f5b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>
        <span style="font-size:12px;color:#2c7a4e;font-weight:700;">${t('privacy')}</span>
      </div>
      <div id="lb-ob-start" style="margin-top:18px;padding:16px;border-radius:14px;background:#742a69;color:#fff;text-align:center;font-size:17px;font-weight:800;cursor:pointer;">Start</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;">
        <span style="font-size:11px;color:#b3a4ae;font-weight:700;">${t('classCode')}</span>
        <span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;color:#6d5c67;background:#f2ecef;border-radius:6px;padding:2px 8px;">${window.escapeHtml(code)}</span>
      </div>
      ${progress(3)}`;
    body.querySelector('#lb-ob-start').addEventListener('click', () => panel.remove());
  }
})();
