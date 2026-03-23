"""
LanguageBridge TTS Inference Service

FastAPI service that serves trained TTS models to students.
Routes each language to the best backend (Piper or Kokoro).

Endpoints:
  POST /synthesize     — Generate audio from text + language
  GET  /voices         — List supported languages and their status
  GET  /health         — Health check

Designed to sit behind the tts-router Azure Function:
  tts-router → check cache → call this service → cache result → return URL
"""

import hashlib
import io
import os
import sys
import time
import wave
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

# Add scripts to path for voice_router and phoneme_map
BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "scripts"))

from voice_router import VOICE_MAP, get_voice_config, VoiceConfig
from phoneme_map import get_espeak_code, clean_phonemes, can_use_kokoro

app = FastAPI(
    title="LanguageBridge TTS",
    description="Proprietary TTS inference for 22+ languages",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# Globals — loaded once at startup
# ---------------------------------------------------------------------------

VOICES_DIR = BASE / "voices"
MODELS_DIR = BASE / "models"
PIPER_DIR = VOICES_DIR / "piper"

# Lazy-loaded model cache (avoid loading all models at startup)
_piper_cache = {}
_kokoro_model = None
_kokoro_voice_cache = {}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    language: str
    format: str = Field(default="wav", pattern="^(wav|mp3)$")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class SynthesizeResponse(BaseModel):
    language: str
    backend: str
    quality: str
    text_hash: str
    duration_ms: int
    format: str


class VoiceInfo(BaseModel):
    language: str
    backend: str
    quality: str
    model: str


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def get_piper_voice(model_name: str):
    """Load and cache a Piper voice model."""
    if model_name not in _piper_cache:
        from piper import PiperVoice
        onnx_path = PIPER_DIR / f"{model_name}.onnx"
        if not onnx_path.exists():
            raise HTTPException(404, f"Piper model not found: {model_name}")
        _piper_cache[model_name] = PiperVoice.load(str(onnx_path))
    return _piper_cache[model_name]


def get_kokoro_model():
    """Load and cache the Kokoro model (shared across languages)."""
    global _kokoro_model
    if _kokoro_model is None:
        from kokoro import KModel
        _kokoro_model = KModel(repo_id="hexgrad/Kokoro-82M")
        _kokoro_model.eval()
    return _kokoro_model


def get_kokoro_voice_pack(language: str):
    """Load and cache a Kokoro voice pack for a language."""
    if language not in _kokoro_voice_cache:
        voice_path = VOICES_DIR / f"{language}.pt"
        if voice_path.exists():
            _kokoro_voice_cache[language] = torch.load(voice_path, map_location="cpu")
        else:
            # Fall back to default voice
            from kokoro import KPipeline
            pipeline = KPipeline(lang_code="a", model=False)
            _kokoro_voice_cache[language] = pipeline.load_voice("af_heart")
    return _kokoro_voice_cache[language]


def get_kokoro_finetuned(language: str):
    """Load fine-tuned weights if available, otherwise return base model."""
    model = get_kokoro_model()
    ft_path = MODELS_DIR / language / f"{language}_tts_v1.pth"
    if ft_path.exists():
        # Load fine-tuned weights into a copy
        from kokoro import KModel
        ft_model = KModel(repo_id="hexgrad/Kokoro-82M")
        state = torch.load(ft_path, map_location="cpu")
        ft_model.load_state_dict(state, strict=False)
        ft_model.eval()
        return ft_model
    return model


# ---------------------------------------------------------------------------
# Synthesis backends
# ---------------------------------------------------------------------------

def synthesize_piper(text: str, model_name: str) -> tuple[bytes, int]:
    """Generate audio with Piper TTS. Returns (wav_bytes, sample_rate)."""
    voice = get_piper_voice(model_name)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(voice.config.sample_rate)
        voice.synthesize_wav(text, wf)
    return buf.getvalue(), voice.config.sample_rate


def synthesize_kokoro(text: str, language: str, voice_name: str,
                      speed: float = 1.0) -> tuple[bytes, int]:
    """Generate audio with Kokoro fine-tuned model. Returns (wav_bytes, sample_rate)."""
    from misaki import espeak

    espeak_code = get_espeak_code(language)
    if not espeak_code:
        raise HTTPException(400, f"No G2P backend for {language}")

    g2p = espeak.EspeakG2P(language=espeak_code)
    phonemes, _ = g2p(text)
    phonemes = clean_phonemes(phonemes, language)

    if not phonemes:
        raise HTTPException(400, f"No phonemes generated for text in {language}")

    model = get_kokoro_finetuned(language)
    voice_pack = get_kokoro_voice_pack(voice_name)

    idx = min(len(phonemes) - 1, voice_pack.shape[0] - 1)
    ref_s = voice_pack[idx]

    with torch.no_grad():
        out = model(phonemes, ref_s, speed=speed, return_output=True)

    # Convert to WAV bytes
    audio_np = out.audio.numpy()
    buf = io.BytesIO()
    sf.write(buf, audio_np, 24000, format="WAV")
    return buf.getvalue(), 24000


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/synthesize", response_class=Response)
async def synthesize(req: SynthesizeRequest):
    """Generate speech audio from text."""
    start = time.time()

    cfg = get_voice_config(req.language)
    text_hash = hashlib.sha256(f"{req.text}::{req.language}".encode()).hexdigest()

    if cfg.backend == "piper":
        wav_bytes, sr = synthesize_piper(req.text, cfg.piper_model)
    elif cfg.backend == "kokoro":
        wav_bytes, sr = synthesize_kokoro(
            req.text, req.language, cfg.kokoro_voice, req.speed
        )
    else:
        raise HTTPException(500, f"Unknown backend: {cfg.backend}")

    elapsed_ms = int((time.time() - start) * 1000)

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "X-LB-Language": req.language,
            "X-LB-Backend": cfg.backend,
            "X-LB-Quality": cfg.quality,
            "X-LB-Text-Hash": text_hash,
            "X-LB-Duration-Ms": str(elapsed_ms),
        },
    )


@app.get("/voices")
async def list_voices():
    """List all supported languages and their TTS backend status."""
    voices = []
    for lang, cfg in sorted(VOICE_MAP.items()):
        model = cfg.piper_model or cfg.kokoro_voice or "default"

        # Check if model files actually exist
        ready = False
        if cfg.backend == "piper":
            ready = (PIPER_DIR / f"{cfg.piper_model}.onnx").exists()
        elif cfg.backend == "kokoro":
            ready = can_use_kokoro(lang)

        voices.append({
            "language": lang,
            "backend": cfg.backend,
            "quality": cfg.quality,
            "model": model,
            "ready": ready,
        })
    return {"voices": voices, "total": len(voices)}


@app.get("/health")
async def health():
    """Health check."""
    return {
        "status": "ok",
        "piper_voices_loaded": len(_piper_cache),
        "kokoro_loaded": _kokoro_model is not None,
        "kokoro_voice_packs": len(_kokoro_voice_cache),
    }
