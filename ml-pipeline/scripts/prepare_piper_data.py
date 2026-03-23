#!/usr/bin/env python3
"""
prepare_piper_data.py

Convert our processed training data into Piper's expected format.
Piper needs:
  dataset_dir/
    metadata.csv     # pipe-delimited: filename|transcript
    wav/
      clip001.wav    # 22050 Hz mono WAV
      clip002.wav

Our data lives at:
  data/processed/{language}/*.wav   (22050 Hz mono, already normalized)
  Each .wav has a matching .txt sidecar with the transcript

Usage:
  python scripts/prepare_piper_data.py --language dari --max-clips 10000
  python scripts/prepare_piper_data.py --language dari --output-dir /tmp/piper_dari
"""

import argparse
import shutil
import sys
from pathlib import Path

import librosa
import soundfile as sf

BASE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = BASE / "data" / "processed"
DEFAULT_OUTPUT = BASE / "data" / "piper_ready"

SAMPLE_RATE = 22050


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--language", "-l", required=True)
    parser.add_argument("--max-clips", "-n", type=int, default=10000)
    parser.add_argument("--output-dir", "-o", default=None)
    args = parser.parse_args()

    lang = args.language
    lang_dir = PROCESSED_DIR / lang

    if not lang_dir.exists():
        print(f"ERROR: No processed data at {lang_dir}")
        sys.exit(1)

    output_dir = Path(args.output_dir) if args.output_dir else DEFAULT_OUTPUT / lang
    wav_dir = output_dir / "wav"
    wav_dir.mkdir(parents=True, exist_ok=True)

    # Find clips with transcripts
    clips = sorted(lang_dir.glob("*.wav"))
    print(f"Found {len(clips)} WAV files in {lang_dir}")

    metadata = []
    copied = 0
    skipped_no_txt = 0
    skipped_short = 0
    skipped_long = 0

    for clip_path in clips:
        if copied >= args.max_clips:
            break

        # Check for transcript sidecar
        txt_path = clip_path.with_suffix(".txt")
        if not txt_path.exists():
            skipped_no_txt += 1
            continue

        transcript = txt_path.read_text().strip()
        if not transcript:
            skipped_no_txt += 1
            continue

        # Check duration
        try:
            audio, sr = librosa.load(str(clip_path), sr=SAMPLE_RATE)
            duration = len(audio) / SAMPLE_RATE
        except Exception:
            continue

        if duration < 1.0:
            skipped_short += 1
            continue
        if duration > 15.0:
            skipped_long += 1
            continue

        # Copy WAV (ensure correct sample rate)
        clip_id = f"clip_{copied:06d}"
        out_wav = wav_dir / f"{clip_id}.wav"

        if sr != SAMPLE_RATE or True:  # always resave to ensure format
            sf.write(str(out_wav), audio, SAMPLE_RATE)
        else:
            shutil.copy2(clip_path, out_wav)

        # Clean transcript — remove pipe characters (Piper delimiter)
        transcript = transcript.replace("|", " ")

        metadata.append(f"{clip_id}|{transcript}")
        copied += 1

        if copied % 500 == 0:
            print(f"  Processed {copied} clips...")

    # Write metadata.csv
    csv_path = output_dir / "metadata.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("\n".join(metadata))

    # Write config for reference
    config = {
        "language": lang,
        "sample_rate": SAMPLE_RATE,
        "clips": copied,
        "source": str(lang_dir),
        "espeak_voice": "fa",  # Persian phonemizer for Dari
    }
    import json
    with open(output_dir / "prep_config.json", "w") as f:
        json.dump(config, f, indent=2)

    print(f"\n{'='*50}")
    print(f"Piper dataset ready: {output_dir}")
    print(f"  Clips:      {copied}")
    print(f"  Skipped:    {skipped_no_txt} (no transcript), {skipped_short} (too short), {skipped_long} (too long)")
    print(f"  metadata:   {csv_path}")
    print(f"  WAV dir:    {wav_dir}")
    print(f"{'='*50}")
    print(f"\nNext: upload this folder to Colab/Azure GPU and run fine-tuning")


if __name__ == "__main__":
    main()
