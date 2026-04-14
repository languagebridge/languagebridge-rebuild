// extension/content/services/lb-translation-service.js
// Calls /lexicon-lookup via background service worker (avoids CORS).
// Includes offline detection and null-response guards.

window.LBTranslationService = {
  async translate(text, targetLang) {
    // Offline check
    if (!navigator.onLine) {
      return { error: 'You appear to be offline. Check your internet connection.' };
    }

    // Student code check
    if (!window.LBState.studentCode) {
      return { error: 'Not enrolled yet. Please complete onboarding first.' };
    }

    // Rate limit
    if (!window.LBRateLimiter.check('translation', window.CONFIG.rateLimits.translationsPerMinute)) {
      LBLog.warn('Translation rate limit reached');
      return { error: 'Rate limit reached. Please wait a moment.' };
    }

    // Cache check
    const cached = window.LBSessionCache?.get(text, targetLang, 'translation');
    if (cached) return cached;

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'lexicon-lookup',
        body: {
          term: text,
          language: targetLang,
          studentCode: window.LBState.studentCode,
          domain: 'k12_academic',
        },
      });

      // Guard against undefined response (background didn't respond)
      if (!res) return { error: 'Extension error. Try reloading the page.' };

      if (!res.ok) {
        if (res.status === 401) return { error: 'API key invalid. Contact your administrator.' };
        LBLog.warn('Lexicon error:', res.data?.error, res.data?.details);
        return { error: res.data?.details || res.data?.error || 'Translation failed' };
      }

      const data = res.data;

      const result = {
        term: data.term,
        source: data.source,
        cognate: data.cognate,
        bridgeAnchor: data.bridge_anchor,
        bridgeScaffold: data.bridge_scaffold,
        bridgeDefinition: data.bridge_definition,
        grammaticalForms: data.grammatical_forms,
        audioUrl: data.audio_url,
        audioSource: data.audio_source,
        ttsBackend: data.tts_backend,
        subject: data.subject,
        gradeBand: data.grade_band,
        transliterationDifficulty: data.transliteration_difficulty,
        translatedText: data.bridge_anchor || data.cognate || '',
        translation: data.bridge_scaffold || data.bridge_anchor || data.cognate || '',
      };

      window.LBSessionCache?.set(text, targetLang, 'translation', result);
      return result;
    } catch (err) {
      LBLog.error('Translation failed:', err);
      return { error: 'Translation unavailable. Please try again.' };
    }
  },
};
