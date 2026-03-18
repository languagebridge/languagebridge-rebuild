"""
Fine-tune Kokoro-82M for a target language using Apple Silicon MPS.

Kokoro is a StyleTTS2-based model. Fine-tuning involves:
  1. Computing mel spectrograms from target language audio
  2. Training the decoder to reconstruct target audio from mel features
  3. Creating language-specific voice packs (style embeddings)

The decoder (53M params) learns the phonetic patterns of the target language.
The predictor (16M params) learns prosody and duration.

Usage:
  python training/finetune.py --language dari --epochs 20
  python training/finetune.py --language dari --epochs 20 --resume
  python training/finetune.py --language dari --epochs 20 --batch-size 8
"""

import argparse
import hashlib
import json
import time
import warnings
from pathlib import Path

# Suppress noisy PyTorch warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import Dataset, DataLoader
import librosa
import numpy as np
from kokoro import KModel

BASE = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE / "models"
SPLITS_DIR = BASE / "data" / "splits"

# Audio params matching Kokoro's expectations
TARGET_SR = 24000  # Kokoro outputs at 24kHz
N_MELS = 80
HOP_LENGTH = 256
WIN_LENGTH = 1024
N_FFT = 1024
MAX_AUDIO_LEN = TARGET_SR * 10  # 10 seconds max


class LanguageAudioDataset(Dataset):
    """Load processed WAV files and convert to mel spectrograms.

    Subsamples to max_clips for tractable fine-tuning.
    Pre-computes F0 to avoid bottleneck during training.
    """

    def __init__(self, split_file: Path, max_frames: int = 900, max_clips: int = 10000):
        with open(split_file) as f:
            all_files = [Path(l.strip()) for l in f if l.strip()]

        # Subsample for tractable training
        if len(all_files) > max_clips:
            rng = np.random.RandomState(42)
            indices = rng.choice(len(all_files), max_clips, replace=False)
            self.files = [all_files[i] for i in indices]
            print(f"    Subsampled {len(all_files)} -> {max_clips} clips", flush=True)
        else:
            self.files = all_files

        self.max_frames = max_frames

    def __len__(self):
        return len(self.files)

    def __getitem__(self, idx):
        path = self.files[idx]
        try:
            y, _ = librosa.load(str(path), sr=TARGET_SR, mono=True)
        except Exception:
            # Return silence if file fails
            y = np.zeros(TARGET_SR, dtype=np.float32)

        # Truncate to max length
        if len(y) > MAX_AUDIO_LEN:
            y = y[:MAX_AUDIO_LEN]

        # Compute mel spectrogram
        mel = librosa.feature.melspectrogram(
            y=y, sr=TARGET_SR, n_fft=N_FFT,
            hop_length=HOP_LENGTH, win_length=WIN_LENGTH, n_mels=N_MELS
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        mel_db = (mel_db + 40) / 40

        if mel_db.shape[1] > self.max_frames:
            mel_db = mel_db[:, :self.max_frames]

        # Estimate F0 using fast zero-crossing rate (100x faster than pyin)
        try:
            zcr = librosa.feature.zero_crossing_rate(
                y, frame_length=WIN_LENGTH, hop_length=HOP_LENGTH
            )[0]
            # Convert ZCR to approximate F0
            f0 = (zcr * TARGET_SR / 2).astype(np.float32)
            # Clamp to speech range
            f0 = np.clip(f0, 50, 550)
            # Zero out low-energy frames (silence)
            rms = librosa.feature.rms(y=y, frame_length=WIN_LENGTH, hop_length=HOP_LENGTH)[0]
            f0[rms < 0.01] = 0.0
        except Exception:
            f0 = np.zeros(mel_db.shape[1], dtype=np.float32)

        return torch.FloatTensor(mel_db), torch.FloatTensor(y), torch.FloatTensor(f0)


def collate_fn(batch):
    """Pad mel spectrograms, audio, and F0 to same length in batch."""
    mels, audios, f0s = zip(*batch)

    max_mel_len = max(m.shape[1] for m in mels)
    max_audio_len = max(a.shape[0] for a in audios)

    mel_padded = torch.zeros(len(mels), N_MELS, max_mel_len)
    audio_padded = torch.zeros(len(audios), max_audio_len)
    f0_padded = torch.zeros(len(f0s), max_mel_len)
    mel_lengths = torch.LongTensor([m.shape[1] for m in mels])

    for i, (mel, audio, f0) in enumerate(zip(mels, audios, f0s)):
        mel_padded[i, :, :mel.shape[1]] = mel
        audio_padded[i, :audio.shape[0]] = audio
        f0_len = min(f0.shape[0], max_mel_len)
        f0_padded[i, :f0_len] = f0[:f0_len]

    return mel_padded, audio_padded, f0_padded, mel_lengths


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


def extract_style_embeddings(model, audio_batch, device):
    """Extract style reference vectors from audio using the decoder's style encoding.

    In Kokoro/StyleTTS2, the style vector (ref_s) is a 256-dim vector where:
    - First 128 dims = acoustic style
    - Last 128 dims = prosody style

    We compute these from mel spectrograms of the target language audio.
    """
    with torch.no_grad():
        mel = librosa.feature.melspectrogram(
            y=audio_batch.cpu().numpy()[0], sr=TARGET_SR,
            n_fft=N_FFT, hop_length=HOP_LENGTH,
            win_length=WIN_LENGTH, n_mels=N_MELS
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        mel_tensor = torch.FloatTensor(mel_db).unsqueeze(0).to(device)

        # Create a simple style vector by averaging mel features
        # This is a proxy for the full style encoder
        acoustic_style = mel_tensor.mean(dim=2).squeeze()[:128]
        if acoustic_style.shape[0] < 128:
            acoustic_style = torch.nn.functional.pad(
                acoustic_style, (0, 128 - acoustic_style.shape[0])
            )

        prosody_style = mel_tensor.std(dim=2).squeeze()[:128]
        if prosody_style.shape[0] < 128:
            prosody_style = torch.nn.functional.pad(
                prosody_style, (0, 128 - prosody_style.shape[0])
            )

        ref_s = torch.cat([acoustic_style, prosody_style]).unsqueeze(0)
    return ref_s


def train(language, epochs, batch_size, lr, resume):
    device = get_device()
    print(f"\n{'='*60}")
    print(f"  Kokoro-82M Fine-Tuning — {language.upper()}")
    print(f"{'='*60}")
    print(f"  Device:    {device}")
    print(f"  Epochs:    {epochs}")
    print(f"  Batch:     {batch_size}")
    print(f"  LR:        {lr}")

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

    optimizer = AdamW(
        list(filter(lambda p: p.requires_grad, model.parameters())) +
        list(mel_projector.parameters()),
        lr=lr, weight_decay=1e-4
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs)

    criterion_mel = nn.L1Loss()
    criterion_stft = nn.MSELoss()

    # Data loaders
    split_dir = SPLITS_DIR / language
    train_ds = LanguageAudioDataset(split_dir / "train.txt")
    val_ds = LanguageAudioDataset(split_dir / "val.txt")

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        collate_fn=collate_fn, num_workers=0, pin_memory=False
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        collate_fn=collate_fn, num_workers=0, pin_memory=False
    )

    print(f"\n  Train clips: {len(train_ds)}", flush=True)
    print(f"  Val clips:   {len(val_ds)}", flush=True)
    print(f"\n{'='*60}", flush=True)
    print(f"  {'Epoch':>5}  {'Train Loss':>12}  {'Val Loss':>12}  {'Time':>8}  {'Status'}", flush=True)
    print(f"{'='*60}", flush=True)

    log = []
    patience_counter = 0
    patience_limit = 5  # Stop if no improvement for 5 epochs

    for epoch in range(start_epoch, epochs):
        t0 = time.time()

        # --- Train ---
        model.train()
        model.bert.eval()
        model.bert_encoder.eval()
        model.text_encoder.eval()

        train_loss = 0.0
        n_batches = 0

        for batch_idx, (mel_batch, audio_batch, f0_batch, mel_lengths) in enumerate(train_loader):
            mel_batch = mel_batch.to(device)
            audio_batch = audio_batch.to(device)
            f0_batch = f0_batch.to(device)

            optimizer.zero_grad()

            batch_loss = 0.0
            for i in range(mel_batch.shape[0]):
                mel_i = mel_batch[i:i+1]
                audio_i = audio_batch[i:i+1]
                f0_i = f0_batch[i:i+1]
                mel_len = mel_lengths[i].item()

                ref_s = extract_style_embeddings(model, audio_i, device)
                mel_features = mel_i[:, :, :mel_len]
                asr_features = mel_projector(mel_features)

                try:
                    # F0 and N need 2x mel length (decoder F0_conv has stride=2)
                    f0_2x = torch.nn.functional.interpolate(
                        f0_i[:, :mel_len].unsqueeze(1), size=mel_len * 2, mode='linear'
                    ).squeeze(1)
                    N = torch.randn(1, mel_len * 2).to(device) * 0.003
                    s_acoustic = ref_s[:, :128]
                    output = model.decoder(asr_features, f0_2x, N, s_acoustic)

                    if output.dim() == 2:
                        output = output.unsqueeze(0)

                    out_np = output.squeeze().detach().cpu().numpy()
                    if len(out_np.shape) > 1:
                        out_np = out_np[0]

                    out_mel = librosa.feature.melspectrogram(
                        y=out_np, sr=TARGET_SR, n_fft=N_FFT,
                        hop_length=HOP_LENGTH, win_length=WIN_LENGTH, n_mels=N_MELS
                    )
                    out_mel_db = librosa.power_to_db(out_mel, ref=np.max)
                    out_mel_db = (out_mel_db + 40) / 40

                    target_mel = mel_i[0, :, :mel_len].cpu()
                    out_mel_tensor = torch.FloatTensor(out_mel_db)

                    min_len = min(target_mel.shape[1], out_mel_tensor.shape[1])
                    loss = criterion_mel(
                        out_mel_tensor[:, :min_len],
                        target_mel[:, :min_len]
                    )
                    batch_loss += loss

                except Exception:
                    continue

            if batch_loss > 0:
                batch_loss = batch_loss / mel_batch.shape[0]
                batch_loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                train_loss += batch_loss.item()
                n_batches += 1

            # Progress every 100 batches
            if (batch_idx + 1) % 100 == 0:
                avg = train_loss / max(n_batches, 1)
                print(f"    Batch {batch_idx+1}/{len(train_loader)}  loss={avg:.6f}", flush=True)

        train_loss = train_loss / max(n_batches, 1)

        # --- Validate ---
        model.eval()
        val_loss = 0.0
        n_val_batches = 0

        with torch.no_grad():
            for mel_batch, audio_batch, f0_batch, mel_lengths in val_loader:
                mel_batch = mel_batch.to(device)
                audio_batch = audio_batch.to(device)
                f0_batch = f0_batch.to(device)

                for i in range(mel_batch.shape[0]):
                    mel_i = mel_batch[i:i+1]
                    audio_i = audio_batch[i:i+1]
                    f0_i = f0_batch[i:i+1]
                    mel_len = mel_lengths[i].item()

                    ref_s = extract_style_embeddings(model, audio_i, device)
                    mel_features = mel_i[:, :, :mel_len]
                    asr_features = mel_projector(mel_features)

                    try:
                        f0_2x = torch.nn.functional.interpolate(
                            f0_i[:, :mel_len].unsqueeze(1), size=mel_len * 2, mode='linear'
                        ).squeeze(1)
                        N = torch.randn(1, mel_len * 2).to(device) * 0.003
                        s_acoustic = ref_s[:, :128]
                        output = model.decoder(asr_features, f0_2x, N, s_acoustic)

                        if output.dim() == 2:
                            output = output.unsqueeze(0)

                        out_np = output.squeeze().cpu().numpy()
                        if len(out_np.shape) > 1:
                            out_np = out_np[0]

                        out_mel = librosa.feature.melspectrogram(
                            y=out_np, sr=TARGET_SR, n_fft=N_FFT,
                            hop_length=HOP_LENGTH, win_length=WIN_LENGTH, n_mels=N_MELS
                        )
                        out_mel_db = librosa.power_to_db(out_mel, ref=np.max)
                        out_mel_db = (out_mel_db + 40) / 40

                        target_mel = mel_i[0, :, :mel_len].cpu()
                        out_mel_tensor = torch.FloatTensor(out_mel_db)

                        min_len = min(target_mel.shape[1], out_mel_tensor.shape[1])
                        loss = criterion_mel(
                            out_mel_tensor[:, :min_len],
                            target_mel[:, :min_len]
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

        print(f"  {epoch+1:5d}  {train_loss:12.6f}  {val_loss:12.6f}  {elapsed:7.1f}s  {status}")

        log.append({
            "epoch": epoch + 1,
            "train_loss": train_loss,
            "val_loss": val_loss,
            "elapsed": round(elapsed, 1),
        })

        # Save checkpoint every epoch
        ckpt_path = out_dir / f"epoch_{epoch+1:03d}.pt"
        torch.save({
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "best_val_loss": best_val_loss,
            "language": language,
        }, ckpt_path)

        # Early stopping
        if patience_counter >= patience_limit:
            print(f"\n  Early stopping — no improvement for {patience_limit} epochs")
            break

    # Write training log
    with open(out_dir / "training_log.json", "w") as f:
        json.dump({
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
            "log": log,
        }, f, indent=2)

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
    "dari", "pashto", "arabic", "ukrainian", "urdu", "uzbek",
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
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=0.0001)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    train(
        language=args.language,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        resume=args.resume,
    )
