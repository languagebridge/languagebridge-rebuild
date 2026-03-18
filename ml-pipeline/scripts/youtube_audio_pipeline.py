"""
YouTube Audio Extraction Pipeline for TTS Training Data.

Downloads YouTube videos, isolates vocals from background noise/music
using Demucs, splits into individual utterances using Silero VAD,
and validates clips for training.

Usage:
  # Single video
  python scripts/youtube_audio_pipeline.py --url "https://youtube.com/watch?v=..." --language dari

  # Channel (downloads all videos)
  python scripts/youtube_audio_pipeline.py --channel "@Hamayon-afghan" --language dari --max-videos 10

  # Playlist
  python scripts/youtube_audio_pipeline.py --url "https://youtube.com/playlist?list=..." --language dari

Requirements:
  pip install yt-dlp demucs silero-vad librosa soundfile
"""

import argparse
import subprocess
import shutil
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch

BASE = Path(__file__).resolve().parents[1]
RAW_DIR = BASE / "data" / "raw"

TARGET_SR = 22050
MIN_CLIP_DURATION = 1.0
MAX_CLIP_DURATION = 10.0


def download_audio(url_or_channel, output_dir, max_videos=None):
    """Download audio from YouTube using yt-dlp."""
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "yt-dlp",
        "-x",                          # Extract audio only
        "--audio-format", "wav",        # Output as WAV
        "--audio-quality", "0",         # Best quality
        "--no-playlist" if "watch" in str(url_or_channel) and max_videos == 1 else "--yes-playlist",
        "-o", str(output_dir / "%(title)s_%(id)s.%(ext)s"),
        "--no-overwrites",             # Skip already downloaded
        "--restrict-filenames",        # Safe filenames
    ]

    if max_videos:
        cmd.extend(["--max-downloads", str(max_videos)])

    # Handle channel URL format
    if url_or_channel.startswith("@"):
        cmd.append(f"https://youtube.com/{url_or_channel}/videos")
    else:
        cmd.append(url_or_channel)

    print(f"\n  Downloading audio from: {url_or_channel}")
    print(f"  Output: {output_dir}")
    if max_videos:
        print(f"  Max videos: {max_videos}")

    result = subprocess.run(cmd, capture_output=False)
    wav_files = list(output_dir.glob("*.wav"))
    print(f"  Downloaded: {len(wav_files)} files")
    return wav_files


def separate_vocals(input_dir, output_dir):
    """Use Demucs to separate vocals from background music/noise."""
    output_dir.mkdir(parents=True, exist_ok=True)
    wav_files = list(input_dir.glob("*.wav"))

    if not wav_files:
        print("  No WAV files found to process")
        return []

    print(f"\n  Separating vocals from {len(wav_files)} files using Demucs...")
    print(f"  This may take a while — Demucs uses AI to isolate speech")

    for i, wav_file in enumerate(wav_files):
        print(f"  [{i+1}/{len(wav_files)}] {wav_file.name}")

        cmd = [
            "python3", "-m", "demucs",
            "--two-stems=vocals",   # Only separate vocals vs other
            "--out", str(output_dir),
            "--device", "mps",      # Use Apple Silicon GPU
            str(wav_file),
        ]

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=600
            )
            if result.returncode != 0:
                # Fallback to CPU if MPS fails
                cmd[cmd.index("mps")] = "cpu"
                subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        except subprocess.TimeoutExpired:
            print(f"    Timeout — skipping {wav_file.name}")
            continue

    # Demucs outputs to: output_dir/htdemucs/filename/vocals.wav
    vocal_files = list(output_dir.rglob("vocals.wav"))
    print(f"  Extracted {len(vocal_files)} vocal tracks")
    return vocal_files


def split_on_silence(audio_path, output_dir, language):
    """Split audio into individual utterances using Silero VAD."""
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load Silero VAD
    model, utils = torch.hub.load(
        repo_or_dir="snakers4/silero-vad",
        model="silero_vad",
        trust_repo=True,
    )
    get_speech_timestamps, _, read_audio, _, _ = utils

    # Load audio at 16kHz (VAD requirement)
    wav = read_audio(str(audio_path), sampling_rate=16000)

    # Get speech timestamps
    speech_timestamps = get_speech_timestamps(
        wav, model,
        sampling_rate=16000,
        min_speech_duration_ms=500,     # Min 0.5s speech
        max_speech_duration_s=10,       # Max 10s per clip
        min_silence_duration_ms=300,    # Split on 300ms silence
        speech_pad_ms=100,              # 100ms padding around speech
    )

    if not speech_timestamps:
        return 0

    # Load full audio at target sample rate for saving
    y, _ = librosa.load(str(audio_path), sr=TARGET_SR, mono=True)

    # Convert timestamps from 16kHz to target SR
    ratio = TARGET_SR / 16000
    stem = audio_path.stem

    clip_count = 0
    for j, ts in enumerate(speech_timestamps):
        start_sample = int(ts["start"] * ratio)
        end_sample = int(ts["end"] * ratio)
        clip = y[start_sample:end_sample]

        duration = len(clip) / TARGET_SR
        if duration < MIN_CLIP_DURATION or duration > MAX_CLIP_DURATION:
            continue

        # Normalize to -20 dBFS
        rms = np.sqrt(np.mean(clip ** 2))
        if rms > 0:
            target_rms = 10 ** (-20 / 20)
            clip = clip * (target_rms / rms)

        # Clip to prevent clipping
        clip = np.clip(clip, -1.0, 1.0)

        out_path = output_dir / f"{language}_{stem}_{j:04d}.wav"
        sf.write(str(out_path), clip, TARGET_SR)
        clip_count += 1

    return clip_count


def run_pipeline(url_or_channel, language, max_videos=None):
    """Full pipeline: download → separate → split → validate."""
    work_dir = RAW_DIR / f"{language}_youtube"
    download_dir = work_dir / "01_downloaded"
    separated_dir = work_dir / "02_separated"
    clips_dir = RAW_DIR / language / "clips_youtube"

    print(f"\n{'='*60}")
    print(f"  YouTube Audio Pipeline — {language.upper()}")
    print(f"{'='*60}")
    print(f"  Source:  {url_or_channel}")
    print(f"  Output:  {clips_dir}")

    # Step 1: Download
    print(f"\n{'─'*60}")
    print(f"  STEP 1: Download audio")
    print(f"{'─'*60}")
    wav_files = download_audio(url_or_channel, download_dir, max_videos)

    if not wav_files:
        print("  No files downloaded — check the URL")
        return

    # Step 2: Separate vocals
    print(f"\n{'─'*60}")
    print(f"  STEP 2: Separate vocals (Demucs AI)")
    print(f"{'─'*60}")
    vocal_files = separate_vocals(download_dir, separated_dir)

    if not vocal_files:
        print("  Vocal separation failed — using raw audio instead")
        vocal_files = wav_files

    # Step 3: Split into clips
    print(f"\n{'─'*60}")
    print(f"  STEP 3: Split into training clips (Silero VAD)")
    print(f"{'─'*60}")
    total_clips = 0
    for i, vocal_file in enumerate(vocal_files):
        print(f"  [{i+1}/{len(vocal_files)}] Splitting {vocal_file.parent.name}...")
        count = split_on_silence(vocal_file, clips_dir, language)
        total_clips += count
        print(f"    → {count} clips")

    # Step 4: Summary
    total_duration = 0
    clip_files = list(clips_dir.glob("*.wav"))
    for cf in clip_files:
        y, sr = librosa.load(str(cf), sr=TARGET_SR)
        total_duration += len(y) / sr

    hours = total_duration / 3600
    print(f"\n{'='*60}")
    print(f"  Pipeline Complete — {language.upper()}")
    print(f"{'='*60}")
    print(f"  Total clips:    {len(clip_files)}")
    print(f"  Total audio:    {hours:.1f} hours")
    print(f"  Output:         {clips_dir}")
    print(f"\n  Next: python scripts/01_prepare_data.py --lang {language}")
    print(f"  Then: python training/finetune.py --language {language} --resume")

    # Cleanup large intermediate files
    print(f"\n  Clean up intermediate files? (saves disk space)")
    print(f"  Run: rm -rf {work_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="YouTube video, playlist, or channel URL")
    parser.add_argument("--channel", help="YouTube channel handle (e.g., @Hamayon-afghan)")
    parser.add_argument("--language", required=True, help="Target language name")
    parser.add_argument("--max-videos", type=int, default=None, help="Max videos to download")
    args = parser.parse_args()

    source = args.channel or args.url
    if not source:
        parser.error("Provide --url or --channel")

    run_pipeline(source, args.language, args.max_videos)
