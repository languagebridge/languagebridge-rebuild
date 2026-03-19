#!/usr/bin/env python3
"""
split_dari_persian.py

Separates Common Voice Farsi (fa) data into three categories:
  1. Dari (Afghan)    — speakers self-identified as Afghan/Kabuli/Dari
  2. Iranian Persian  — speakers self-identified as Iranian/Tehran/etc.
  3. Unknown          — no accent metadata (85% of clips)

The "unknown" pool is the key resource. Strategy:
  - Iranian Persian model: use iranian + unknown (most CV fa speakers are Iranian)
  - Dari model: use dari + YouTube pipeline Afghan sources + DLI data

Current Common Voice fa breakdown (319,795 validated clips):
  Afghan/Dari-identified:     14 clips  (0.004%)
  Iranian-identified:     45,336 clips  (14.2%)
  Unknown/empty accent:  274,445 clips  (85.8%)

Since almost no clips are labeled Dari, we supplement with:
  - DLI (Defense Language Institute) Dari clips already in data/raw/dari/clips_dli/
  - YouTube Afghan radio/TV via youtube_audio_pipeline.py (future)
  - FLEURS prs_af (Afghan Persian) if available

Usage:
  python scripts/split_dari_persian.py
  python scripts/split_dari_persian.py --dry-run
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path

csv.field_size_limit(sys.maxsize)

RAW_DIR = Path("/Volumes/MLTraining/languagebridge-ml/data/raw/dari")
PROCESSED_DIR = Path("/Volumes/MLTraining/languagebridge-ml/data/processed")
SPLITS_DIR = Path(__file__).resolve().parents[1] / "data" / "splits"

# Keywords for accent classification
AFGHAN_KEYWORDS = [
    "afghan", "kabul", "kabuli", "dari", "herat", "mazar",
    "kandahar", "دری", "کابل", "افغان", "هرات", "افغانستان",
]
IRANIAN_KEYWORDS = [
    "iran", "tehran", "mashhad", "isfahan", "shiraz", "tabriz",
    "persian", "native persian", "farsi",
    "تهران", "ایران", "مازندران", "فارس", "بندرعباس",
    "ترک", "اصفهان", "شیراز", "مشهد",
]


def classify_accent(accent: str) -> str:
    """Classify a Common Voice accent string as dari, iranian, or unknown."""
    accent_lower = accent.lower().strip()
    if not accent_lower:
        return "unknown"
    if any(k in accent_lower for k in AFGHAN_KEYWORDS):
        return "dari"
    if any(k in accent_lower for k in IRANIAN_KEYWORDS):
        return "iranian"
    return "unknown"


def main():
    parser = argparse.ArgumentParser(description="Split Common Voice fa into Dari vs Persian")
    parser.add_argument("--dry-run", "-n", action="store_true")
    args = parser.parse_args()

    tsv_path = RAW_DIR / "fa" / "validated.tsv"
    if not tsv_path.exists():
        print(f"Error: {tsv_path} not found")
        sys.exit(1)

    # ── 1. Classify all validated clips ─────────────────────────────
    print("Classifying Common Voice fa clips by accent...")
    dari_clips = []
    iranian_clips = []
    unknown_clips = []

    with open(tsv_path, "r") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            accent = row.get("accents", "")
            category = classify_accent(accent)
            clip_path = row.get("path", "")

            if category == "dari":
                dari_clips.append(clip_path)
            elif category == "iranian":
                iranian_clips.append(clip_path)
            else:
                unknown_clips.append(clip_path)

    print(f"  Dari-identified:    {len(dari_clips):>8,}")
    print(f"  Iranian-identified: {len(iranian_clips):>8,}")
    print(f"  Unknown accent:     {len(unknown_clips):>8,}")

    # ── 2. Find DLI Dari clips (already downloaded) ─────────────────
    dli_dir = RAW_DIR / "clips_dli"
    dli_clips = []
    if dli_dir.exists():
        dli_clips = [str(f) for f in sorted(dli_dir.glob("*.wav"))]
        print(f"  DLI Dari clips:     {len(dli_clips):>8,}")

    # ── 3. Build processed file paths ──────────────────────────────
    # CV clips are in processed/dari/ as common_voice_fa_XXXXX.wav
    proc_dari = PROCESSED_DIR / "dari"
    proc_persian = PROCESSED_DIR / "persian" if (PROCESSED_DIR / "persian").exists() else None

    def cv_to_processed(clip_path: str) -> str:
        """Convert CV clip path (e.g., 'common_voice_fa_123.mp3') to processed wav path."""
        stem = Path(clip_path).stem
        return str(proc_dari / f"{stem}.wav")

    # ── 4. Build Dari dataset ──────────────────────────────────────
    # Strategy: labeled Dari + DLI clips + portion of unknown
    # We assign unknown clips to Iranian (since most CV fa speakers are Iranian)
    dari_processed = []

    # Add labeled Dari clips
    for clip in dari_clips:
        p = cv_to_processed(clip)
        if os.path.exists(p):
            dari_processed.append(p)

    # Add DLI clips
    for clip in dli_clips:
        dari_processed.append(clip)

    # ── 5. Build Iranian Persian dataset ───────────────────────────
    # Strategy: labeled Iranian + all unknown (conservative — assume most are Iranian)
    iranian_processed = []

    for clip in iranian_clips:
        p = cv_to_processed(clip)
        if os.path.exists(p):
            iranian_processed.append(p)

    for clip in unknown_clips:
        p = cv_to_processed(clip)
        if os.path.exists(p):
            iranian_processed.append(p)

    print(f"\n  Dari dataset:       {len(dari_processed):>8,} clips")
    print(f"  Persian dataset:    {len(iranian_processed):>8,} clips")

    if args.dry_run:
        print("\n[DRY RUN] No files written.")
        print("\nRecommendation:")
        print(f"  Dari has only {len(dari_processed)} clips — not enough for quality TTS.")
        print("  To get more Dari audio:")
        print("    1. youtube_audio_pipeline.py with Afghan radio/TV channels")
        print("    2. FLEURS prs_af (Afghan Persian) dataset")
        print("    3. Record community speakers via a mobile recording app")
        return

    # ── 6. Write split files ────────────────────────────────────────
    import numpy as np
    rng = np.random.RandomState(42)

    for name, clips in [("dari", dari_processed), ("persian", iranian_processed)]:
        if len(clips) < 10:
            print(f"\n  Skipping {name} — only {len(clips)} clips")
            continue

        split_dir = SPLITS_DIR / name
        split_dir.mkdir(parents=True, exist_ok=True)

        # Shuffle and split 80/10/10
        rng.shuffle(clips)
        n = len(clips)
        n_train = int(n * 0.8)
        n_val = int(n * 0.1)

        train = clips[:n_train]
        val = clips[n_train:n_train + n_val]
        test = clips[n_train + n_val:]

        for split_name, split_clips in [("train", train), ("val", val), ("test", test)]:
            path = split_dir / f"{split_name}.txt"
            with open(path, "w") as f:
                f.write("\n".join(split_clips) + "\n")

        print(f"\n  {name}: {len(train)} train / {len(val)} val / {len(test)} test")
        print(f"    Written to {split_dir}")

    # ── 7. Summary ──────────────────────────────────────────────────
    print(f"\n{'=' * 60}")
    print("SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Persian model: {len(iranian_processed):,} clips (iranian + unknown)")
    print(f"    → Ready to train with good data volume")
    print(f"  Dari model:    {len(dari_processed):,} clips (labeled dari + DLI)")
    print(f"    → Limited data — supplement with:")
    print(f"       • Afghan YouTube radio/TV (youtube_audio_pipeline.py)")
    print(f"       • FLEURS prs_af dataset")
    print(f"       • Community speaker recordings")
    print(f"    → Until supplemented, Dari students hear Iranian-accented TTS")
    print(f"       (intelligible but not native-sounding)")


if __name__ == "__main__":
    main()
