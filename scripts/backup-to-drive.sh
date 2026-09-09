#!/usr/bin/env bash
#
# backup-to-drive.sh — snapshot the important LanguageBridge document sets to the
# external drive. Safe to run anytime; each run writes a dated snapshot and moves
# the `latest` pointer to it.
#
# Usage:
#   scripts/backup-to-drive.sh                 # backs up to the default drive
#   LB_BACKUP_DRIVE=/Volumes/Other scripts/backup-to-drive.sh
#
# What it backs up: the non-code deliverables that aren't trivially regenerable —
# company docs, engineering/compliance docs, and handoff deliverables. Source code
# is already backed up by git; this is for the document corpus.

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────
DRIVE="${LB_BACKUP_DRIVE:-/Volumes/MLTraining}"
FOLDERS=(company docs deliverables)

# Repo root = parent of this script's directory (works from anywhere).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEST_ROOT="$DRIVE/languagebridge-backups"
STAMP="$(date +%F)"                      # YYYY-MM-DD
DEST="$DEST_ROOT/$STAMP"

# ── Preconditions ────────────────────────────────────────────────────
if [ ! -d "$DRIVE" ]; then
  echo "✗ Backup drive not mounted: $DRIVE" >&2
  echo "  Plug it in (or set LB_BACKUP_DRIVE=/Volumes/<name>) and re-run." >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "✗ rsync not found." >&2
  exit 1
fi

# ── Backup ───────────────────────────────────────────────────────────
echo "LanguageBridge backup"
echo "  source: $REPO_ROOT"
echo "  dest:   $DEST"
echo

mkdir -p "$DEST"

for d in "${FOLDERS[@]}"; do
  if [ -d "$REPO_ROOT/$d" ]; then
    rsync -a --delete "$REPO_ROOT/$d/" "$DEST/$d/"
    printf "  ✓ %-14s %s\n" "$d" "$(du -sh "$DEST/$d" 2>/dev/null | cut -f1)"
  else
    printf "  – %-14s (not present, skipped)\n" "$d"
  fi
done

# Move the `latest` pointer to this snapshot.
ln -sfn "$DEST" "$DEST_ROOT/latest"

echo
echo "  total:  $(du -sh "$DEST" 2>/dev/null | cut -f1)"
echo "  latest → $DEST_ROOT/latest"
echo "Done."
