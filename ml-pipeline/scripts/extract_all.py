"""
Extract all downloaded tar.gz archives in data/raw/.
Handles both standard tar.gz and Common Voice cv-corpus format.

Usage:
  python scripts/extract_all.py
"""

import tarfile
import zipfile
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
RAW_DIR = BASE / "data" / "raw"


def extract_archive(archive_path: Path):
    name = archive_path.stem.replace(".tar", "")
    print(f"\nExtracting: {archive_path.name}")

    # Determine output directory name
    # cv-corpus files get renamed to the language name
    cv_map = {
        "fa": "dari",
        "ps": "pashto",
        "ar": "arabic",
        "ur": "urdu",
        "uz": "uzbek",
        "uk": "ukrainian",
        "es": "spanish",
        "fr": "french",
        "vi": "vietnamese",
        "sw": "swahili",
        "am": "amharic",
        "ti": "tigrinya",
        "tw": "twi",
        "ug": "uyghur",
        "pt": "portuguese",
        "ne": "nepali",
        "so": "somali",
    }

    # Check if it's a cv-corpus file
    stem = archive_path.name
    out_dir = None
    for code, lang_name in cv_map.items():
        if f"-{code}." in stem or stem.startswith(f"{lang_name}"):
            out_dir = RAW_DIR / lang_name
            break

    if out_dir is None:
        # Use the archive name as folder name
        out_dir = RAW_DIR / name

    if out_dir.exists() and any(out_dir.iterdir()):
        print(f"  Already extracted to {out_dir.name}/ — skipping")
        return

    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        if archive_path.suffix == ".gz" or str(archive_path).endswith(".tar.gz"):
            with tarfile.open(archive_path, "r:gz") as t:
                t.extractall(out_dir)
        elif archive_path.suffix == ".zip":
            with zipfile.ZipFile(archive_path, "r") as z:
                z.extractall(out_dir)
        print(f"  Done -> {out_dir.name}/")
    except Exception as e:
        print(f"  Failed: {e}")
        return

    # Count files
    wav = len(list(out_dir.rglob("*.wav")))
    mp3 = len(list(out_dir.rglob("*.mp3")))
    print(f"  Files: {wav} WAV + {mp3} MP3")


if __name__ == "__main__":
    archives = sorted(RAW_DIR.glob("*.tar.gz")) + sorted(RAW_DIR.glob("*.zip"))

    if not archives:
        print("No archives found in data/raw/")
    else:
        print(f"Found {len(archives)} archives in {RAW_DIR}\n")
        for archive in archives:
            extract_archive(archive)

    print("\nExtraction complete.")
    print("Next: python scripts/01_prepare_data.py")
