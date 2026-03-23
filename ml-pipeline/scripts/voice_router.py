"""
voice_router.py

TTS voice routing table for LanguageBridge.
Maps each language to its TTS backend:

  Tier 1 — Piper native voice (production quality)
  Tier 1.5 — Piper proxy voice (related language model)
  Tier 2 — Azure TTS only (no local model)
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

BASE = Path(__file__).resolve().parents[1]
VOICES_DIR = BASE / "voices"


@dataclass
class VoiceConfig:
    backend: str                  # "piper" or "azure"
    piper_model: Optional[str]    # Piper ONNX model name
    quality: str                  # "production", "beta", "experimental"


VOICE_MAP = {
    # --- Tier 1: Piper native (natural, production-ready) ---
    "arabic":       VoiceConfig("piper", "ar_JO-kareem-medium", "production"),
    "french":       VoiceConfig("piper", "fr_FR-mls-medium", "production"),
    "portuguese":   VoiceConfig("piper", "pt_BR-cadu-medium", "production"),
    "ukrainian":    VoiceConfig("piper", "uk_UA-ukrainian_tts-medium", "production"),
    "vietnamese":   VoiceConfig("piper", "vi_VN-vais1000-medium", "production"),
    "spanish":      VoiceConfig("piper", "es_AR-daniela-high", "production"),
    "persian":      VoiceConfig("piper", "fa_IR-amir-medium", "production"),
    "nepali":       VoiceConfig("piper", "ne_NP-chitwan-medium", "beta"),
    "swahili":      VoiceConfig("piper", "sw_CD-lanfrica-medium", "beta"),

    # --- Tier 1.5: Piper proxy (related language model) ---
    "dari":         VoiceConfig("piper", "fa_IR-amir-medium", "beta"),
    "pashto":       VoiceConfig("piper", "fa_IR-amir-medium", "experimental"),
    "urdu":         VoiceConfig("piper", "ar_JO-kareem-medium", "experimental"),
    "somali":       VoiceConfig("piper", "sw_CD-lanfrica-medium", "experimental"),
    "kinyarwanda":  VoiceConfig("piper", "sw_CD-lanfrica-medium", "experimental"),
    "twi":          VoiceConfig("piper", "sw_CD-lanfrica-medium", "experimental"),

    # --- Tier 2: Azure TTS only (no local Piper voice) ---
    "burmese":      VoiceConfig("azure", None, "azure_only"),
    "uzbek":        VoiceConfig("azure", None, "azure_only"),
    "amharic":      VoiceConfig("azure", None, "azure_only"),
    "tagalog":      VoiceConfig("azure", None, "azure_only"),
    "tigrinya":     VoiceConfig("azure", None, "azure_only"),

    # --- English (always available) ---
    "english":      VoiceConfig("azure", None, "production"),
}


def get_voice_config(language: str) -> VoiceConfig:
    """Get the voice configuration for a language."""
    if language not in VOICE_MAP:
        raise ValueError(f"Unsupported language: {language}. Supported: {sorted(VOICE_MAP.keys())}")
    return VOICE_MAP[language]
