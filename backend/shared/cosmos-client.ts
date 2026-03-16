import { CosmosClient, Database, Container } from '@azure/cosmos';

/**
 * Cosmos DB Client
 *
 * Initializes one CosmosClient instance for the entire backend.
 * All four Azure Functions import from here — never create a new client
 * inside a function. One connection, reused across warm invocations.
 */

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;
const databaseId = process.env.COSMOS_DB_DATABASE ?? 'languagebridge-prod';

if (!endpoint || !key) {
  throw new Error('COSMOS_DB_ENDPOINT and COSMOS_DB_KEY must be set in environment variables');
}

const client = new CosmosClient({ endpoint, key });

// ============================================
// DATABASE ACCESSOR
// ============================================

function getDatabase(): Database {
  return client.database(databaseId);
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

export { client };
