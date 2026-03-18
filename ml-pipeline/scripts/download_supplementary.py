"""
Download supplementary speech datasets from OpenSLR for languages
missing or too small in Mozilla Data Collective.

All datasets are CC BY-SA 4.0 or Apache 2.0 — clean IP chain.

Usage:
  python scripts/download_supplementary.py                    # all languages
  python scripts/download_supplementary.py --lang tagalog     # single language
  python scripts/download_supplementary.py --dry-run          # show sources only

Sources:
  Tagalog:  openslr.org/80  (CC BY-SA 4.0) — same dataset as Burmese
  Amharic:  openslr.org/25  (CC BY-SA 4.0)
  Swahili:  openslr.org/25  (CC BY-SA 4.0)
  Nepali:   openslr.org/54  (CC BY-SA 4.0) — sharded into 16 zips
  Somali:   no clean open-source corpus — using transfer learning from Arabic
"""

import argparse
import subprocess
import tarfile
import zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
RAW_DIR = Path("/Volumes/MLTraining/languagebridge-ml/data/raw")

# Each entry is a list of URLs to download (some datasets are sharded)
SOURCES = {
    # Tagalog — not on MDC, OpenSLR 80 is the only clean source
    "tagalog": {
        "urls": [
            "https://openslr.org/resources/80/fil_ph_female.zip",
            "https://openslr.org/resources/80/fil_ph_male.zip",
        ],
        "format": "zip",
        "license": "CC BY-SA 4.0",
        "note": "OpenSLR 80 — Filipino/Tagalog crowdsourced TTS",
    },
    # Nepali — MDC has only 38MB, OpenSLR 54 has ~9.3GB
    "nepali": {
        "urls": [
            f"https://openslr.elda.org/resources/54/asr_nepali_{i}.zip"
            for i in list("0123456789abcdef")
        ],
        "format": "zip",
        "license": "CC BY-SA 4.0",
        "note": "OpenSLR 54 — Nepali ASR (16 shards, ~9.3 GB total)",
    },
    # Spanish dialects — supplement MDC's 48GB general Spanish
    # Prioritized for Ohio's Latino refugee/immigrant population
    "spanish_puerto_rico": {
        "urls": [
            "https://openslr.elda.org/resources/74/es_pr_female.zip",
        ],
        "format": "zip",
        "license": "CC BY-SA 4.0",
        "note": "OpenSLR 74 — Puerto Rican Spanish (large Columbus/Cleveland community)",
    },
    "spanish_colombian": {
        "urls": [
            "https://openslr.elda.org/resources/72/es_co_female.zip",
            "https://openslr.elda.org/resources/72/es_co_male.zip",
        ],
        "format": "zip",
        "license": "CC BY-SA 4.0",
        "note": "OpenSLR 72 — Colombian Spanish (refugee population + General LatAm proxy)",
    },
    "spanish_venezuelan": {
        "urls": [
            "https://openslr.elda.org/resources/75/es_ve_female.zip",
            "https://openslr.elda.org/resources/75/es_ve_male.zip",
        ],
        "format": "zip",
        "license": "CC BY-SA 4.0",
        "note": "OpenSLR 75 — Venezuelan Spanish (growing refugee community)",
    },
    "spanish_peruvian": {
        "urls": [
            "https://openslr.elda.org/resources/73/es_pe_female.zip",
            "https://openslr.elda.org/resources/73/es_pe_male.zip",
        ],
        "format": "zip",
        "license": "CC BY-SA 4.0",
        "note": "OpenSLR 73 — Peruvian Spanish (Andean/Central American proxy)",
    },
    "spanish_mexican": {
        "urls": [
            "https://openslr.elda.org/resources/39/LDC2006S37.tar.gz",
        ],
        "format": "tar.gz",
        "license": "Apache 2.0",
        "note": "OpenSLR 39 — Mexican Spanish (Heroico corpus)",
    },
    # NOTE: Swahili (21GB) and Amharic are better sourced from MDC directly
}


def extract_archive(archive_path: Path, out_dir: Path):
    name = archive_path.name
    if name.endswith(".zip"):
        with zipfile.ZipFile(archive_path, "r") as z:
            z.extractall(out_dir)
    elif name.endswith(".tar.bz2") or name.endswith(".tar.gz") or name.endswith(".tgz"):
        mode = "r:bz2" if name.endswith(".bz2") else "r:gz"
        with tarfile.open(archive_path, mode) as t:
            t.extractall(out_dir)
    else:
        raise ValueError(f"Unknown archive format: {name}")


def download_language(name, config, dry_run=False):
    print(f"\n[{name}]  {config['note']}")
    print(f"  License: {config['license']}")
    print(f"  Files:   {len(config['urls'])}")

    if dry_run:
        for url in config["urls"]:
            print(f"  {url}")
        return

    out_dir = RAW_DIR / name
    clips_dir = out_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    for url in config["urls"]:
        filename = url.split("/")[-1]
        archive_path = out_dir / filename

        print(f"  Downloading {filename}...")
        result = subprocess.run(
            ["curl", "-L", "-C", "-", "--progress-bar", "--max-time", "3600", "-o", str(archive_path), url],
            check=False
        )

        if result.returncode != 0:
            print(f"  Failed to download {filename}")
            continue

        # Verify it's not an HTML error page
        with open(archive_path, "rb") as f:
            header = f.read(16)
        if b"<!DOCTYPE" in header or b"<html" in header:
            print(f"  Got HTML instead of file — URL may have changed, skipping")
            archive_path.unlink()
            continue

        print(f"  Extracting {filename}...")
        try:
            extract_archive(archive_path, clips_dir)
            archive_path.unlink()  # Remove archive after successful extraction
        except Exception as e:
            print(f"  Extraction failed: {e}")
            continue

    wav_count = len(list(clips_dir.rglob("*.wav")))
    mp3_count = len(list(clips_dir.rglob("*.mp3")))
    print(f"  Done — {wav_count} WAV + {mp3_count} MP3 files")

    with open(out_dir / "LICENSE.txt", "w") as f:
        f.write(f"Source: {config['note']}\n")
        f.write(f"License: {config['license']}\n")
        f.write(f"URLs:\n")
        for url in config["urls"]:
            f.write(f"  {url}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", choices=list(SOURCES.keys()), help="Single language")
    parser.add_argument("--dry-run", action="store_true", help="Show sources without downloading")
    args = parser.parse_args()

    langs = {args.lang: SOURCES[args.lang]} if args.lang else SOURCES

    print(f"{'DRY RUN — ' if args.dry_run else ''}Supplementary downloads from OpenSLR\n")
    print("Note: Somali has no clean open-source corpus — will use transfer learning from Arabic\n")

    for name, config in langs.items():
        download_language(name, config, dry_run=args.dry_run)

    if not args.dry_run:
        print("\nAll downloads complete.")
        print("Next: python scripts/01_prepare_data.py")
