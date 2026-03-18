"""
Register a trained model in Cosmos DB with full provenance.

Usage:
  python registry/register_model.py --language dari --version v1 --hash <sha256>
"""

import argparse
import os
import socket
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from azure.cosmos import CosmosClient

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

COSMOS_URL = os.getenv("COSMOS_URL")
COSMOS_KEY = os.getenv("COSMOS_KEY")
COSMOS_DB = os.getenv("COSMOS_DB", "lb-analytics")
BLOB_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT", "lbstorage")

BASE = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE / "models"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def register(language, version, weights_hash):
    model_id = f"{language}_model_{version}"
    weights_path = MODELS_DIR / language / f"{language}_tts_{version}.pth"

    if not weights_path.exists():
        print(f"Error: weights file not found at {weights_path}")
        return

    # Verify hash matches actual file
    actual_hash = sha256_file(weights_path)
    if actual_hash != weights_hash:
        print(f"Error: provided hash does not match file")
        print(f"  Provided: {weights_hash}")
        print(f"  Actual:   {actual_hash}")
        return

    blob_path = f"models/{language}/{language}_tts_{version}.pth"

    record = {
        "id": model_id,
        "type": "proprietary_model",
        "language": language,
        "version": version,
        "weightsHash": weights_hash,
        "blobPath": blob_path,
        "blobAccount": BLOB_ACCOUNT,
        "baseModel": "kokoro-82m-apache-2.0",
        "baseModelLicense": "Apache 2.0",
        "trainingData": "mozilla-common-voice-cc0",
        "trainingDataLicense": "CC0",
        "derivativeWorksOwner": "LanguageBridge LLC",
        "trainingDate": datetime.now(timezone.utc).isoformat(),
        "trainingMachine": f"macbook-{socket.gethostname()}",
        "registeredBy": "justin@languagebridge.app",
        "source": "proprietary",
    }

    print(f"\nRegistration record:")
    for k, v in record.items():
        print(f"  {k}: {v}")

    client = CosmosClient(COSMOS_URL, credential=COSMOS_KEY)
    db = client.get_database_client(COSMOS_DB)
    container = db.get_container_client("model_registry")

    container.upsert_item(record)
    print(f"\nRegistered: {model_id}")
    print(f"Verify with: az cosmosdb sql query ... WHERE c.id = '{model_id}'")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--language", required=True)
    parser.add_argument("--version", default="v1")
    parser.add_argument("--hash", required=True, dest="weights_hash")
    args = parser.parse_args()

    register(args.language, args.version, args.weights_hash)
