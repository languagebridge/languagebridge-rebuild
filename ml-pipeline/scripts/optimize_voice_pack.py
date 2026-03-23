#!/usr/bin/env python3
"""
optimize_voice_pack.py

Create a Kokoro-compatible voice pack by optimizing the style embedding
directly against Kokoro's decoder. Instead of extracting from a mismatched
encoder, we find the ref_s vector that makes Kokoro sound most like our
target language audio.

Approach:
  1. Start from an existing Kokoro voice (af_heart as initialization)
  2. Take N audio clips from our training data + their phoneme transcriptions
  3. Make ref_s a learnable parameter
  4. Forward through Kokoro's decoder
  5. Compare output mel spectrogram to target mel spectrogram
  6. Backprop to update ref_s only (all model weights frozen)
  7. Save the optimized ref_s as a voice pack

Usage:
  python scripts/optimize_voice_pack.py --language dari --steps 300
  python scripts/optimize_voice_pack.py --language arabic --steps 300
"""

import argparse
import random
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf_lib
import torch
import torch.nn.functional as F
from kokoro import KModel, KPipeline
from misaki import espeak

BASE = Path(__file__).resolve().parents[1]
VOICES_DIR = BASE / "voices"
VOICES_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 24000


def compute_mel_from_audio(audio, sr=SAMPLE_RATE, n_mels=80, n_fft=1024, hop_length=256):
    """Compute log-mel spectrogram from audio waveform."""
    mel_basis = librosa.filters.mel(sr=sr, n_fft=n_fft, n_mels=n_mels)
    mel_basis = torch.from_numpy(mel_basis).float()

    if isinstance(audio, np.ndarray):
        audio = torch.from_numpy(audio).float()

    # STFT
    window = torch.hann_window(n_fft)
    stft = torch.stft(audio, n_fft=n_fft, hop_length=hop_length,
                       win_length=n_fft, window=window, return_complex=True)
    mag = stft.abs()

    # Mel
    mel = torch.matmul(mel_basis, mag)
    log_mel = torch.log(mel.clamp(min=1e-5))
    return log_mel


def load_training_pairs(language, data_dir, max_clips=50, seed=42):
    """Load audio clips and generate phoneme transcriptions."""
    sys.path.insert(0, str(BASE / "scripts"))
    from phoneme_map import get_espeak_code, clean_phonemes

    espeak_code = get_espeak_code(language)
    if not espeak_code:
        print(f"ERROR: No espeak code for {language}")
        sys.exit(1)

    g2p = espeak.EspeakG2P(language=espeak_code)

    lang_dir = Path(data_dir) / language
    clips = list(lang_dir.glob("**/*.wav"))
    if not clips:
        print(f"ERROR: No wav files in {lang_dir}")
        sys.exit(1)

    random.seed(seed)
    random.shuffle(clips)

    pairs = []
    for clip_path in clips:
        if len(pairs) >= max_clips:
            break

        try:
            audio, sr = librosa.load(str(clip_path), sr=SAMPLE_RATE)
            audio, _ = librosa.effects.trim(audio, top_db=30)

            # Skip very short or very long clips
            if len(audio) < SAMPLE_RATE * 1.0 or len(audio) > SAMPLE_RATE * 8.0:
                continue

            # Get transcript from metadata if available, otherwise skip
            # For our training data, the transcript is in the filename or a .txt sidecar
            txt_path = clip_path.with_suffix(".txt")
            if txt_path.exists():
                transcript = txt_path.read_text().strip()
            else:
                # Try to find transcript in metadata TSV
                continue

            if not transcript:
                continue

            phonemes, _ = g2p(transcript)
            phonemes = clean_phonemes(phonemes, language)

            if not phonemes or len(phonemes) < 2 or len(phonemes) > 400:
                continue

            pairs.append({
                "audio": audio,
                "phonemes": phonemes,
                "path": str(clip_path),
            })

        except Exception as e:
            continue

    return pairs


def estimate_snr(audio):
    """Estimate signal-to-noise ratio in dB. Higher = cleaner."""
    # Split into frames, use top 10% energy as signal, bottom 10% as noise
    frame_len = 1024
    n_frames = len(audio) // frame_len
    if n_frames < 4:
        return 0.0
    energies = []
    for i in range(n_frames):
        frame = audio[i * frame_len:(i + 1) * frame_len]
        energies.append(np.sum(frame ** 2))
    energies = sorted(energies)
    noise_energy = np.mean(energies[:max(1, n_frames // 10)]) + 1e-10
    signal_energy = np.mean(energies[-(n_frames // 10):]) + 1e-10
    return 10 * np.log10(signal_energy / noise_energy)


def load_training_pairs_simple(language, data_dir, max_clips=30, seed=42):
    """
    Load clean audio clips from training data for voice style optimization.
    Filters by duration, trims silence, and ranks by SNR to pick the
    cleanest recordings for the target voice signature.
    """
    sys.path.insert(0, str(BASE / "scripts"))
    from phoneme_map import get_espeak_code, clean_phonemes

    lang_dir = Path(data_dir) / language
    clips = list(lang_dir.glob("**/*.wav"))
    if not clips:
        print(f"ERROR: No wav files in {lang_dir}")
        sys.exit(1)

    random.seed(seed)
    random.shuffle(clips)

    # Load candidates with SNR scoring — pick the cleanest
    candidates = []
    scan_limit = min(len(clips), max_clips * 10)  # scan 10x to find clean ones
    for clip_path in clips[:scan_limit]:
        try:
            audio, sr = librosa.load(str(clip_path), sr=SAMPLE_RATE)
            audio, _ = librosa.effects.trim(audio, top_db=30)
            if not (SAMPLE_RATE * 1.5 < len(audio) < SAMPLE_RATE * 6.0):
                continue
            snr = estimate_snr(audio)
            candidates.append((snr, audio))
        except:
            continue

    # Sort by SNR descending — take the cleanest clips
    candidates.sort(key=lambda x: -x[0])
    audios = [audio for snr, audio in candidates[:max_clips]]
    if candidates:
        snr_kept = [snr for snr, _ in candidates[:max_clips]]
        print(f"  SNR range of kept clips: {min(snr_kept):.1f} - {max(snr_kept):.1f} dB")

    return audios


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--language", "-l", required=True)
    parser.add_argument("--max-clips", "-n", type=int, default=30)
    parser.add_argument("--steps", type=int, default=300)
    parser.add_argument("--lr", type=float, default=0.01)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--ref-audio-dir", default=None,
                        help="Dir with clean reference audio (e.g., Piper-generated Persian) to blend into target signature")
    parser.add_argument("--ref-weight", type=float, default=0.3,
                        help="Weight of reference audio in target signature blend (0-1)")
    args = parser.parse_args()

    language = args.language
    data_dir = BASE / "data" / "processed"

    print(f"Loading target audio for {language}...")
    target_audios = load_training_pairs_simple(
        language, data_dir, max_clips=args.max_clips, seed=args.seed
    )
    print(f"Loaded {len(target_audios)} target clips")

    if len(target_audios) < 5:
        print("ERROR: Need at least 5 clips")
        sys.exit(1)

    # Compute target mel statistics (mean spectral envelope = voice identity)
    print("Computing target voice signature...")
    target_mels = []
    for audio in target_audios:
        mel = compute_mel_from_audio(audio)
        # Average over time to get spectral envelope
        target_mels.append(mel.mean(dim=-1))  # [n_mels]

    # Average spectral envelope across all clips = voice identity
    target_signature = torch.stack(target_mels).mean(dim=0)  # [n_mels]

    # Blend with clean reference audio (e.g., Persian Piper) if provided
    if args.ref_audio_dir:
        ref_dir = Path(args.ref_audio_dir)
        ref_wavs = list(ref_dir.glob("*.wav"))
        if ref_wavs:
            print(f"Blending with {len(ref_wavs)} reference clips (weight={args.ref_weight})...")
            ref_mels = []
            for rw in ref_wavs:
                try:
                    audio, _ = librosa.load(str(rw), sr=SAMPLE_RATE)
                    mel = compute_mel_from_audio(audio)
                    ref_mels.append(mel.mean(dim=-1))
                except:
                    continue
            if ref_mels:
                ref_signature = torch.stack(ref_mels).mean(dim=0)
                # Blend: mostly real Dari data + some clean Persian prosody
                target_signature = (1 - args.ref_weight) * target_signature + args.ref_weight * ref_signature
                print(f"  Blended target signature (Dari {1-args.ref_weight:.0%} + ref {args.ref_weight:.0%})")

    print(f"Target signature shape: {target_signature.shape}")

    # Load Kokoro and starting voice pack
    print("Loading Kokoro model...")
    model = KModel(repo_id="hexgrad/Kokoro-82M")
    model.eval()

    # Freeze all model parameters
    for param in model.parameters():
        param.requires_grad = False

    # Initialize from Persian Piper-derived style if reference audio provided,
    # otherwise fall back to af_heart
    # First, generate a Kokoro-space initialization by running a few optimization
    # steps targeting the reference audio signature, then continue with the blend
    pipeline = KPipeline(lang_code="a", model=False)
    init_voice = pipeline.load_voice("af_heart")  # [510, 1, 256]
    print(f"Initial voice shape: {init_voice.shape}")

    # We optimize a single 256-dim vector (tiled to all positions)
    style_vec = init_voice[100].clone().squeeze()  # [256] — pick mid-length position
    style_vec = torch.nn.Parameter(style_vec)

    optimizer = torch.optim.Adam([style_vec], lr=args.lr)

    # Test phonemes for optimization
    sys.path.insert(0, str(BASE / "scripts"))
    from phoneme_map import get_espeak_code, clean_phonemes

    espeak_code = get_espeak_code(language)

    test_phonemes = []
    if espeak_code:
        # Language has espeak G2P — use native text
        g2p = espeak.EspeakG2P(language=espeak_code)
        test_texts = [
            "سلام", "معلم", "کتاب", "مدرسه", "آب",
            "خانه", "بزرگ", "کوچک", "زمین", "آسمان",
        ]
        for text in test_texts:
            ph, _ = g2p(text)
            ph = clean_phonemes(ph, language)
            if ph and len(ph) >= 2:
                test_phonemes.append(ph)

    if not test_phonemes:
        # No espeak support — use generic phoneme strings that Kokoro can decode.
        # These cover a wide range of sounds to exercise the decoder's style path.
        # The content doesn't matter — only the style (timbre + prosody) is optimized.
        print(f"  No espeak for {language} — using generic phoneme set")
        test_phonemes = [
            "sɑlˈɑm",                    # open vowels
            "mˈʊʔˌalɪm",                 # stops + glottal
            "kɪtˈɑːb",                    # aspirated stop
            "wˈɑːtəɹ sˈaɪkəl",           # liquid + diphthong
            "hˈaʊ θɪŋz wˈɜːk",           # fricative + nasal
            "ðə tˈiːʧɚ hˈɛlps",          # dental + affricate
            "lˈaɪt fɹˌʌm ðə sˈʌn",       # lateral + rhotic
            "bˈɪɡ ˈænd smˈɔːl",           # voiced stops
            "ˈɛvɹiːθɪŋ əɹˈaʊnd ʌs",      # long sequence
            "wˈʌn tˈuː θɹˈiː fˈɔːɹ",    # numbers
        ]

    print(f"Optimizing with {len(test_phonemes)} test phrases, {args.steps} steps...")
    print()

    best_loss = float("inf")
    best_vec = style_vec.data.clone()

    for step in range(args.steps):
        total_loss = 0

        for phonemes in test_phonemes:
            ref_s = style_vec.unsqueeze(0)  # [1, 256]

            # Forward through Kokoro (need grad-enabled version)
            input_ids = list(filter(lambda i: i is not None, map(lambda p: model.vocab.get(p), phonemes)))
            if len(input_ids) < 1:
                continue
            input_ids_t = torch.LongTensor([[0, *input_ids, 0]])

            input_lengths = torch.LongTensor([input_ids_t.shape[-1]])
            text_mask = torch.arange(input_lengths.max()).unsqueeze(0).expand(1, -1).type_as(input_lengths)
            text_mask = torch.gt(text_mask + 1, input_lengths.unsqueeze(1))

            bert_dur = model.bert(input_ids_t, attention_mask=(~text_mask).int())
            d_en = model.bert_encoder(bert_dur).transpose(-1, -2)

            s = ref_s[:, 128:]
            d = model.predictor.text_encoder(d_en, s, input_lengths, text_mask)
            x, _ = model.predictor.lstm(d)
            duration = model.predictor.duration_proj(x)
            duration = torch.sigmoid(duration).sum(axis=-1)
            pred_dur = torch.round(duration).clamp(min=1).long().squeeze()

            indices = torch.repeat_interleave(torch.arange(input_ids_t.shape[1]), pred_dur)
            pred_aln_trg = torch.zeros((input_ids_t.shape[1], indices.shape[0]))
            pred_aln_trg[indices, torch.arange(indices.shape[0])] = 1
            pred_aln_trg = pred_aln_trg.unsqueeze(0)

            en = d.transpose(-1, -2) @ pred_aln_trg
            F0_pred, N_pred = model.predictor.F0Ntrain(en, s)

            t_en = model.text_encoder(input_ids_t, input_lengths, text_mask)
            asr = t_en @ pred_aln_trg

            audio_out = model.decoder(asr, F0_pred, N_pred, ref_s[:, :128]).squeeze()

            # Compute mel of generated audio
            gen_mel = compute_mel_from_audio(audio_out)
            gen_signature = gen_mel.mean(dim=-1)  # [n_mels]

            # Loss: make generated voice signature match target
            loss = F.mse_loss(gen_signature, target_signature)
            total_loss += loss

        avg_loss = total_loss / len(test_phonemes)

        optimizer.zero_grad()
        avg_loss.backward()
        optimizer.step()

        if avg_loss.item() < best_loss:
            best_loss = avg_loss.item()
            best_vec = style_vec.data.clone()

        if (step + 1) % 25 == 0:
            print(f"  Step {step+1}/{args.steps}  loss={avg_loss.item():.6f}  best={best_loss:.6f}")

    # Build voice pack from best vector
    print(f"\nBest loss: {best_loss:.6f}")
    pack = best_vec.unsqueeze(0).unsqueeze(0).expand(510, 1, 256).clone()

    out_path = VOICES_DIR / f"{language}.pt"
    torch.save(pack, out_path)
    print(f"Saved: {out_path}")

    # Generate a test sample
    print("\nGenerating test sample...")
    test_ref = pack[5]  # [1, 256]
    with torch.no_grad():
        out = model("salˈɑm", test_ref, speed=1.0, return_output=True)
    sf_lib.write(f"/tmp/tts_eval/{language}_optimized_hello.wav", out.audio.numpy(), 24000)
    print(f"Test: afplay /tmp/tts_eval/{language}_optimized_hello.wav")


if __name__ == "__main__":
    main()
