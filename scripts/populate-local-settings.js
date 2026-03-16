const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');

const vars = {};
env.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && trimmed[0] !== '#') {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      vars[key] = val;
    }
  }
});

const settingsPath = path.join(root, 'backend', 'local.settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

Object.keys(settings.Values).forEach(k => {
  if (vars[k]) settings.Values[k] = vars[k];
});

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

const populated = Object.keys(settings.Values).filter(
  k => settings.Values[k] && settings.Values[k] !== 'UseDevelopmentStorage=true'
);
console.log('Done. Keys populated:', populated.join(', '));
