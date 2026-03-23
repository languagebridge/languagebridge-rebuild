#!/bin/bash
#
# train_kokoro_only.sh
#
# Train ONLY the 5 languages that have no Piper voice.
# These are the only languages that need Kokoro fine-tuning.
#
# Usage:
#   cd ~/projects/languagebridge-rebuild/ml-pipeline
#   source venv/bin/activate
#   bash scripts/train_kokoro_only.sh

set -e

MLPIPE="/Users/justinbernard/projects/languagebridge-rebuild/ml-pipeline"
LOG_DIR="/Volumes/MLTraining/languagebridge-ml/logs"
MODELS_DIR="$MLPIPE/models"

mkdir -p "$LOG_DIR"

# Only languages with NO Piper voice — ordered by data size
LANGUAGES=(
    "amharic"       # 1,424 clips
    "burmese"       # 2,463 clips
    "tagalog"       #   289 clips (limited)
    "uzbek"         # 211,847 clips (large!)
    "tigrinya"      #   unknown — check processed/
)

echo "============================================================"
echo "  Kokoro-Only Training — 5 Languages"
echo "============================================================"
echo "  Languages: ${#LANGUAGES[@]}"
echo "  These have NO Piper voice — Kokoro is the only option."
echo "============================================================"
echo ""

COMPLETED=0
SKIPPED=0
FAILED=0

for lang in "${LANGUAGES[@]}"; do
    MODEL_FILE="$MODELS_DIR/$lang/${lang}_tts_v1.pth"

    if [ -f "$MODEL_FILE" ]; then
        echo "[$lang] SKIP — model already exists"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    echo ""
    echo "────────────────────────────────────────────────────"
    echo "  Training: $lang"
    echo "────────────────────────────────────────────────────"

    # Precompute mels if not cached
    echo "[$lang] Precomputing mels..."
    python -u scripts/precompute_mels.py --language "$lang" 2>&1 | tail -3

    # Train
    echo "[$lang] Training..."
    python -u training/finetune.py \
        --language "$lang" \
        --epochs 20 \
        --max-clips 2000 \
        2>&1 | tee "$LOG_DIR/finetune_${lang}.log"

    if [ -f "$MODEL_FILE" ]; then
        echo "[$lang] DONE — model saved"
        COMPLETED=$((COMPLETED + 1))
    else
        echo "[$lang] FAILED — no model file"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "============================================================"
echo "  TRAINING COMPLETE"
echo "============================================================"
echo "  Completed: $COMPLETED"
echo "  Skipped:   $SKIPPED (already trained)"
echo "  Failed:    $FAILED"
echo "============================================================"
