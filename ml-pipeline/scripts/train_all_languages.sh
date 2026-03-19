#!/bin/bash
#
# train_all_languages.sh
#
# Precomputes mels and trains Kokoro-82M for all languages sequentially.
# Run this after Dari finishes. It will:
#   1. Precompute cached mels for each language
#   2. Train for 20 epochs (early stopping at patience=5)
#   3. Log output per language
#   4. Skip languages that already have a trained model
#
# Usage:
#   cd /Users/justinbernard/projects/languagebridge-rebuild/ml-pipeline
#   source venv/bin/activate
#   bash scripts/train_all_languages.sh
#
# To resume after interruption, just run again — it skips completed languages.

set -e

MLPIPE="/Users/justinbernard/projects/languagebridge-rebuild/ml-pipeline"
LOG_DIR="/Volumes/MLTraining/languagebridge-ml/logs"
MODELS_DIR="$MLPIPE/models"

mkdir -p "$LOG_DIR"

# Languages ordered by priority and data size
# Tier 1: Pilot languages with strong data (train first)
# Tier 2: Expansion languages with strong data
# Tier 3: Languages with moderate data
# Tier 4: Languages with limited data (may not converge well)

TIER1=(
    "arabic"        # 103K clips — pilot language
    "urdu"          # 181K clips — pilot language
    "ukrainian"     # 68K clips  — pilot language
    "spanish_colombian"  # 3.8K clips — pilot dialect
)

TIER2=(
    "french"        # 619K clips
    "swahili"       # 531K clips
    "portuguese"    # 137K clips
    "uzbek"         # 169K clips
    "persian"       # 282K clips (same data as dari)
    "nepali"        # 84K clips
)

TIER3=(
    "vietnamese"    # 14K clips
    "spanish_peruvian"   # 4.2K clips
    "spanish_venezuelan" # 2.6K clips
    "burmese"       # 1.9K clips
    "amharic"       # 1.1K clips
    "spanish_mexican"    # 905 clips
    "spanish_puerto_rico" # 482 clips
)

TIER4=(
    # These have <400 clips — may not train well
    # Download supplementary data first for better results
    "pashto"        # 335 clips (975 hrs available via CV v19)
    "somali"        # 304 clips (FLEURS available)
    "twi"           # 258 clips (BibleTTS 160 hrs available)
    "tagalog"       # 231 clips (FLEURS + Nexdata available)
)

ALL_LANGS=("${TIER1[@]}" "${TIER2[@]}" "${TIER3[@]}" "${TIER4[@]}")

echo "============================================================"
echo "  LanguageBridge — Train All Languages"
echo "============================================================"
echo "  Languages: ${#ALL_LANGS[@]}"
echo "  Log dir:   $LOG_DIR"
echo "  Models:    $MODELS_DIR"
echo "============================================================"
echo ""

COMPLETED=0
SKIPPED=0
FAILED=0

for lang in "${ALL_LANGS[@]}"; do
    MODEL_FILE="$MODELS_DIR/$lang/${lang}_tts_v1.pth"

    # Skip if model already exists
    if [ -f "$MODEL_FILE" ]; then
        echo "[SKIP] $lang — model already exists at $MODEL_FILE"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    echo ""
    echo "──────────────────────────────────────────────────────────"
    echo "  [$lang] Starting..."
    echo "──────────────────────────────────────────────────────────"

    # Step 1: Precompute mels
    CACHE_DIR="$MLPIPE/data/cache/$lang"
    CACHE_COUNT=$(ls "$CACHE_DIR"/*.pt 2>/dev/null | wc -l || echo 0)

    if [ "$CACHE_COUNT" -lt 100 ]; then
        echo "  Precomputing mels for $lang..."
        python -u "$MLPIPE/scripts/precompute_mels.py" \
            --language "$lang" \
            --max-clips 10000 \
            --workers 4 \
            2>&1 | tee "$LOG_DIR/precompute_${lang}.log"

        if [ $? -ne 0 ]; then
            echo "  [FAIL] Precompute failed for $lang"
            FAILED=$((FAILED + 1))
            continue
        fi
    else
        echo "  Cache exists ($CACHE_COUNT clips), skipping precompute"
    fi

    # Step 2: Train
    echo "  Training $lang..."
    python -u "$MLPIPE/training/finetune.py" \
        --language "$lang" \
        --epochs 20 \
        --max-clips 2000 \
        2>&1 | tee "$LOG_DIR/finetune_${lang}.log"

    if [ -f "$MODEL_FILE" ]; then
        echo "  [DONE] $lang — model saved to $MODEL_FILE"
        COMPLETED=$((COMPLETED + 1))
    else
        echo "  [FAIL] $lang — no model file produced"
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
echo "  Total:     ${#ALL_LANGS[@]}"
echo "============================================================"
echo ""
echo "Next: python scripts/evaluate_tts.py --language <lang>"
echo "Then: python registry/upload_weights.py --language <lang>"
