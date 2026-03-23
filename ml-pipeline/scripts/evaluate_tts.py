#!/usr/bin/env python3
"""
evaluate_tts.py

Generate test audio samples from the fine-tuned Dari TTS model and compare
against the base Kokoro model. Listen to both to evaluate quality.

Usage:
  python scripts/evaluate_tts.py --language dari
  python scripts/evaluate_tts.py --language dari --output-dir /tmp/tts_eval
"""

import argparse
import os
import time
from pathlib import Path

import soundfile as sf
import torch
from kokoro import KModel, KPipeline
from misaki import espeak

BASE = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE / "models"

# Test sentences: Dari academic terms and bridge definitions from our lexicon
TEST_SENTENCES = {
    "dari": [
        # Bridge definitions (what students actually hear)
        ("photosynthesis_bridge", "روندی که گیاهان از نور آفتاب غذا می‌سازند"),
        ("water_cycle_bridge", "چرخش آب بین زمین و آسمان"),
        ("gravity_bridge", "نیرویی که اشیا را به سمت زمین می‌کشد"),
        ("democracy_bridge", "نظامی که مردم رهبران خود را انتخاب می‌کنند"),
        ("ecosystem_bridge", "محلی که موجودات زنده و غیرزنده با هم زندگی می‌کنند"),
        # Cognates (direct translations)
        ("photosynthesis_cognate", "فوتوسنتز"),
        ("cell_cognate", "سلول"),
        ("atom_cognate", "اتم"),
        ("oxygen_cognate", "اکسیژن"),
        ("chromosome_cognate", "کروموزوم"),
        # School navigation (day-one survival words)
        ("bathroom", "تشناب کجاست"),
        ("cafeteria", "غذاخوری"),
        ("classroom", "صنف"),
        ("teacher", "معلم"),
        ("homework", "کار خانگی"),
        # Longer explanation
        ("mitosis_bridge", "روندی که یک سلول به دو سلول مساوی تقسیم می‌شود"),
        ("fraction_bridge", "عددی که بخشی از یک عدد کامل را نشان می‌دهد"),
        ("revolution_bridge", "حرکت زمین به دور آفتاب که یک سال طول می‌کشد"),
        ("constitution_bridge", "سندی که قوانین اساسی یک کشور را مشخص می‌کند"),
        ("evaporation_bridge", "وقتی آب گرم شده و به بخار تبدیل می‌شود"),
    ],
}

# Voice pack to use for style reference
DEFAULT_VOICE = "af_heart"


def evaluate(language: str, output_dir: str):
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    sentences = TEST_SENTENCES.get(language)
    if not sentences:
        print(f"No test sentences for language: {language}")
        return

    # Setup G2P using phoneme map
    from phoneme_map import get_espeak_code, clean_phonemes, can_use_kokoro, NO_ESPEAK_FALLBACK

    if not can_use_kokoro(language):
        fallback = NO_ESPEAK_FALLBACK.get(language, "No fallback available")
        print(f"Cannot use Kokoro for {language} — no espeak support.")
        print(f"Fallback: {fallback}")
        return

    espeak_lang = get_espeak_code(language)
    print(f"Setting up G2P with espeak language: {espeak_lang}")
    g2p = espeak.EspeakG2P(language=espeak_lang)

    # Load base model
    print("Loading Kokoro-82M base model...")
    base_model = KModel(repo_id="hexgrad/Kokoro-82M")

    # Load voice pack for style
    # Check for a language-specific voice pack first
    custom_voice_path = MODELS_DIR.parent / "voices" / f"{language}.pt"
    if custom_voice_path.exists():
        print(f"Using native voice pack: {custom_voice_path}")
        voice_pack = torch.load(custom_voice_path, map_location="cpu")
    else:
        print(f"No native voice pack found. Using default: {DEFAULT_VOICE}")
        pipeline = KPipeline(lang_code="a", model=False)
        voice_pack = pipeline.load_voice(DEFAULT_VOICE)

    # Check for fine-tuned weights
    finetuned_path = MODELS_DIR / language / f"{language}_tts_v1.pth"
    has_finetuned = finetuned_path.exists()

    if has_finetuned:
        print(f"Loading fine-tuned weights: {finetuned_path}")
        finetuned_model = KModel(repo_id="hexgrad/Kokoro-82M")
        state = torch.load(finetuned_path, map_location="cpu")
        finetuned_model.load_state_dict(state, strict=False)
    else:
        print(f"No fine-tuned weights at {finetuned_path} — base model only")

    # Generate samples
    print(f"\nGenerating {len(sentences)} test samples...")
    print(f"Output: {output_path}\n")
    print(f"{'Name':30s} {'Phonemes':50s} {'Base':>6s} {'Fine':>6s}")
    print("─" * 100)

    for name, text in sentences:
        phonemes, _ = g2p(text)
        if not phonemes:
            print(f"{name:30s} FAILED — no phonemes generated")
            continue

        # Strip unmapped diacritics for partial-support languages
        phonemes = clean_phonemes(phonemes, language)

        # Trim phonemes if too long
        if len(phonemes) > 510:
            phonemes = phonemes[:510]

        ref_s = voice_pack[min(len(phonemes) - 1, voice_pack.shape[0] - 1)]

        # Base model
        try:
            base_output = base_model(phonemes, ref_s, speed=1.0, return_output=True)
            base_dur = f"{base_output.audio.shape[0]/24000:.1f}s"
            sf.write(str(output_path / f"{name}_base.wav"), base_output.audio.numpy(), 24000)
        except Exception as e:
            base_dur = f"ERR"
            print(f"  Base error for {name}: {e}")

        # Fine-tuned model
        fine_dur = "N/A"
        if has_finetuned:
            try:
                fine_output = finetuned_model(phonemes, ref_s, speed=1.0, return_output=True)
                fine_dur = f"{fine_output.audio.shape[0]/24000:.1f}s"
                sf.write(str(output_path / f"{name}_finetuned.wav"), fine_output.audio.numpy(), 24000)
            except Exception as e:
                fine_dur = f"ERR"
                print(f"  Fine-tuned error for {name}: {e}")

        print(f"{name:30s} {phonemes[:48]:50s} {base_dur:>6s} {fine_dur:>6s}")

    print(f"\n{'─' * 100}")
    print(f"Output directory: {output_path}")
    print(f"Files generated: {len(list(output_path.glob('*.wav')))}")
    print(f"\nListen to the pairs and compare:")
    print(f"  Base:       *_base.wav      (Kokoro default, no Dari training)")
    print(f"  Fine-tuned: *_finetuned.wav (trained on {language} speech data)")
    print(f"\nPlay with: afplay {output_path}/<name>_base.wav")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate fine-tuned TTS model")
    parser.add_argument("--language", "-l", default="dari")
    parser.add_argument("--output-dir", "-o", default="/tmp/tts_eval")
    parser.add_argument("--voice", "-v", default=None,
                        help="Voice pack name (e.g., 'dari' to use voices/dari.pt) or Kokoro voice (e.g., 'af_heart')")
    args = parser.parse_args()
    evaluate(args.language, args.output_dir)
