"""
voice_router.py

Unified TTS voice routing for LanguageBridge.
Routes each language to the best available TTS backend:

  Tier 1 — Piper TTS (MIT license, natural voices, 6+ languages)
  Tier 2 — Kokoro fine-tuned + optimized voice pack (Apache 2.0, our custom models)
  Tier 3 — Kokoro fine-tuned + default voice (fallback)

Usage:
  from voice_router import synthesize
  audio_path = synthesize("سلام", language="dari", output_path="/tmp/test.wav")
"""

import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

BASE = Path(__file__).resolve().parents[1]
VOICES_DIR = BASE / "voices"
MODELS_DIR = BASE / "models"

# ---------------------------------------------------------------------------
# Language → TTS backend routing table
# ---------------------------------------------------------------------------

@dataclass
class VoiceConfig:
    backend: str                  # "piper" or "kokoro"
    piper_model: Optional[str]    # Piper model name (auto-downloads)
    kokoro_voice: Optional[str]   # Kokoro voice pack name in voices/
    quality: str                  # "production", "beta", "experimental"


VOICE_MAP = {
    # --- TIER 1: Piper pre-trained (natural, ship-ready) ---
    "arabic":       VoiceConfig("piper", "ar_JO-kareem-medium", None, "production"),
    "french":       VoiceConfig("piper", "fr_FR-siwis-medium", None, "production"),
    "portuguese":   VoiceConfig("piper", "pt_BR-faber-medium", None, "production"),
    "ukrainian":    VoiceConfig("piper", "uk_UA-ukrainian_tts-medium", None, "production"),
    "vietnamese":   VoiceConfig("piper", "vi_VN-vais1000-medium", None, "production"),
    "spanish":      VoiceConfig("piper", "es_MX-claude-high", None, "production"),
    "spanish_mexican":    VoiceConfig("piper", "es_MX-claude-high", None, "production"),
    "spanish_colombian":  VoiceConfig("piper", "es_MX-claude-high", None, "beta"),
    "spanish_peruvian":   VoiceConfig("piper", "es_MX-claude-high", None, "beta"),
    "spanish_puerto_rico": VoiceConfig("piper", "es_MX-claude-high", None, "beta"),
    "spanish_venezuelan": VoiceConfig("piper", "es_MX-claude-high", None, "beta"),

    # --- TIER 1.5: Piper available but may need quality check ---
    "persian":      VoiceConfig("piper", "fa_IR-amir-medium", None, "beta"),
    "nepali":       VoiceConfig("piper", "ne_NP-google-medium", None, "beta"),
    "swahili":      VoiceConfig("piper", "sw_CD-lanfrica-medium", None, "beta"),

    # --- TIER 1.5 continued: Using related Piper voices ---
    "dari":         VoiceConfig("piper", "fa_IR-amir-medium", None, "beta"),           # Persian → Dari (same script/phonemes)
    "dari_afghan":  VoiceConfig("piper", "fa_IR-amir-medium", None, "beta"),           # Persian → Afghan Dari
    "pashto":       VoiceConfig("piper", "fa_IR-amir-medium", None, "experimental"),   # Persian closest to Pashto

    # --- TIER 2: Piper proxy voices (related language, not exact) ---
    "urdu":         VoiceConfig("piper", "ar_JO-kareem-medium", None, "experimental"), # Arabic → Urdu (shared script)
    "somali":       VoiceConfig("piper", "sw_CD-lanfrica-medium", None, "experimental"), # Swahili → Somali (East African)
    "kinyarwanda":  VoiceConfig("piper", "sw_CD-lanfrica-medium", None, "experimental"), # Swahili → Kinyarwanda (Bantu)
    "twi":          VoiceConfig("piper", "sw_CD-lanfrica-medium", None, "experimental"), # Swahili → Twi (closest African)

    # --- TIER 3: Kokoro only (no related Piper voice exists) ---
    "burmese":      VoiceConfig("kokoro", None, "burmese", "experimental"),
    "uzbek":        VoiceConfig("kokoro", None, "uzbek", "experimental"),
    "amharic":      VoiceConfig("kokoro", None, "amharic", "experimental"),
    "tagalog":      VoiceConfig("kokoro", None, "tagalog", "experimental"),
    "tigrinya":     VoiceConfig("kokoro", None, "tigrinya", "experimental"),
}


def get_voice_config(language: str) -> VoiceConfig:
    """Get the voice configuration for a language."""
    if language not in VOICE_MAP:
        raise ValueError(f"Unsupported language: {language}. Supported: {sorted(VOICE_MAP.keys())}")
    return VOICE_MAP[language]


def list_languages():
    """List all supported languages and their TTS status."""
    print(f"{'Language':<25s} {'Backend':<10s} {'Quality':<15s} {'Model/Voice'}")
    print("─" * 80)
    for lang in sorted(VOICE_MAP):
        cfg = VOICE_MAP[lang]
        model = cfg.piper_model or cfg.kokoro_voice or "default"
        print(f"{lang:<25s} {cfg.backend:<10s} {cfg.quality:<15s} {model}")


def synthesize_piper(text: str, model_name: str, output_path: str) -> str:
    """Synthesize with Piper TTS. Downloads model on first use."""
    cmd = [
        sys.executable, "-m", "piper",
        "--model", model_name,
        "--output_file", output_path,
    ]
    proc = subprocess.run(
        cmd, input=text, capture_output=True, text=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Piper failed: {proc.stderr}")
    return output_path


def synthesize_kokoro(text: str, language: str, voice_name: str,
                      output_path: str) -> str:
    """Synthesize with Kokoro fine-tuned model + optimized voice pack."""
    import soundfile as sf
    import torch
    from kokoro import KModel, KPipeline
    from misaki import espeak

    sys.path.insert(0, str(BASE / "scripts"))
    from phoneme_map import get_espeak_code, clean_phonemes

    espeak_code = get_espeak_code(language)
    if not espeak_code:
        raise ValueError(f"No espeak code for {language}")

    g2p = espeak.EspeakG2P(language=espeak_code)
    phonemes, _ = g2p(text)
    phonemes = clean_phonemes(phonemes, language)

    if not phonemes:
        raise ValueError(f"No phonemes generated for: {text}")

    # Load model (fine-tuned if available, else base)
    model = KModel(repo_id="hexgrad/Kokoro-82M")
    ft_path = MODELS_DIR / language / f"{language}_tts_v1.pth"
    if ft_path.exists():
        state = torch.load(ft_path, map_location="cpu")
        model.load_state_dict(state, strict=False)

    # Load voice pack (optimized if available, else default)
    voice_path = VOICES_DIR / f"{voice_name}.pt"
    if voice_path.exists():
        voice_pack = torch.load(voice_path, map_location="cpu")
    else:
        pipeline = KPipeline(lang_code="a", model=False)
        voice_pack = pipeline.load_voice("af_heart")

    idx = min(len(phonemes) - 1, voice_pack.shape[0] - 1)
    ref_s = voice_pack[idx]

    with torch.no_grad():
        out = model(phonemes, ref_s, speed=1.0, return_output=True)

    sf.write(output_path, out.audio.numpy(), 24000)
    return output_path


def synthesize(text: str, language: str, output_path: Optional[str] = None) -> str:
    """
    Synthesize speech for any supported language.
    Automatically routes to the best available TTS backend.

    Returns the path to the generated WAV file.
    """
    cfg = get_voice_config(language)

    if output_path is None:
        output_path = tempfile.mktemp(suffix=".wav", prefix=f"lb_tts_{language}_")

    if cfg.backend == "piper":
        return synthesize_piper(text, cfg.piper_model, output_path)
    elif cfg.backend == "kokoro":
        return synthesize_kokoro(text, language, cfg.kokoro_voice, output_path)
    else:
        raise ValueError(f"Unknown backend: {cfg.backend}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="LanguageBridge TTS Voice Router")
    parser.add_argument("--list", action="store_true", help="List all supported languages")
    parser.add_argument("--language", "-l", help="Language code")
    parser.add_argument("--text", "-t", help="Text to synthesize")
    parser.add_argument("--output", "-o", help="Output WAV path")
    args = parser.parse_args()

    if args.list:
        list_languages()
    elif args.language and args.text:
        path = synthesize(args.text, args.language, args.output)
        print(f"Saved: {path}")
        print(f"Play:  afplay {path}")
    else:
        parser.print_help()
