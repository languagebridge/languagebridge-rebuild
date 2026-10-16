/**
 * LanguageBridge - Toolbar Flag Controller
 * Handles flag reporting to the backend.
 * Also instantiates the toolbar (this is the last file in load order).
 */

const _TF = LanguageBridgeToolbar.prototype;

// flagType: 'translation' | 'pronunciation' | 'recognition'. The backend REQUIRES
// flagType — without it the flag is rejected. Returns { ok, count } so callers
// can show honest confirmation (never "thank you" on a failed flag).
// opts (all optional): { language, surface, context, intendedText, quiet }
//   language — override the student's language (Talk to Teacher flags the
//              language that was spoken / translated into)
//   surface  — 'lookup' | 'passage' | 'talk_to_teacher' | 'audio'
//   context  — surrounding sentence; defaults to the current selection's sentence
//   quiet    — skip the toolbar status line (caller shows its own confirmation)
const LB_FLAG_TYPES = ['translation', 'pronunciation', 'recognition'];

_TF.reportProblem = async function (flagText, flagType, opts = {}) {
  const text = flagText || this.selectedText || window.LBState.selectedText;
  const type = LB_FLAG_TYPES.includes(flagType) ? flagType : 'translation';
  const language = opts.language || this.userLanguage;
  const status = (msg, kind) => { if (!opts.quiet) this.showStatus(msg, kind); };
  if (!text) { status('Select text to flag', 'error'); return { ok: false }; }

  // Avoid duplicate flags for the same text+type within a session.
  this._flagged = this._flagged || new Set();
  const dedupeKey = `${language}::${type}::${text.toLowerCase().trim()}`;
  if (this._flagged.has(dedupeKey)) {
    return { ok: true, count: 0, alreadyFlagged: true };
  }

  const surface = opts.surface || (text.trim().split(/\s+/).length > 3 ? 'passage' : 'lookup');
  const context = opts.context !== undefined
    ? opts.context
    : (text === this.selectedText ? this.selectedContext : null);
  const subject = window.LBTranslationService?.detectSubject?.() || null;

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'api-fetch',
      endpoint: 'flag-handler',
      body: {
        flaggedText: text.slice(0, 500),
        language,
        studentCode: window.LBState.studentCode,
        timestamp: new Date().toISOString(),
        flagType: type,
        surface,
        ...(context && { context: context.slice(0, 500) }),
        ...(opts.intendedText && { intendedText: opts.intendedText.slice(0, 200) }),
        ...(subject && { subject }),
      },
    });

    if (res?.ok && res.data) {
      this._flagged.add(dedupeKey);
      const count = res.data.flagCount || 1;
      status(`Reported — thank you (${count} flagged this)`, 'success');
      window.LBAnalytics?.flagEvent(text);
      return { ok: true, count };
    }

    LBLog.warn('Flag rejected:', res?.data?.error, res?.data?.details);
    status('Could not send report — please try again', 'error');
    return { ok: false };
  } catch (err) {
    LBLog.warn('Flag failed:', err);
    status('Could not send report — please try again', 'error');
    return { ok: false };
  }
};

// ---------- Help overlay ----------
// Lightweight "how to use it" panel. Replaces the dead LanguageBridgeGuide
// references (that module never existed, so Help did nothing).
_TF.showHelp = function () {
  document.getElementById('lb-help-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lb-help-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.5);' +
    'display:flex;align-items:center;justify-content:center;';

  const tips = window.LB_HELP_TIPS || [];

  const card = document.createElement('div');
  card.style.cssText =
    'background:#fff;color:#333;max-width:440px;width:90%;max-height:80vh;overflow-y:auto;' +
    'border-radius:18px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,0.35);' +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";

  let html = '<h2 style="color:#742a69;margin:0 0 16px;">How to use LanguageBridge</h2>';
  tips.forEach(([t, d]) => {
    html += '<div style="margin-bottom:14px;">' +
      '<div style="font-weight:700;color:#742a69;margin-bottom:2px;">' + window.escapeHtml(t) + '</div>' +
      '<div style="font-size:14px;line-height:1.45;color:#555;">' + window.escapeHtml(d) + '</div></div>';
  });
  card.innerHTML = html;

  const close = document.createElement('button');
  close.textContent = 'Got it';
  close.style.cssText =
    'margin-top:8px;width:100%;padding:12px;border:none;border-radius:12px;cursor:pointer;' +
    'font-size:16px;font-weight:700;color:#fff;background:linear-gradient(135deg,#742a69,#f37030);';
  close.addEventListener('click', () => overlay.remove());
  card.appendChild(close);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
};

// ---------- Instantiate ----------
// This is the last toolbar file in manifest load order, so all prototype methods are defined.

window.__lbToolbar = new LanguageBridgeToolbar();
LBLog.info('Toolbar loaded');

// Session start analytics — deferred until persisted state has loaded. Firing it
// synchronously here would race the async storage read: studentCode is still null,
// so LBAnalytics.send() drops the event (that's why session_start was always 0
// while session_end, which fires later on unload, logged normally).
if (window.LBState?.whenReady) window.LBState.whenReady(() => window.LBAnalytics?.sessionStart());
else window.LBAnalytics?.sessionStart();

// Session end on page unload
window.addEventListener('beforeunload', () => {
  window.LBAnalytics?.sessionEnd();
});
