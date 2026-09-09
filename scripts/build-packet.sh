#!/usr/bin/env bash
#
# build-packet.sh — assemble the district-facing document packet into a PDF.
#
# Includes ONLY the customer-facing docs (Company Overview, Pricing, Security &
# Privacy, FAQ, and the DPA template). Internal docs (Cost Model, Canonical Facts,
# README, Before-You-Send checklist) are excluded, and the DPA's internal
# "Internal notes (NOT part of the agreement)" section is stripped so it never
# reaches a district. Internal .md cross-links are flattened to plain text.
#
# Requires: pandoc + Google Chrome (headless print-to-pdf). Output → company/exports/.
# Usage: scripts/build-packet.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CO="$ROOT/company"
OUT="$CO/exports"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DATE="$(date '+%B %Y')"
NAME="LanguageBridge-District-Packet"

command -v pandoc >/dev/null || { echo "✗ pandoc not found (brew install pandoc)"; exit 1; }
[ -x "$CHROME" ] || { echo "✗ Google Chrome not found at expected path"; exit 1; }

mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── Cover + contents (raw HTML, passed through by pandoc) ────────────
cat > "$TMP/combined.md" <<EOF
<div class="cover">
  <div class="brand">LanguageBridge</div>
  <div class="sub">District Information Packet</div>
  <div class="rule"></div>
  <div class="tagline">Academic translation, read-aloud audio, and two-way classroom communication for K-12 English learners — in 16 languages, on any Chromebook.</div>
  <div class="meta">
    <strong>LanguageBridge LLC</strong><br>
    856 Eastlawn Dr, Highland Heights, OH 44143<br>
    Justin Bernard, CEO &middot; justin@languagebridge.app &middot; (216) 800-6020<br>
    $DATE
  </div>
  <div class="conf">Confidential — prepared for the named district and its advisors</div>
</div>

<div class="toc">

## Contents

1. Company Overview
2. Pricing &amp; Packaging
3. Security &amp; Privacy Overview
4. Administrator FAQ
5. Student Data Privacy Agreement (template)

</div>

EOF

# ── Body: customer-facing docs, in order ────────────────────────────
DOCS=(COMPANY-OVERVIEW PRICING-AND-PACKAGING SECURITY-AND-PRIVACY-OVERVIEW SCHOOL-ADMIN-FAQ DPA-TEMPLATE)
for f in "${DOCS[@]}"; do
  if [ "$f" = "DPA-TEMPLATE" ]; then
    # Drop the internal-notes section (everything from that heading to EOF).
    awk '/^## Internal notes/{exit} {print}' "$CO/$f.md" >> "$TMP/combined.md"
  else
    cat "$CO/$f.md" >> "$TMP/combined.md"
  fi
  printf '\n\n' >> "$TMP/combined.md"
done

# Flatten internal cross-links [text](something.md) -> text
perl -0pi -e 's/\[([^\]]+)\]\([^)]*\.md[^)]*\)/$1/g' "$TMP/combined.md"

# ── Markdown -> HTML fragment -> full HTML with print styles ─────────
pandoc "$TMP/combined.md" -f gfm -t html5 -o "$TMP/body.html"
{
  echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LanguageBridge — District Information Packet</title>'
  cat "$ROOT/scripts/packet-style.html"
  echo '</head><body>'
  cat "$TMP/body.html"
  echo '</body></html>'
} > "$OUT/$NAME.html"

# ── HTML -> PDF via headless Chrome ─────────────────────────────────
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --user-data-dir="$TMP/chrome" \
  --print-to-pdf="$OUT/$NAME.pdf" \
  "file://$OUT/$NAME.html" >/dev/null 2>&1 || \
"$CHROME" --headless --disable-gpu --print-to-pdf-no-header \
  --user-data-dir="$TMP/chrome" \
  --print-to-pdf="$OUT/$NAME.pdf" \
  "file://$OUT/$NAME.html" >/dev/null 2>&1

echo "Built:"
echo "  $OUT/$NAME.pdf"
echo "  $OUT/$NAME.html"
ls -la "$OUT/$NAME.pdf"
