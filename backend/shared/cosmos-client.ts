import { CosmosClient, Container } from '@azure/cosmos';

/**
 * Cosmos DB Client — lazy initialization
 *
 * Client is created on first use, not at import time.
 * This prevents startup crashes if env vars aren't yet available.
 */

let _client: CosmosClient | null = null;

function getClient(): CosmosClient {
  if (!_client) {
    const endpoint = process.env.COSMOS_DB_ENDPOINT;
    const key = process.env.COSMOS_DB_KEY;
    if (!endpoint || !key) {
      throw new Error('COSMOS_DB_ENDPOINT and COSMOS_DB_KEY must be set in environment variables');
    }
    _client = new CosmosClient({ endpoint, key });
  }
  return _client;
}

function getDatabase() {
  const databaseId = process.env.COSMOS_DB_DATABASE ?? 'languagebridge-prod';
  return getClient().database(databaseId);
}

// ============================================
// CONTAINER ACCESSORS (one per collection)
// ============================================

export function getSessionsContainer(): Container {
  return getDatabase().container('sessions');
}

export function getFlagsContainer(): Container {
  return getDatabase().container('flags');
}

export function getModelRegistryContainer(): Container {
  return getDatabase().container('model_registry');
}

export function getPilotsContainer(): Container {
  return getDatabase().container('pilots');
}

export function getAdminUsersContainer(): Container {
  return getDatabase().container('admin_users');
}

export function getAudioCacheMetadataContainer(): Container {
  return getDatabase().container('audio_cache_metadata');
}

export function getLexiconContainer(): Container {
  return getDatabase().container('lexicon');
}

export function getEnrollmentsContainer(): Container {
  return getDatabase().container('enrollments');
}

export function getAnalyticsContainer(): Container {
  return getDatabase().container('analytics');
}
