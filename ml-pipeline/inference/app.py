"""
LanguageBridge TTS Inference Service

FastAPI service that serves Piper pre-trained TTS models.
Languages without a Piper voice return 400 — use Azure TTS via tts-router instead.

Endpoints:
  POST /synthesize  — Generate audio from text + language
  GET  /voices      — List supported languages and readiness
  GET  /health      — Health check
"""

import hashlib
import io
import logging
import os
import sys
import time
import wave
from collections import OrderedDict
from pathlib import Path

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import Response
from pydantic import BaseModel, Field

# Structured logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("lb-tts")

# Add scripts to path for voice_router
BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "scripts"))

from voice_router import VOICE_MAP, get_voice_config

app = FastAPI(
    title="LanguageBridge TTS",
    description="Piper TTS inference for LanguageBridge languages",
    version="2.0.0",
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

VOICES_DIR = BASE / "voices"
PIPER_DIR = VOICES_DIR / "piper"
API_KEY = os.environ.get("LB_INFERENCE_API_KEY")
MAX_PIPER_CACHE = 20


# ---------------------------------------------------------------------------
# Bounded Piper model cache
# ---------------------------------------------------------------------------

_piper_cache: OrderedDict = OrderedDict()


def get_piper_voice(model_name: str):
    """Load and cache a Piper voice model. Evicts LRU when cache is full."""
    if model_name in _piper_cache:
        _piper_cache.move_to_end(model_name)
        return _piper_cache[model_name]

    from piper import PiperVoice

    onnx_path = PIPER_DIR / f"{model_name}.onnx"
    if not onnx_path.exists():
        raise HTTPException(404, f"Piper model not found: {model_name}")

    voice = PiperVoice.load(str(onnx_path))
    _piper_cache[model_name] = voice

    # Evict oldest if over limit
    while len(_piper_cache) > MAX_PIPER_CACHE:
        evicted = _piper_cache.popitem(last=False)
        logger.info(f"Evicted Piper model from cache: {evicted[0]}")

    return voice


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------

async def verify_api_key(x_lb_api_key: str = Header(None)):
    if API_KEY and x_lb_api_key != API_KEY:
        raise HTTPException(401, "Invalid or missing API key")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    language: str
    format: str = Field(default="wav", pattern="^(wav|mp3)$")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


# ---------------------------------------------------------------------------
# Synthesis
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/synthesize", response_class=Response, dependencies=[])
async def synthesize(req: SynthesizeRequest, x_lb_api_key: str = Header(None)):
    """Generate speech audio from text."""
    # Auth
    if API_KEY and x_lb_api_key != API_KEY:
        raise HTTPException(401, "Invalid or missing API key")

    start = time.time()

    try:
        cfg = get_voice_config(req.language)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if cfg.backend != "piper":
        raise HTTPException(
            400,
            f"Language '{req.language}' has no local Piper voice. Use Azure TTS via tts-router.",
        )

    if not cfg.piper_model:
        raise HTTPException(500, f"No Piper model configured for {req.language}")

    text_hash = hashlib.sha256(f"{req.text}::{req.language}".encode()).hexdigest()

    try:
        wav_bytes, sr = synthesize_piper(req.text, cfg.piper_model)
    except Exception as e:
        logger.error(f"Synthesis failed for {req.language}: {e}")
        raise HTTPException(500, f"Synthesis failed: {str(e)}")

    elapsed_ms = int((time.time() - start) * 1000)
    logger.info(f"synthesize lang={req.language} backend=piper ms={elapsed_ms} hash={text_hash[:12]}")

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={
            "X-LB-Language": req.language,
            "X-LB-Backend": "piper",
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
        ready = False
        model = "none"

        if cfg.backend == "piper" and cfg.piper_model:
            model = cfg.piper_model
            ready = (PIPER_DIR / f"{cfg.piper_model}.onnx").exists()
        elif cfg.backend == "azure":
            model = "azure-neural"
            ready = True  # Azure is always available

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
        "piper_cache_limit": MAX_PIPER_CACHE,
    }
