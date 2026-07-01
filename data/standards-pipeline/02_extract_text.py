"""
Extract text from downloaded Ohio Learning Standards PDFs.

Produces structured JSON files in extracted/ that preserve:
  - subject, grade_band, source_file metadata
  - per-page raw text (for downstream NLP term extraction)
  - document-level concatenated text

Output schema designed to feed into NLP term extraction pipeline.
"""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

PDF_DIR = Path(__file__).parent / "pdfs"
OUT_DIR = Path(__file__).parent / "extracted"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Grade-level keywords for splitting K-12 documents into grade bands
GRADE_BAND_PATTERNS = {
    "K-2": [
        r"\bkindergarten\b", r"\bgrade\s*1\b", r"\bgrade\s*2\b",
        r"\bfirst\s+grade\b", r"\bsecond\s+grade\b",
        r"\bgrades?\s*k\s*[-–]\s*2\b",
    ],
    "3-5": [
        r"\bgrade\s*3\b", r"\bgrade\s*4\b", r"\bgrade\s*5\b",
        r"\bthird\s+grade\b", r"\bfourth\s+grade\b", r"\bfifth\s+grade\b",
        r"\bgrades?\s*3\s*[-–]\s*5\b",
    ],
    "6-8": [
        r"\bgrade\s*6\b", r"\bgrade\s*7\b", r"\bgrade\s*8\b",
        r"\bsixth\s+grade\b", r"\bseventh\s+grade\b", r"\beighth\s+grade\b",
        r"\bgrades?\s*6\s*[-–]\s*8\b", r"\bmiddle\s+school\b",
    ],
    "9-12": [
        r"\bgrade\s*9\b", r"\bgrade\s*10\b", r"\bgrade\s*11\b", r"\bgrade\s*12\b",
        r"\bhigh\s+school\b", r"\bgrades?\s*9\s*[-–]\s*12\b",
        r"\balgebra\b", r"\bgeometry\b", r"\bcalculus\b",
        r"\bamerican\s+history\b", r"\bworld\s+history\b",
        r"\bphysics\b", r"\bchemistry\b", r"\bbiology\b",
    ],
}


def detect_page_grade_band(text: str) -> Optional[str]:
    """Detect which grade band a page most likely belongs to based on keyword density."""
    text_lower = text.lower()
    scores = {}
    for band, patterns in GRADE_BAND_PATTERNS.items():
        score = sum(len(re.findall(p, text_lower)) for p in patterns)
        if score > 0:
            scores[band] = score
    if not scores:
        return None
    return max(scores, key=scores.get)


def extract_pdf(pdf_path: Path) -> list[dict]:
    """Extract text from a PDF, returning per-page data."""
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        if text.strip():
            pages.append({
                "page_number": i + 1,
                "text": text.strip(),
                "char_count": len(text.strip()),
                "detected_grade_band": detect_page_grade_band(text),
            })
    doc.close()
    return pages


def build_document_record(
    subject: str,
    grade_band: str,
    pdf_name: str,
    pages: list[dict],
    description: str = "",
) -> dict:
    """Build a structured record for one PDF extraction."""
    full_text = "\n\n".join(p["text"] for p in pages)

    # For K-12 docs placed in a specific grade band folder,
    # filter pages to those matching the grade band
    relevant_pages = []
    for p in pages:
        detected = p["detected_grade_band"]
        if detected == grade_band or detected is None:
            relevant_pages.append(p)

    relevant_text = "\n\n".join(p["text"] for p in relevant_pages)

    return {
        "source": "ohio_learning_standards",
        "source_url": "https://education.ohio.gov",
        "subject": subject,
        "grade_band": grade_band,
        "source_file": pdf_name,
        "description": description,
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "total_pages": len(pages),
        "relevant_pages": len(relevant_pages),
        "full_text": full_text,
        "full_text_char_count": len(full_text),
        "grade_band_text": relevant_text,
        "grade_band_text_char_count": len(relevant_text),
        "pages": relevant_pages,
    }


def main():
    all_records = []
    seen_files = set()

    subjects = sorted(d.name for d in PDF_DIR.iterdir() if d.is_dir())

    for subject in subjects:
        subject_dir = PDF_DIR / subject
        bands = sorted(d.name for d in subject_dir.iterdir() if d.is_dir())

        for band in bands:
            band_dir = subject_dir / band
            pdfs = sorted(band_dir.glob("*.pdf"))

            for pdf_path in pdfs:
                file_key = f"{subject}/{band}/{pdf_path.name}"
                if file_key in seen_files:
                    continue
                seen_files.add(file_key)

                print(f"Extracting: {file_key}")
                try:
                    pages = extract_pdf(pdf_path)
                except Exception as e:
                    print(f"  ERROR: {e}")
                    continue

                record = build_document_record(
                    subject=subject,
                    grade_band=band,
                    pdf_name=pdf_path.name,
                    pages=pages,
                )
                all_records.append(record)
                print(f"  {record['total_pages']} pages, {record['relevant_pages']} relevant to {band}")

    # Save per-subject JSON files
    by_subject = {}
    for rec in all_records:
        by_subject.setdefault(rec["subject"], []).append(rec)

    for subject, records in by_subject.items():
        out_path = OUT_DIR / f"{subject}_standards.json"
        with open(out_path, "w") as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
        total_chars = sum(r["grade_band_text_char_count"] for r in records)
        print(f"\nSaved: {out_path.name} ({len(records)} docs, {total_chars:,} chars)")

    # Save combined manifest for the NLP pipeline
    manifest = {
        "pipeline": "languagebridge_lexicon",
        "step": "01_standards_extraction",
        "source": "Ohio K-12 Learning Standards",
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "subjects": list(by_subject.keys()),
        "total_documents": len(all_records),
        "total_characters": sum(r["grade_band_text_char_count"] for r in all_records),
        "files": [f"{s}_standards.json" for s in sorted(by_subject.keys())],
    }
    manifest_path = OUT_DIR / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nManifest: {manifest_path}")
    print(f"Total: {manifest['total_documents']} docs, {manifest['total_characters']:,} chars extracted")


if __name__ == "__main__":
    main()
