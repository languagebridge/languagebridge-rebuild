"""
Extract audio from HuggingFace Parquet datasets to WAV files.

Usage:
  python scripts/extract_parquet_audio.py                     # all supplement datasets
  python scripts/extract_parquet_audio.py --lang kinyarwanda   # single language
  python scripts/extract_parquet_audio.py --dry-run            # show counts only
"""

import argparse
import io
from pathlib import Path

import pandas as pd
import soundfile as sf

BASE = Path(__file__).resolve().parents[1]
RAW_DIR = BASE / "data" / "raw"

# Map folder name -> output folder for extracted audio
DATASETS = {
    "kinyarwanda":        "kinyarwanda",
    "tigrinya":           "tigrinya",
    "uyghur":             "uyghur",
    "amharic_supplement": "amharic",       # merge into existing amharic
    "somali_supplement":  "somali",        # merge into existing somali
    "twi_supplement":     "twi",           # merge into existing twi
}


def extract_audio_from_parquet(parquet_path, output_dir, prefix=""):
    """Extract audio column from a single parquet file."""
    df = pd.read_parquet(parquet_path)

    # Find the audio column — common names: audio, speech, input_values
    audio_col = None
    for col in ["audio", "speech", "input_values"]:
        if col in df.columns:
            audio_col = col
            break

    if audio_col is None:
        print(f"    No audio column found in {parquet_path.name}. Columns: {list(df.columns)}")
        return 0

    count = 0
    for idx, row in df.iterrows():
        audio_data = row[audio_col]
        if audio_data is None:
            continue

        out_path = output_dir / f"{prefix}{idx:06d}.wav"
        if out_path.exists():
            count += 1
            continue

        try:
            # HuggingFace audio format: dict with 'bytes', 'path', 'array', 'sampling_rate'
            if isinstance(audio_data, dict):
                if "bytes" in audio_data and audio_data["bytes"]:
                    audio_bytes = audio_data["bytes"]
                    data, sr = sf.read(io.BytesIO(audio_bytes))
                    sf.write(str(out_path), data, sr)
                    count += 1
                elif "array" in audio_data:
                    sr = audio_data.get("sampling_rate", 16000)
                    sf.write(str(out_path), audio_data["array"], sr)
                    count += 1
            elif isinstance(audio_data, bytes):
                data, sr = sf.read(io.BytesIO(audio_data))
                sf.write(str(out_path), data, sr)
                count += 1
        except Exception as e:
            pass  # skip corrupt entries

    return count


def process_dataset(folder_name, output_name, dry_run=False):
    """Process all parquet files in a dataset folder."""
    input_dir = RAW_DIR / folder_name
    if not input_dir.exists():
        print(f"  [{folder_name}] Not found, skipping")
        return

    parquet_files = sorted(input_dir.rglob("*.parquet"))
    if not parquet_files:
        print(f"  [{folder_name}] No parquet files found")
        return

    print(f"  [{folder_name}] {len(parquet_files)} parquet files found")

    if dry_run:
        # Just count rows
        total = 0
        for pf in parquet_files:
            df = pd.read_parquet(pf, columns=[])
            total += len(df)
        print(f"  [{folder_name}] ~{total} audio clips available")
        return

    output_dir = RAW_DIR / output_name / "clips_hf"
    output_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    for i, pf in enumerate(parquet_files):
        prefix = f"{pf.stem}_{i:03d}_"
        count = extract_audio_from_parquet(pf, output_dir, prefix=prefix)
        total += count
        print(f"    {pf.name}: {count} clips extracted")

    print(f"  [{folder_name}] Total: {total} clips -> {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", choices=list(DATASETS.keys()), help="Single dataset")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    datasets = {args.lang: DATASETS[args.lang]} if args.lang else DATASETS

    print(f"{'DRY RUN — ' if args.dry_run else ''}Extracting audio from {len(datasets)} dataset(s)...\n")
    for folder, output in datasets.items():
        process_dataset(folder, output, dry_run=args.dry_run)
