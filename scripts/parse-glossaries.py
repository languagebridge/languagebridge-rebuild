#!/usr/bin/env python3
"""
parse-glossaries.py

Parses RBERN bilingual glossary PDFs from data/glossaries/<language>/<filename>.pdf
and outputs LexiconDoc-shaped JSON ready for Cosmos DB seeding.

Folder structure:
  data/glossaries/
    pashto/
      elementary_school_science.pdf
      middle_school_math.pdf
    dari/
      ...

Filename convention:
  <grade_level>_<subject>.pdf
  e.g. elementary_school_science.pdf -> grade_band="K-5", subject="science"
       middle_school_math.pdf        -> grade_band="6-8", subject="math"
       high_school_chemistry.pdf     -> grade_band="9-12", subject="chemistry"

Usage:
  python3 scripts/parse-glossaries.py
  python3 scripts/parse-glossaries.py --language pashto
  python3 scripts/parse-glossaries.py --dry-run
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone

import pdfplumber

GLOSSARIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'glossaries')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'lexicon-seed')

# Map filename tokens to grade_band
GRADE_MAP = {
    'elementary': 'K-5',
    'middle': '6-8',
    'high': '9-12',
}

# Map filename tokens to subject
SUBJECT_MAP = {
    'science': 'science',
    'math': 'math',
    'social_studies': 'social_studies',
    'ela': 'ela',
    'language_arts': 'ela',
    'algebra': 'math',
    'geometry': 'math',
    'calculus': 'math',
    'chemistry': 'science',
    'physics': 'science',
    'biology': 'science',
    'earth_science': 'science',
    'living_environment': 'science',
}


def parse_filename(filename: str) -> dict:
    """Extract grade_band and subject from filename."""
    name = os.path.splitext(filename)[0].lower()
    tokens = name.split('_')

    grade_band = None
    for token in tokens:
        if token in GRADE_MAP:
            grade_band = GRADE_MAP[token]
            break

    subject = None
    # Try multi-word matches first
    for key in sorted(SUBJECT_MAP.keys(), key=len, reverse=True):
        if key in name:
            subject = SUBJECT_MAP[key]
            break

    return {
        'grade_band': grade_band or 'K-12',
        'subject': subject or 'general',
    }


def find_data_columns(table):
    """Find the two data-bearing column indices from a table.

    RBERN PDFs use either:
      - 2-column layout: data in cols 0, 1
      - 6-column layout: data in cols 0, 3 (headers offset in cols 1, 4)
    We detect by finding which columns actually hold non-empty data rows.
    """
    if not table or len(table) < 3:
        return 0, 1

    num_cols = max(len(row) for row in table if row)

    # Count non-empty cells per column (skip first row which is header)
    col_counts = [0] * num_cols
    for row in table[1:]:
        for i, cell in enumerate(row):
            if cell and cell.strip():
                col_counts[i] += 1

    # Get the two columns with the most data
    ranked = sorted(range(num_cols), key=lambda i: col_counts[i], reverse=True)
    if len(ranked) >= 2:
        pair = sorted(ranked[:2])  # English is always the leftmost
        return pair[0], pair[1]

    return 0, 1


def extract_pairs_from_text(pdf_path: str) -> list[tuple[str, str]]:
    """Fallback: extract pairs from text-based PDFs (no tables).

    Handles two formats:
      - ELA numbered: "1 action 1 عمل" (number english number translation)
      - Two-column text: "English  Translation" (separated by multiple spaces)
    """
    pairs = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue

            for line in text.split('\n'):
                line = line.strip()
                if not line:
                    continue

                # Skip headers and single-letter section markers
                if line.upper() in ('ENGLISH', 'ARABIC', 'PASHTO', 'FRENCH', 'SPANISH',
                                     'URDU', 'NEPALI', 'BURMESE', 'VIETNAMESE', 'UKRAINIAN',
                                     'SWAHILI', 'TAGALOG', 'TWI', 'UZBEK', 'KINYARWANDA',
                                     'PORTUGUESE', 'FARSI', 'DARI'):
                    continue
                if 'ENGLISH' in line.upper() and len(line) < 60:
                    continue
                if 'GLOSSARY' in line.upper():
                    continue
                if len(line) <= 1:
                    continue
                if len(line) == 1 and line.isalpha():
                    continue

                import re

                # Format 1: ELA numbered — "1 action 1 عمل"
                m = re.match(r'^(\d+)\s+(.+?)\s+\1\s+(.+)$', line)
                if m:
                    english = m.group(2).strip()
                    translation = m.group(3).strip()
                    if english and translation:
                        pairs.append((english, translation))
                    continue

                # Format 2: Script-boundary split — "action عمل"
                # Works when translation uses non-Latin script (Arabic, Cyrillic, Devanagari, etc.)
                m = re.match(r'^([A-Za-z][\w\s\',.\-/()]+?)\s+([\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0400-\u04FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0B00-\u0B7F\u0C00-\u0C7F\u0D00-\u0D7F\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1100-\u11FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u10A0-\u10FF\u1200-\u137F\u2D80-\u2DDF].+)$', line)
                if m:
                    english = m.group(1).strip()
                    translation = m.group(2).strip()
                    # Skip if english is too short or looks like a section header
                    if len(english) > 1 and english and translation:
                        pairs.append((english, translation))

    return pairs


def extract_pairs_from_pdf(pdf_path: str) -> list[tuple[str, str]]:
    """Extract (english, translation) pairs from a glossary PDF."""
    pairs = []
    col_indices = None

    with pdfplumber.open(pdf_path) as pdf:
        has_tables = False
        for page in pdf.pages:
            tables = page.extract_tables()
            if tables:
                has_tables = True
                break

    if not has_tables:
        # Fallback to text-based extraction
        return extract_pairs_from_text(pdf_path)

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            if not tables:
                continue

            for table in tables:
                # Detect layout from the first table we see
                if col_indices is None:
                    col_indices = find_data_columns(table)

                eng_idx, trans_idx = col_indices

                for row in table:
                    if not row or len(row) < 2:
                        continue

                    if eng_idx >= len(row) or trans_idx >= len(row):
                        continue

                    english = (row[eng_idx] or '').strip()
                    translation = (row[trans_idx] or '').strip()

                    # Skip headers, empty rows, and single-letter section markers
                    if not english or not translation:
                        continue
                    if english.upper() in ('ENGLISH', 'ANGLAIS'):
                        continue
                    if len(english) == 1 and english.isalpha():
                        continue

                    pairs.append((english, translation))

    return pairs


def make_lexicon_doc(
    term: str,
    cognate: str,
    language: str,
    subject: str,
    grade_band: str,
    source_file: str,
) -> dict:
    """Create a LexiconDoc-shaped dictionary."""
    normalized = term.strip().lower()
    doc_id = f"{normalized.replace(' ', '_')}_{language}_rbern"

    return {
        'id': doc_id,
        'term': normalized,
        'language': language,
        'domain': 'k12_academic',
        'subject': subject,
        'grade_band': grade_band,
        'cognate': cognate,
        'bridge_definition': None,
        'bridge_definition_en': None,
        'audio_blob_path': None,
        'audio_source': None,
        'status': 'pending_review',
        'version': 1,
        'usage_count': 0,
        'flag_count': 0,
        'created_by': 'rbern_glossary',
        'source_file': source_file,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }


def process_language(language_dir: str, language: str, dry_run: bool = False) -> list[dict]:
    """Process all PDFs for a single language."""
    docs = []
    pdf_files = sorted(f for f in os.listdir(language_dir) if f.lower().endswith('.pdf'))

    if not pdf_files:
        print(f"  No PDFs found in {language_dir}")
        return docs

    for pdf_file in pdf_files:
        pdf_path = os.path.join(language_dir, pdf_file)
        meta = parse_filename(pdf_file)

        print(f"  Parsing: {pdf_file} (grade_band={meta['grade_band']}, subject={meta['subject']})")

        pairs = extract_pairs_from_pdf(pdf_path)
        print(f"    Found {len(pairs)} term pairs")

        for english, translation in pairs:
            doc = make_lexicon_doc(
                term=english,
                cognate=translation,
                language=language,
                subject=meta['subject'],
                grade_band=meta['grade_band'],
                source_file=pdf_file,
            )
            docs.append(doc)

    return docs


def main():
    parser = argparse.ArgumentParser(description='Parse RBERN glossary PDFs into LexiconDoc JSON')
    parser.add_argument('--language', '-l', help='Process only this language folder')
    parser.add_argument('--dry-run', '-n', action='store_true', help='Parse and print stats without writing files')
    args = parser.parse_args()

    glossaries_dir = os.path.abspath(GLOSSARIES_DIR)
    output_dir = os.path.abspath(OUTPUT_DIR)

    if not os.path.isdir(glossaries_dir):
        print(f"Error: glossaries directory not found at {glossaries_dir}")
        sys.exit(1)

    # Collect language folders
    if args.language:
        languages = [args.language]
    else:
        languages = sorted(
            d for d in os.listdir(glossaries_dir)
            if os.path.isdir(os.path.join(glossaries_dir, d)) and not d.startswith('.')
        )

    if not languages:
        print("No language folders found.")
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    total_docs = 0
    summary = {}

    for language in languages:
        language_dir = os.path.join(glossaries_dir, language)
        if not os.path.isdir(language_dir):
            print(f"Warning: {language_dir} is not a directory, skipping")
            continue

        print(f"\n[{language}]")
        docs = process_language(language_dir, language, args.dry_run)

        if docs and not args.dry_run:
            out_path = os.path.join(output_dir, f'{language}_lexicon_seed.json')
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(docs, f, ensure_ascii=False, indent=2)
            print(f"  -> Wrote {len(docs)} docs to {out_path}")

        summary[language] = len(docs)
        total_docs += len(docs)

    # Print summary
    print(f"\n{'=' * 50}")
    print(f"SUMMARY {'(dry run)' if args.dry_run else ''}")
    print(f"{'=' * 50}")
    for lang, count in summary.items():
        print(f"  {lang:15s} {count:5d} terms")
    print(f"  {'TOTAL':15s} {total_docs:5d} terms")

    if not args.dry_run:
        print(f"\nOutput written to: {output_dir}/")


if __name__ == '__main__':
    main()
