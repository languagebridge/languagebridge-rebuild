"""
Upload trained model weights to Azure Blob Storage.

Usage:
  python registry/upload_weights.py --language dari --version v1
"""

import argparse
import hashlib
import os
from pathlib import Path
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
CONTAINER_NAME = "languagebridge-tts-models"

BASE = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE / "models"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def upload(language, version):
    weights_path = MODELS_DIR / language / f"{language}_tts_{version}.pth"

    if not weights_path.exists():
        print(f"Error: {weights_path} not found")
        return None, None

    weights_hash = sha256_file(weights_path)
    blob_path = f"models/{language}/{language}_tts_{version}.pth"

    print(f"File:     {weights_path}")
    print(f"Size:     {weights_path.stat().st_size / 1024 / 1024:.1f} MB")
    print(f"SHA-256:  {weights_hash}")
    print(f"Uploading to {CONTAINER_NAME}/{blob_path}...")

    client = BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)
    container = client.get_container_client(CONTAINER_NAME)

    # Create container if it doesn't exist
    try:
        container.create_container()
    except Exception:
        pass  # Already exists

    blob_client = container.get_blob_client(blob_path)
    with open(weights_path, "rb") as f:
        blob_client.upload_blob(
            f,
            overwrite=True,
            metadata={
                "language": language,
                "version": version,
                "sha256": weights_hash,
                "owner": "LanguageBridge LLC",
            }
        )

    print(f"\nUpload complete.")
    print(f"Blob path:  {blob_path}")
    print(f"SHA-256:    {weights_hash}")
    print(f"\nNext step: python registry/register_model.py --language {language} --version {version} --hash {weights_hash}")

    return blob_path, weights_hash


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--language", required=True)
    parser.add_argument("--version", default="v1")
    args = parser.parse_args()

    upload(args.language, args.version)
