"""
Download Ohio K-12 Learning Standards PDFs from education.ohio.gov.

Organizes PDFs into folders by subject and grade band:
  pdfs/{subject}/{grade_band}/filename.pdf

Ohio publishes:
  - ELA, Science, Social Studies: single K-12 PDFs (stored in each relevant grade band)
  - Math: per-grade PDFs (K-8) + per-course PDFs (HS)
"""

import os
import time
import requests
from pathlib import Path

BASE_DIR = Path(__file__).parent / "pdfs"
BASE_URL = "https://education.ohio.gov"

HEADERS = {
    "User-Agent": "LanguageBridge-Lexicon/1.0 (educational research; contact: languagebridge.app)"
}

# Grade band mapping for individual math grade PDFs
MATH_GRADE_BANDS = {
    "Kindergarten": "K-2",
    "Grade-1": "K-2",
    "Grade-2": "K-2",
    "Grade-3": "3-5",
    "Grade-4": "3-5",
    "Grade-5": "3-5",
    "Grade-6": "6-8",
    "Grade-7": "6-8",
    "Grade-8": "6-8",
}

STANDARDS = {
    "ela": {
        "grade_bands": ["K-2", "3-5", "6-8", "9-12"],
        "files": [
            {
                "name": "ELA-Learning-Standards-2017.pdf",
                "url": "/getattachment/Topics/Learning-in-Ohio/English-Language-Art/English-Language-Arts-Standards/ELA-Learning-Standards-2017.pdf.aspx?lang=en-US",
                "description": "Ohio ELA Learning Standards K-12 (2017)",
                "scope": "K-12",
            },
        ],
    },
    "math": {
        "grade_bands": ["K-2", "3-5", "6-8", "9-12"],
        "files": [
            # K-8 individual grades
            {"name": "MATH-Standards-Kindergarten.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Kindergarten.pdf.aspx?lang=en-US", "grade_band": "K-2", "description": "Math Kindergarten"},
            {"name": "MATH-Standards-Grade-1.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Grade-1.pdf.aspx?lang=en-US", "grade_band": "K-2", "description": "Math Grade 1"},
            {"name": "MATH-Standards-Grade-2.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Grade-2.pdf.aspx?lang=en-US", "grade_band": "K-2", "description": "Math Grade 2"},
            {"name": "MATH-Standards-Grade-3.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Grade-3.pdf.aspx?lang=en-US", "grade_band": "3-5", "description": "Math Grade 3"},
            {"name": "MATH-Standards-Grade-4.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Grade-4.pdf.aspx?lang=en-US", "grade_band": "3-5", "description": "Math Grade 4"},
            {"name": "MATH-Standards-Grade-5.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Grade-5.pdf.aspx?lang=en-US", "grade_band": "3-5", "description": "Math Grade 5"},
            {"name": "MATH-Standards-Grade-6.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Grade-6.pdf.aspx?lang=en-US", "grade_band": "6-8", "description": "Math Grade 6"},
            {"name": "MATH-Standards-Grade-7.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Grade-7.pdf.aspx?lang=en-US", "grade_band": "6-8", "description": "Math Grade 7"},
            {"name": "MATH-Standards-Grade-8.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-Standards-Grade-8.pdf.aspx?lang=en-US", "grade_band": "6-8", "description": "Math Grade 8"},
            # High school courses
            {"name": "ALGEBRA-1-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/ALGEBRA-1-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Algebra 1"},
            {"name": "GEOMETRY-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/GEOMETRY-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Geometry"},
            {"name": "ALGEBRA-2-MATH-3-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/ALGEBRA-2-MATH-3-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Algebra 2 / Math 3"},
            {"name": "MATH-1-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-1-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Integrated Math 1"},
            {"name": "MATH-2-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/MATH-2-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Integrated Math 2"},
            {"name": "SP-MATH-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/SP-MATH-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Statistics & Probability"},
            {"name": "DSF-MATH-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/DSF-MATH-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Data Science Foundations"},
            {"name": "Advanced-Quantitative-Reasoning-Math-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/Advanced-Quantitative-Reasoning-Math-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Advanced Quantitative Reasoning"},
            {"name": "Discrete-Math_Computer-Science-Standards.pdf", "url": "/getattachment/Topics/Learning-in-Ohio/Mathematics/Ohio-s-Learning-Standards-in-Mathematics/Discrete-Math_Computer-Science-Standards.pdf.aspx?lang=en-US", "grade_band": "9-12", "description": "Discrete Math / CS"},
        ],
    },
    "science": {
        "grade_bands": ["K-2", "3-5", "6-8", "9-12"],
        "files": [
            {
                "name": "Science-Standards-and-Model-Curriculum-2019.pdf",
                "url": "/getattachment/Topics/Learning-in-Ohio/Science/Ohios-Learning-Standards-and-MC/SciFinalStandardsMC060719.pdf.aspx?lang=en-US",
                "description": "Ohio Science Standards + Model Curriculum K-12 (2019)",
                "scope": "K-12",
            },
        ],
    },
    "social-studies": {
        "grade_bands": ["K-2", "3-5", "6-8", "9-12"],
        "files": [
            {
                "name": "Social-Studies-Standards-2018.pdf",
                "url": "/getattachment/Topics/Learning-in-Ohio/Social-Studies/Ohio-s-Learning-Standards-for-Social-Studies/Ohio-s-Learning-Standards-for-Social-Studies_01-2019.pdf.aspx?lang=en-US",
                "description": "Ohio Social Studies Learning Standards K-12 (2018)",
                "scope": "K-12",
            },
        ],
    },
}


def download_file(url: str, dest: Path) -> bool:
    """Download a file with retry logic."""
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  SKIP (exists): {dest.name}")
        return True

    dest.parent.mkdir(parents=True, exist_ok=True)

    for attempt in range(3):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=60, stream=True)
            resp.raise_for_status()

            content_type = resp.headers.get("Content-Type", "")
            if "pdf" not in content_type and "octet-stream" not in content_type:
                print(f"  WARN: unexpected content type '{content_type}' for {dest.name}")

            with open(dest, "wb") as f:
                for chunk in resp.iter_content(chunk_size=8192):
                    f.write(chunk)

            size_kb = dest.stat().st_size / 1024
            print(f"  OK: {dest.name} ({size_kb:.0f} KB)")
            return True

        except requests.RequestException as e:
            print(f"  RETRY {attempt + 1}/3: {e}")
            time.sleep(2 ** attempt)

    print(f"  FAILED: {dest.name}")
    return False


def main():
    total = 0
    failed = 0

    for subject, config in STANDARDS.items():
        print(f"\n{'='*60}")
        print(f"Subject: {subject.upper()}")
        print(f"{'='*60}")

        for file_info in config["files"]:
            url = BASE_URL + file_info["url"]

            # K-12 scope PDFs get copied to each grade band folder
            if file_info.get("scope") == "K-12":
                for band in config["grade_bands"]:
                    dest = BASE_DIR / subject / band / file_info["name"]
                    ok = download_file(url, dest)
                    total += 1
                    if not ok:
                        failed += 1
                    # Only actually download once, then copy
                    if ok and band == config["grade_bands"][0]:
                        src = dest
                    elif ok:
                        # File already downloaded by requests to same URL — skip is fine
                        pass
                    time.sleep(0.5)
            else:
                band = file_info["grade_band"]
                dest = BASE_DIR / subject / band / file_info["name"]
                ok = download_file(url, dest)
                total += 1
                if not ok:
                    failed += 1
                time.sleep(0.5)

    print(f"\n{'='*60}")
    print(f"Done: {total - failed}/{total} files downloaded")
    if failed:
        print(f"FAILED: {failed} files")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
