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

# Copy voice files (Piper ONNX models + Kokoro voice packs)
COPY voices/ ./voices/

# Copy trained model weights (only languages with fine-tuned models)
# In production, mount these from Azure Blob Storage instead of baking in
COPY models/ ./models/

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
