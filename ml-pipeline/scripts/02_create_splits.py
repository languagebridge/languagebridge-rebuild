"""
Step 2: Create 80/10/10 train/val/test splits.

Usage:
  python scripts/02_create_splits.py
  python scripts/02_create_splits.py --lang dari
"""

import argparse
from pathlib import Path
from sklearn.model_selection import train_test_split

LANGUAGES = [
    "dari", "pashto", "arabic", "ukrainian", "urdu", "uzbek",
    "persian", "french", "portuguese", "swahili", "somali",
    "tagalog", "vietnamese", "burmese", "amharic", "nepali", "twi",
    "kinyarwanda", "tigrinya", "uyghur",
    "spanish_colombian", "spanish_mexican", "spanish_peruvian",
    "spanish_puerto_rico", "spanish_venezuelan",
]

BASE = Path(__file__).resolve().parents[1]
PROCESSED_DIR = BASE / "data" / "processed"
SPLITS_DIR = BASE / "data" / "splits"


def create_splits(lang):
    lang_dir = PROCESSED_DIR / lang
    wav_files = sorted(lang_dir.glob("*.wav"))

    if not wav_files:
        print(f"  [{lang}] No WAV files found — run 01_prepare_data.py first")
        return

    train, temp = train_test_split(wav_files, test_size=0.2, random_state=42)
    val, test = train_test_split(temp, test_size=0.5, random_state=42)

    out = SPLITS_DIR / lang
    out.mkdir(parents=True, exist_ok=True)

    for split_name, files in [("train", train), ("val", val), ("test", test)]:
        with open(out / f"{split_name}.txt", "w") as f:
            f.writelines(f"{p}\n" for p in files)

    print(f"  [{lang}] train={len(train)}  val={len(val)}  test={len(test)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", choices=LANGUAGES + ["all"], help="Single language or 'all'")
    args = parser.parse_args()

    langs = [args.lang] if args.lang else LANGUAGES
    for lang in langs:
        create_splits(lang)
