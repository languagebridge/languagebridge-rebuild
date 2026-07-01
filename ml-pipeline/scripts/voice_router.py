"""
voice_router.py

TTS voice routing table for LanguageBridge.
Reads from the single source of truth: backend/shared/voice-config.json

Maps each language to its TTS backend:
  Tier 1 — Piper native voice (production quality)
  Tier 1.5 — Piper proxy voice (related language model)
  Tier 2 — Azure TTS only (no local model)
"""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

CONFIG_PATH = Path(__file__).resolve().parents[2] / "backend" / "shared" / "voice-config.json"


@dataclass
class VoiceConfig:
    backend: str                  # "piper" or "azure"
    piper_model: Optional[str]    # Piper ONNX model name
    quality: str                  # "production", "beta", "experimental", "azure_only"
    azure_voice: str              # Azure Neural voice name


def _load_voice_map() -> dict[str, VoiceConfig]:
    with open(CONFIG_PATH) as f:
        raw = json.load(f)
    return {
        lang: VoiceConfig(
            backend=cfg["backend"],
            piper_model=cfg.get("piper_model"),
            quality=cfg["quality"],
            azure_voice=cfg["azure_voice"],
        )
        for lang, cfg in raw.items()
    }


VOICE_MAP = _load_voice_map()


def get_voice_config(language: str) -> VoiceConfig:
    """Get the voice configuration for a language."""
    if language not in VOICE_MAP:
        raise ValueError(f"Unsupported language: {language}. Supported: {sorted(VOICE_MAP.keys())}")
    return VOICE_MAP[language]
