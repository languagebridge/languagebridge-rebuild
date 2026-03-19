#!/bin/bash
# download-glossaries.sh
#
# Downloads all RBERN bilingual glossary PDFs for LanguageBridge training languages
# and sorts them into data/glossaries/<language>/<standardized_filename>.pdf
#
# Usage: bash scripts/download-glossaries.sh

set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)/data/glossaries"
TOTAL=0
FAILED=0

download() {
  local url="$1"
  local language="$2"
  local filename="$3"
  local dest="$BASE_DIR/$language/$filename"

  if [ -f "$dest" ]; then
    echo "  SKIP (exists): $language/$filename"
    return
  fi

  mkdir -p "$BASE_DIR/$language"
  if curl -sS -L -f -o "$dest" "$url"; then
    echo "  OK: $language/$filename"
    TOTAL=$((TOTAL + 1))
  else
    echo "  FAIL: $language/$filename ($url)"
    FAILED=$((FAILED + 1))
    rm -f "$dest"
  fi
}

echo "=== Downloading RBERN Bilingual Glossaries ==="
echo ""

# ── ELA ──────────────────────────────────────────────────────────────
echo "[ELA Glossaries]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_arabic.pdf" arabic ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_burmese.pdf" burmese ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_french.pdf" french ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_kinyarwanda.pdf" kinyarwanda ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_nepali.pdf" nepali ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_Pashto.pdf" pashto ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_portuguese.pdf" portuguese ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_spanish.pdf" spanish ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_swahili.pdf" swahili ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_tagalog.pdf" tagalog ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_twi.pdf" twi ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_ukrainian.pdf" ukrainian ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_urdu.pdf" urdu ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_uzbek.pdf" uzbek ela.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ela/ela_vietnamese.pdf" vietnamese ela.pdf

# ── Elementary School Math ───────────────────────────────────────────
echo ""
echo "[Elementary School Math]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/ele3to5matharabic.pdf" arabic elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/ele3to5mathburmese.pdf" burmese elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/3-5math_glossary_french.pdf" french elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/elementary_math_kinyarwanda.pdf" kinyarwanda elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/elementary_math_nepali.pdf" nepali elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/elementary_math_pashto.pdf" pashto elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/elementary_math_portuguese.pdf" portuguese elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/ele3to5mathspanish.pdf" spanish elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/elementary_math_swahili.pdf" swahili elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/elementary_math_3-5_tagalog.pdf" tagalog elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/elementary_math_twi.pdf" twi elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/ele3to5mathukrainian.pdf" ukrainian elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/ele3to5mathurdu.pdf" urdu elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/elementary_school_math_uzbek.pdf" uzbek elementary_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemath/3-5math_glossary_vietnamese.pdf" vietnamese elementary_school_math.pdf

# ── Middle School Math ───────────────────────────────────────────────
echo ""
echo "[Middle School Math]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/ms_6_8_math_arabic.pdf" arabic middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/ms_6_8_math_burmese.pdf" burmese middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/6-8math_glossary_french.pdf" french middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/middle_school_6-8_math_kinyarwanda.pdf" kinyarwanda middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/MS6to8IntermediateMathNepali2014.pdf" nepali middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/middle_school_math_Pashto.pdf" pashto middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/intermediate_level_6-8_math_portuguese.pdf" portuguese middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/ms_6_8_math_spanish.pdf" spanish middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/middle_school_6-8_math_swahili.pdf" swahili middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/intermediate_level_6-8_math_tagalog.pdf" tagalog middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/middle_school_6-8_math_twi.pdf" twi middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/ms_6_8_math_ukrainian.pdf" ukrainian middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/ms_6_8_math_urdu.pdf" urdu middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/middle_school_math_uzbek.pdf" uzbek middle_school_math.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msmath/6-8math_glossary_vietnamese.pdf" vietnamese middle_school_math.pdf

# ── High School Integrated Algebra ───────────────────────────────────
echo ""
echo "[High School Integrated Algebra]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_arabic.pdf" arabic high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_Burmese.pdf" burmese high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_french.pdf" french high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_kinyarwanda.pdf" kinyarwanda high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_nepali.pdf" nepali high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_Pashto.pdf" pashto high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_portuguese.pdf" portuguese high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_spanish.pdf" spanish high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_swahili.pdf" swahili high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_tagalog.pdf" tagalog high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_twi.pdf" twi high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_ukrainian.pdf" ukrainian high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_urdu.pdf" urdu high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_uzbek.pdf" uzbek high_school_algebra.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsintegratedalgebra/hs_integrated_algebra_vietnamese.pdf" vietnamese high_school_algebra.pdf

# ── High School Geometry ─────────────────────────────────────────────
echo ""
echo "[High School Geometry]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_arabic.pdf" arabic high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_Burmese.pdf" burmese high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_french.pdf" french high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_kinyarwanda.pdf" kinyarwanda high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_nepali.pdf" nepali high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_Pashto.pdf" pashto high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_portuguese.pdf" portuguese high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_spanish.pdf" spanish high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_swahili.pdf" swahili high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_tagalog.pdf" tagalog high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_twi.pdf" twi high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_ukrainian.pdf" ukrainian high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_urdu.pdf" urdu high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_uzbek.pdf" uzbek high_school_geometry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/hsgeometry/hs_geometry_vietnamese.pdf" vietnamese high_school_geometry.pdf

# ── High School Algebra 2 ───────────────────────────────────────────
echo ""
echo "[High School Algebra 2]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_arabic.pdf" arabic high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_Burmese.pdf" burmese high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_french.pdf" french high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_kinyarwanda.pdf" kinyarwanda high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trig_nepali.pdf" nepali high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_Pashto.pdf" pashto high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trigonometry_portuguese.pdf" portuguese high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trigonometry_spanish.pdf" spanish high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trig_swahili.pdf" swahili high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trig_tagalog.pdf" tagalog high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trig_twi.pdf" twi high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trig_ukrainian.pdf" ukrainian high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trig_urdu.pdf" urdu high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_trig_uzbek.pdf" uzbek high_school_algebra2.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/algebra2/hs_algebra2_vietnamese.pdf" vietnamese high_school_algebra2.pdf

# ── Middle School Science ────────────────────────────────────────────
echo ""
echo "[Middle School Science]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_arabic.pdf" arabic middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_burmese.pdf" burmese middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_farsi.pdf" dari middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_french.pdf" french middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_kinyarwanda.pdf" kinyarwanda middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_nepali.pdf" nepali middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/middle_school_science_Pashto.pdf" pashto middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_portuguese.pdf" portuguese middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_spanish.pdf" spanish middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_swahili.pdf" swahili middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_tagalog.pdf" tagalog middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_twi.pdf" twi middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_ukrainian.pdf" ukrainian middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_urdu.pdf" urdu middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_uzbek.pdf" uzbek middle_school_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/msscience/ms_science_vietnamese.pdf" vietnamese middle_school_science.pdf

# ── High School Earth Science ────────────────────────────────────────
echo ""
echo "[High School Earth Science]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_arabic.pdf" arabic high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_burmese.pdf" burmese high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_farsi.pdf" dari high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_french.pdf" french high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_kinyarwanda.pdf" kinyarwanda high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_nepali.pdf" nepali high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth-science_Pashto.pdf" pashto high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_portuguese.pdf" portuguese high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_spanish.pdf" spanish high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_swahili.pdf" swahili high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_tagalog.pdf" tagalog high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_twi.pdf" twi high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_ukrainian.pdf" ukrainian high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_urdu.pdf" urdu high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_uzbek.pdf" uzbek high_school_earth_science.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/earthsci/hs_earth_science_vietnamese.pdf" vietnamese high_school_earth_science.pdf

# ── High School Living Environment (Biology) ─────────────────────────
echo ""
echo "[High School Biology]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_arabic.pdf" arabic high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_Burmese.pdf" burmese high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_french.pdf" french high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_kinyarwanda.pdf" kinyarwanda high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_nepali.pdf" nepali high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_Pashto.pdf" pashto high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_portuguese.pdf" portuguese high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_spanish.pdf" spanish high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_swahili.pdf" swahili high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_tagalog.pdf" tagalog high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_twi.pdf" twi high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_ukrainian.pdf" ukrainian high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_urdu.pdf" urdu high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_uzbek.pdf" uzbek high_school_living_environment.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/biology/hs_living_environment_vietnamese.pdf" vietnamese high_school_living_environment.pdf

# ── High School Chemistry ────────────────────────────────────────────
echo ""
echo "[High School Chemistry]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_arabic.pdf" arabic high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_burmese.pdf" burmese high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_farsi.pdf" dari high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_french.pdf" french high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_kinyarwanda.pdf" kinyarwanda high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_nepali.pdf" nepali high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_glossary_Pashto.pdf" pashto high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_portuguese.pdf" portuguese high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_spanish.pdf" spanish high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_swahili.pdf" swahili high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_tagalog.pdf" tagalog high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_twi.pdf" twi high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_ukrainian.pdf" ukrainian high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_urdu.pdf" urdu high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_uzbek.pdf" uzbek high_school_chemistry.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/chemistry/hs_chemistry_vietnamese.pdf" vietnamese high_school_chemistry.pdf

# ── High School Physics ──────────────────────────────────────────────
echo ""
echo "[High School Physics]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_arabic.pdf" arabic high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_burmese.pdf" burmese high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_farsi.pdf" dari high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_french.pdf" french high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_kinyarwanda.pdf" kinyarwanda high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_nepali.pdf" nepali high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_Pashto.pdf" pashto high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_portuguese.pdf" portuguese high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_spanish.pdf" spanish high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_swahili.pdf" swahili high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_tagalog.pdf" tagalog high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_twi.pdf" twi high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_ukrainian.pdf" ukrainian high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_urdu.pdf" urdu high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_uzbek.pdf" uzbek high_school_physics.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/physics/hs_physics_vietnamese.pdf" vietnamese high_school_physics.pdf

# ── Elementary Social Studies ────────────────────────────────────────
echo ""
echo "[Elementary Social Studies]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_arabic.pdf" arabic elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_burmese.pdf" burmese elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_french.pdf" french elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_kinyarwanda.pdf" kinyarwanda elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_nepali.pdf" nepali elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_Pashto.pdf" pashto elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_portuguese.pdf" portuguese elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_spanish.pdf" spanish elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_swahili.pdf" swahili elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_tagalog.pdf" tagalog elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_twi.pdf" twi elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_ukrainian.pdf" ukrainian elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_urdu.pdf" urdu elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_uzbek.pdf" uzbek elementary_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/elemsocialstudies/elementary_social_studies_viet.pdf" vietnamese elementary_school_social_studies.pdf

# ── Middle School Social Studies ─────────────────────────────────────
echo ""
echo "[Middle School Social Studies]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_arabic.pdf" arabic middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_burmese.pdf" burmese middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_french.pdf" french middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_kinyarwanda.pdf" kinyarwanda middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_nepali.pdf" nepali middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/middle_school_social_studies_Pashto.pdf" pashto middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_portuguese.pdf" portuguese middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_spanish.pdf" spanish middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_swahili.pdf" swahili middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_tagalog.pdf" tagalog middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_twi.pdf" twi middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_ukrainian.pdf" ukrainian middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_urdu.pdf" urdu middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_uzbek.pdf" uzbek middle_school_social_studies.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/mssocialstudies/ms_social_studies_vietnamese.pdf" vietnamese middle_school_social_studies.pdf

# ── High School Global History ───────────────────────────────────────
echo ""
echo "[High School Global History]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_arabic.pdf" arabic high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_burmese.pdf" burmese high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_french.pdf" french high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_kinyarwanda.pdf" kinyarwanda high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_nepali.pdf" nepali high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_Pashto.pdf" pashto high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_portuguese.pdf" portuguese high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_spanish.pdf" spanish high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_swahili.pdf" swahili high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_tagalog.pdf" tagalog high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_twi.pdf" twi high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_ukrainian.pdf" ukrainian high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_urdu.pdf" urdu high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_uzbek.pdf" uzbek high_school_global_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/globalhistory/hs_global_history_vietnamese.pdf" vietnamese high_school_global_history.pdf

# ── High School US History ───────────────────────────────────────────
echo ""
echo "[High School US History]"
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_arabic.pdf" arabic high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_burmese.pdf" burmese high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_french.pdf" french high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_kinyarwanda.pdf" kinyarwanda high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_nepali.pdf" nepali high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_Pashto.pdf" pashto high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_portuguese.pdf" portuguese high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_spanish.pdf" spanish high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_swahili.pdf" swahili high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_tagalog.pdf" tagalog high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_twi.pdf" twi high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_ukrainian.pdf" ukrainian high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_urdu.pdf" urdu high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_uzbek.pdf" uzbek high_school_us_history.pdf
download "https://docs.steinhardt.nyu.edu/pdfs/metrocenter/atn293/ushistory/hs_us_history_vietnamese.pdf" vietnamese high_school_us_history.pdf

echo ""
echo "=================================================="
echo "DONE: Downloaded $TOTAL new PDFs ($FAILED failures)"
echo "=================================================="
echo ""
echo "Existing elementary science PDFs were skipped."
echo "Run 'python3 scripts/parse-glossaries.py' to parse all PDFs into lexicon seed JSON."
