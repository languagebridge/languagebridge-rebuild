#!/usr/bin/env python3
"""
extract_voice_pack.py

Extract a Kokoro-compatible voice pack from speech audio using StyleTTS2's
style encoder. This creates a native-sounding voice for any language instead
of forcing foreign phonemes through an English voice style.

Usage:
  # Extract Dari voice pack from processed training clips
  python scripts/extract_voice_pack.py --language dari --max-clips 200

  # Extract for any language
  python scripts/extract_voice_pack.py --language arabic --max-clips 200

Output: voices/{language}.pt  (Kokoro-compatible [510, 1, 256] tensor)

How it works:
  1. Loads StyleTTS2's pretrained style_encoder + predictor_encoder
  2. Samples N audio clips from our processed training data
  3. Extracts 128-dim acoustic style + 128-dim prosody style per clip
  4. Averages across clips to get a stable speaker identity
  5. Tiles the 256-dim vector across 510 positions (Kokoro format)
"""

import argparse
import random
import sys
from pathlib import Path

import librosa
import numpy as np
import torch
import torch.nn as nn

BASE = Path(__file__).resolve().parents[1]
DATA_DIR = BASE / "data" / "processed"
VOICES_DIR = BASE / "voices"
VOICES_DIR.mkdir(parents=True, exist_ok=True)

# Mel spectrogram config matching StyleTTS2/Kokoro
SAMPLE_RATE = 24000
N_MELS = 80
N_FFT = 2048
HOP_LENGTH = 300
WIN_LENGTH = 1200


def compute_mel(audio, sr=SAMPLE_RATE):
    """Compute mel spectrogram matching StyleTTS2 preprocessing."""
    mel = librosa.feature.melspectrogram(
        y=audio, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH,
        win_length=WIN_LENGTH, n_mels=N_MELS,
    )
    mel = np.log1p(mel)
    mel_tensor = torch.from_numpy(mel).float()
    return mel_tensor


def load_style_encoders():
    """Load StyleTTS2 with pretrained style encoders."""
    print("Loading StyleTTS2 style encoders (downloads ~800MB on first run)...")

    # Patch torch.load for StyleTTS2 compatibility with PyTorch 2.6+
    _original_load = torch.load
    def _patched_load(*args, **kwargs):
        kwargs.setdefault("weights_only", False)
        return _original_load(*args, **kwargs)
    torch.load = _patched_load

    try:
        from styletts2.tts import StyleTTS2
        tts = StyleTTS2()
    finally:
        torch.load = _original_load

    style_enc = tts.model.style_encoder
    pred_enc = tts.model.predictor_encoder
    device = tts.device
    print(f"Style encoders loaded on {device}")
    return style_enc, pred_enc, device


def extract_style(audio_path, style_enc, pred_enc, device):
    """Extract 256-dim style vector from a single audio file."""
    wave, sr = librosa.load(str(audio_path), sr=SAMPLE_RATE)
    audio, _ = librosa.effects.trim(wave, top_db=30)

    if len(audio) < SAMPLE_RATE * 0.5:  # skip clips < 0.5s
        return None

    mel_tensor = compute_mel(audio).to(device)

    with torch.no_grad():
        ref_s = style_enc(mel_tensor.unsqueeze(0).unsqueeze(0))  # [1, 128]
        ref_p = pred_enc(mel_tensor.unsqueeze(0).unsqueeze(0))   # [1, 128]

    style_vec = torch.cat([ref_s, ref_p], dim=1)  # [1, 256]
    return style_vec.cpu()


def build_voice_pack(style_vectors):
    """
    Build a Kokoro-compatible voice pack [510, 1, 256] from averaged style vectors.

    Kokoro indexes into the pack by phoneme length: pack[len(phonemes) - 1].
    The style is essentially the same at all positions, so we tile the averaged
    embedding across all 510 slots.
    """
    # Average all extracted styles
    stacked = torch.cat(style_vectors, dim=0)  # [N, 256]
    avg_style = stacked.mean(dim=0, keepdim=True)  # [1, 256]

    # Tile to [510, 1, 256]
    pack = avg_style.unsqueeze(0).expand(510, -1, -1).clone()  # [510, 1, 256]
    return pack


def main():
    parser = argparse.ArgumentParser(description="Extract Kokoro voice pack from speech data")
    parser.add_argument("--language", "-l", required=True, help="Language code (e.g., dari, arabic)")
    parser.add_argument("--max-clips", "-n", type=int, default=200, help="Max clips to sample")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for clip sampling")
    args = parser.parse_args()

    language = args.language
    lang_dir = DATA_DIR / language

    if not lang_dir.exists():
        print(f"ERROR: No processed data at {lang_dir}")
        sys.exit(1)

    # Find audio files
    clips = list(lang_dir.glob("**/*.wav"))
    if not clips:
        clips = list(lang_dir.glob("**/*.mp3"))
    if not clips:
        print(f"ERROR: No audio files found in {lang_dir}")
        sys.exit(1)

    print(f"Found {len(clips)} audio clips for {language}")

    # Sample clips
    random.seed(args.seed)
    if len(clips) > args.max_clips:
        clips = random.sample(clips, args.max_clips)
    print(f"Sampling {len(clips)} clips for style extraction")

    # Load encoders
    style_enc, pred_enc, device = load_style_encoders()

    # Extract styles
    style_vectors = []
    failed = 0
    for i, clip in enumerate(clips):
        if (i + 1) % 20 == 0:
            print(f"  Extracting {i+1}/{len(clips)}...")

        try:
            vec = extract_style(clip, style_enc, pred_enc, device)
            if vec is not None:
                style_vectors.append(vec)
        except Exception as e:
            failed += 1
            if failed <= 3:
                print(f"  WARN: {clip.name}: {e}")

    print(f"\nExtracted {len(style_vectors)} style vectors ({failed} failed)")

    if len(style_vectors) < 10:
        print("ERROR: Too few successful extractions. Check audio quality.")
        sys.exit(1)

    # Build voice pack
    pack = build_voice_pack(style_vectors)
    print(f"Voice pack shape: {pack.shape}")  # should be [510, 1, 256]

    # Save
    out_path = VOICES_DIR / f"{language}.pt"
    torch.save(pack, out_path)
    print(f"\nSaved: {out_path}")
    print(f"Use in eval: python scripts/evaluate_tts.py --language {language} --voice {language}")


if __name__ == "__main__":
    main()
