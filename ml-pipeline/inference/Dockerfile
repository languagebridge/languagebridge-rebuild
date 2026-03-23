FROM python:3.11.11-slim

# Install espeak-ng for Piper phonemization + curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng libespeak-ng-dev curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps (pinned versions)
COPY inference/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code + voice routing config
COPY inference/app.py .
COPY scripts/voice_router.py ./scripts/

# Copy Piper ONNX voice models
COPY voices/piper/ ./voices/piper/

# Non-root user
RUN useradd -m -r appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
