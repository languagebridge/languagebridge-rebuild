#!/bin/bash
# Build voice packs for all Tier 2 languages
# Runs on CPU only — safe to run alongside MPS training
set -e

cd "$(dirname "$0")/.."
source venv/bin/activate

STEPS=800
CLIPS=80
LR=0.008

echo "════════════════════════════════════════════════════"
echo "  Building voice packs for 10 Tier 2 languages"
echo "  Steps: $STEPS | Clips: $CLIPS | LR: $LR"
echo "════════════════════════════════════════════════════"

# Languages with related Piper reference voices
echo ""
echo "── Pashto (ref: Persian) ──"
python scripts/optimize_voice_pack.py -l pashto --steps $STEPS --max-clips $CLIPS --lr $LR \
  --ref-audio-dir /tmp/tts_eval/ref_fa_IR-amir-medium --ref-weight 0.3

echo ""
echo "── Urdu (ref: Arabic) ──"
python scripts/optimize_voice_pack.py -l urdu --steps $STEPS --max-clips $CLIPS --lr $LR \
  --ref-audio-dir /tmp/tts_eval/ref_ar_JO-kareem-medium --ref-weight 0.25

echo ""
echo "── Somali (ref: Swahili) ──"
python scripts/optimize_voice_pack.py -l somali --steps $STEPS --max-clips $CLIPS --lr $LR \
  --ref-audio-dir /tmp/tts_eval/ref_sw_CD-lanfrica-medium --ref-weight 0.2

echo ""
echo "── Kinyarwanda (ref: Swahili) ──"
python scripts/optimize_voice_pack.py -l kinyarwanda --steps $STEPS --max-clips $CLIPS --lr $LR \
  --ref-audio-dir /tmp/tts_eval/ref_sw_CD-lanfrica-medium --ref-weight 0.2

echo ""
echo "── Twi (ref: Swahili) ──"
python scripts/optimize_voice_pack.py -l twi --steps $STEPS --max-clips $CLIPS --lr $LR \
  --ref-audio-dir /tmp/tts_eval/ref_sw_CD-lanfrica-medium --ref-weight 0.15

# Languages with no related voice — optimize from scratch
echo ""
echo "── Burmese (no ref) ──"
python scripts/optimize_voice_pack.py -l burmese --steps $STEPS --max-clips $CLIPS --lr $LR

echo ""
echo "── Uzbek (no ref) ──"
python scripts/optimize_voice_pack.py -l uzbek --steps $STEPS --max-clips $CLIPS --lr $LR

echo ""
echo "── Amharic (no ref) ──"
python scripts/optimize_voice_pack.py -l amharic --steps $STEPS --max-clips $CLIPS --lr $LR

echo ""
echo "── Tagalog (no ref) ──"
python scripts/optimize_voice_pack.py -l tagalog --steps $STEPS --max-clips $CLIPS --lr $LR

echo ""
echo "── Tigrinya (no ref) ──"
python scripts/optimize_voice_pack.py -l tigrinya --steps $STEPS --max-clips $CLIPS --lr $LR

echo ""
echo "════════════════════════════════════════════════════"
echo "  All 10 voice packs complete!"
echo "  Check: ls -la voices/*.pt"
echo "════════════════════════════════════════════════════"
