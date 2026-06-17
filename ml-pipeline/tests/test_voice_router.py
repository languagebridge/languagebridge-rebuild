"""Tests for voice_router.py — voice routing table integrity."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from voice_router import VOICE_MAP, get_voice_config, VoiceConfig


def test_all_languages_have_config():
    """Every language in the map returns a valid VoiceConfig."""
    for lang, cfg in VOICE_MAP.items():
        assert isinstance(cfg, VoiceConfig), f"{lang} config is not VoiceConfig"
        assert cfg.backend in ("piper", "azure"), f"{lang} has invalid backend: {cfg.backend}"
        assert cfg.quality in ("production", "beta", "experimental", "azure_only"), \
            f"{lang} has invalid quality: {cfg.quality}"


def test_no_kokoro_backend():
    """No language should use kokoro backend."""
    for lang, cfg in VOICE_MAP.items():
        assert cfg.backend != "kokoro", f"{lang} still uses kokoro backend"


def test_piper_languages_have_model():
    """Every piper-backed language must specify a piper_model."""
    for lang, cfg in VOICE_MAP.items():
        if cfg.backend == "piper":
            assert cfg.piper_model is not None, f"{lang} is piper but has no model"
            assert len(cfg.piper_model) > 0, f"{lang} has empty piper_model"


def test_azure_languages_have_no_model():
    """Azure-only languages should not have a piper_model."""
    for lang, cfg in VOICE_MAP.items():
        if cfg.backend == "azure":
            assert cfg.piper_model is None, f"{lang} is azure but has piper_model set"


def test_get_voice_config_valid():
    """get_voice_config returns config for known languages."""
    cfg = get_voice_config("arabic")
    assert cfg.backend == "piper"
    assert cfg.piper_model == "ar_JO-kareem-medium"


def test_get_voice_config_invalid():
    """get_voice_config raises ValueError for unknown languages."""
    try:
        get_voice_config("klingon")
        assert False, "Should have raised ValueError"
    except ValueError:
        pass


def test_minimum_language_count():
    """We should support at least 16 languages (5 non-working langs dropped 2026-06)."""
    assert len(VOICE_MAP) >= 16, f"Only {len(VOICE_MAP)} languages configured"


def test_pilot_languages_present():
    """Core pilot languages must be in the map."""
    required = ["dari", "arabic", "spanish", "ukrainian", "french", "english"]
    for lang in required:
        assert lang in VOICE_MAP, f"Pilot language {lang} missing from VOICE_MAP"
