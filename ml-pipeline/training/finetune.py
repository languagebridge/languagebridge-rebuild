"""
Fine-tune Kokoro-82M for a target language using Apple Silicon MPS.

Kokoro is a StyleTTS2-based model. Fine-tuning involves:
  1. Loading precomputed mel spectrograms (run scripts/precompute_mels.py first)
  2. Training the decoder to reconstruct target audio from mel features
  3. Creating language-specific voice packs (style embeddings)

The decoder (53M params) learns the phonetic patterns of the target language.
The predictor (16M params) learns prosody and duration.

Usage:
  # Step 1: Precompute mels (one-time)
  python scripts/precompute_mels.py --language dari

  # Step 2: Train
  python training/finetune.py --language dari --epochs 20
  python training/finetune.py --language dari --epochs 20 --resume
  python training/finetune.py --language dari --max-clips 2000  # fast iteration
"""

import argparse
import hashlib
import json
import os
import time
import warnings
from pathlib import Path

# Suppress noisy PyTorch warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchaudio
from kokoro import KModel
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader, Dataset

BASE = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE / "models"
SPLITS_DIR = BASE / "data" / "splits"
CACHE_DIR = BASE / "data" / "cache"

# Audio params matching Kokoro's expectations
TARGET_SR = 24000  # Kokoro outputs at 24kHz
N_MELS = 80
HOP_LENGTH = 256
WIN_LENGTH = 1024
N_FFT = 1024


# ─────────────────────────────────────────────────────────────────────
# Differentiable mel spectrogram (stays on MPS, gradients flow)
# ─────────────────────────────────────────────────────────────────────

class TorchMelSpec(nn.Module):
    """GPU-resident mel spectrogram for loss computation.

    Unlike librosa (CPU, no gradients), this keeps everything on device
    and allows backpropagation through the mel reconstruction loss.
    """

    def __init__(self, device):
        super().__init__()
        self.mel_spec = torchaudio.transforms.MelSpectrogram(
            sample_rate=TARGET_SR,
            n_fft=N_FFT,
            hop_length=HOP_LENGTH,
            win_length=WIN_LENGTH,
            n_mels=N_MELS,
            power=2.0,
        ).to(device)
        self.amp_to_db = torchaudio.transforms.AmplitudeToDB(
            stype="power", top_db=80.0
        ).to(device)

    def forward(self, waveform):
        """waveform: (B, T) on device → (B, 80, frames) on device.

        Uses identical normalization as precompute_mels.py:
          AmplitudeToDB(power, top_db=80) → (x + 40) / 40

        Note: Decoder output can be [-20000, +20000] early in training.
        We normalize by peak amplitude to preserve gradients (hard clamp
        would zero all gradients since every value is outside [-1, 1]).
        """
        # Normalize to [-1, 1] by peak — preserves gradients unlike clamp
        peak = waveform.abs().max(dim=-1, keepdim=True).values.clamp(min=1e-4)
        waveform = waveform / peak
        mel = self.mel_spec(waveform)  # (B, 80, frames)
        mel_db = self.amp_to_db(mel)   # (B, 80, frames) in dB
        mel_db = (mel_db + 40.0) / 40.0
        return mel_db


# ─────────────────────────────────────────────────────────────────────
# Cached dataset (loads precomputed .pt files, no librosa)
# ─────────────────────────────────────────────────────────────────────

class CachedMelDataset(Dataset):
    """Loads precomputed mel/f0/style tensors from disk.

    Run scripts/precompute_mels.py first to generate the cache.
    """

    def __init__(self, split_file: Path, cache_dir: Path, max_clips: int = 0):
        with open(split_file) as f:
            all_files = [line.strip() for line in f if line.strip()]

        # Filter to cached files first, then subsample
        self.cache_paths = []
        for wav_path in all_files:
            stem = Path(wav_path).stem
            pt_path = cache_dir / f"{stem}.pt"
            if pt_path.exists():
                self.cache_paths.append(pt_path)

        print(f"    Found {len(self.cache_paths)}/{len(all_files)} clips in cache", flush=True)

        # Subsample from available cached clips
        if max_clips > 0 and len(self.cache_paths) > max_clips:
            rng = np.random.RandomState(42)
            indices = rng.choice(len(self.cache_paths), max_clips, replace=False)
            self.cache_paths = [self.cache_paths[i] for i in indices]
            print(f"    Subsampled to {max_clips} clips", flush=True)

    def __len__(self):
        return len(self.cache_paths)

    MAX_FRAMES = 200  # Cap at ~2s of audio — keeps decoder output tractable

    def __getitem__(self, idx):
        data = torch.load(self.cache_paths[idx], weights_only=True)
        mel = data["mel"]
        f0 = data["f0"]
        # Truncate long clips to keep decoder output + backward fast
        if mel.shape[1] > self.MAX_FRAMES:
            mel = mel[:, :self.MAX_FRAMES]
            f0 = f0[:self.MAX_FRAMES]
        return mel, f0, data["style"]


def collate_fn(batch):
    """Pad mel, f0, style to same length in batch."""
    mels, f0s, styles = zip(*batch)

    max_mel_len = max(m.shape[1] for m in mels)

    mel_padded = torch.zeros(len(mels), N_MELS, max_mel_len)
    f0_padded = torch.zeros(len(f0s), max_mel_len)
    style_stacked = torch.stack(styles)  # (B, 256)
    mel_lengths = torch.LongTensor([m.shape[1] for m in mels])

    for i, (mel, f0) in enumerate(zip(mels, f0s)):
        mel_padded[i, :, :mel.shape[1]] = mel
        f0_len = min(f0.shape[0], max_mel_len)
        f0_padded[i, :f0_len] = f0[:f0_len]

    return mel_padded, f0_padded, style_stacked, mel_lengths


# ─────────────────────────────────────────────────────────────────────
# Utilities
# ─────────────────────────────────────────────────────────────────────

def get_device():
    if torch.backends.mps.is_available():
        return torch.device("mps")
    elif torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


# ─────────────────────────────────────────────────────────────────────
# Training loop
# ─────────────────────────────────────────────────────────────────────

def train(language, epochs, batch_size, lr, resume, max_clips):
    device = get_device()

    # MPS optimizations
    if device.type == "mps":
        os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

    print(f"\n{'='*60}")
    print(f"  Kokoro-82M Fine-Tuning — {language.upper()}")
    print(f"{'='*60}")
    print(f"  Device:     {device}")
    print(f"  Epochs:     {epochs}")
    print(f"  Batch:      {batch_size}")
    print(f"  LR:         {lr}")
    print(f"  Max clips:  {max_clips if max_clips > 0 else 'all'}")

    # Verify cache exists
    cache_dir = CACHE_DIR / language
    if not cache_dir.exists() or not any(cache_dir.glob("*.pt")):
        print(f"\n  ERROR: No cached mels found at {cache_dir}")
        print(f"  Run first: python scripts/precompute_mels.py --language {language}")
        return None, None

    cached_count = len(list(cache_dir.glob("*.pt")))
    print(f"  Cached mels: {cached_count}")

    # Load Kokoro base model
    print(f"\n  Loading Kokoro-82M base model...")
    model = KModel(repo_id="hexgrad/Kokoro-82M").to(device)

    total_params = sum(p.numel() for p in model.parameters())
    print(f"  Total params: {total_params:,}")

    # Freeze text encoder and BERT — only train decoder and predictor
    for param in model.bert.parameters():
        param.requires_grad = False
    for param in model.bert_encoder.parameters():
        param.requires_grad = False
    for param in model.text_encoder.parameters():
        param.requires_grad = False

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    frozen = total_params - trainable
    print(f"  Trainable:  {trainable:,} (decoder + predictor)")
    print(f"  Frozen:     {frozen:,} (bert + text_encoder)")

    out_dir = MODELS_DIR / language
    out_dir.mkdir(parents=True, exist_ok=True)

    start_epoch = 0
    best_val_loss = float("inf")

    # Resume from checkpoint if requested
    if resume:
        checkpoints = sorted(out_dir.glob("epoch_*.pt"))
        if checkpoints:
            latest = checkpoints[-1]
            print(f"\n  Resuming from {latest.name}")
            ckpt = torch.load(latest, map_location=device)
            model.load_state_dict(ckpt["model_state_dict"], strict=False)
            start_epoch = ckpt["epoch"] + 1
            best_val_loss = ckpt.get("best_val_loss", float("inf"))

    # Projection layer: mel (80) -> decoder input dim (512)
    mel_projector = nn.Conv1d(N_MELS, 512, kernel_size=1).to(device)

    # Differentiable mel spectrogram for loss computation
    mel_spec = TorchMelSpec(device)

    optimizer = AdamW(
        list(filter(lambda p: p.requires_grad, model.parameters()))
        + list(mel_projector.parameters()),
        lr=lr,
        weight_decay=1e-4,
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.L1Loss()

    # Data loaders (cached — fast)
    split_dir = SPLITS_DIR / language
    train_ds = CachedMelDataset(split_dir / "train.txt", cache_dir, max_clips=max_clips)
    val_ds = CachedMelDataset(split_dir / "val.txt", cache_dir, max_clips=max_clips)

    # num_workers=0 on MPS to avoid memory pressure from forked processes
    # Data is cached .pt files on SSD — single-worker load is fast enough
    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        collate_fn=collate_fn,
        num_workers=0,
        pin_memory=False,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size,
        shuffle=False,
        collate_fn=collate_fn,
        num_workers=0,
        pin_memory=False,
    )

    print(f"\n  Train clips: {len(train_ds)}", flush=True)
    print(f"  Val clips:   {len(val_ds)}", flush=True)
    print(f"  Batches/epoch: {len(train_loader)}", flush=True)
    print(f"\n{'='*60}", flush=True)
    print(
        f"  {'Epoch':>5}  {'Train Loss':>12}  {'Val Loss':>12}  {'Time':>8}  {'Status'}",
        flush=True,
    )
    print(f"{'='*60}", flush=True)

    log = []
    patience_counter = 0
    patience_limit = 5

    for epoch in range(start_epoch, epochs):
        t0 = time.time()

        # ── Train ────────────────────────────────────────────────
        model.train()
        model.bert.eval()
        model.bert_encoder.eval()
        model.text_encoder.eval()

        train_loss = 0.0
        n_batches = 0
        n_nan = 0
        n_err = 0

        for batch_idx, (mel_batch, f0_batch, style_batch, mel_lengths) in enumerate(
            train_loader
        ):
            mel_batch = mel_batch.to(device)  # (B, 80, T)
            f0_batch = f0_batch.to(device)  # (B, T)
            style_batch = style_batch.to(device)  # (B, 256)
            mel_lengths = mel_lengths.to(device)

            optimizer.zero_grad()

            # Batched forward pass through decoder
            max_mel_t = mel_batch.shape[2]
            asr_features = mel_projector(mel_batch)  # (B, 512, T)

            # F0 at 2x mel length (decoder expects stride-2)
            f0_2x = F.interpolate(
                f0_batch.unsqueeze(1), size=max_mel_t * 2, mode="linear"
            ).squeeze(1)  # (B, T*2)

            N = torch.randn(mel_batch.shape[0], max_mel_t * 2, device=device) * 0.003
            s_acoustic = style_batch[:, :128]  # (B, 128)

            try:
                output = model.decoder(
                    asr_features, f0_2x, N, s_acoustic
                )  # (B, 1, audio_T)

                if output.dim() == 2:
                    output = output.unsqueeze(1)

                output_audio = output.squeeze(1)  # (B, audio_T)

                # Truncate to expected audio length (decoder overproduces ~2.3x)
                expected_audio_len = max_mel_t * HOP_LENGTH
                if output_audio.shape[1] > expected_audio_len:
                    output_audio = output_audio[:, :expected_audio_len]

                # Differentiable mel on decoder output (stays on MPS)
                output_mel = mel_spec(output_audio)  # (B, 80, frames)

                # Target mel from cache — renormalize through same transform
                # so both sides use identical normalization
                target_mel = mel_batch  # (B, 80, T)

                # Match lengths
                min_len = min(target_mel.shape[2], output_mel.shape[2])

                # Masked loss: ignore padding
                mask = (
                    torch.arange(min_len, device=device).unsqueeze(0)
                    < mel_lengths.unsqueeze(1)
                ).unsqueeze(1).float()  # (B, 1, min_len)

                loss_unreduced = torch.abs(
                    output_mel[:, :, :min_len] - target_mel[:, :, :min_len]
                )  # (B, 80, min_len)
                mask_sum = mask[:, :, :min_len].sum()
                if mask_sum == 0:
                    continue
                loss = (loss_unreduced * mask[:, :, :min_len]).sum() / (
                    mask_sum * N_MELS
                )

                # Skip NaN/Inf losses
                if torch.isnan(loss) or torch.isinf(loss):
                    n_nan += 1
                    if batch_idx < 5:
                        print(f"    Batch {batch_idx}: NaN/Inf loss, skipping", flush=True)
                    continue

                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
                optimizer.step()

                train_loss += loss.item()
                n_batches += 1

            except Exception as e:
                n_err += 1
                if batch_idx < 3:
                    print(f"    Batch {batch_idx} error: {e}", flush=True)
                continue
            finally:
                # Free MPS memory after each batch
                if device.type == "mps":
                    torch.mps.empty_cache()

            # Progress every 10 batches
            if (batch_idx + 1) % 10 == 0:
                avg = train_loss / max(n_batches, 1)
                print(
                    f"    Batch {batch_idx+1}/{len(train_loader)}  loss={avg:.6f}  ok={n_batches} nan={n_nan} err={n_err}",
                    flush=True,
                )

        train_loss = train_loss / max(n_batches, 1)

        # ── Validate ─────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        n_val_batches = 0

        with torch.no_grad():
            for mel_batch, f0_batch, style_batch, mel_lengths in val_loader:
                mel_batch = mel_batch.to(device)
                f0_batch = f0_batch.to(device)
                style_batch = style_batch.to(device)
                mel_lengths = mel_lengths.to(device)

                max_mel_t = mel_batch.shape[2]
                asr_features = mel_projector(mel_batch)

                f0_2x = F.interpolate(
                    f0_batch.unsqueeze(1), size=max_mel_t * 2, mode="linear"
                ).squeeze(1)

                N = torch.randn(mel_batch.shape[0], max_mel_t * 2, device=device) * 0.003
                s_acoustic = style_batch[:, :128]

                try:
                    output = model.decoder(asr_features, f0_2x, N, s_acoustic)
                    if output.dim() == 2:
                        output = output.unsqueeze(1)
                    output_audio = output.squeeze(1)

                    output_mel = mel_spec(output_audio)
                    target_mel = mel_batch
                    min_len = min(target_mel.shape[2], output_mel.shape[2])

                    mask = (
                        torch.arange(min_len, device=device).unsqueeze(0)
                        < mel_lengths.unsqueeze(1)
                    ).unsqueeze(1).float()

                    loss_unreduced = torch.abs(
                        output_mel[:, :, :min_len] - target_mel[:, :, :min_len]
                    )
                    loss = (loss_unreduced * mask[:, :, :min_len]).sum() / (
                        mask[:, :, :min_len].sum() * N_MELS
                    )

                    val_loss += loss.item()
                    n_val_batches += 1

                except Exception:
                    continue

        val_loss = val_loss / max(n_val_batches, 1)
        scheduler.step()
        elapsed = time.time() - t0

        # Check for improvement
        status = ""
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_path = out_dir / f"{language}_tts_v1.pth"
            torch.save(model.state_dict(), best_path)
            status = "* BEST *"
            patience_counter = 0
        else:
            patience_counter += 1

        print(
            f"  {epoch+1:5d}  {train_loss:12.6f}  {val_loss:12.6f}  {elapsed:7.1f}s  {status}",
            flush=True,
        )

        log.append(
            {
                "epoch": epoch + 1,
                "train_loss": train_loss,
                "val_loss": val_loss,
                "elapsed": round(elapsed, 1),
            }
        )

        # Save checkpoint every epoch
        ckpt_path = out_dir / f"epoch_{epoch+1:03d}.pt"
        torch.save(
            {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "best_val_loss": best_val_loss,
                "language": language,
            },
            ckpt_path,
        )

        # Early stopping
        if patience_counter >= patience_limit:
            print(f"\n  Early stopping — no improvement for {patience_limit} epochs")
            break

    # Write training log
    with open(out_dir / "training_log.json", "w") as f:
        json.dump(
            {
                "language": language,
                "base_model": "kokoro-82m",
                "base_model_license": "Apache-2.0",
                "training_data_license": "CC0",
                "epochs_completed": epoch + 1,
                "best_val_loss": best_val_loss,
                "training_machine": "macbook-air-m4",
                "device": str(device),
                "batch_size": batch_size,
                "learning_rate": lr,
                "max_clips": max_clips,
                "log": log,
            },
            f,
            indent=2,
        )

    best_path = out_dir / f"{language}_tts_v1.pth"
    if best_path.exists():
        weights_hash = sha256_file(best_path)
        print(f"\n{'='*60}")
        print(f"  Training complete — {language.upper()}")
        print(f"{'='*60}")
        print(f"  Best model:  {best_path}")
        print(f"  Val loss:    {best_val_loss:.6f}")
        print(f"  SHA-256:     {weights_hash}")
        print(f"\n  Next: python registry/register_model.py \\")
        print(f"    --language {language} --version v1 --hash {weights_hash}")
        return str(best_path), weights_hash
    else:
        print(f"\n  No best model saved — training may have failed")
        return None, None


ALL_LANGUAGES = [
    "dari", "dari_afghan", "pashto", "arabic", "ukrainian", "urdu", "uzbek",
    "persian", "french", "portuguese", "swahili", "somali",
    "tagalog", "vietnamese", "burmese", "amharic", "nepali", "twi",
    "kinyarwanda", "tigrinya",
    "spanish_colombian", "spanish_mexican", "spanish_peruvian",
    "spanish_puerto_rico", "spanish_venezuelan",
]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--language", required=True, choices=ALL_LANGUAGES)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=0.00002)
    parser.add_argument("--max-clips", type=int, default=10000, help="0 = all cached clips")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    train(
        language=args.language,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        resume=args.resume,
        max_clips=args.max_clips,
    )
