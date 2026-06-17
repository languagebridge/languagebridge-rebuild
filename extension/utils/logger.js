// extension/utils/logger.js
// Simple logger with emoji prefixes for easy console filtering

window.LBLog = {
  info: (...args) => console.log('🌉', ...args),
  warn: (...args) => console.warn('🌉⚠️', ...args),
  error: (...args) => console.error('🌉❌', ...args),
  debug: (...args) => console.debug('🌉🔍', ...args),
};