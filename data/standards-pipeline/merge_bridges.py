"""
Merge bridge phrase batches into the main output file with full metadata.
Reads _batch_*.json files, matches them to term records, and writes
the fully-hydrated ohio_bridge_phrases.json.
"""

import json
import glob
from datetime import datetime, timezone
from pathlib import Path

PIPELINE_DIR = Path(__file__).parent
TERMS_PATH = PIPELINE_DIR / "terms" / "ohio_standards_terms.json"
BRIDGES_DIR = PIPELINE_DIR / "bridges"
OUTPUT_PATH = BRIDGES_DIR / "ohio_bridge_phrases.json"


def main():
    # Load term records for metadata lookup
    with open(TERMS_PATH) as f:
        all_terms = json.load(f)

    term_lookup = {}
    for t in all_terms:
        term_lookup[t["term_normalized"]] = t
        term_lookup[t["term"]] = t

    # Load existing output
    existing = []
    existing_terms = set()
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH) as f:
            existing = json.load(f)
        existing_terms = {e["term_normalized"] for e in existing}

    # Load all batch files
    batch_files = sorted(glob.glob(str(BRIDGES_DIR / "_batch_*.json")))
    new_count = 0

    for bf in batch_files:
        print(f"Loading {Path(bf).name}...")
        with open(bf) as f:
            batch = json.load(f)

        for bridge in batch:
            term_key = bridge["term"].lower().strip()
            if term_key in existing_terms:
                continue

            # Find the full term record
            term_rec = term_lookup.get(term_key)
            if not term_rec:
                print(f"  WARN: no term record for '{term_key}', skipping")
                continue

            now = datetime.now(timezone.utc).isoformat()
            entry = {
                "id": f"{term_key.replace(' ', '_')}_bridge_ohio",
                "term": term_rec["term"],
                "term_normalized": term_rec["term_normalized"],
                "domain": "k12_academic",
                "subjects": term_rec.get("subjects", term_rec.get("subject", "")),
                "grade_bands": term_rec.get("grade_bands", term_rec.get("grade_band", "")),
                "standard_ref": term_rec.get("standard_ref"),
                "bridge_anchor": bridge["bridge_anchor"],
                "bridge_scaffold": bridge["bridge_scaffold"],
                "grammatical_forms": bridge.get("grammatical_forms", {}),
                "awl_match": term_rec.get("awl_match", False),
                "is_latin_derived": term_rec.get("is_latin_derived", False),
                "is_greek_derived": term_rec.get("is_greek_derived", False),
                "etymology_evidence": term_rec.get("etymology_evidence"),
                "transliteration_difficulty": term_rec.get("transliteration_difficulty"),
                "frequency": term_rec.get("frequency", 0),
                "pos": term_rec.get("pos"),
                "is_multi_word": term_rec.get("is_multi_word", False),
                "status": "pending_review",
                "version": 1,
                "created_by": "bridge_pipeline_v1",
                "created_at": now,
                "updated_at": now,
            }
            existing.append(entry)
            existing_terms.add(term_key)
            new_count += 1

    # Sort by frequency descending
    existing.sort(key=lambda e: -e.get("frequency", 0))

    with open(OUTPUT_PATH, "w") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)

    print(f"\nMerged {new_count} new entries")
    print(f"Total entries: {len(existing)}")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
