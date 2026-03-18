"""
Step 1: Validate and convert Common Voice audio clips to WAV for Kokoro fine-tuning.

Usage:
  python scripts/01_prepare_data.py                    # all languages
  python scripts/01_prepare_data.py --lang dari        # single language
  python scripts/01_prepare_data.py --dry-run          # validate only
"""

import argparse
import json
from pathlib import Path

import librosa
import soundfile as sf

# Kokoro target sample rate
TARGET_SR = 22050

# All languages: language name -> Common Voice / FLEURS language code
LANGUAGES = {
    # v2.0 core
    "dari":                "fa",
    "pashto":              "ps",
    "arabic":              "ar",
    "urdu":                "ur",
    "uzbek":               "uz",
    "ukrainian":           "uk",
    "persian":             "fa",
    # Phase 2 expansion
    "french":              "fr",
    "portuguese":          "pt",
    "swahili":             "sw",
    "somali":              "so",
    "tagalog":             "fil",
    "vietnamese":          "vi",
    "burmese":             "my",
    "amharic":             "am",
    "nepali":              "ne",
    "twi":                 "tw",
    "kinyarwanda":         "rw",
    "uyghur":              "ug",
    "tigrinya":            "ti",
    # Spanish dialects
    "spanish_colombian":   "es_co",
    "spanish_mexican":     "es_mx",
    "spanish_peruvian":    "es_pe",
    "spanish_puerto_rico": "es_pr",
    "spanish_venezuelan":  "es_ve",
}

BASE = Path(__file__).resolve().parents[1]
RAW_DIR = BASE / "data" / "raw"
PROCESSED_DIR = BASE / "data" / "processed"


def validate_audio(path, min_duration=1.0, max_duration=20.0):
    """Return (is_valid, reason)."""
    try:
        y, sr = librosa.load(path, sr=TARGET_SR, mono=True)
        duration = len(y) / sr

        if duration < min_duration:
            return False, f"Too short: {duration:.1f}s"
        if duration > max_duration:
            return False, f"Too long: {duration:.1f}s"
        if max(abs(y)) > 0.99:
            return False, "Clipping detected"
        if librosa.feature.rms(y=y).mean() < 0.01:
            return False, "Too quiet"

        return True, "OK"
    except Exception as e:
        return False, str(e)


def process_language(name, cv_code, dry_run=False):
    """Process all clips for one language."""
    # Common Voice extracts to a folder named by language code
    input_path = RAW_DIR / cv_code
    if not input_path.exists():
        # Also try the full language name
        input_path = RAW_DIR / name
    if not input_path.exists():
        print(f"  [{name}] Skipping — not found in {RAW_DIR}")
        return

    # Find clips directory — handle multiple MDC/FLEURS layouts:
    # 1. input_path/clips/  (flat MDC layout)
    # 2. input_path/{cv_code}/clips/  (MDC nested: ukrainian/uk/clips)
    # 3. input_path/data/{cv_code}/  (FLEURS layout: pashto/data/ps_af/)
    # 4. input_path/ itself (fallback)
    clips_dir = None
    candidates = [
        input_path / "clips",
        input_path / cv_code / "clips",
        input_path / "data" / f"{cv_code}_af",
        input_path / "data" / f"{cv_code}_eg",
        input_path / "data" / f"{cv_code}_np",
        input_path / "data" / f"{cv_code}_so",
        input_path / "data" / f"{cv_code}_ph",
    ]
    for candidate in candidates:
        if candidate.exists():
            clips_dir = candidate
            break
    if clips_dir is None:
        # Search one level deep for any clips folder
        for sub in input_path.rglob("clips"):
            if sub.is_dir():
                clips_dir = sub
                break
    if clips_dir is None:
        clips_dir = input_path

    mp3_files = list(clips_dir.glob("*.mp3")) + list(clips_dir.glob("**/*.mp3"))
    wav_files = list(clips_dir.glob("*.wav")) + list(clips_dir.glob("**/*.wav"))
    flac_files = list(clips_dir.glob("*.flac")) + list(clips_dir.glob("**/*.flac"))
    all_files = mp3_files + wav_files + flac_files
    # Deduplicate (glob + rglob can overlap)
    all_files = list({str(f): f for f in all_files}.values())
    print(f"  [{name}] {len(all_files)} clips found ({len(mp3_files)} mp3, {len(wav_files)} wav, {len(flac_files)} flac)")

    if not all_files:
        return

    out_dir = PROCESSED_DIR / name
    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    valid, invalid = [], []

    for audio_file in all_files:
        ok, reason = validate_audio(audio_file)
        if ok:
            valid.append(audio_file)
            if not dry_run:
                y, sr = librosa.load(str(audio_file), sr=TARGET_SR, mono=True)
                # Normalize to -20 dBFS
                rms = librosa.feature.rms(y=y).mean()
                if rms > 0:
                    target_rms = 10 ** (-20 / 20)
                    y = y * (target_rms / rms)
                sf.write(str(out_dir / (audio_file.stem + ".wav")), y, TARGET_SR)
        else:
            invalid.append((audio_file.name, reason))

    if not dry_run:
        total_hours = sum(librosa.get_duration(path=str(f)) for f in valid) / 3600
        with open(out_dir / "processing.json", "w") as f:
            json.dump({
                "language": name,
                "cv_code": cv_code,
                "valid_clips": len(valid),
                "invalid_clips": len(invalid),
                "total_audio_hours": round(total_hours, 2),
                "sample_rate": TARGET_SR,
            }, f, indent=2)

    print(f"  [{name}] Valid: {len(valid)}  Invalid: {len(invalid)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", nargs="+", choices=list(LANGUAGES.keys()), help="One or more languages")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    langs = {k: LANGUAGES[k] for k in args.lang} if args.lang else LANGUAGES

    print(f"{'DRY RUN — ' if args.dry_run else ''}Processing {len(langs)} language(s)...\n")
    for name, code in langs.items():
        process_language(name, code, dry_run=args.dry_run)
