#!/usr/bin/env python3
"""
precompute_mels.py

Pre-compute mel spectrograms, F0, and style vectors for all training clips.
Eliminates librosa from the training loop entirely.

Usage:
  python scripts/precompute_mels.py --language dari
  python scripts/precompute_mels.py --language dari --max-clips 2000
  python scripts/precompute_mels.py --language dari --workers 8
"""

import argparse
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio

BASE = Path(__file__).resolve().parents[1]
SPLITS_DIR = BASE / "data" / "splits"
CACHE_DIR = BASE / "data" / "cache"

# Audio params matching Kokoro's expectations
TARGET_SR = 24000
N_MELS = 80
HOP_LENGTH = 256
WIN_LENGTH = 1024
N_FFT = 1024
MAX_AUDIO_LEN = TARGET_SR * 10  # 10 seconds


def process_clip(wav_path: str, cache_path: str) -> dict:
    """Process a single WAV clip → mel + f0 + style tensors."""
    try:
        # Use soundfile (torchaudio.load requires torchcodec on newer versions)
        data, sr = sf.read(wav_path, dtype="float32")

        # Mono
        if data.ndim > 1:
            data = data.mean(axis=1)

        waveform = torch.FloatTensor(data).unsqueeze(0)  # (1, T)

        # Resample if needed
        if sr != TARGET_SR:
            resampler = torchaudio.transforms.Resample(sr, TARGET_SR)
            waveform = resampler(waveform)

        # Truncate
        if waveform.shape[1] > MAX_AUDIO_LEN:
            waveform = waveform[:, :MAX_AUDIO_LEN]

        # Skip very short clips (< 0.5s)
        if waveform.shape[1] < TARGET_SR // 2:
            return {"status": "skipped", "reason": "too_short"}

        # Mel spectrogram (torch, not librosa)
        mel_transform = torchaudio.transforms.MelSpectrogram(
            sample_rate=TARGET_SR,
            n_fft=N_FFT,
            hop_length=HOP_LENGTH,
            win_length=WIN_LENGTH,
            n_mels=N_MELS,
            power=2.0,
        )
        mel = mel_transform(waveform)  # (1, 80, T)
        mel_db = torchaudio.transforms.AmplitudeToDB(stype="power", top_db=80.0)(mel)
        mel_db = (mel_db + 40.0) / 40.0
        mel_db = mel_db.squeeze(0)  # (80, T)

        # F0 estimate via zero-crossing rate (fast, matches original)
        y = waveform.squeeze(0).numpy()
        frame_length = WIN_LENGTH
        hop = HOP_LENGTH
        n_frames = mel_db.shape[1]

        f0 = np.zeros(n_frames, dtype=np.float32)
        rms = np.zeros(n_frames, dtype=np.float32)
        for i in range(n_frames):
            start = i * hop
            end = min(start + frame_length, len(y))
            if end - start < 2:
                continue
            frame = y[start:end]
            # Zero crossing rate
            zcr = np.sum(np.abs(np.diff(np.signbit(frame)))) / (2 * len(frame))
            f0[i] = np.clip(zcr * TARGET_SR / 2, 50, 550)
            rms[i] = np.sqrt(np.mean(frame ** 2))

        # Zero out silence
        f0[rms < 0.01] = 0.0
        f0 = torch.FloatTensor(f0)

        # Style vector (mean/std of mel, 128 each = 256 total)
        acoustic_style = mel_db.mean(dim=1)  # (80,)
        prosody_style = mel_db.std(dim=1)  # (80,)

        # Pad to 128 each
        if acoustic_style.shape[0] < 128:
            acoustic_style = torch.nn.functional.pad(
                acoustic_style, (0, 128 - acoustic_style.shape[0])
            )
        else:
            acoustic_style = acoustic_style[:128]

        if prosody_style.shape[0] < 128:
            prosody_style = torch.nn.functional.pad(
                prosody_style, (0, 128 - prosody_style.shape[0])
            )
        else:
            prosody_style = prosody_style[:128]

        style = torch.cat([acoustic_style, prosody_style])  # (256,)

        # Save
        torch.save(
            {"mel": mel_db, "f0": f0, "style": style},
            cache_path,
        )
        return {"status": "ok", "frames": mel_db.shape[1]}

    except Exception as e:
        return {"status": "error", "reason": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Precompute mels for training")
    parser.add_argument("--language", "-l", required=True)
    parser.add_argument("--max-clips", type=int, default=0, help="0 = all clips")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    split_dir = SPLITS_DIR / args.language
    cache_dir = CACHE_DIR / args.language
    cache_dir.mkdir(parents=True, exist_ok=True)

    # Collect all clips from train + val splits
    all_files = []
    for split in ["train.txt", "val.txt"]:
        split_file = split_dir / split
        if split_file.exists():
            with open(split_file) as f:
                all_files.extend([line.strip() for line in f if line.strip()])

    if args.max_clips > 0 and len(all_files) > args.max_clips:
        rng = np.random.RandomState(42)
        indices = rng.choice(len(all_files), args.max_clips, replace=False)
        all_files = [all_files[i] for i in indices]

    print(f"Precomputing mels for {args.language}")
    print(f"  Clips: {len(all_files)}")
    print(f"  Cache: {cache_dir}")
    print(f"  Workers: {args.workers}")

    # Check what's already cached
    tasks = []
    skipped_cached = 0
    for wav_path in all_files:
        stem = Path(wav_path).stem
        cache_path = str(cache_dir / f"{stem}.pt")
        if os.path.exists(cache_path):
            skipped_cached += 1
        else:
            tasks.append((wav_path, cache_path))

    print(f"  Already cached: {skipped_cached}")
    print(f"  To process: {len(tasks)}")

    if not tasks:
        print("  Nothing to do.")
        return

    ok = 0
    errors = 0
    skipped = 0

    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(process_clip, wav, cache): wav
            for wav, cache in tasks
        }

        for i, future in enumerate(as_completed(futures)):
            result = future.result()
            if result["status"] == "ok":
                ok += 1
            elif result["status"] == "skipped":
                skipped += 1
            else:
                errors += 1

            if (i + 1) % 500 == 0:
                total = ok + errors + skipped
                print(f"  {total}/{len(tasks)} — {ok} ok, {skipped} skipped, {errors} errors")

    print(f"\nDone: {ok} cached, {skipped} skipped, {errors} errors")
    print(f"Cache directory: {cache_dir}")


if __name__ == "__main__":
    main()
