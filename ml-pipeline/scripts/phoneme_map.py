"""
phoneme_map.py

Maps LanguageBridge language codes to espeak G2P codes and documents
compatibility with Kokoro-82M's 114-token vocabulary.

Used by evaluate_tts.py and the inference service.

Status as of March 2026:
  READY (10):    dari, pashto*, urdu, spanish, portuguese, nepali,
                 burmese, swahili, uzbek, amharic
  STRIP (3):     arabic, ukrainian, vietnamese (strip 1 diacritic each)
  WORKAROUND (2): french (use fr-fr), persian (same as dari)
  NO ESPEAK (4): somali, tagalog, twi, kinyarwanda

  * Pashto uses fa (Farsi) phonemizer as approximation — Pashto-specific
    letters (ځ ړ ږ ښ) get approximate phonemes but the decoder was trained
    on Pashto audio, so acoustic output is correct even if phonemes are
    imprecise for those characters.
"""

# LanguageBridge language → espeak language code
# None = no espeak support, needs alternative approach
ESPEAK_LANG_MAP: dict[str, str | None] = {
    # Pilot languages
    "dari": "fa",
    "pashto": "fa",       # Approximation: Farsi phonemizer for Pashto script
    "persian": "fa",
    "arabic": "ar",
    "urdu": "ur",
    "somali": None,        # No espeak support
    "ukrainian": "uk",
    "spanish": "es",
    "english": "en-us",
    # Expansion languages
    "french": "fr-fr",
    "portuguese": "pt",
    "nepali": "ne",
    "burmese": "my",
    "swahili": "sw",
    "tagalog": None,       # No espeak support
    "vietnamese": "vi",
    "twi": None,           # No espeak support
    "uzbek": "uz",
    "kinyarwanda": None,   # No espeak support
    "amharic": "am",
}

# Phonemes that appear in espeak output but aren't in Kokoro's vocab.
# These are diacritics that can be safely stripped without losing
# intelligibility — they mark secondary articulation features that
# the acoustic model handles implicitly.
STRIP_PHONEMES: dict[str, list[str]] = {
    "arabic": ["ˤ"],      # Pharyngealization mark
    "ukrainian": ["\u032A"],  # Dental diacritic (combining bridge below)
    "vietnamese": ["6"],   # Tone number (acoustic model handles tone from training data)
}

# Languages with no espeak support — fallback strategies
NO_ESPEAK_FALLBACK = {
    "somali": "Azure TTS (so-SO-MuuseNeural) — best available option until espeak adds Somali",
    "tagalog": "Azure TTS (fil-PH-AngeloNeural) — espeak has no Filipino/Tagalog",
    "twi": "Azure TTS has no Twi — use closest available (ak) or skip TTS for now",
    "kinyarwanda": "Azure TTS has no Kinyarwanda — community recording needed",
}


def get_espeak_code(language: str) -> str | None:
    """Get the espeak language code for a LanguageBridge language."""
    return ESPEAK_LANG_MAP.get(language)


def clean_phonemes(phonemes: str, language: str) -> str:
    """Strip unmapped diacritics for languages with partial support."""
    strips = STRIP_PHONEMES.get(language, [])
    for s in strips:
        phonemes = phonemes.replace(s, "")
    return phonemes


def can_use_kokoro(language: str) -> bool:
    """Check if a language can use Kokoro TTS (has espeak support)."""
    return ESPEAK_LANG_MAP.get(language) is not None
