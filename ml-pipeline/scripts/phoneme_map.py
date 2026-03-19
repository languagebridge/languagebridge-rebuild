"""
phoneme_map.py

Maps LanguageBridge language codes to espeak G2P codes and documents
compatibility with Kokoro-82M's 114-token vocabulary.

Used by evaluate_tts.py and the inference service.

Status as of March 2026 — ALL 19 LANGUAGES SUPPORTED:
  espeak (14):   dari, pashto*, persian, arabic†, urdu, ukrainian†,
                 spanish, english, french, portuguese, nepali, burmese,
                 swahili, uzbek, amharic, vietnamese†
  epitran (3):   somali, tagalog, kinyarwanda
  custom (1):    twi (rule-based, twi_g2p.py)

  100% Kokoro vocab coverage for all 19 languages.
  * Pashto uses fa (Farsi) phonemizer as approximation
  † Strip 1 diacritic each (pharyngealization/dental/tone mark)
"""

# LanguageBridge language → G2P backend and code
# "espeak:<code>" = use misaki.espeak.EspeakG2P
# "epitran:<code>" = use epitran.Epitran
# "custom:<module>" = use custom G2P class
ESPEAK_LANG_MAP: dict[str, str | None] = {
    # Pilot languages — espeak
    "dari": "fa",
    "pashto": "fa",       # Approximation: Farsi phonemizer for Pashto script
    "persian": "fa",
    "arabic": "ar",
    "urdu": "ur",
    "ukrainian": "uk",
    "spanish": "es",
    "english": "en-us",
    # Expansion languages — espeak
    "french": "fr-fr",
    "portuguese": "pt",
    "nepali": "ne",
    "burmese": "my",
    "swahili": "sw",
    "vietnamese": "vi",
    "uzbek": "uz",
    "amharic": "am",
    # These 4 use alternative G2P backends (not espeak)
    "somali": None,        # Use epitran som-Latn
    "tagalog": None,       # Use epitran tgl-Latn
    "kinyarwanda": None,   # Use epitran kin-Latn
    "twi": None,           # Use custom twi_g2p.TwiG2P
}

# Alternative G2P backends for languages without espeak support
# All tested: 100% Kokoro vocab coverage
EPITRAN_LANG_MAP: dict[str, str] = {
    "somali": "som-Latn",
    "tagalog": "tgl-Latn",
    "kinyarwanda": "kin-Latn",
}

# Twi uses a custom rule-based G2P (twi_g2p.py)
CUSTOM_G2P_LANGUAGES = {"twi"}

# Phonemes that appear in espeak output but aren't in Kokoro's vocab.
# These are diacritics that can be safely stripped without losing
# intelligibility — they mark secondary articulation features that
# the acoustic model handles implicitly.
STRIP_PHONEMES: dict[str, list[str]] = {
    "arabic": ["ˤ"],      # Pharyngealization mark
    "ukrainian": ["\u032A"],  # Dental diacritic (combining bridge below)
    "vietnamese": ["6"],   # Tone number (acoustic model handles tone from training data)
}

def get_g2p(language: str):
    """Get a G2P instance for any supported language.

    Returns an object with __call__(text) -> (phonemes, tokens).
    Handles espeak, epitran, and custom backends transparently.
    """
    # espeak languages
    espeak_code = ESPEAK_LANG_MAP.get(language)
    if espeak_code is not None:
        from misaki import espeak
        return espeak.EspeakG2P(language=espeak_code)

    # epitran languages (Somali, Tagalog, Kinyarwanda)
    epitran_code = EPITRAN_LANG_MAP.get(language)
    if epitran_code is not None:
        import epitran as _epitran
        epi = _epitran.Epitran(epitran_code)
        # Wrap to match espeak interface: __call__ returns (phonemes, None)
        class EpitranWrapper:
            def __call__(self, text):
                return epi.transliterate(text), None
        return EpitranWrapper()

    # Custom G2P (Twi)
    if language in CUSTOM_G2P_LANGUAGES:
        from twi_g2p import TwiG2P
        return TwiG2P()

    return None


def get_espeak_code(language: str) -> str | None:
    """Get the espeak language code for a LanguageBridge language.
    Returns None for languages that use epitran or custom G2P.
    """
    return ESPEAK_LANG_MAP.get(language)


def clean_phonemes(phonemes: str, language: str) -> str:
    """Strip unmapped diacritics for languages with partial support."""
    strips = STRIP_PHONEMES.get(language, [])
    for s in strips:
        phonemes = phonemes.replace(s, "")
    return phonemes


def can_use_kokoro(language: str) -> bool:
    """Check if a language can use Kokoro TTS (has any G2P support)."""
    return (
        ESPEAK_LANG_MAP.get(language) is not None
        or language in EPITRAN_LANG_MAP
        or language in CUSTOM_G2P_LANGUAGES
    )
