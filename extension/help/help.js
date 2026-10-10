// extension/help/help.js
// Renders the shared tips into the bundled help page. This page is part of the
// extension itself, so it opens even where content scripts cannot run.

const tipsEl = document.getElementById('tips');
(window.LB_HELP_TIPS || []).forEach(([title, text]) => {
  const tip = document.createElement('div');
  tip.className = 'help-tip';
  const t = document.createElement('div');
  t.className = 'help-tip-title';
  t.textContent = title;
  const d = document.createElement('div');
  d.className = 'help-tip-text';
  d.textContent = text;
  tip.append(t, d);
  tipsEl.appendChild(tip);
});
