import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob';

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

/**
 * Generate a read-only SAS URL for a blob with 1-hour expiry.
 */
export function generateSasUrl(containerName: string, blobName: string): string {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;
  if (!account || !key) {
    throw new Error(
      'AZURE_STORAGE_ACCOUNT and AZURE_STORAGE_KEY must be set to generate signed URLs. ' +
      'Refusing to return unsigned URL — this would expose blobs without auth.'
    );
  }

  const credential = new StorageSharedKeyCredential(account, key);
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const sas = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    },
    credential
  ).toString();

  return `https://${account}.blob.core.windows.net/${containerName}/${blobName}?${sas}`;
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
