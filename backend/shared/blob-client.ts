import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

/**
 * Azure Blob Storage Client
 *
 * One BlobServiceClient instance shared across all functions.
 * Used by tts-router to cache audio files and check if audio already exists.
 */

const connectionString = process.env.AZURE_BLOB_CONN_STRING;

if (!connectionString) {
  throw new Error('AZURE_BLOB_CONN_STRING must be set in environment variables');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

// ============================================
// CONTAINER ACCESSORS
// ============================================

export function getAudioCacheContainer(): ContainerClient {
  return blobServiceClient.getContainerClient(
    process.env.AZURE_STORAGE_CONTAINER_AUDIO ?? 'tts-audio-cache'
  );
}

export function getFlagDataContainer(): ContainerClient {
  return blobServiceClient.getContainerClient('flag-data');
}

export function getModelWeightsContainer(): ContainerClient {
  return blobServiceClient.getContainerClient('model-weights');
}

export { blobServiceClient };
