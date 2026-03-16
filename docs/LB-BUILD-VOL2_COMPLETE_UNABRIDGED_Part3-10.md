# LanguageBridge LLC: Volume 2 Backend Rebuild
## Part 3-10: Database, Functions, Testing & Deployment

**This continues from Part 1-2. Keep both documents open side by side.**

---

## Part 3: Cosmos DB & Azure Blob Storage Setup

### The Rebuild Database Architecture

In Phase 1 (live), you use Netlify Blobs, which is a simple key-value store. It works for the pilot, but does not scale. Phase 2 moves to Cosmos DB (Microsoft's NoSQL database) which is:

- **Structured:** You define collections (like tables) with schemas
- **Queryable:** You can write SQL-like queries to find documents
- **Scalable:** Handles 10,000+ students without breaking
- **Cost-effective:** You pay for what you use
- **GDPR-compliant:** Data stays in your Azure subscription

The rebuild database has 6 collections:

| Collection | Purpose | Example Document |
|-----------|---------|------------------|
| **sessions** | Log every event (no PII) | `{ sessionToken, language, eventType, timestamp }` |
| **flags** | Track flagged words/audio | `{ word, language, flagCount, status }` |
| **model_registry** | Proprietary model metadata | `{ language, modelVersion, sha256Hash }` |
| **pilots** | School/district configuration | `{ pilotId, name, district, languages }` |
| **admin_users** | Teacher & admin accounts | `{ email, pilotIds, permissions }` |
| **audio_cache_metadata** | Blob storage reference | `{ textHash, audioUrl, cachedAt }` |

### Step 1: Create Azure Resources

Log into Azure:

```bash
az login
# This opens a browser. Sign in with your Azure account.
```

Verify you are logged in:

```bash
az account show
# Should display your subscription details
```

Set your subscription (if you have multiple):

```bash
az account set --subscription "your-subscription-id"
```

Create a resource group (if you do not have one):

```bash
az group create --name languagebridge-rg --location eastus
```

Verify the resource group was created:

```bash
az group show --name languagebridge-rg
```

### Step 2: Create Cosmos DB Account

```bash
# This creates the Cosmos DB account (takes 2-3 minutes)
az cosmosdb create \
  --name languagebridge-cosmos \
  --resource-group languagebridge-rg \
  --locations regionName=eastus failoverPriority=0 \
  --default-consistency-level Eventual \
  --enable-free-tier true
```

Wait for this to complete. You should see output with the account details.

Get your Cosmos DB connection string:

```bash
az cosmosdb keys list \
  --name languagebridge-cosmos \
  --resource-group languagebridge-rg \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv
```

Copy this entire connection string. You will add it to `.env` shortly.

Also get your endpoint and key separately:

```bash
# Get endpoint
az cosmosdb show \
  --name languagebridge-cosmos \
  --resource-group languagebridge-rg \
  --query "documentEndpoint" \
  --output tsv

# Get primary key
az cosmosdb keys list \
  --name languagebridge-cosmos \
  --resource-group languagebridge-rg \
  --query "primaryMasterKey" \
  --output tsv
```

### Step 3: Create Cosmos DB Database

```bash
# Create the database
az cosmosdb sql database create \
  --account-name languagebridge-cosmos \
  --resource-group languagebridge-rg \
  --name languagebridge-prod
```

Verify the database was created:

```bash
az cosmosdb sql database list \
  --account-name languagebridge-cosmos \
  --resource-group languagebridge-rg
```

### Step 4: Create Collections (with Indexes)

Create the **sessions** collection:

```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name sessions \
  --partition-key-path "/pilotId" \
  --throughput 400 \
  --index-policy '{
    "indexingMode": "consistent",
    "includedPaths": [
      {
        "path": "/*"
      }
    ],
    "excludedPaths": [
      {
        "path": "/\"_etag\"/?"
      }
    ]
  }'
```

Create the **flags** collection:

```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name flags \
  --partition-key-path "/language" \
  --throughput 400
```

Create the **model_registry** collection:

```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name model_registry \
  --partition-key-path "/language" \
  --throughput 400
```

Create the **pilots** collection:

```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name pilots \
  --partition-key-path "/id" \
  --throughput 400
```

Create the **admin_users** collection:

```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name admin_users \
  --partition-key-path "/email" \
  --throughput 400
```

Create the **audio_cache_metadata** collection:

```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name audio_cache_metadata \
  --partition-key-path "/language" \
  --throughput 400
```

Verify all collections were created:

```bash
az cosmosdb sql container list \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg
```

You should see all 6 containers listed.

### Step 5: Create Azure Storage Account (Blob Storage)

```bash
az storage account create \
  --name languagbridgeaudio \
  --resource-group languagebridge-rg \
  --location eastus \
  --sku Standard_LRS
```

Get the storage account key:

```bash
az storage account keys list \
  --account-name languagbridgeaudio \
  --resource-group languagebridge-rg \
  --query "[0].value" \
  --output tsv
```

Copy this key. You will add it to `.env`.

### Step 6: Create Blob Containers

Create containers for audio cache and flag data:

```bash
# Audio cache container
az storage container create \
  --name tts-audio-cache \
  --account-name languagbridgeaudio

# Flag data container
az storage container create \
  --name flag-data \
  --account-name languagbridgeaudio

# Model registry container (for Kokoro weights in Phase 4)
az storage container create \
  --name model-weights \
  --account-name languagbridgeaudio
```

Verify containers were created:

```bash
az storage container list --account-name languagbridgeaudio
```

### Step 7: Update Your `.env` File

Now populate your `.env` with the real credentials:

```bash
cd ~/projects/languagebridge-rebuild

# Open .env in your editor
nano .env
```

Find and replace these lines:

```
COSMOS_DB_ENDPOINT=https://languagebridge-cosmos.documents.azure.com:443/
COSMOS_DB_KEY=[paste the primaryMasterKey you got earlier]
COSMOS_DB_DATABASE=languagebridge-prod
COSMOS_DB_CONN_STRING=[paste the connection string you got earlier]

AZURE_STORAGE_ACCOUNT=languagbridgeaudio
AZURE_STORAGE_KEY=[paste the storage account key you got earlier]
AZURE_STORAGE_CONTAINER_AUDIO=tts-audio-cache
AZURE_STORAGE_CONTAINER_FLAGS=flag-data
AZURE_BLOB_CONN_STRING=DefaultEndpointsProtocol=https;AccountName=languagbridgeaudio;AccountKey=[paste the key];EndpointSuffix=core.windows.net
```

Save the file (Ctrl+X, Y, Enter in nano).

Verify the file was updated:

```bash
grep COSMOS_DB .env
# Should show your real endpoint and key
```

### Step 8: Create Cosmos DB Client

Create the shared Cosmos DB utilities file:

```bash
cat > backend/shared/cosmos-client.ts << 'EOF'
/**
 * Cosmos DB Client
 * 
 * Singleton instance for all Azure Functions to use.
 * Handles connection pooling and error handling.
 */

import { CosmosClient, Database, Container } from '@azure/cosmos';

let client: CosmosClient | null = null;
let database: Database | null = null;

const containers: { [key: string]: Container } = {};

/**
 * Initialize the Cosmos DB client
 */
export async function initializeCosmosClient(): Promise<CosmosClient> {
  if (client) {
    return client;
  }

  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const dbName = process.env.COSMOS_DB_DATABASE || 'languagebridge-prod';

  if (!endpoint || !key) {
    throw new Error('COSMOS_DB_ENDPOINT and COSMOS_DB_KEY are required');
  }

  client = new CosmosClient({ endpoint, key });

  try {
    database = client.database(dbName);
    console.log(`Connected to Cosmos DB: ${dbName}`);
  } catch (error) {
    console.error('Failed to connect to Cosmos DB:', error);
    throw error;
  }

  return client;
}

/**
 * Get a specific container
 */
export async function getContainer(containerName: string): Promise<Container> {
  if (!database) {
    await initializeCosmosClient();
  }

  if (!containers[containerName]) {
    containers[containerName] = database!.container(containerName);
  }

  return containers[containerName];
}

/**
 * Write a document to a container
 */
export async function writeDocument<T extends { id: string }>(
  containerName: string,
  document: T
): Promise<T> {
  const container = await getContainer(containerName);

  try {
    const response = await container.items.create(document);
    return response.resource as T;
  } catch (error) {
    console.error(`Error writing to ${containerName}:`, error);
    throw error;
  }
}

/**
 * Read a document by ID
 */
export async function readDocument<T>(
  containerName: string,
  id: string,
  partitionKeyValue: string
): Promise<T | null> {
  const container = await getContainer(containerName);

  try {
    const response = await container.item(id, partitionKeyValue).read();
    return response.resource as T;
  } catch (error: any) {
    if (error.code === 404) {
      return null; // Document not found
    }
    console.error(`Error reading from ${containerName}:`, error);
    throw error;
  }
}

/**
 * Update a document
 */
export async function updateDocument<T extends { id: string }>(
  containerName: string,
  id: string,
  partitionKeyValue: string,
  updates: Partial<T>
): Promise<T> {
  const container = await getContainer(containerName);

  try {
    // First read the current document
    const current = await readDocument<T>(containerName, id, partitionKeyValue);
    if (!current) {
      throw new Error(`Document ${id} not found in ${containerName}`);
    }

    // Merge updates
    const updated = { ...current, ...updates, id };

    // Write back
    const response = await container.item(id, partitionKeyValue).replace(updated);
    return response.resource as T;
  } catch (error) {
    console.error(`Error updating in ${containerName}:`, error);
    throw error;
  }
}

/**
 * Query documents
 */
export async function queryDocuments<T>(
  containerName: string,
  query: string,
  parameters?: Array<{ name: string; value: any }>
): Promise<T[]> {
  const container = await getContainer(containerName);

  try {
    const response = await container.items
      .query<T>(query, { parameters })
      .fetchAll();

    return response.resources;
  } catch (error) {
    console.error(`Error querying ${containerName}:`, error);
    throw error;
  }
}

/**
 * Delete a document
 */
export async function deleteDocument(
  containerName: string,
  id: string,
  partitionKeyValue: string
): Promise<void> {
  const container = await getContainer(containerName);

  try {
    await container.item(id, partitionKeyValue).delete();
  } catch (error) {
    console.error(`Error deleting from ${containerName}:`, error);
    throw error;
  }
}

/**
 * Upsert a document (create if not exists, update if exists)
 */
export async function upsertDocument<T extends { id: string }>(
  containerName: string,
  document: T
): Promise<T> {
  const container = await getContainer(containerName);

  try {
    const response = await container.items.upsert(document);
    return response.resource as T;
  } catch (error) {
    console.error(`Error upserting in ${containerName}:`, error);
    throw error;
  }
}
EOF
```

### Step 9: Create Azure Blob Storage Client

```bash
cat > backend/shared/blob-client.ts << 'EOF'
/**
 * Azure Blob Storage Client
 * 
 * Handles audio file storage and retrieval.
 * Uses connection string for authentication.
 */

import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

let blobServiceClient: BlobServiceClient | null = null;
const containers: { [key: string]: ContainerClient } = {};

/**
 * Initialize the Blob Service Client
 */
export async function initializeBlobClient(): Promise<BlobServiceClient> {
  if (blobServiceClient) {
    return blobServiceClient;
  }

  const connString = process.env.AZURE_BLOB_CONN_STRING;

  if (!connString) {
    throw new Error('AZURE_BLOB_CONN_STRING is required');
  }

  blobServiceClient = BlobServiceClient.fromConnectionString(connString);

  try {
    console.log('Connected to Azure Blob Storage');
  } catch (error) {
    console.error('Failed to connect to Blob Storage:', error);
    throw error;
  }

  return blobServiceClient;
}

/**
 * Get a container client
 */
export async function getContainerClient(containerName: string): Promise<ContainerClient> {
  if (!blobServiceClient) {
    await initializeBlobClient();
  }

  if (!containers[containerName]) {
    containers[containerName] = blobServiceClient!.getContainerClient(containerName);
  }

  return containers[containerName];
}

/**
 * Upload a blob (file)
 */
export async function uploadBlob(
  containerName: string,
  blobName: string,
  data: Buffer,
  contentType: string = 'audio/mpeg'
): Promise<string> {
  const containerClient = await getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    await blockBlobClient.upload(data, data.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });

    return blockBlobClient.url;
  } catch (error) {
    console.error(`Error uploading blob ${blobName}:`, error);
    throw error;
  }
}

/**
 * Download a blob
 */
export async function downloadBlob(
  containerName: string,
  blobName: string
): Promise<Buffer> {
  const containerClient = await getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    const downloadResponse = await blockBlobClient.download();
    const chunks: Buffer[] = [];

    for await (const chunk of downloadResponse.readableStreamBody!) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error(`Error downloading blob ${blobName}:`, error);
    throw error;
  }
}

/**
 * Check if a blob exists
 */
export async function blobExists(containerName: string, blobName: string): Promise<boolean> {
  const containerClient = await getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    await blockBlobClient.getProperties();
    return true;
  } catch (error: any) {
    if (error.code === 'BlobNotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Delete a blob
 */
export async function deleteBlob(containerName: string, blobName: string): Promise<void> {
  const containerClient = await getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  try {
    await blockBlobClient.delete();
  } catch (error) {
    console.error(`Error deleting blob ${blobName}:`, error);
    throw error;
  }
}

/**
 * List all blobs in a container
 */
export async function listBlobs(containerName: string, prefix?: string): Promise<string[]> {
  const containerClient = await getContainerClient(containerName);

  try {
    const blobs: string[] = [];

    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      blobs.push(blob.name);
    }

    return blobs;
  } catch (error) {
    console.error(`Error listing blobs in ${containerName}:`, error);
    throw error;
  }
}
EOF
```

### Step 10: Create Request Validators

```bash
cat > backend/shared/validators.ts << 'EOF'
/**
 * Request Validators
 * 
 * Validate incoming requests before processing them.
 * All validators return { valid: boolean, errors?: string[] }
 */

import { 
  TTSRequest, 
  AnalyticsWriterRequest, 
  FlagEventRequest,
  SUPPORTED_LANGUAGES,
  MAX_TEXT_LENGTH,
  hasPII 
} from './types';

export type ValidationResult = {
  valid: boolean;
  errors?: string[];
};

/**
 * Validate TTS Request
 */
export function validateTTSRequest(body: any): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (!body.text || typeof body.text !== 'string') {
    errors.push('text is required and must be a string');
  }
  if (!body.language || typeof body.language !== 'string') {
    errors.push('language is required and must be a string');
  }
  if (!body.pilotId || typeof body.pilotId !== 'string') {
    errors.push('pilotId is required and must be a string');
  }
  if (!body.sessionToken || typeof body.sessionToken !== 'string') {
    errors.push('sessionToken is required and must be a string');
  }

  // Check text length
  if (body.text && body.text.length > MAX_TEXT_LENGTH) {
    errors.push(`text must be ${MAX_TEXT_LENGTH} characters or less`);
  }

  // Check language is supported
  if (body.language && !SUPPORTED_LANGUAGES.includes(body.language)) {
    errors.push(`language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  // Check for PII
  if (hasPII(body)) {
    errors.push('request contains prohibited fields (email, name, studentId, etc.)');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate Analytics Writer Request
 */
export function validateAnalyticsWriterRequest(body: any): ValidationResult {
  const errors: string[] = [];

  const validEventTypes = ['session_start', 'tts_request', 'flag_event', 'session_end', 'glossary_view'];

  // Check required fields
  if (!body.sessionToken || typeof body.sessionToken !== 'string') {
    errors.push('sessionToken is required');
  }
  if (!body.pilotId || typeof body.pilotId !== 'string') {
    errors.push('pilotId is required');
  }
  if (!body.language || typeof body.language !== 'string') {
    errors.push('language is required');
  }
  if (!body.eventType || !validEventTypes.includes(body.eventType)) {
    errors.push(`eventType must be one of: ${validEventTypes.join(', ')}`);
  }
  if (!body.timestamp || typeof body.timestamp !== 'string') {
    errors.push('timestamp is required (ISO 8601 format)');
  }
  if (!body.extensionVersion || typeof body.extensionVersion !== 'string') {
    errors.push('extensionVersion is required');
  }

  // Check for PII (CRITICAL)
  if (hasPII(body)) {
    errors.push('request contains PII: email, name, studentId, schoolId are prohibited');
  }

  // Validate timestamp is ISO 8601
  if (body.timestamp) {
    try {
      new Date(body.timestamp);
    } catch {
      errors.push('timestamp must be valid ISO 8601 format');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate Flag Event Request
 */
export function validateFlagEventRequest(body: any): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (!body.word || typeof body.word !== 'string') {
    errors.push('word is required');
  }
  if (!body.language || typeof body.language !== 'string') {
    errors.push('language is required');
  }
  if (!body.sessionToken || typeof body.sessionToken !== 'string') {
    errors.push('sessionToken is required');
  }
  if (!body.pilotId || typeof body.pilotId !== 'string') {
    errors.push('pilotId is required');
  }
  if (!body.timestamp || typeof body.timestamp !== 'string') {
    errors.push('timestamp is required');
  }

  // Check language is supported
  if (body.language && !SUPPORTED_LANGUAGES.includes(body.language)) {
    errors.push(`language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate JWT Token Format
 */
export function validateJWTFormat(token: string): ValidationResult {
  const errors: string[] = [];

  // JWT has 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    errors.push('Invalid JWT format. Must have 3 parts separated by dots.');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
EOF
```

### Step 11: Commit Database Setup

```bash
git add backend/shared/
git commit -m "feat: add Cosmos DB and Blob Storage clients with validators"
git push origin main
```

### Checkpoint: Part 3 Complete

You have now:

1. Created Cosmos DB account and database
2. Created 6 collections with proper partition keys
3. Created Azure Storage account and containers
4. Updated `.env` with real Azure credentials
5. Created Cosmos DB client with CRUD operations
6. Created Blob Storage client with upload/download
7. Created request validators with PII checking

**Test your Cosmos DB connection locally:**

```bash
# Create a quick test file
cat > backend/__tests__/cosmos-test.ts << 'EOF'
import { initializeCosmosClient, getContainer } from '../shared/cosmos-client';

async function testConnection() {
  try {
    const client = await initializeCosmosClient();
    console.log('✓ Connected to Cosmos DB');

    const container = await getContainer('pilots');
    console.log('✓ Got pilots container');

    // Write a test document
    const testPilot = {
      id: 'TEST-001',
      name: 'Test School',
      district: 'Test District',
      adminEmail: 'test@languagebridge.app',
      studentCount: 0,
      languages: ['dari'],
      createdAt: new Date().toISOString(),
      contractStartDate: '2026-01-01',
      contractEndDate: '2026-12-31',
    };

    const result = await container.items.create(testPilot);
    console.log('✓ Created test pilot:', result.resource?.id);

    // Clean up
    await container.item(testPilot.id, testPilot.id).delete();
    console.log('✓ Deleted test pilot');

    console.log('\n✓✓✓ All Cosmos DB tests passed!');
  } catch (error) {
    console.error('✗ Test failed:', error);
  }
}

testConnection();
EOF

# Compile and run
npx tsc backend/__tests__/cosmos-test.ts
node backend/__tests__/cosmos-test.js
```

If you see "All Cosmos DB tests passed!", your database is ready!

---

## Part 4: Building tts-router

This is the most important function. It is where all the magic happens: checking proprietary models first, falling back to Azure, caching results.

### Step 1: Create the tts-router Function Folder Structure

```bash
mkdir -p backend/azure-functions/tts-router
cd backend/azure-functions/tts-router
```

### Step 2: Create `function.json` (Function Configuration)

```bash
cat > function.json << 'EOF'
{
  "scriptFile": "index.ts",
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
      "route": "tts-router"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "$return"
    }
  ]
}
EOF
```

### Step 3: Create `index.ts` (The Main Function)

```bash
cat > index.ts << 'EOF'
/**
 * tts-router Azure Function
 * 
 * Purpose: Route text-to-speech requests through the following pipeline:
 * 1. Validate input (required fields, PII check)
 * 2. Check proprietary model registry for language
 * 3. If proprietary model exists, use it (cost savings, IP moat)
 * 4. If no proprietary model, fall back to Azure TTS
 * 5. Cache the result in Azure Blob Storage
 * 6. Log usage to Cosmos DB analytics
 * 7. Return audio URL and metadata
 * 
 * Performance target: < 2 seconds (including Azure TTS call)
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import axios from 'axios';
import { TTSRequest, TTSResponse, TTSErrorResponse, generateHash } from '../shared/types';
import { validateTTSRequest } from '../shared/validators';
import { getContainer, readDocument, writeDocument } from '../shared/cosmos-client';
import { uploadBlob, blobExists } from '../shared/blob-client';

const ttsRouter: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  const startTime = Date.now();

  try {
    // ============================================
    // STEP 1: PARSE & VALIDATE REQUEST
    // ============================================

    context.log('tts-router: Processing request');

    const body = req.body;
    const validation = validateTTSRequest(body);

    if (!validation.valid) {
      context.log.error('Validation failed:', validation.errors);

      const errorResponse: TTSErrorResponse = {
        error: 'MISSING_FIELDS',
        details: validation.errors?.join('; ') || 'Invalid request',
      };

      context.res = {
        status: 400,
        body: errorResponse,
      };
      return;
    }

    const request: TTSRequest = body;
    context.log(`Request valid: text="${request.text.substring(0, 50)}...", language="${request.language}"`);

    // ============================================
    // STEP 2: GENERATE CACHE KEY
    // ============================================

    const textHash = await generateHash(request.text, request.language);
    const cacheKey = `${request.language}/${textHash}.mp3`;

    context.log(`Cache key: ${cacheKey}`);

    // ============================================
    // STEP 3: CHECK CACHE FIRST
    // ============================================

    const cached = await blobExists('tts-audio-cache', cacheKey);

    if (cached) {
      context.log('Cache hit! Returning cached audio');

      const blobUrl = `https://languagbridgeaudio.blob.core.windows.net/tts-audio-cache/${cacheKey}`;

      const response: TTSResponse = {
        audioUrl: blobUrl,
        source: 'azure_cache',
        durationMs: 0, // TODO: Get from metadata
        cached: true,
        textHash,
      };

      context.res = {
        status: 200,
        body: response,
      };

      // Log usage (fire and forget)
      logUsage(context, request, 'tts_cache_hit').catch((err) => context.log.error('Error logging usage:', err));

      return;
    }

    context.log('Cache miss');

    // ============================================
    // STEP 4: CHECK PROPRIETARY MODEL REGISTRY
    // ============================================

    context.log(`Checking proprietary model registry for language: ${request.language}`);

    const modelContainer = await getContainer('model_registry');
    let modelEntry;

    try {
      modelEntry = await readDocument(
        'model_registry',
        request.language,
        request.language
      );
    } catch (error) {
      context.log(`No proprietary model found for ${request.language}`);
      modelEntry = null;
    }

    if (modelEntry) {
      context.log(`Found proprietary model: ${modelEntry.modelName} v${modelEntry.modelVersion}`);

      // TODO: Phase 4 - Call local Kokoro model inference
      // For now, we fall through to Azure TTS

      // audioUrl = await generateFromProprietaryModel(request.text, request.language);
    }

    // ============================================
    // STEP 5: FALL BACK TO AZURE COGNITIVE SERVICES
    // ============================================

    context.log('Calling Azure TTS...');

    const audioBuffer = await generateFromAzureTTS(context, request);

    if (!audioBuffer) {
      const errorResponse: TTSErrorResponse = {
        error: 'AZURE_SERVICE_ERROR',
        details: 'Azure TTS service returned empty response',
      };

      context.res = {
        status: 503,
        body: errorResponse,
      };
      return;
    }

    // ============================================
    // STEP 6: CACHE THE RESULT
    // ============================================

    context.log(`Uploading to cache: ${cacheKey}`);

    const audioUrl = await uploadBlob('tts-audio-cache', cacheKey, audioBuffer, 'audio/mpeg');

    context.log(`Cached at: ${audioUrl}`);

    // ============================================
    // STEP 7: RETURN RESPONSE
    // ============================================

    const response: TTSResponse = {
      audioUrl,
      source: 'azure_live',
      durationMs: calculateDuration(audioBuffer),
      cached: false,
      textHash,
    };

    context.res = {
      status: 200,
      body: response,
    };

    // ============================================
    // STEP 8: LOG USAGE (ASYNC)
    // ============================================

    logUsage(context, request, 'tts_request').catch((err) =>
      context.log.error('Error logging usage:', err)
    );

    const duration = Date.now() - startTime;
    context.log(`✓ Request completed in ${duration}ms`);
  } catch (error) {
    context.log.error('Unexpected error in tts-router:', error);

    const errorResponse: TTSErrorResponse = {
      error: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error',
    };

    context.res = {
      status: 500,
      body: errorResponse,
    };
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate audio from Azure Cognitive Services TTS
 */
async function generateFromAzureTTS(
  context: Context,
  request: TTSRequest
): Promise<Buffer | null> {
  const azureKey = process.env.AZURE_TTS_KEY;
  const azureRegion = process.env.AZURE_TTS_REGION;

  if (!azureKey || !azureRegion) {
    throw new Error('Azure TTS credentials not configured');
  }

  // Map language code to Azure voice
  const voiceMap: { [key: string]: string } = {
    dari: 'am-ET-MedhanAmehaNeural', // Placeholder - update with real Dari voice
    pashto: 'ps-AF-LatifaNeural',
    somali: 'so-SO-MuuseNeural',
    ukrainian: 'uk-UA-OksanaNeural',
    arabic: 'ar-SA-ZariyahNeural',
  };

  const voice = voiceMap[request.language] || 'en-US-AvaNeural';

  const ssmlBody = `
    <speak version="1.0" xml:lang="en-US">
      <voice name="${voice}">
        <prosody rate="0.95">${escapeXml(request.text)}</prosody>
      </voice>
    </speak>
  `;

  try {
    const response = await axios.post(
      `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
      ssmlBody,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': azureKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        },
        responseType: 'arraybuffer',
      }
    );

    return Buffer.from(response.data);
  } catch (error) {
    context.log.error('Azure TTS error:', error);
    return null;
  }
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimate audio duration from MP3 buffer (rough estimate)
 */
function calculateDuration(buffer: Buffer): number {
  // MP3 bitrate is typically 32 kbps (from Azure config)
  const kilobytes = buffer.length / 1024;
  const seconds = kilobytes / 4; // 32 kbps = 4 KB per second
  return Math.round(seconds * 1000); // Convert to milliseconds
}

/**
 * Log usage event to Cosmos DB (non-blocking)
 */
async function logUsage(
  context: Context,
  request: TTSRequest,
  eventType: string
): Promise<void> {
  try {
    const container = await getContainer('sessions');

    const event = {
      id: `${request.sessionToken}-${Date.now()}`,
      sessionToken: request.sessionToken,
      pilotId: request.pilotId,
      language: request.language,
      eventType,
      timestamp: new Date().toISOString(),
      extensionVersion: request.extensionVersion || 'unknown',
    };

    await container.items.create(event);
    context.log(`Usage logged: ${eventType}`);
  } catch (error) {
    context.log.error('Failed to log usage:', error);
    // Do not throw - logging failure should not fail the request
  }
}

export default ttsRouter;
EOF
```

### Step 4: Create `tsconfig.json` for this Function

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": ".",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  }
}
EOF
```

### Step 5: Commit tts-router

```bash
cd ~/projects/languagebridge-rebuild
git add backend/azure-functions/tts-router/
git commit -m "feat: implement tts-router function with caching and Azure fallback"
git push origin main
```

---

## Part 5: Building analytics-writer

This function logs every user action WITHOUT collecting PII. This is critical for FERPA/COPPA compliance.

### Step 1: Create Function Folder

```bash
mkdir -p backend/azure-functions/analytics-writer
cd backend/azure-functions/analytics-writer
```

### Step 2: Create `function.json`

```bash
cat > function.json << 'EOF'
{
  "scriptFile": "index.ts",
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
      "route": "analytics-writer"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "$return"
    }
  ]
}
EOF
```

### Step 3: Create `index.ts`

```bash
cat > index.ts << 'EOF'
/**
 * analytics-writer Azure Function
 * 
 * Purpose: Log anonymous user events to Cosmos DB
 * 
 * CRITICAL: This function must NEVER touch PII.
 * - No student names
 * - No student IDs
 * - No email addresses
 * - No school names
 * - Only: session tokens (anonymous UUIDs), language, event type, timestamp
 * 
 * The payload is validated by validateAnalyticsWriterRequest which
 * returns 400 if any PII field is detected.
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { AnalyticsWriterRequest, AnalyticsWriterResponse, AnalyticsWriterErrorResponse } from '../shared/types';
import { validateAnalyticsWriterRequest } from '../shared/validators';
import { getContainer } from '../shared/cosmos-client';

const analyticsWriter: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    // ============================================
    // STEP 1: PARSE & VALIDATE
    // ============================================

    context.log('analytics-writer: Processing request');

    const body = req.body;
    const validation = validateAnalyticsWriterRequest(body);

    if (!validation.valid) {
      context.log.error('Validation failed:', validation.errors);

      // Check if this is a PII violation
      const isPIIViolation = validation.errors?.some((e) => e.includes('PII'));

      const errorResponse: AnalyticsWriterErrorResponse = {
        error: isPIIViolation ? 'PII_VIOLATION' : 'MISSING_FIELDS',
        details: validation.errors?.join('; ') || 'Invalid request',
        prohibitedFields: isPIIViolation ? ['email', 'name', 'studentId', 'schoolId'] : undefined,
      };

      context.res = {
        status: 400,
        body: errorResponse,
      };

      // ALERT: PII attempt detected
      if (isPIIViolation) {
        context.log.error(`⚠️ PII VIOLATION DETECTED in analytics request from ${body.sessionToken}`);
        // TODO: Add alerting here (send alert email, log to security system)
      }

      return;
    }

    const request: AnalyticsWriterRequest = body;

    // ============================================
    // STEP 2: CONSTRUCT DOCUMENT
    // ============================================

    const doc = {
      id: `${request.sessionToken}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      sessionToken: request.sessionToken,
      pilotId: request.pilotId,
      language: request.language,
      eventType: request.eventType,
      timestamp: request.timestamp,
      extensionVersion: request.extensionVersion,
      // Document TTL: auto-delete after 90 days (7,776,000 seconds)
      // This is set at the container level, so we do not include it here
    };

    context.log(`Analytics event: ${request.eventType} for language ${request.language}`);

    // ============================================
    // STEP 3: WRITE TO COSMOS DB
    // ============================================

    const container = await getContainer('sessions');

    const createdDoc = await container.items.create(doc);

    context.log(`✓ Document created with ID: ${createdDoc.resource?.id}`);

    // ============================================
    // STEP 4: RETURN RESPONSE
    // ============================================

    const response: AnalyticsWriterResponse = {
      logged: true,
      eventId: createdDoc.resource?.id || 'unknown',
      timestamp: new Date().toISOString(),
    };

    context.res = {
      status: 200,
      body: response,
    };
  } catch (error) {
    context.log.error('Unexpected error in analytics-writer:', error);

    const errorResponse: AnalyticsWriterErrorResponse = {
      error: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error',
    };

    context.res = {
      status: 500,
      body: errorResponse,
    };
  }
};

export default analyticsWriter;
EOF
```

### Step 4: Create `tsconfig.json`

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": ".",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  }
}
EOF
```

### Step 5: Commit analytics-writer

```bash
cd ~/projects/languagebridge-rebuild
git add backend/azure-functions/analytics-writer/
git commit -m "feat: implement analytics-writer with strict PII validation"
git push origin main
```

---

## Part 6: Building flag-handler

This function processes pronunciation flags with automatic escalation.

### Step 1: Create Function Folder

```bash
mkdir -p backend/azure-functions/flag-handler
cd backend/azure-functions/flag-handler
```

### Step 2: Create `function.json`

```bash
cat > function.json << 'EOF'
{
  "scriptFile": "index.ts",
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
      "route": "flag-handler"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "$return"
    }
  ]
}
EOF
```

### Step 3: Create `index.ts`

```bash
cat > index.ts << 'EOF'
/**
 * flag-handler Azure Function
 * 
 * Purpose: Process pronunciation flags with threshold-based escalation
 * 
 * Flag Thresholds:
 * 1-2 flags: 'logged' (monitored, no action)
 * 3-5 flags: 'review' (visible to admin, needs human review)
 * 6-10 flags: 'bounty' (added to bounty board for interpreter marketplace)
 * 10+ flags: 'high_priority' (top of mission queue, stacked bounty)
 * 
 * This is the foundation for Phase 3 (interpreter marketplace).
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { FlagEventRequest, FlagHandlerResponse, FlagDoc, FLAG_THRESHOLDS } from '../shared/types';
import { validateFlagEventRequest } from '../shared/validators';
import { getContainer, readDocument, upsertDocument, generateHash } from '../shared/cosmos-client';

const flagHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    // ============================================
    // STEP 1: PARSE & VALIDATE
    // ============================================

    context.log('flag-handler: Processing request');

    const body = req.body;
    const validation = validateFlagEventRequest(body);

    if (!validation.valid) {
      context.log.error('Validation failed:', validation.errors);

      context.res = {
        status: 400,
        body: {
          error: 'MISSING_FIELDS',
          details: validation.errors?.join('; ') || 'Invalid request',
        },
      };
      return;
    }

    const request: FlagEventRequest = body;

    // ============================================
    // STEP 2: GENERATE DETERMINISTIC ID
    // ============================================

    // The ID is (word + language) so the same word in the same language
    // always maps to the same document. This enables deduplication.
    const docId = await generateHash(request.word, request.language);

    context.log(`Flag ID: ${docId} (word: ${request.word}, language: ${request.language})`);

    // ============================================
    // STEP 3: QUERY EXISTING FLAG DOCUMENT
    // ============================================

    const container = await getContainer('flags');

    let existingFlag: FlagDoc | null = null;

    try {
      existingFlag = await readDocument<FlagDoc>('flags', docId, request.language);
    } catch (error) {
      context.log('No existing flag document found (first flag for this word)');
    }

    // ============================================
    // STEP 4: CREATE OR UPDATE DOCUMENT
    // ============================================

    let flagDoc: FlagDoc;
    let isNewFlag = false;

    if (!existingFlag) {
      // CREATE
      isNewFlag = true;

      flagDoc = {
        id: docId,
        word: request.word,
        language: request.language,
        flagCount: 1,
        status: 'logged',
        pilotIds: [request.pilotId],
        audioUrl: request.audioUrl,
        createdAt: new Date().toISOString(),
        lastFlaggedAt: new Date().toISOString(),
        requiresReview: false,
      };

      context.log(`✓ Created new flag document (count: 1)`);
    } else {
      // UPDATE
      const newCount = existingFlag.flagCount + 1;

      // Add pilotId to array if not already there
      const pilotIds = Array.from(new Set([...existingFlag.pilotIds, request.pilotId]));

      // Determine new status based on threshold
      let newStatus = existingFlag.status;
      let requiresReview = false;

      if (newCount >= FLAG_THRESHOLDS.HIGH_PRIORITY) {
        newStatus = 'high_priority';
        requiresReview = true;
      } else if (newCount >= FLAG_THRESHOLDS.BOUNTY) {
        newStatus = 'bounty';
        requiresReview = true;
      } else if (newCount >= FLAG_THRESHOLDS.REVIEW) {
        newStatus = 'review';
        requiresReview = true;
      }

      flagDoc = {
        ...existingFlag,
        flagCount: newCount,
        status: newStatus,
        pilotIds,
        lastFlaggedAt: new Date().toISOString(),
        requiresReview,
      };

      context.log(`✓ Updated flag document (count: ${newCount}, status: ${newStatus})`);

      // Alert if threshold crossed
      if (newStatus !== existingFlag.status) {
        context.log(`⚠️ FLAG ESCALATION: "${request.word}" (${request.language}) -> ${newStatus}`);
        // TODO: Send alert email, trigger workflow
      }
    }

    // ============================================
    // STEP 5: UPSERT TO DATABASE
    // ============================================

    const upserted = await upsertDocument<FlagDoc>('flags', flagDoc);

    context.log(`✓ Document upserted`);

    // ============================================
    // STEP 6: RETURN RESPONSE
    // ============================================

    const response: FlagHandlerResponse = {
      flagId: upserted.id!,
      flagCount: upserted.flagCount,
      status: upserted.status,
      requiresReview: upserted.requiresReview,
      bountyValue: upserted.status === 'bounty' ? 50 : undefined, // Phase 3: calculate actual bounty
    };

    context.res = {
      status: 200,
      body: response,
    };
  } catch (error) {
    context.log.error('Unexpected error in flag-handler:', error);

    context.res = {
      status: 500,
      body: {
        error: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
};

export default flagHandler;
EOF
```

### Step 4: Create `tsconfig.json`

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": ".",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  }
}
EOF
```

### Step 5: Commit flag-handler

```bash
cd ~/projects/languagebridge-rebuild
git add backend/azure-functions/flag-handler/
git commit -m "feat: implement flag-handler with threshold-based escalation"
git push origin main
```

---

## Part 7: Building auth-layer

This function validates Supabase JWTs and enforces pilot-level access control.

### Step 1: Create Function Folder

```bash
mkdir -p backend/azure-functions/auth-layer
cd backend/azure-functions/auth-layer
```

### Step 2: Create `function.json`

```bash
cat > function.json << 'EOF'
{
  "scriptFile": "index.ts",
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["post"],
      "route": "auth-layer"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "$return"
    }
  ]
}
EOF
```

### Step 3: Create `index.ts`

```bash
cat > index.ts << 'EOF'
/**
 * auth-layer Azure Function
 * 
 * Purpose: Validate Supabase JWT tokens and return user context
 * 
 * Flow:
 * 1. Extract JWT from Authorization header
 * 2. Call Supabase auth.getUser(jwt) to validate token
 * 3. Query Cosmos DB pilots collection to find accessible pilots
 * 4. Check if user is super-admin (email ends with @languagebridge.app)
 * 5. Return user ID, email, accessible pilot IDs, and permissions
 * 
 * This function is called by the React PWA admin dashboard to authenticate users.
 * The extension does NOT use this function (uses anonymous session tokens instead).
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { createClient } from '@supabase/supabase-js';
import { AuthResponse, AuthErrorResponse } from '../shared/types';
import { validateJWTFormat } from '../shared/validators';
import { getContainer, queryDocuments } from '../shared/cosmos-client';

const authLayer: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    // ============================================
    // STEP 1: EXTRACT JWT FROM HEADER
    // ============================================

    context.log('auth-layer: Processing authentication');

    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      context.log.error('Missing or invalid Authorization header');

      const errorResponse: AuthErrorResponse = {
        error: 'MISSING_TOKEN',
        details: 'Authorization header must be present and formatted as "Bearer [token]"',
      };

      context.res = {
        status: 401,
        body: errorResponse,
      };
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Basic JWT format validation
    const jwtValidation = validateJWTFormat(token);
    if (!jwtValidation.valid) {
      context.log.error('Invalid JWT format');

      const errorResponse: AuthErrorResponse = {
        error: 'INVALID_TOKEN',
        details: jwtValidation.errors?.join('; ') || 'Invalid token format',
      };

      context.res = {
        status: 401,
        body: errorResponse,
      };
      return;
    }

    // ============================================
    // STEP 2: VALIDATE TOKEN WITH SUPABASE
    // ============================================

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let user;

    try {
      const { data, error } = await supabase.auth.admin.getUserById(
        // Decode JWT and extract user ID
        extractUserIdFromJWT(token)
      );

      if (error) {
        context.log.error('Supabase auth error:', error.message);

        const errorResponse: AuthErrorResponse = {
          error: 'INVALID_TOKEN',
          details: 'Token validation failed',
        };

        context.res = {
          status: 401,
          body: errorResponse,
        };
        return;
      }

      user = data?.user;

      if (!user) {
        context.log.error('User not found in Supabase');

        const errorResponse: AuthErrorResponse = {
          error: 'INVALID_TOKEN',
          details: 'User not found',
        };

        context.res = {
          status: 401,
          body: errorResponse,
        };
        return;
      }

      context.log(`✓ User authenticated: ${user.email}`);
    } catch (error) {
      context.log.error('Error validating token:', error);

      const errorResponse: AuthErrorResponse = {
        error: 'INVALID_TOKEN',
        details: error instanceof Error ? error.message : 'Token validation failed',
      };

      context.res = {
        status: 401,
        body: errorResponse,
      };
      return;
    }

    // ============================================
    // STEP 3: CHECK IF SUPER-ADMIN
    // ============================================

    const isSuper-Admin = user.email?.endsWith('@languagebridge.app') ?? false;

    context.log(`User is super-admin: ${isSuper-Admin}`);

    let accessiblePilotIds: string[] = [];

    if (isSuper-Admin) {
      // Super-admins can access all pilots
      const pilots = await queryDocuments<{ id: string }>(
        'pilots',
        'SELECT c.id FROM c'
      );

      accessiblePilotIds = pilots.map((p) => p.id);

      context.log(`Super-admin can access ${accessiblePilotIds.length} pilots`);
    } else {
      // Regular admins: find pilots where adminEmail matches
      const pilots = await queryDocuments<{ id: string }>(
        'pilots',
        'SELECT c.id FROM c WHERE c.adminEmail = @email',
        [{ name: '@email', value: user.email }]
      );

      accessiblePilotIds = pilots.map((p) => p.id);

      context.log(`User can access ${accessiblePilotIds.length} pilots`);
    }

    // ============================================
    // STEP 4: DETERMINE PERMISSIONS
    // ============================================

    const permissions = [
      'view_dashboard',
      'export_data',
      'view_analytics',
      'view_flags',
    ];

    if (isSuper-Admin) {
      permissions.push('manage_flags', 'manage_users', 'view_billing');
    }

    // ============================================
    // STEP 5: RETURN RESPONSE
    // ============================================

    const response: AuthResponse = {
      userId: user.id,
      email: user.email || 'unknown',
      accessiblePilotIds,
      isSuper-Admin,
      permissions,
    };

    context.res = {
      status: 200,
      body: response,
    };
  } catch (error) {
    context.log.error('Unexpected error in auth-layer:', error);

    const errorResponse: AuthErrorResponse = {
      error: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : 'Unknown error',
    };

    context.res = {
      status: 500,
      body: errorResponse,
    };
  }
};

/**
 * Extract user ID from JWT (simple decode, not verification)
 * In production, Supabase verifies the signature.
 */
function extractUserIdFromJWT(token: string): string {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return decoded.sub || decoded.user_id;
  } catch (error) {
    throw new Error('Failed to extract user ID from JWT');
  }
}

export default authLayer;
EOF
```

### Step 4: Create `tsconfig.json`

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": ".",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node"
  }
}
EOF
```

### Step 5: Commit auth-layer

```bash
cd ~/projects/languagebridge-rebuild
git add backend/azure-functions/auth-layer/
git commit -m "feat: implement auth-layer with Supabase JWT validation"
git push origin main
```

---

## Part 8: Local Testing & Debugging

Now test all four functions locally before deploying to Azure.

### Step 1: Build All TypeScript

```bash
cd ~/projects/languagebridge-rebuild

# Compile TypeScript to JavaScript
npm run build:backend
```

You should see no errors. If there are errors, read them carefully:

```
# Example error:
# backend/azure-functions/tts-router/index.ts:45:10 - error TS2345: 
# Argument of type 'any' is not assignable to parameter of type 'TTSRequest'.

# This means you have a type mismatch. Check line 45 and fix it.
```

### Step 2: Start Azure Functions Locally

In one terminal:

```bash
cd ~/projects/languagebridge-rebuild/backend

# Start the local Azure Functions runtime
npx func start
```

You should see output like:

```
Azure Functions Core Tools
Version 4.x
Listening on 'http://localhost:7071'

Functions:

tts-router: [POST] http://localhost:7071/api/tts-router
analytics-writer: [POST] http://localhost:7071/api/analytics-writer
flag-handler: [POST] http://localhost:7071/api/flag-handler
auth-layer: [POST] http://localhost:7071/api/auth-layer
```

If you see errors, check:

1. `ls backend/azure-functions/*/function.json` - all 4 files exist?
2. `ls backend/azure-functions/*/index.ts` - all 4 files exist?
3. `npm run build:backend` - does it compile without errors?

### Step 3: Test Each Function (In Another Terminal)

Open a second terminal:

```bash
# Test tts-router
curl -X POST http://localhost:7071/api/tts-router \
  -H "Content-Type: application/json" \
  -d '{
    "text": "photosynthesis",
    "language": "dari",
    "pilotId": "PCSD-2026",
    "sessionToken": "test-session-001",
    "extensionVersion": "2.0.0"
  }'
```

Expected response:

```json
{
  "audioUrl": "https://languagbridgeaudio.blob.core.windows.net/tts-audio-cache/dari/...",
  "source": "azure_live",
  "durationMs": 2400,
  "cached": false,
  "textHash": "abc123..."
}
```

Test analytics-writer:

```bash
curl -X POST http://localhost:7071/api/analytics-writer \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "test-session-001",
    "pilotId": "PCSD-2026",
    "language": "dari",
    "eventType": "tts_request",
    "timestamp": "2026-03-15T14:30:00Z",
    "extensionVersion": "2.0.0"
  }'
```

Expected response:

```json
{
  "logged": true,
  "eventId": "test-session-001-...",
  "timestamp": "2026-03-15T14:30:45.123Z"
}
```

Test analytics-writer with PII (should fail):

```bash
curl -X POST http://localhost:7071/api/analytics-writer \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "test-session-001",
    "pilotId": "PCSD-2026",
    "language": "dari",
    "eventType": "tts_request",
    "timestamp": "2026-03-15T14:30:00Z",
    "extensionVersion": "2.0.0",
    "email": "student@school.com"
  }'
```

Expected response (400):

```json
{
  "error": "PII_VIOLATION",
  "details": "request contains PII: email, name, studentId, schoolId are prohibited",
  "prohibitedFields": ["email", "name", "studentId", "schoolId"]
}
```

Test flag-handler:

```bash
curl -X POST http://localhost:7071/api/flag-handler \
  -H "Content-Type: application/json" \
  -d '{
    "word": "photosynthesis",
    "language": "dari",
    "sessionToken": "test-session-001",
    "pilotId": "PCSD-2026",
    "timestamp": "2026-03-15T14:30:00Z"
  }'
```

Expected response:

```json
{
  "flagId": "abc123...",
  "flagCount": 1,
  "status": "logged",
  "requiresReview": false
}
```

Run it 6 times to see escalation:

```bash
# Run the flag-handler curl command 6 times
# On the 6th call, you should see:
# "status": "bounty"
# "requiresReview": true
```

### Step 4: Check Cosmos DB Directly

In the [Azure Portal](https://portal.azure.com):

1. Go to your Cosmos DB account
2. Click "Data Explorer"
3. Expand `languagebridge-prod` database
4. Click on `sessions` collection
5. Click "New SQL Query"
6. Run: `SELECT * FROM c ORDER BY c._ts DESC LIMIT 5`

You should see your analytics events logged!

### Step 5: Stop Local Server

```bash
# In the first terminal (where func start is running)
# Press Ctrl+C to stop
```

### Checkpoint: Part 8 Complete

You have now:

1. Built all four Azure Functions
2. Tested them locally with curl
3. Verified Cosmos DB writes
4. Verified PII validation
5. Verified flag escalation

---

## Part 9: Azure Deployment

Deploy your functions to Azure.

### Step 1: Create Function App in Azure

```bash
# Create the Function App
az functionapp create \
  --resource-group languagebridge-rg \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name lb-backend-functions \
  --storage-account languagbridgeaudio
```

This takes 2-3 minutes. Wait for it to complete.

### Step 2: Set Environment Variables

```bash
# Set all Azure Functions app settings
az functionapp config appsettings set \
  --name lb-backend-functions \
  --resource-group languagebridge-rg \
  --settings \
  COSMOS_DB_ENDPOINT="$(grep COSMOS_DB_ENDPOINT .env | cut -d'=' -f2)" \
  COSMOS_DB_KEY="$(grep COSMOS_DB_KEY .env | cut -d'=' -f2)" \
  COSMOS_DB_DATABASE="$(grep COSMOS_DB_DATABASE .env | cut -d'=' -f2)" \
  AZURE_STORAGE_ACCOUNT="$(grep AZURE_STORAGE_ACCOUNT .env | cut -d'=' -f2)" \
  AZURE_STORAGE_KEY="$(grep AZURE_STORAGE_KEY .env | cut -d'=' -f2)" \
  AZURE_STORAGE_CONTAINER_AUDIO="tts-audio-cache" \
  AZURE_TTS_KEY="$(grep AZURE_TTS_KEY .env | cut -d'=' -f2)" \
  AZURE_TTS_REGION="$(grep AZURE_TTS_REGION .env | cut -d'=' -f2)" \
  SUPABASE_URL="$(grep SUPABASE_URL .env | cut -d'=' -f2)" \
  SUPABASE_SERVICE_ROLE_KEY="$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d'=' -f2)" \
  NODE_ENV="production"
```

### Step 3: Deploy Functions

```bash
cd ~/projects/languagebridge-rebuild/backend

# Deploy to Azure
npx func azure functionapp publish lb-backend-functions
```

This takes 2-5 minutes. You should see output showing each function being deployed:

```
Deployment successful.
tts-router published to https://lb-backend-functions.azurewebsites.net/api/tts-router
analytics-writer published to https://lb-backend-functions.azurewebsites.net/api/analytics-writer
flag-handler published to https://lb-backend-functions.azurewebsites.net/api/flag-handler
auth-layer published to https://lb-backend-functions.azurewebsites.net/api/auth-layer
```

### Step 4: Test Production Endpoints

```bash
# Test tts-router
curl -X POST https://lb-backend-functions.azurewebsites.net/api/tts-router \
  -H "Content-Type: application/json" \
  -d '{
    "text": "hello world",
    "language": "dari",
    "pilotId": "PCSD-2026",
    "sessionToken": "prod-test-001"
  }'
```

You should get a 200 response with audio URL.

### Checkpoint: Part 9 Complete

Your backend is now deployed to Azure! The Greenbriar pilot still uses the old Netlify backend, but your new backend is ready. Volume 5 will guide you through the cutover.

---

## Part 10: Validation Checklist

Before moving to Volume 3 (Frontend), complete all these tests:

### tts-router Tests

```bash
# TEST 1: Proprietary model registered
# (We don't have one yet, so this falls back to Azure)
curl -X POST http://localhost:7071/api/tts-router \
  -d '{"text":"test","language":"dari","pilotId":"PCSD-2026","sessionToken":"test-1"}'
# PASS: Returns source: "azure_live"

# TEST 2: Cache hit on second request
# (Run the same request twice)
# PASS: Second call returns source: "azure_cache"

# TEST 3: Missing fields
curl -X POST http://localhost:7071/api/tts-router \
  -d '{"text":"test"}'
# PASS: Returns 400 MISSING_FIELDS

# TEST 4: Invalid language
curl -X POST http://localhost:7071/api/tts-router \
  -d '{"text":"test","language":"klingon","pilotId":"PCSD-2026","sessionToken":"test-1"}'
# PASS: Returns 400 INVALID_LANGUAGE

# TEST 5: Text too long (>500 chars)
# (Generate a 501-character string)
LONGTEXT=$(python3 -c "print('a' * 501)")
curl -X POST http://localhost:7071/api/tts-router \
  -d "{\"text\":\"$LONGTEXT\",\"language\":\"dari\",\"pilotId\":\"PCSD-2026\",\"sessionToken\":\"test-1\"}"
# PASS: Returns 400 TEXT_TOO_LONG
```

### analytics-writer Tests

```bash
# TEST 1: Valid request
curl -X POST http://localhost:7071/api/analytics-writer \
  -d '{
    "sessionToken":"test-1",
    "pilotId":"PCSD-2026",
    "language":"dari",
    "eventType":"tts_request",
    "timestamp":"2026-03-15T14:30:00Z",
    "extensionVersion":"2.0.0"
  }'
# PASS: Returns logged: true

# TEST 2: PII violation (email field)
curl -X POST http://localhost:7071/api/analytics-writer \
  -d '{
    "sessionToken":"test-1",
    "pilotId":"PCSD-2026",
    "language":"dari",
    "eventType":"tts_request",
    "timestamp":"2026-03-15T14:30:00Z",
    "extensionVersion":"2.0.0",
    "email":"student@school.com"
  }'
# PASS: Returns 400 PII_VIOLATION

# TEST 3: PII violation (name field)
curl -X POST http://localhost:7071/api/analytics-writer \
  -d '{
    "sessionToken":"test-1",
    "pilotId":"PCSD-2026",
    "language":"dari",
    "eventType":"tts_request",
    "timestamp":"2026-03-15T14:30:00Z",
    "extensionVersion":"2.0.0",
    "name":"Ahmed Hassan"
  }'
# PASS: Returns 400 PII_VIOLATION

# TEST 4: Verify in Cosmos DB
# (In Azure Portal, query: SELECT COUNT(*) FROM c)
# PASS: Count increases by 1 after each request
```

### flag-handler Tests

```bash
# TEST 1: First flag (count=1, status="logged")
curl -X POST http://localhost:7071/api/flag-handler \
  -d '{
    "word":"photosynthesis",
    "language":"dari",
    "sessionToken":"test-1",
    "pilotId":"PCSD-2026",
    "timestamp":"2026-03-15T14:30:00Z"
  }'
# PASS: Returns flagCount: 1, status: "logged"

# TEST 2: Third flag (count=3, status="review")
# (Run flag test 2 more times, same word/language)
# PASS: On 3rd call, returns status: "review"

# TEST 3: Sixth flag (count=6, status="bounty")
# (Run flag test 3 more times)
# PASS: On 6th call, returns status: "bounty", requiresReview: true

# TEST 4: Tenth flag (count=10, status="high_priority")
# (Run flag test 4 more times)
# PASS: On 10th call, returns status: "high_priority"
```

### auth-layer Tests

(These require a valid Supabase JWT. Skip for now until Volume 3)

### Production Deployment Tests

```bash
# TEST 1: Production endpoint is live
curl -X POST https://lb-backend-functions.azurewebsites.net/api/tts-router \
  -d '{"text":"test","language":"dari","pilotId":"PCSD-2026","sessionToken":"prod-1"}'
# PASS: Returns 200 with audioUrl

# TEST 2: Production analytics logging
curl -X POST https://lb-backend-functions.azurewebsites.net/api/analytics-writer \
  -d '{
    "sessionToken":"prod-1",
    "pilotId":"PCSD-2026",
    "language":"dari",
    "eventType":"tts_request",
    "timestamp":"2026-03-15T14:30:00Z",
    "extensionVersion":"2.0.0"
  }'
# PASS: Returns logged: true

# TEST 3: Verify in production Cosmos DB
# (In Azure Portal, connect to your Cosmos DB)
# PASS: Documents appear in sessions collection
```

### Final Checklist

- [ ] All 4 Azure Functions compile without errors
- [ ] All 4 functions run locally with `func start`
- [ ] tts-router returns audio URL
- [ ] tts-router caches second request
- [ ] analytics-writer rejects PII
- [ ] flag-handler escalates at threshold 3
- [ ] flag-handler escalates at threshold 6
- [ ] flag-handler escalates at threshold 10
- [ ] All functions deployed to Azure
- [ ] Production endpoints respond to requests
- [ ] Cosmos DB documents created successfully
- [ ] `.env` is in `.gitignore` (never committed)
- [ ] All code committed to GitHub with clear messages

---

## You Are Ready for Volume 3

Your backend is complete, tested, and deployed. The four Azure Functions are running and ready to receive requests from Prentice's Chrome extension.

In Volume 3, Prentice will:

1. Build the Chrome extension content script
2. Wire it to call your tts-router, analytics-writer, and flag-handler functions
3. Build the React PWA admin dashboard
4. Wire it to call your auth-layer function
5. Deploy the extension to Google Admin Console
6. Deploy the PWA to Netlify

Both of you will see the student toolbar working with the new backend.

---

**LanguageBridge LLC | Phase 2 Bootcamp | March 2026**

Justin Bernard (CEO, Backend & ML) - justin@languagebridge.app

Prentice Howard (CTO/Co-Founder, Frontend) - prentice@languagebridge.app

**END OF VOLUME 2**
