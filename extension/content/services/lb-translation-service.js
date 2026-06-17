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
      // Detect subject context from page content/URL
      const pageText = (document.title + ' ' + window.location.href).toLowerCase();
      let context = null;
      if (/science|biology|chemistry|physics|photosynthesis|cell|atom/.test(pageText)) context = 'science';
      else if (/math|algebra|geometry|calculus|equation|fraction/.test(pageText)) context = 'math';
      else if (/history|government|geography|social.studies|civics/.test(pageText)) context = 'social_studies';
      else if (/english|reading|writing|literature|essay|grammar/.test(pageText)) context = 'ela';

      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'lexicon-lookup',
        body: {
          term: text,
          language: targetLang,
          studentCode: window.LBState.studentCode,
          ...(context && { context }),
        },
      });

      // Guard against undefined response (background didn't respond)
      if (!res) return { error: 'Extension error. Try reloading the page.' };

      if (!res.ok) {
        if (res.status === 401) return { error: 'API key invalid. Contact your administrator.' };

        // Retry once on INTERNAL_ERROR
        if (res.data?.error === 'INTERNAL_ERROR' && !this._retrying) {
          this._retrying = true;
          LBLog.info('INTERNAL_ERROR — retrying once...');
          await new Promise(r => setTimeout(r, 500));
          const result = await this.translate(text, targetLang);
          this._retrying = false;
          return result;
        }
        this._retrying = false;

        LBLog.warn('Lexicon error:', res.data?.error, res.data?.details);
        // Try /translate fallback before giving up
        const fallback = await this._translateFallback(text, targetLang);
        if (fallback) {
          window.LBSessionCache?.set(text, targetLang, 'translation', fallback);
          return fallback;
        }
        return { error: res.data?.details || res.data?.error || 'Translation failed' };
      }

      const data = res.data;
      LBLog.info(`Lexicon response for "${text}" in ${targetLang}:`, JSON.stringify({
        bridge_anchor: data.bridge_anchor,
        cognate: data.cognate,
        bridge_scaffold: data.bridge_scaffold,
        source: data.source,
        audio_url: data.audio_url ? '(has url)' : null,
      }));

      const term = (text || '').toLowerCase().trim();
      const anchor = (data.bridge_anchor || '').toLowerCase().trim();
      const cognateVal = (data.cognate || '').toLowerCase().trim();
      const scaffold = (data.bridge_scaffold || '').toLowerCase().trim();
      // A cognate that just echoes the English term is NOT a real translation —
      // treat it as missing so it never gets shown as "the translation".
      const realCognate = (data.cognate && cognateVal !== term) ? data.cognate : null;
      // We have something useful only if there's a real native translation.
      // A bridge anchor/scaffold alone is English help, not a translation, so it
      // does NOT prevent falling back to /translate to get the native word.
      const hasContent = !!realCognate;

      // If the lexicon had no real native translation, get one from /translate —
      // but PRESERVE any bridge (English aid) and metadata from the lexicon hit so
      // the student still gets the simple-English scaffold alongside the translation.
      if (!hasContent) {
        LBLog.info(`Lexicon returned no native cognate for "${text}" in ${targetLang}, fetching via /translate`);
        const fallback = await this._translateFallback(text, targetLang);
        if (fallback) {
          fallback.bridgeAnchor = data.bridge_anchor || null;
          fallback.bridgeScaffold = data.bridge_scaffold || null;
          fallback.grammaticalForms = data.grammatical_forms || null;
          fallback.audioUrl = data.audio_url || null;
          fallback.subject = data.subject || null;
          fallback.gradeBand = data.grade_band || null;
          window.LBSessionCache?.set(text, targetLang, 'translation', fallback);
          return fallback;
        }
      }

      const result = {
        term: data.term,
        source: data.source,
        cognate: realCognate,                 // native translation (null if only an English echo)
        bridgeAnchor: data.bridge_anchor,     // simple-English aid — never shown AS the translation
        bridgeScaffold: data.bridge_scaffold,
        bridgeDefinition: data.bridge_definition,
        grammaticalForms: data.grammatical_forms,
        audioUrl: data.audio_url,
        audioSource: data.audio_source,
        ttsBackend: data.tts_backend,
        subject: data.subject,
        gradeBand: data.grade_band,
        transliterationDifficulty: data.transliteration_difficulty,
        translatedText: realCognate || '',    // primary = the native translation
      };

      window.LBSessionCache?.set(text, targetLang, 'translation', result);
      return result;
    } catch (err) {
      LBLog.error('Translation failed:', err);
      return { error: 'Translation unavailable. Please try again.' };
    }
  },

  async _translateFallback(text, targetLang) {
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'api-fetch',
        endpoint: 'translate',
        body: {
          text,
          fromLanguage: 'english',
          toLanguage: targetLang,
          studentCode: window.LBState.studentCode,
        },
      });
      if (!res?.ok) {
        LBLog.warn('Translate fallback failed:', res?.data?.error);
        return null;
      }
      const translated = res.data?.translation || res.data?.translatedText || res.data?.text || '';
      if (!translated) return null;

      LBLog.info(`Translate fallback: "${text}" → "${translated}" (${targetLang})`);
      return {
        term: text,
        source: 'translator_fallback',
        cognate: translated,
        bridgeAnchor: null,
        bridgeScaffold: null,
        bridgeDefinition: null,
        grammaticalForms: null,
        audioUrl: null,
        audioSource: null,
        ttsBackend: null,
        subject: null,
        gradeBand: null,
        transliterationDifficulty: null,
        translatedText: translated,
        translation: translated,
      };
    } catch (err) {
      LBLog.error('Translate fallback error:', err);
      return null;
    }
  },
};
