import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

/**
 * Azure Blob Storage Client — lazy initialization
 *
 * Client is created on first use, not at import time.
 * This prevents startup crashes if env vars aren't yet available.
 */

let _blobServiceClient: BlobServiceClient | null = null;

function getBlobServiceClient(): BlobServiceClient {
  if (!_blobServiceClient) {
    const connectionString = process.env.AZURE_BLOB_CONN_STRING;
    if (!connectionString) {
      throw new Error('AZURE_BLOB_CONN_STRING must be set in environment variables');
    }
    _blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  }
  return _blobServiceClient;
}

// ============================================
// CONTAINER ACCESSORS
// ============================================

export function getAudioCacheContainer(): ContainerClient {
  return getBlobServiceClient().getContainerClient(
    process.env.AZURE_STORAGE_CONTAINER_AUDIO ?? 'tts-audio-cache'
  );
}

export function getFlagDataContainer(): ContainerClient {
  return getBlobServiceClient().getContainerClient('flag-data');
}

export function getModelWeightsContainer(): ContainerClient {
  return getBlobServiceClient().getContainerClient('model-weights');
}
