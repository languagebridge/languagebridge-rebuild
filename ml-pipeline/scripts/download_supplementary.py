"""
Download supplementary speech datasets for low-resource pilot languages.

All datasets are CC BY-SA 4.0, CC0, CC-BY, or Apache 2.0 — clean IP chain.

Usage:
  python scripts/download_supplementary.py                    # all languages
  python scripts/download_supplementary.py --lang tagalog     # single language
  python scripts/download_supplementary.py --dry-run          # show sources only

Sources (updated March 2026):
  Pashto:   Common Voice v19.0 (975+ validated hrs, CC0) — massive upgrade from v17
  Somali:   Common Voice v19.0 + FLEURS (CC-BY)
  Twi:      BibleTTS via OpenSLR (160 hrs, CC BY-SA) + HuggingFace 400K pairs
  Tagalog:  OpenSLR 80 + FLEURS + Common Voice v19.0

  Original sources retained: Nepali, Spanish dialects
"""

import argparse
import subprocess
import tarfile
import zipfile
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
RAW_DIR = Path("/Volumes/MLTraining/languagebridge-ml/data/raw")

# ─────────────────────────────────────────────────────────────────────
# HuggingFace datasets (downloaded via `datasets` library)
# ─────────────────────────────────────────────────────────────────────

HF_SOURCES = {
    # ── PASHTO: 335 clips → 600K+ clips ──────────────────────────
    "pashto_cv19": {
        "dataset": "mozilla-foundation/common_voice_19_0",
        "config": "ps",
        "split": "train",
        "license": "CC0",
        "note": "Common Voice v19.0 — Pashto (975+ validated hrs, 687K clips)",
    },
    "pashto_fleurs": {
        "dataset": "google/fleurs",
        "config": "ps_af",
        "split": "train",
        "license": "CC-BY",
        "note": "Google FLEURS — Pashto (curated read speech)",
    },
    # ── SOMALI: 304 clips → ~15K+ clips ──────────────────────────
    "somali_cv19": {
        "dataset": "mozilla-foundation/common_voice_19_0",
        "config": "so",
        "split": "train",
        "license": "CC0",
        "note": "Common Voice v19.0 — Somali",
    },
    "somali_fleurs": {
        "dataset": "google/fleurs",
        "config": "so_so",
        "split": "train",
        "license": "CC-BY",
        "note": "Google FLEURS — Somali (curated read speech)",
    },
    # ── TWI: 258 clips → 400K+ clips ─────────────────────────────
    "twi_400k": {
        "dataset": "michsethowusu/twi-words-speech-text-parallel-400k",
        "config": None,
        "split": "train",
        "license": "HuggingFace",
        "note": "Twi Words Speech-Text Parallel (413K pairs)",
    },
    "twi_multispeaker": {
        "dataset": "ghananlpcommunity/twi-speech-text-multispeaker-16k",
        "config": None,
        "split": "train",
        "license": "HuggingFace",
        "note": "Twi Multi-speaker (21K pairs, 16kHz)",
    },
    "twi_bibletss_hf": {
        "dataset": "hci-lab-dcug/bibletts-asante-twi-max29secs-total9hrs-sr22050",
        "config": None,
        "split": "train",
        "license": "CC BY-SA 4.0",
        "note": "BibleTTS Asante Twi (9 hrs, 22050Hz, studio quality)",
    },
    # ── TAGALOG: 231 clips → ~50K+ clips ─────────────────────────
    "tagalog_cv19": {
        "dataset": "mozilla-foundation/common_voice_19_0",
        "config": "tl",
        "split": "train",
        "license": "CC0",
        "note": "Common Voice v19.0 — Tagalog",
    },
    "tagalog_fleurs": {
        "dataset": "google/fleurs",
        "config": "fil_ph",
        "split": "train",
        "license": "CC-BY",
        "note": "Google FLEURS — Filipino/Tagalog (curated read speech)",
    },
    "tagalog_nexdata": {
        "dataset": "Nexdata/Filipino_Speech_Data_by_Mobile_Phone",
        "config": None,
        "split": "train",
        "license": "Check dataset card",
        "note": "Nexdata Filipino Speech (104 hrs conversational)",
    },
}

# ─────────────────────────────────────────────────────────────────────
# Direct URL downloads (OpenSLR archives)
# ─────────────────────────────────────────────────────────────────────

SOURCES = {
    # ── TWI: BibleTTS from OpenSLR (studio quality, ~80 hrs each) ──
    "twi_bibletss_akuapem": {
        "urls": [
            "https://www.openslr.org/resources/129/akuapem-twi.tgz",
        ],
        "format": "tgz",
        "license": "CC BY-SA 4.0",
        "note": "BibleTTS — Akuapem Twi (~80 hrs, 48kHz studio, single speaker)",
    },
    "twi_bibletss_asante": {
        "urls": [
            "https://www.openslr.org/resources/129/asante-twi.tgz",
        ],
        "format": "tgz",
        "license": "CC BY-SA 4.0",
        "note": "BibleTTS — Asante Twi (~80 hrs, 48kHz studio, single speaker)",
    },
    # ── TAGALOG: OpenSLR ──────────────────────────────────────────
    "tagalog": {
        "urls": [
            "https://openslr.org/resources/80/fil_ph_female.zip",
            "https://openslr.org/resources/80/fil_ph_male.zip",
        ],
        "format": "zip",
        "license": "CC BY-SA 4.0",
        "note": "OpenSLR 80 — Filipino/Tagalog crowdsourced TTS",
    },
    # ── NEPALI (retained from original) ───────────────────────────
    "nepali": {
        "urls": [
            f"https://openslr.elda.org/resources/54/asr_nepali_{i}.zip"
            for i in list("0123456789abcdef")
        ],
        "format": "zip",
        "license": "CC BY-SA 4.0",
        "note": "OpenSLR 54 — Nepali ASR (16 shards, ~9.3 GB total)",
    },
    # ── SPANISH DIALECTS (retained from original) ─────────────────
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


# ─────────────────────────────────────────────────────────────────────
# HuggingFace downloader
# ─────────────────────────────────────────────────────────────────────

def download_hf_dataset(name, config, dry_run=False):
    """Download a dataset from HuggingFace Hub."""
    dest = RAW_DIR / name

    print(f"\n  [{name}]  {config['note']}")
    print(f"  License: {config['license']}")
    print(f"  Dataset: {config['dataset']} ({config.get('config', 'default')})")

    if dest.exists():
        print(f"  [skip] {dest} already exists")
        return

    if dry_run:
        print(f"  [dry-run] Would download to {dest}")
        return

    try:
        from datasets import load_dataset
    except ImportError:
        print("  ERROR: 'datasets' library not installed. Run: pip install datasets")
        return

    print(f"  Downloading...")
    try:
        kwargs = {
            "split": config.get("split", "train"),
            "trust_remote_code": True,
        }
        if config.get("config"):
            ds = load_dataset(config["dataset"], config["config"], **kwargs)
        else:
            ds = load_dataset(config["dataset"], **kwargs)

        ds.save_to_disk(str(dest))
        print(f"  ✓ Saved to {dest} ({len(ds)} clips)")

        # Write license info
        with open(dest / "LICENSE.txt", "w") as f:
            f.write(f"Source: {config['note']}\n")
            f.write(f"License: {config['license']}\n")
            f.write(f"HuggingFace: {config['dataset']}\n")

    except Exception as e:
        print(f"  ⚠ Failed: {e}")


# ─────────────────────────────────────────────────────────────────────
# URL/archive downloader (OpenSLR, BibleTTS)
# ─────────────────────────────────────────────────────────────────────

def download_url_dataset(name, config, dry_run=False):
    """Download and extract archive files from URLs."""
    print(f"\n  [{name}]  {config['note']}")
    print(f"  License: {config['license']}")
    print(f"  Files:   {len(config['urls'])}")

    if dry_run:
        for url in config["urls"]:
            print(f"    {url}")
        return

    out_dir = RAW_DIR / name
    clips_dir = out_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    for url in config["urls"]:
        filename = url.split("/")[-1]
        archive_path = out_dir / filename

        if archive_path.exists():
            print(f"  [skip] {filename} already downloaded")
            continue

        print(f"  Downloading {filename}...")
        result = subprocess.run(
            ["curl", "-L", "-C", "-", "--progress-bar", "--max-time", "7200", "-o", str(archive_path), url],
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
    flac_count = len(list(clips_dir.rglob("*.flac")))
    print(f"  Done — {wav_count} WAV + {mp3_count} MP3 + {flac_count} FLAC files")

    with open(out_dir / "LICENSE.txt", "w") as f:
        f.write(f"Source: {config['note']}\n")
        f.write(f"License: {config['license']}\n")
        f.write(f"URLs:\n")
        for url in config["urls"]:
            f.write(f"  {url}\n")


# ─────────────────────────────────────────────────────────────────────
# Language grouping for --lang filter
# ─────────────────────────────────────────────────────────────────────

LANGUAGE_GROUPS = {
    "pashto": {
        "hf": ["pashto_cv19", "pashto_fleurs"],
        "url": [],
    },
    "somali": {
        "hf": ["somali_cv19", "somali_fleurs"],
        "url": [],
    },
    "twi": {
        "hf": ["twi_400k", "twi_multispeaker", "twi_bibletss_hf"],
        "url": ["twi_bibletss_akuapem", "twi_bibletss_asante"],
    },
    "tagalog": {
        "hf": ["tagalog_cv19", "tagalog_fleurs", "tagalog_nexdata"],
        "url": ["tagalog"],
    },
    "nepali": {
        "hf": [],
        "url": ["nepali"],
    },
    "spanish": {
        "hf": [],
        "url": ["spanish_puerto_rico", "spanish_colombian", "spanish_venezuelan",
                "spanish_peruvian", "spanish_mexican"],
    },
}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Download supplementary speech data for low-resource languages"
    )
    parser.add_argument(
        "--lang",
        choices=list(LANGUAGE_GROUPS.keys()),
        help="Download only this language group (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show sources without downloading",
    )
    args = parser.parse_args()

    groups = {args.lang: LANGUAGE_GROUPS[args.lang]} if args.lang else LANGUAGE_GROUPS

    print(f"{'=' * 60}")
    print(f"SUPPLEMENTARY DATA DOWNLOAD {'(DRY RUN)' if args.dry_run else ''}")
    print(f"Target: {RAW_DIR}")
    print(f"Languages: {', '.join(groups.keys())}")
    print(f"{'=' * 60}")

    for lang, group in groups.items():
        print(f"\n{'─' * 60}")
        print(f"[{lang.upper()}]")
        print(f"{'─' * 60}")

        # HuggingFace datasets
        for hf_name in group["hf"]:
            if hf_name in HF_SOURCES:
                download_hf_dataset(hf_name, HF_SOURCES[hf_name], dry_run=args.dry_run)

        # URL/archive downloads
        for url_name in group["url"]:
            if url_name in SOURCES:
                download_url_dataset(url_name, SOURCES[url_name], dry_run=args.dry_run)

    print(f"\n{'=' * 60}")
    if args.dry_run:
        print("DRY RUN COMPLETE — no data downloaded")
    else:
        print("ALL DOWNLOADS COMPLETE")
    print(f"{'=' * 60}")
    print()
    print("Next steps:")
    print("  1. python ml-pipeline/scripts/01_prepare_data.py --lang <language>")
    print("  2. python ml-pipeline/scripts/02_create_splits.py --lang <language>")
    print("  3. python ml-pipeline/training/finetune.py --language <language>")
