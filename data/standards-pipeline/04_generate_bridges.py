"""
Step 4: Generate bridge phrases for high-difficulty academic terms.

For every term flagged as high transliteration difficulty + bridge priority,
calls the Anthropic API to generate:
  - ANCHOR tier: shortest possible plain-language phrase
  - SCAFFOLD tier: slightly expanded, still no academic vocabulary
  - Grammatical forms: noun, verb, adjective where applicable

Constraint: No Latin/Greek-derived vocabulary in output. Must not directly
answer Ohio K-12 assessment questions.

Usage:
  # Full run (all high-difficulty bridge priority terms)
  python 04_generate_bridges.py

  # Dry run — show what would be processed, no API calls
  python 04_generate_bridges.py --dry-run

  # Limit to N terms (for testing)
  python 04_generate_bridges.py --limit 50

  # Resume from checkpoint (automatic — just re-run)
  python 04_generate_bridges.py

Requires: ANTHROPIC_API_KEY in .env or environment
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

PIPELINE_DIR = Path(__file__).parent
TERMS_DIR = PIPELINE_DIR / "terms"
OUT_DIR = PIPELINE_DIR / "bridges"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CHECKPOINT_PATH = OUT_DIR / ".checkpoint.json"
OUTPUT_PATH = OUT_DIR / "ohio_bridge_phrases.json"
BATCH_SIZE = 20  # terms per API call
MODEL = "claude-haiku-4-5-20251001"

SYSTEM_PROMPT = """You are a linguistic bridge specialist for K-12 English Language Learners.
Your task is to generate plain-language bridge phrases that help students understand academic vocabulary.

STRICT RULES:
1. Use ONLY plain, everyday English words. NO Latin-derived or Greek-derived vocabulary.
2. Do NOT include information that would directly answer a standard Ohio K-12 assessment question about the term.
3. Keep bridge phrases as short as possible while preserving meaning.
4. Generate grammatical forms (noun, verb, adjective) ONLY where the term naturally has those forms.

For each term, produce exactly two tiers:
- ANCHOR: The shortest possible plain-language phrase (2-8 words) that transfers the core concept.
- SCAFFOLD: A slightly expanded phrase (5-15 words) that adds context, still using only plain words.

Respond in valid JSON array format. Each element must have this exact structure:
{
  "term": "<the input term>",
  "anchor": "<shortest bridge phrase>",
  "scaffold": "<expanded bridge phrase>",
  "forms": {
    "noun": "<noun form bridge or null>",
    "verb": "<verb form bridge or null>",
    "adjective": "<adjective form bridge or null>"
  }
}"""


def build_user_prompt(terms: List[dict]) -> str:
    """Build the user prompt for a batch of terms."""
    term_lines = []
    for t in terms:
        ctx = f"[{t['subjects']}, {t['grade_bands']}]"
        etym = f" ({t['etymology_evidence']})" if t.get("etymology_evidence") else ""
        term_lines.append(f"- {t['term']}{etym} {ctx}")

    return (
        "Produce the shortest plain-language phrase that transfers the concept "
        "without using academic, Latin-derived, or Greek-derived vocabulary. "
        "Do not include any information that would directly answer a standard "
        "Ohio K-12 assessment question about this term. "
        "Generate noun, verb, and adjectival grammatical forms where applicable.\n\n"
        "Terms:\n" + "\n".join(term_lines) + "\n\n"
        "Respond with a JSON array only. No markdown, no explanation."
    )


def call_api(client, terms_batch: List[dict], retry_count: int = 3) -> Optional[List[dict]]:
    """Call Anthropic API for a batch of terms."""
    user_prompt = build_user_prompt(terms_batch)

    for attempt in range(retry_count):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            )

            text = response.content[0].text.strip()
            # Handle markdown code blocks
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

            results = json.loads(text)

            if not isinstance(results, list):
                print(f"    WARN: expected list, got {type(results)}")
                return None

            return results

        except json.JSONDecodeError as e:
            print(f"    JSON parse error (attempt {attempt + 1}): {e}")
            if attempt < retry_count - 1:
                time.sleep(2 ** attempt)
        except Exception as e:
            print(f"    API error (attempt {attempt + 1}): {e}")
            if attempt < retry_count - 1:
                time.sleep(2 ** attempt)

    return None


def load_checkpoint() -> dict:
    """Load processing checkpoint."""
    if CHECKPOINT_PATH.exists():
        with open(CHECKPOINT_PATH) as f:
            return json.load(f)
    return {"processed_terms": [], "last_batch": 0}


def save_checkpoint(checkpoint: dict):
    """Save processing checkpoint."""
    with open(CHECKPOINT_PATH, "w") as f:
        json.dump(checkpoint, f)


def build_codex_entry(term_record: dict, bridge: dict) -> dict:
    """Build a Codex-compatible entry from term + bridge data."""
    now = datetime.now(timezone.utc).isoformat()
    term = term_record["term_normalized"]

    return {
        "id": f"{term.replace(' ', '_')}_bridge_ohio",
        "term": term_record["term"],
        "term_normalized": term,
        "domain": "k12_academic",
        "subjects": term_record.get("subjects", term_record.get("subject", "")),
        "grade_bands": term_record.get("grade_bands", term_record.get("grade_band", "")),
        "standard_ref": term_record.get("standard_ref"),
        "source": "ohio_learning_standards",
        "bridge_anchor": bridge.get("anchor"),
        "bridge_scaffold": bridge.get("scaffold"),
        "grammatical_forms": bridge.get("forms", {}),
        "awl_match": term_record.get("awl_match", False),
        "is_latin_derived": term_record.get("is_latin_derived", False),
        "is_greek_derived": term_record.get("is_greek_derived", False),
        "etymology_evidence": term_record.get("etymology_evidence"),
        "transliteration_difficulty": term_record.get("transliteration_difficulty"),
        "frequency": term_record.get("frequency", 0),
        "pos": term_record.get("pos"),
        "is_multi_word": term_record.get("is_multi_word", False),
        "status": "pending_review",
        "version": 1,
        "created_by": "bridge_pipeline_v1",
        "created_at": now,
        "updated_at": now,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show plan without API calls")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of terms to process")
    parser.add_argument("--single-word-only", action="store_true", help="Only process single-word terms")
    args = parser.parse_args()

    # Load terms
    terms_path = TERMS_DIR / "ohio_standards_terms.json"
    if not terms_path.exists():
        print("ERROR: Run 03_extract_terms.py first.")
        sys.exit(1)

    with open(terms_path) as f:
        all_terms = json.load(f)

    # Filter to high-difficulty bridge priority terms
    target_terms = [
        t for t in all_terms
        if t["transliteration_difficulty"] == "high" and t["is_bridge_priority"]
    ]

    if args.single_word_only:
        target_terms = [t for t in target_terms if not t["is_multi_word"]]

    # Sort by frequency (most common first — highest value)
    target_terms.sort(key=lambda t: -t["frequency"])

    if args.limit > 0:
        target_terms = target_terms[:args.limit]

    print(f"Target terms: {len(target_terms)}")
    print(f"Batches of {BATCH_SIZE}: {(len(target_terms) + BATCH_SIZE - 1) // BATCH_SIZE}")

    estimated_calls = (len(target_terms) + BATCH_SIZE - 1) // BATCH_SIZE
    # Haiku: ~$0.001 per call with 20 terms
    estimated_cost = estimated_calls * 0.002
    print(f"Estimated API calls: {estimated_calls}")
    print(f"Estimated cost: ~${estimated_cost:.2f}")

    if args.dry_run:
        print("\n--- DRY RUN ---")
        print("Top 20 terms that would be processed:")
        for t in target_terms[:20]:
            print(f"  {t['term']:35s} freq={t['frequency']:4d} subj={t['subjects']}")
        return

    # Check API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("\nERROR: Set ANTHROPIC_API_KEY in .env or environment.")
        print("  echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env")
        sys.exit(1)

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    # Load checkpoint for resume
    checkpoint = load_checkpoint()
    processed_set = set(checkpoint["processed_terms"])
    remaining = [t for t in target_terms if t["term_normalized"] not in processed_set]

    # Load existing results
    codex_entries = []
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH) as f:
            codex_entries = json.load(f)

    print(f"\nAlready processed: {len(processed_set)}")
    print(f"Remaining: {len(remaining)}")

    if not remaining:
        print("All terms already processed!")
        return

    # Process in batches
    batch_count = 0
    success_count = 0
    fail_count = 0
    start_time = time.time()

    for i in range(0, len(remaining), BATCH_SIZE):
        batch = remaining[i:i + BATCH_SIZE]
        batch_count += 1
        batch_total = (len(remaining) + BATCH_SIZE - 1) // BATCH_SIZE

        print(f"\nBatch {batch_count}/{batch_total} ({len(batch)} terms)...", end="", flush=True)

        results = call_api(client, batch)

        if results is None:
            print(f" FAILED")
            fail_count += len(batch)
            continue

        # Match results back to input terms
        result_map = {r["term"].lower().strip(): r for r in results}

        for term_record in batch:
            norm = term_record["term_normalized"]
            # Try to match by term or normalized form
            bridge = result_map.get(term_record["term"].lower())
            if not bridge:
                bridge = result_map.get(norm)
            if not bridge:
                # Fuzzy match — find closest
                for key in result_map:
                    if norm in key or key in norm:
                        bridge = result_map[key]
                        break

            if bridge:
                entry = build_codex_entry(term_record, bridge)
                codex_entries.append(entry)
                processed_set.add(norm)
                success_count += 1
            else:
                fail_count += 1

        # Save progress after each batch
        checkpoint["processed_terms"] = list(processed_set)
        checkpoint["last_batch"] = batch_count
        save_checkpoint(checkpoint)

        with open(OUTPUT_PATH, "w") as f:
            json.dump(codex_entries, f, indent=2, ensure_ascii=False)

        elapsed = time.time() - start_time
        rate = success_count / elapsed if elapsed > 0 else 0
        print(f" OK ({success_count} done, {rate:.1f} terms/sec)")

        # Rate limit: stay under 60 req/min for Haiku
        time.sleep(1.2)

    # Final save
    with open(OUTPUT_PATH, "w") as f:
        json.dump(codex_entries, f, indent=2, ensure_ascii=False)

    # Save manifest
    manifest = {
        "pipeline": "languagebridge_lexicon",
        "step": "03_bridge_generation",
        "model": MODEL,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "total_terms_processed": success_count + fail_count,
        "successful": success_count,
        "failed": fail_count,
        "codex_entries": len(codex_entries),
        "output_file": "ohio_bridge_phrases.json",
    }
    with open(OUT_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    elapsed = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"BRIDGE GENERATION COMPLETE")
    print(f"{'='*60}")
    print(f"Processed:  {success_count + fail_count:,} terms")
    print(f"Successful: {success_count:,}")
    print(f"Failed:     {fail_count:,}")
    print(f"Time:       {elapsed/60:.1f} minutes")
    print(f"Output:     {OUTPUT_PATH}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
