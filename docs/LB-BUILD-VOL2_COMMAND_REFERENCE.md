# LanguageBridge Backend Rebuild: Command Reference Guide

**Purpose:** Copy-paste all terminal commands needed to build, test, and deploy the backend

**For:** Justin Bernard (CEO/Backend Developer)

**Status:** Ready to execute immediately

---

## Quick Navigation

- [Part 2: Project Setup](#part-2-project-setup)
- [Part 3: Azure & Database Setup](#part-3-azure-database-setup)
- [Part 4-7: Build Functions](#part-4-7-build-functions)
- [Part 8: Local Testing](#part-8-local-testing)
- [Part 9: Deploy to Azure](#part-9-deploy-to-azure)
- [Part 10: Validation Tests](#part-10-validation-tests)
- [Troubleshooting](#troubleshooting)

---

## Part 2: Project Setup

### Initial Repository Setup

```bash
# Create local directory
cd ~/projects
git clone git@github.com:languagebridge-llc/languagebridge-rebuild.git
cd languagebridge-rebuild
```

### Create Folder Structure

```bash
# Backend
mkdir -p backend/azure-functions/{tts-router,analytics-writer,flag-handler,auth-layer}
mkdir -p backend/shared
mkdir -p backend/__tests__/{unit,integration}

# Extension
mkdir -p extension/src/{ui,api,utils}
mkdir -p extension/public/assets
mkdir -p extension/__tests__

# PWA
mkdir -p pwa/src/{pages,components,hooks,utils}
mkdir -p pwa/public
mkdir -p pwa/__tests__

# ML Pipeline
mkdir -p ml-pipeline/{notebooks,scripts,models,registry,data}
mkdir -p ml-pipeline/__tests__

# Documentation
mkdir -p docs

# Integration tests
mkdir -p tests/{integration,e2e}

# Create .gitkeep files
touch backend/__tests__/unit/.gitkeep
touch backend/__tests__/integration/.gitkeep
touch extension/__tests__/.gitkeep
touch pwa/__tests__/.gitkeep
touch ml-pipeline/__tests__/.gitkeep
touch ml-pipeline/models/.gitkeep
touch ml-pipeline/data/.gitkeep
touch tests/integration/.gitkeep
touch tests/e2e/.gitkeep
touch docs/.gitkeep

# Create root config files
touch .gitignore .env.example README.md tsconfig.json tsconfig.backend.json
```

### Install Root Dependencies

```bash
cd ~/projects/languagebridge-rebuild
npm install
cd backend
npm install
cd ..
```

### Verify Setup

```bash
npm run type-check:backend
# Should show no errors
```

---

## Part 3: Azure & Database Setup

### Login to Azure

```bash
az login
# Browser opens, sign in with your Azure account

# Verify login
az account show

# If multiple subscriptions, set the correct one
az account set --subscription "your-subscription-id"
```

### Create Resource Group

```bash
az group create --name languagebridge-rg --location eastus

# Verify
az group show --name languagebridge-rg
```

### Create Cosmos DB Account

```bash
az cosmosdb create \
  --name languagebridge-cosmos \
  --resource-group languagebridge-rg \
  --locations regionName=eastus failoverPriority=0 \
  --default-consistency-level Eventual \
  --enable-free-tier true
```

### Get Cosmos DB Credentials

```bash
# Get connection string
az cosmosdb keys list \
  --name languagebridge-cosmos \
  --resource-group languagebridge-rg \
  --type connection-strings \
  --query "connectionStrings[0].connectionString" \
  --output tsv

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

### Create Cosmos DB Database

```bash
az cosmosdb sql database create \
  --account-name languagebridge-cosmos \
  --resource-group languagebridge-rg \
  --name languagebridge-prod

# Verify
az cosmosdb sql database list \
  --account-name languagebridge-cosmos \
  --resource-group languagebridge-rg
```

### Create Collections (Paste Each Individually)

**sessions collection:**
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
    "includedPaths": [{"path": "/*"}],
    "excludedPaths": [{"path": "/\"_etag\"/?"} ]
  }'
```

**flags collection:**
```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name flags \
  --partition-key-path "/language" \
  --throughput 400
```

**model_registry collection:**
```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name model_registry \
  --partition-key-path "/language" \
  --throughput 400
```

**pilots collection:**
```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name pilots \
  --partition-key-path "/id" \
  --throughput 400
```

**admin_users collection:**
```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name admin_users \
  --partition-key-path "/email" \
  --throughput 400
```

**audio_cache_metadata collection:**
```bash
az cosmosdb sql container create \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg \
  --name audio_cache_metadata \
  --partition-key-path "/language" \
  --throughput 400
```

### Verify All Collections

```bash
az cosmosdb sql container list \
  --account-name languagebridge-cosmos \
  --database-name languagebridge-prod \
  --resource-group languagebridge-rg
```

### Create Azure Storage Account

```bash
az storage account create \
  --name languagbridgeaudio \
  --resource-group languagebridge-rg \
  --location eastus \
  --sku Standard_LRS

# Get the key
az storage account keys list \
  --account-name languagbridgeaudio \
  --resource-group languagebridge-rg \
  --query "[0].value" \
  --output tsv
```

### Create Blob Containers

```bash
az storage container create \
  --name tts-audio-cache \
  --account-name languagbridgeaudio

az storage container create \
  --name flag-data \
  --account-name languagbridgeaudio

az storage container create \
  --name model-weights \
  --account-name languagbridgeaudio

# Verify
az storage container list --account-name languagbridgeaudio
```

### Update .env File

```bash
cd ~/projects/languagebridge-rebuild

# Copy and edit the file
nano .env

# Paste your real Azure credentials here
# See LB-BUILD-VOL2 Part 3, Step 7 for what to paste
```

---

## Part 4-7: Build Functions

### Create tts-router

```bash
# Navigate to function folder
cd ~/projects/languagebridge-rebuild/backend/azure-functions/tts-router

# Create function.json
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

# Create tsconfig.json
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

# Now create index.ts - See Part 4, Step 3 of LB-BUILD-VOL2
# (Too long to paste here - copy from the document)
```

### Create analytics-writer

```bash
cd ~/projects/languagebridge-rebuild/backend/azure-functions/analytics-writer

# Create function.json
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

# Create tsconfig.json (same as tts-router)
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

# Now create index.ts - See Part 5, Step 3 of LB-BUILD-VOL2
```

### Create flag-handler

```bash
cd ~/projects/languagebridge-rebuild/backend/azure-functions/flag-handler

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

# Now create index.ts - See Part 6, Step 3 of LB-BUILD-VOL2
```

### Create auth-layer

```bash
cd ~/projects/languagebridge-rebuild/backend/azure-functions/auth-layer

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

# Now create index.ts - See Part 7, Step 3 of LB-BUILD-VOL2
```

### Create Shared Files

```bash
cd ~/projects/languagebridge-rebuild

# Create types.ts - See Part 2, Step 13 of LB-BUILD-VOL2
# Create cosmos-client.ts - See Part 3, Step 8 of LB-BUILD-VOL2
# Create blob-client.ts - See Part 3, Step 9 of LB-BUILD-VOL2
# Create validators.ts - See Part 3, Step 10 of LB-BUILD-VOL2
```

### Commit Functions

```bash
cd ~/projects/languagebridge-rebuild

git add backend/
git commit -m "feat: implement all four Azure Functions (tts-router, analytics-writer, flag-handler, auth-layer)"
git push origin main
```

---

## Part 8: Local Testing

### Build TypeScript

```bash
cd ~/projects/languagebridge-rebuild
npm run build:backend
# Should show no errors
```

### Start Local Azure Functions (Terminal 1)

```bash
cd ~/projects/languagebridge-rebuild/backend
npx func start

# You should see:
# Functions:
# tts-router: [POST] http://localhost:7071/api/tts-router
# analytics-writer: [POST] http://localhost:7071/api/analytics-writer
# flag-handler: [POST] http://localhost:7071/api/flag-handler
# auth-layer: [POST] http://localhost:7071/api/auth-layer
```

### Test Each Function (Terminal 2)

**Test tts-router:**
```bash
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

**Test analytics-writer:**
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

**Test analytics-writer with PII (should fail):**
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

**Test flag-handler:**
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

**Run flag-handler 6 times to test escalation:**
```bash
for i in {1..6}; do
  echo "Flag attempt $i:"
  curl -X POST http://localhost:7071/api/flag-handler \
    -H "Content-Type: application/json" \
    -d '{
      "word": "photosynthesis",
      "language": "dari",
      "sessionToken": "test-session-001",
      "pilotId": "PCSD-2026",
      "timestamp": "2026-03-15T14:30:00Z"
    }'
  echo ""
done
```

---

## Part 9: Deploy to Azure

### Create Function App

```bash
az functionapp create \
  --resource-group languagebridge-rg \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name lb-backend-functions \
  --storage-account languagbridgeaudio
```

### Set Environment Variables

```bash
cd ~/projects/languagebridge-rebuild

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

### Deploy Functions

```bash
cd ~/projects/languagebridge-rebuild/backend
npx func azure functionapp publish lb-backend-functions

# You should see:
# Deployment successful.
# tts-router published to https://lb-backend-functions.azurewebsites.net/api/tts-router
# etc.
```

---

## Part 10: Validation Tests

### Test Production Endpoints

**Test tts-router:**
```bash
curl -X POST https://lb-backend-functions.azurewebsites.net/api/tts-router \
  -H "Content-Type: application/json" \
  -d '{
    "text": "hello world",
    "language": "dari",
    "pilotId": "PCSD-2026",
    "sessionToken": "prod-test-001"
  }'
```

**Test analytics-writer:**
```bash
curl -X POST https://lb-backend-functions.azurewebsites.net/api/analytics-writer \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "prod-test-001",
    "pilotId": "PCSD-2026",
    "language": "dari",
    "eventType": "tts_request",
    "timestamp": "2026-03-15T14:30:00Z",
    "extensionVersion": "2.0.0"
  }'
```

### Verify Cosmos DB

```bash
# In Azure Portal:
# 1. Go to languagebridge-cosmos
# 2. Click "Data Explorer"
# 3. Click "languagebridge-prod" database
# 4. Click "sessions" collection
# 5. Click "New SQL Query"
# 6. Paste this:
SELECT * FROM c ORDER BY c._ts DESC LIMIT 10
# 7. Click "Execute Query"
# You should see your analytics events!
```

### Final Commit

```bash
cd ~/projects/languagebridge-rebuild

git add .
git commit -m "feat: complete Phase 2 backend rebuild with Azure Functions deployment"
git push origin main

# Verify on GitHub
# Go to https://github.com/languagebridge-llc/languagebridge-rebuild
# Click "Commits" and see your latest commit at the top
```

---

## Troubleshooting

### npm install fails

```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### TypeScript won't compile

```bash
npm run type-check:backend
# Read the error message carefully
# It tells you exactly what is wrong
```

### Azure CLI not found

```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm
```

### func start fails

```bash
# Make sure you're in the right directory
cd ~/projects/languagebridge-rebuild/backend

# Make sure TypeScript is compiled
npm run build:backend

# Make sure all function.json files exist
ls azure-functions/*/function.json

# Should show:
# azure-functions/analytics-writer/function.json
# azure-functions/auth-layer/function.json
# azure-functions/flag-handler/function.json
# azure-functions/tts-router/function.json
```

### Cosmos DB connection fails

```bash
# Verify credentials in .env
grep COSMOS_DB .env

# Should show real endpoint and key, not placeholders

# Try connecting manually
npx @azure/cosmos --endpoint https://your-cosmos.documents.azure.com --key your-key
```

### Functions not showing when func start runs

```bash
# Make sure all TypeScript files are created
# Check that every index.ts file exists

ls backend/azure-functions/*/index.ts
# Should show:
# backend/azure-functions/analytics-writer/index.ts
# backend/azure-functions/auth-layer/index.ts
# backend/azure-functions/flag-handler/index.ts
# backend/azure-functions/tts-router/index.ts

# If any are missing, create them from the LB-BUILD-VOL2 document
```

### SSH key not working

```bash
# Test SSH connection
ssh -T git@github.com

# Should return:
# Hi [your-github-username]! You've successfully authenticated, but GitHub does not provide shell access.

# If this fails, follow Volume 1 Part 5 to set up SSH keys
```

---

## Quick Commands Cheat Sheet

```bash
# Start from anywhere and go to project root
cd ~/projects/languagebridge-rebuild

# Install dependencies
npm run install-all

# Compile TypeScript
npm run build:backend

# Type check (no compile)
npm run type-check:backend

# Start local Azure Functions
cd backend && npx func start

# Deploy to Azure
cd backend && npx func azure functionapp publish lb-backend-functions

# View logs
func azure functionapp logstream lb-backend-functions

# Stop local server (in the terminal running func start)
# Press Ctrl+C

# Git workflow
git status
git add .
git commit -m "your message"
git push origin main
```

---

**LanguageBridge LLC | Command Reference | March 2026**

Justin Bernard - justin@languagebridge.app
