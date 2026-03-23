FROM python:3.11-slim

# Install espeak-ng for phonemization
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng libespeak-ng-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY inference/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code + scripts it imports
COPY inference/app.py .
COPY scripts/voice_router.py scripts/phoneme_map.py scripts/twi_g2p.py ./scripts/

# Copy Piper voice files (ONNX models ~100MB each)
COPY voices/piper/ ./voices/piper/

# Copy Kokoro voice packs (style vectors ~500KB each)
COPY voices/*.pt ./voices/

# Model weights are NOT baked in — mount from Azure Blob Storage at runtime
# Mount path: /app/models/<language>/<language>_tts_v1.pth

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
