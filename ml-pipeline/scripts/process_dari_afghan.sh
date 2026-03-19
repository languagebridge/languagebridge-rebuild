#!/bin/bash
#
# process_dari_afghan.sh
#
# Processes all Afghan Dari audio sources into training-ready clips:
#   1. YouTube downloads → Demucs vocal separation → VAD segmentation
#   2. DLI clips → 01_prepare_data.py
#   3. Combines all Afghan sources into dari_afghan split
#
# Run WHILE Dari/Persian training runs in background — this is CPU/disk work,
# doesn't compete with MPS training.
#
# Usage:
#   cd /Users/justinbernard/projects/languagebridge-rebuild/ml-pipeline
#   source venv/bin/activate
#   bash scripts/process_dari_afghan.sh
#
# After this finishes + current training finishes:
#   python scripts/precompute_mels.py --language dari_afghan
#   python training/finetune.py --language dari_afghan --epochs 20 --max-clips 5000

set -e

MLPIPE="/Users/justinbernard/projects/languagebridge-rebuild/ml-pipeline"
RAW_DIR="/Volumes/MLTraining/languagebridge-ml/data/raw"
PROC_DIR="/Volumes/MLTraining/languagebridge-ml/data/processed"
SPLITS_DIR="$MLPIPE/data/splits"
LOG_DIR="/Volumes/MLTraining/languagebridge-ml/logs"

mkdir -p "$LOG_DIR"

echo "============================================================"
echo "  Process Afghan Dari Audio Sources"
echo "============================================================"
echo ""

# ─────────────────────────────────────────────────────────────────
# STEP 1: Process YouTube downloads through Demucs + VAD
# ─────────────────────────────────────────────────────────────────

YT_DOWNLOAD="$RAW_DIR/dari_youtube/01_downloaded"
YT_SEPARATED="$RAW_DIR/dari_youtube/02_separated"
YT_CLIPS="$RAW_DIR/dari/clips_youtube"

mkdir -p "$YT_SEPARATED" "$YT_CLIPS"

YT_COUNT=$(ls "$YT_DOWNLOAD"/*.wav 2>/dev/null | wc -l | tr -d ' ')
echo "[STEP 1] YouTube Dari: $YT_COUNT downloaded videos"

if [ "$YT_COUNT" -gt 0 ]; then
    EXISTING_CLIPS=$(ls "$YT_CLIPS"/*.wav 2>/dev/null | wc -l | tr -d ' ')

    if [ "$EXISTING_CLIPS" -gt 100 ]; then
        echo "  Already processed ($EXISTING_CLIPS clips). Skipping."
    else
        echo "  Running Demucs vocal separation (this takes a while)..."
        echo "  Using CPU to avoid competing with MPS training"

        for wav in "$YT_DOWNLOAD"/*.wav; do
            filename=$(basename "$wav")

            # Skip webm files and small files
            if [[ "$filename" == *.webm ]] || [[ $(stat -f%z "$wav") -lt 1000000 ]]; then
                continue
            fi

            # Check if already separated
            stem="${filename%.*}"
            if ls "$YT_SEPARATED"/htdemucs/"$stem"/vocals.wav 2>/dev/null 1>&2; then
                echo "  [skip] $filename (already separated)"
                continue
            fi

            echo "  [demucs] $filename..."
            python3 -m demucs \
                --two-stems=vocals \
                --out "$YT_SEPARATED" \
                --device cpu \
                "$wav" 2>&1 | tail -3
        done

        echo ""
        echo "  Running VAD segmentation on vocal tracks..."

        # Split each vocal track into clips using Silero VAD
        python3 -u -c "
import sys
sys.path.insert(0, '$MLPIPE/scripts')
from youtube_audio_pipeline import split_on_silence
from pathlib import Path

separated = Path('$YT_SEPARATED')
clips_dir = Path('$YT_CLIPS')
clips_dir.mkdir(parents=True, exist_ok=True)

vocals = sorted(separated.rglob('vocals.wav'))
print(f'  Found {len(vocals)} vocal tracks to segment')

total = 0
for i, v in enumerate(vocals):
    print(f'  [{i+1}/{len(vocals)}] {v.parent.name}...', flush=True)
    count = split_on_silence(v, clips_dir, 'dari_yt')
    print(f'    -> {count} clips')
    total += count

print(f'  Total YouTube clips: {total}')
"
    fi
fi

# ─────────────────────────────────────────────────────────────────
# STEP 2: Process DLI clips
# ─────────────────────────────────────────────────────────────────

DLI_RAW="$RAW_DIR/dari_dli"
DLI_CLIPS="$RAW_DIR/dari/clips_dli"
DLI_PROC="$PROC_DIR/dari_afghan_dli"

echo ""
echo "[STEP 2] DLI Dari clips"

# The clips_dli already has 1,433 WAV files extracted
# The dari_dli has 254 additional MP3 files in subdirs
# Convert MP3s to WAV and combine

mkdir -p "$DLI_PROC"

DLI_MP3_COUNT=$(find "$DLI_RAW" -name "*.mp3" 2>/dev/null | wc -l | tr -d ' ')
DLI_WAV_COUNT=$(ls "$DLI_CLIPS"/*.wav 2>/dev/null | wc -l | tr -d ' ')

echo "  DLI WAV clips (already extracted): $DLI_WAV_COUNT"
echo "  DLI MP3 files (need conversion):   $DLI_MP3_COUNT"

if [ "$DLI_MP3_COUNT" -gt 0 ]; then
    echo "  Converting DLI MP3s to WAV..."

    find "$DLI_RAW" -name "*.mp3" | while read mp3; do
        stem=$(basename "$mp3" .mp3 | tr ' ' '_')
        out="$DLI_CLIPS/dli_extra_${stem}.wav"
        if [ ! -f "$out" ]; then
            ffmpeg -i "$mp3" -ar 22050 -ac 1 "$out" -y -loglevel error 2>/dev/null || true
        fi
    done

    NEW_COUNT=$(ls "$DLI_CLIPS"/*.wav 2>/dev/null | wc -l | tr -d ' ')
    echo "  DLI total WAV clips: $NEW_COUNT"
fi

# ─────────────────────────────────────────────────────────────────
# STEP 3: Combine all Afghan sources and create splits
# ─────────────────────────────────────────────────────────────────

echo ""
echo "[STEP 3] Combining Afghan Dari sources + creating splits"

python3 -u -c "
import os
import numpy as np
from pathlib import Path
import soundfile as sf

splits_dir = Path('$SPLITS_DIR/dari_afghan')
splits_dir.mkdir(parents=True, exist_ok=True)

# Collect all Afghan Dari clips
clips = []

# YouTube clips
yt_dir = Path('$YT_CLIPS')
if yt_dir.exists():
    yt_clips = sorted(yt_dir.glob('*.wav'))
    clips.extend([str(c) for c in yt_clips])
    print(f'  YouTube clips: {len(yt_clips)}')

# DLI clips
dli_dir = Path('$DLI_CLIPS')
if dli_dir.exists():
    dli_clips = sorted(dli_dir.glob('*.wav'))
    clips.extend([str(c) for c in dli_clips])
    print(f'  DLI clips:     {len(dli_clips)}')

# CV Dari-labeled (the 14 clips)
# These are in processed/dari/ but we'd need to identify them
# Skip for now — 14 clips is negligible

print(f'  Total Afghan Dari: {len(clips)}')

if len(clips) < 50:
    print('  WARNING: Very few clips. Run Demucs on YouTube videos first.')
    print('  Creating splits anyway...')

# Shuffle and split 80/10/10
rng = np.random.RandomState(42)
rng.shuffle(clips)
n = len(clips)
n_train = int(n * 0.8)
n_val = int(n * 0.1)

train = clips[:n_train]
val = clips[n_train:n_train + n_val]
test = clips[n_train + n_val:]

for name, split in [('train', train), ('val', val), ('test', test)]:
    with open(splits_dir / f'{name}.txt', 'w') as f:
        f.write('\n'.join(split) + '\n')
    print(f'  {name}: {len(split)} clips')

# Calculate total duration
total_dur = 0
for c in clips[:100]:  # Sample first 100 for speed
    try:
        info = sf.info(c)
        total_dur += info.duration
    except:
        pass

est_total = total_dur / min(100, len(clips)) * len(clips)
print(f'  Estimated total audio: {est_total/3600:.1f} hours')
"

echo ""
echo "============================================================"
echo "  Afghan Dari Processing Complete"
echo "============================================================"
echo ""
echo "  Next steps:"
echo "    1. python scripts/precompute_mels.py --language dari_afghan"
echo "    2. python training/finetune.py --language dari_afghan --epochs 20 --max-clips 5000"
echo ""
echo "  To get MORE Dari data from Humyan Afghan's channel:"
echo "    python scripts/youtube_audio_pipeline.py \\"
echo "      --channel '@Hamayon-afghan' \\"
echo "      --language dari \\"
echo "      --max-videos 50"
