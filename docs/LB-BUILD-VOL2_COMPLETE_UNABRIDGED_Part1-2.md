# LanguageBridge LLC: The Phase 2 Bootcamp
## Volume 2: The Complete Backend Rebuild
### TypeScript, Azure Functions, Cosmos DB, Blob Storage & The Art of the API

**LB-BUILD-VOL2 | v3.0 COMPLETE | March 2026 | Confidential**

**Justin's Primary Track | Prentice Reads Along (API Contract Understanding)**

---

## Table of Contents

- [Part 0: The Mission](#part-0-the-mission)
- [Part 1: TypeScript Mastery](#part-1-typescript-mastery)
- [Part 2: Project Initialization & Environment Setup](#part-2-project-initialization)
- [Part 3: Cosmos DB & Azure Blob Storage](#part-3-database-and-storage)
- [Part 4: Building tts-router](#part-4-tts-router)
- [Part 5: Building analytics-writer](#part-5-analytics-writer)
- [Part 6: Building flag-handler](#part-6-flag-handler)
- [Part 7: Building auth-layer](#part-7-auth-layer)
- [Part 8: Local Testing & Debugging](#part-8-local-testing)
- [Part 9: Azure Deployment](#part-9-azure-deployment)
- [Part 10: Validation Checklist](#part-10-validation-checklist)

---

## Part 0: The Mission

In Naruto, the Sharingan lets you copy techniques by watching. Prentice, you are the Sharingan in this volume. You read every line Justin builds, because understanding what the backend does is how you know what to send from the extension and what to expect back. You are not just watching. You are learning the shape of the API so that when Volume 3 starts, you wire into it without asking a single question.

### What We Are Building

This volume builds the brain of LanguageBridge. The Chrome extension is the face. The backend is the brain. Every request from every student at every school passes through what you build here.

By the end of this volume, Justin will have built and deployed four Azure Functions that replace the current Netlify proxy layer. These functions do not just pass requests through. They implement real application logic: checking proprietary models before calling Azure, writing structured analytics to Cosmos DB, processing flags with threshold escalation, and enforcing pilot-level permissions.

| Part | What You Build |
|------|----------------|
| Part 1 | TypeScript from scratch. What it is, why it matters, how to read and write it. |
| Part 2 | Project initialization. npm, tsconfig, shared types, environment variables, folder structure. |
| Part 3 | Cosmos DB and Blob Storage setup. Creating collections, understanding NoSQL, writing your first documents. |
| Part 4 | **tts-router**: the most important function. Proprietary audio first, Azure fallback, caching logic. |
| Part 5 | **analytics-writer**: anonymous session logging with PII prevention built into the types. |
| Part 6 | **flag-handler**: flag processing with threshold logic and auto-escalation. |
| Part 7 | **auth-layer**: Supabase JWT validation and pilot-level data isolation. |
| Part 8 | Local testing. Running all four functions, testing with curl, debugging common errors. |
| Part 9 | Deploying to Azure. Publishing, environment variables, production testing. |
| Part 10 | Validation checklist. Every test that must pass before Volume 3. |

### Prerequisites for This Volume

Before you start, confirm you have:

- **Volume 1 complete** (all commands executed, all checkpoints passed)
- **Node.js v22+** installed: `node --version` (should return `v22.0.0` or higher)
- **TypeScript globally installed**: `npm install -g typescript`
- **Azure Functions Core Tools**: `npm install -g azure-functions-core-tools@4 --unsafe-perm`
- **Azure CLI installed and logged in**: `az login` (completes successfully)
- **SSH keys configured**: `ssh -T git@github.com` (returns "Hi [username]! You've successfully authenticated")
- **VS Code or your preferred editor** ready
- **Access to Azure subscription** with resource group created
- **Supabase project** created with JWT configured
- **Two MacBooks** (M4 preferred) with identical setup

If any of these fail, return to Volume 1 Part 5 and complete the checkpoint quiz.

---

## Part 1: TypeScript Mastery

### What Is TypeScript?

TypeScript is JavaScript with type annotations. That is it. Every TypeScript file compiles down to plain JavaScript. The browser and Node.js never see TypeScript directly. They run the compiled JavaScript. The types exist only during development to catch errors before they reach production.

### The Problem TypeScript Solves

In JavaScript, you can do this:

```javascript
let studentCount = 20;
studentCount = 'twenty'; // JavaScript: totally fine. No error.
```

This is a bug waiting to happen. Somewhere later in your code, you try to do math with studentCount and it fails silently or gives NaN (Not a Number).

In TypeScript:

```typescript
let studentCount: number = 20;
studentCount = 'twenty'; // TypeScript: ERROR. Type 'string' is not assignable to type 'number'.
```

TypeScript catches the bug immediately, before you even run the code. This is called static type checking. It is like having a sensei who watches your form during training and corrects you before you develop bad habits.

### The Types You Need to Know

#### Primitive Types

```typescript
let name: string = 'Justin'; // Text
let age: number = 35; // Numbers (integer or decimal)
let isAdmin: boolean = true; // true or false
let nothing: null = null; // Intentionally empty
let notSet: undefined = undefined; // Not yet assigned
```

#### Arrays

```typescript
let languages: string[] = ['dari', 'pashto', 'arabic'];
let flagCounts: number[] = [1, 3, 7, 12];
```

The type goes before the brackets. `string[]` means "an array where every item is a string." If you try to push a number into a string array, TypeScript stops you.

#### Objects and Interfaces

Most of your data will be objects. TypeScript lets you define the exact shape of an object using a `type` or `interface`:

```typescript
type TTSRequest = {
  text: string; // The text the student selected
  language: string; // Target language code
  pilotId: string; // Which district pilot
  sessionToken: string; // Anonymous device UUID
};
```

Now when you create a TTSRequest, TypeScript enforces the shape:

```typescript
const request: TTSRequest = {
  text: 'photosynthesis',
  language: 'dari',
  pilotId: 'PCSD-2026',
  sessionToken: 'abc-123-def-456',
};
```

If you forget a field or add a typo, TypeScript tells you immediately. This is why we define types BEFORE writing functions. The types are the contract. The functions are the implementation.

#### Union Types (Pick One)

```typescript
type EventType = 'session_start' | 'tts_request' | 'flag_event' | 'session_end';
```

This means eventType can ONLY be one of those four values. If you accidentally type `'sesion_start'` (typo), TypeScript catches it. This is incredibly powerful for preventing silent bugs.

#### Optional Fields

```typescript
type ModelRegistryDoc = {
  id: string;
  language: string;
  modelVersion?: string; // The ? means this field is optional
};
```

The question mark after modelVersion means you can create a document with or without it. Required fields have no question mark.

#### Functions with Types

```typescript
function generateHash(text: string, language: string): string {
  // Parameters have types. Return value has a type after the colon.
  return crypto.createHash('sha256').update(`${text}::${language}`).digest('hex');
}
```

The function says: "I take two strings and I return a string." If you try to pass a number, or if you forget to return a string, TypeScript catches it.

#### Async/Await with Types

```typescript
async function getAudio(text: string, lang: string): Promise<string> {
  const response = await axios.post(azureUrl, { text, lang }); // Wait for Azure
  return response.data.audioUrl; // Then continue
}
```

The `async` keyword means the function contains `await` calls. `await` pauses execution until the promise resolves. `Promise<string>` means the function eventually returns a string.

### Practice: Write Your First Types

Create a practice file:

```bash
mkdir -p ~/projects/playground
touch ~/projects/playground/types-practice.ts
```

In `types-practice.ts`, write these types:

```typescript
// 1. A type for a student
type Student = {
  id: string;
  name: string; // First and last name
  language: string; // Dari, Pashto, etc.
  gradeLevel: number; // 5-12
  isSLIFE: boolean; // Interrupted formal education?
  enrollmentDate: string; // ISO 8601 format: "2026-03-15"
};

// 2. A type for a language
type Language = {
  code: string; // 'dari', 'pashto', 'arabic'
  englishName: string; // 'Dari', 'Pashto', 'Arabic'
  nativeScript: string; // Script name
  studentsSupported: number; // How many students speak it
};

// 3. A type for a flag event
type FlagEvent = {
  id: string;
  word: string; // The word that was flagged
  language: string; // The language
  audioUrl: string; // Where the audio is stored
  sessionToken: string; // Anonymous session ID
  timestamp: string; // ISO 8601 format
  reason?: string; // Optional: why the student flagged it
};

// 4. A function signature
function calculateEnglishProficiency(
  sessionMinutes: number,
  testScore: number,
  submittedAssignments: number
): number {
  // Return a proficiency score (0-100)
  return (testScore * 0.5) + (Math.min(sessionMinutes, 300) * 0.167) + (submittedAssignments * 0.333);
}

// 5. Test your types
const student: Student = {
  id: 'STU-001',
  name: 'Amira Hassan',
  language: 'dari',
  gradeLevel: 7,
  isSLIFE: true,
  enrollmentDate: '2026-01-15',
};

const dariLanguage: Language = {
  code: 'dari',
  englishName: 'Dari',
  nativeScript: 'Dari script (variant of Persian)',
  studentsSupported: 8,
};

const flagEvent: FlagEvent = {
  id: 'FLAG-001',
  word: 'photosynthesis',
  language: 'dari',
  audioUrl: 'https://cache.languagebridge.app/dari/photosynthesis.mp3',
  sessionToken: 'abc-123-def-456',
  timestamp: '2026-03-15T14:30:00Z',
  reason: 'Pronunciation sounds off, not matching any plant-related words I know',
};

const proficiency = calculateEnglishProficiency(120, 85, 12);
console.log(`Student proficiency: ${proficiency}`);
```

Compile this with:

```bash
cd ~/projects/playground
npx tsc types-practice.ts
```

You should see a new file `types-practice.js` created. This is the compiled JavaScript. Open it and see how TypeScript transforms your types into empty objects.

**Homework: Write a type called `AdminUser` with fields: `id` (string), `email` (string), `pilotId` (string), `permissions` (array of strings like 'view_dashboard', 'export_data', 'manage_flags'), and `isSuper-Admin` (boolean). Then write a function `canUserAccessPilot(user: AdminUser, targetPilotId: string): boolean` that returns true if the user is a super-admin or if their pilotId matches the targetPilotId.**

---

## Part 2: Project Initialization

This is where you set up the actual rebuild repository with the folder structure, configuration files, and root-level setup that connects to both your backend and Prentice's frontend.

### Step 1: Verify Your GitHub Organization

First, ensure you have a GitHub organization called `languagebridge-llc`. If you do not have one yet:

```bash
# Go to github.com and create the organization manually
# Name it: languagebridge-llc
# Confirm you can access it at github.com/languagebridge-llc
```

Verify your organization access:

```bash
curl -H "Authorization: token $(git config user.token)" \
  https://api.github.com/user/orgs
```

### Step 2: Create the Central Repository

On GitHub.com, create a new repository in your organization:

- **Repository name:** `languagebridge-rebuild`
- **Description:** "Phase 2 Backend Rebuild: Azure Functions, Cosmos DB, Kokoro ML Pipeline"
- **Visibility:** Private (you can change to public later)
- **Initialize with:** None (we will push from local)

After creation, you should have: `https://github.com/languagebridge-llc/languagebridge-rebuild`

### Step 3: Clone the Repository Locally

```bash
cd ~/projects
git clone git@github.com:languagebridge-llc/languagebridge-rebuild.git
cd languagebridge-rebuild
```

Verify you are in the correct directory:

```bash
pwd
# Should output: /Users/YourUsername/projects/languagebridge-rebuild

git remote -v
# Should show:
# origin  git@github.com:languagebridge-llc/languagebridge-rebuild.git (fetch)
# origin  git@github.com:languagebridge-llc/languagebridge-rebuild.git (push)
```

### Step 4: Create Root-Level Folder Structure

Create all directories:

```bash
# Backend folders
mkdir -p backend/azure-functions/{tts-router,analytics-writer,flag-handler,auth-layer}
mkdir -p backend/shared
mkdir -p backend/__tests__/{unit,integration}

# Extension folders (for Prentice)
mkdir -p extension/src/{ui,api,utils}
mkdir -p extension/public/assets
mkdir -p extension/__tests__

# PWA folders (for Prentice)
mkdir -p pwa/src/{pages,components,hooks,utils}
mkdir -p pwa/public
mkdir -p pwa/__tests__

# ML Pipeline folders
mkdir -p ml-pipeline/{notebooks,scripts,models,registry,data}
mkdir -p ml-pipeline/__tests__

# Documentation
mkdir -p docs

# Integration tests (both frontend and backend)
mkdir -p tests/{integration,e2e}

# Root config files (no content yet)
touch .gitignore .env.example README.md tsconfig.json tsconfig.backend.json

# Create .gitkeep files to ensure empty folders are tracked
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
```

Verify the structure:

```bash
tree -L 3 -I 'node_modules'
```

You should see a clean tree structure with all your folders created.

### Step 5: Create `.gitignore`

This file tells Git what NOT to commit. This is critical for security (never commit API keys).

```bash
cat > .gitignore << 'EOF'
# Environment & Secrets
.env
.env.local
.env.*.local
.env.production

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
package-lock.json
yarn.lock

# Build artifacts
dist/
build/
.next/
out/
.nuxt/
.cache/
.vuepress/dist/
.serverless/
.fusebox/
.dynamodb/
.tern-port

# IDE & Editor
.vscode/
.idea/
*.swp
*.swo
*~
*.sublime-project
*.sublime-workspace
.DS_Store
.AppleDouble
.LSOverride
Thumbs.db

# Testing
coverage/
.nyc_output/
*.lcov

# ML Models & Large Files (NEVER commit these)
ml-pipeline/models/**/*
!ml-pipeline/models/.gitkeep
ml-pipeline/data/**/*
!ml-pipeline/data/.gitkeep

# Temporary
tmp/
temp/
*.tmp

# OS
.DS_Store
.AppleDouble
.LSOverride
Thumbs.db
ehthumbs.db

# Logs
logs/
*.log

# Azure Functions local
local.settings.json
.funcignore
EOF
```

Verify the file was created:

```bash
cat .gitignore
```

### Step 6: Create `package.json` (Root Workspace)

This is your monorepo configuration. It defines how npm manages all four subdirectories (backend, extension, pwa, ml-pipeline).

```bash
cat > package.json << 'EOF'
{
  "name": "languagebridge-rebuild",
  "version": "2.0.0",
  "description": "LanguageBridge Phase 2: Complete backend rebuild with Azure Functions, Cosmos DB, and Kokoro ML pipeline",
  "private": true,
  "author": "Justin Bernard <justin@languagebridge.app> & Prentice Howard <prentice@languagebridge.app>",
  "license": "PROPRIETARY",
  "homepage": "https://github.com/languagebridge-llc/languagebridge-rebuild",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/languagebridge-llc/languagebridge-rebuild.git"
  },
  "workspaces": [
    "backend",
    "extension",
    "pwa",
    "ml-pipeline"
  ],
  "scripts": {
    "setup": "npm install && npm run setup --workspaces",
    "install-all": "npm install --workspaces",
    "dev:backend": "npm run dev --workspace=backend",
    "dev:pwa": "npm run dev --workspace=pwa",
    "build": "npm run build --workspaces",
    "build:backend": "npm run build --workspace=backend",
    "build:pwa": "npm run build --workspace=pwa",
    "test": "npm test --workspaces",
    "test:backend": "npm test --workspace=backend",
    "lint": "npm run lint --workspaces",
    "lint:backend": "npm run lint --workspace=backend",
    "type-check": "npx tsc --noEmit",
    "type-check:backend": "npx tsc --noEmit --project tsconfig.backend.json"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1",
    "typescript": "^5.3.3"
  }
}
EOF
```

Verify the file was created:

```bash
cat package.json | head -20
```

### Step 7: Create `tsconfig.json` (Root TypeScript Config)

This tells TypeScript how to compile all TypeScript files in the project.

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  },
  "include": [
    "backend/**/*.ts",
    "ml-pipeline/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "extension",
    "pwa"
  ]
}
EOF
```

### Step 8: Create `tsconfig.backend.json` (Backend-Specific Config)

```bash
cat > tsconfig.backend.json << 'EOF'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./backend/dist",
    "rootDir": "./backend"
  },
  "include": ["backend/**/*.ts"],
  "exclude": ["node_modules", "backend/dist"]
}
EOF
```

### Step 9: Create `.env.example`

This is a template that shows what environment variables are needed. You will NOT commit your real .env file.

```bash
cat > .env.example << 'EOF'
# ============================================
# LanguageBridge Backend: Environment Variables
# ============================================
# Instructions:
# 1. Copy this file to .env: cp .env.example .env
# 2. Fill in REAL values for your Azure subscription
# 3. NEVER commit .env to GitHub
# 4. Add .env to .gitignore (already done)

# ============================================
# AZURE SUBSCRIPTION
# ============================================
AZURE_SUBSCRIPTION_ID=your_subscription_id_here
AZURE_TENANT_ID=your_tenant_id_here
AZURE_CLIENT_ID=your_service_principal_client_id_here
AZURE_CLIENT_SECRET=your_service_principal_secret_here
AZURE_RESOURCE_GROUP=languagebridge-rg
AZURE_REGION=eastus

# ============================================
# COSMOS DB (NoSQL Database)
# ============================================
COSMOS_DB_ENDPOINT=https://your-cosmos-account.documents.azure.com:443/
COSMOS_DB_KEY=your_cosmos_primary_key_here
COSMOS_DB_DATABASE=languagebridge-prod
COSMOS_DB_CONN_STRING=AccountEndpoint=https://your-cosmos.documents.azure.com:443/;AccountKey=your_key;

# ============================================
# AZURE BLOB STORAGE (Audio Cache & Files)
# ============================================
AZURE_STORAGE_ACCOUNT=languagebridge
AZURE_STORAGE_KEY=your_storage_account_key_here
AZURE_STORAGE_CONTAINER_AUDIO=tts-audio-cache
AZURE_STORAGE_CONTAINER_FLAGS=flag-data
AZURE_BLOB_CONN_STRING=DefaultEndpointsProtocol=https;AccountName=your_account;AccountKey=your_key;EndpointSuffix=core.windows.net

# ============================================
# AZURE COGNITIVE SERVICES (Translation & TTS)
# ============================================
AZURE_TRANSLATOR_KEY=your_translator_api_key_here
AZURE_TRANSLATOR_REGION=eastus
AZURE_TRANSLATOR_ENDPOINT=https://eastus.api.cognitive.microsoft.com/

AZURE_TTS_KEY=your_tts_api_key_here
AZURE_TTS_REGION=eastus
AZURE_TTS_ENDPOINT=https://eastus.tts.speech.microsoft.com

AZURE_SPEECH_KEY=your_speech_recognition_key_here
AZURE_SPEECH_REGION=eastus

# ============================================
# SUPABASE (Auth: Teachers & Admins)
# ============================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here

# ============================================
# APPLICATION SECRETS
# ============================================
ADMIN_API_KEY=change_this_to_random_string_in_production
SESSION_SECRET=change_this_to_random_string_in_production

# ============================================
# ENVIRONMENT
# ============================================
NODE_ENV=development
# Set to "production" when deploying to Azure

# ============================================
# PILOT CONFIGURATION
# ============================================
PILOT_ID_GREENBRIAR=PCSD-2026
PILOT_NAME_GREENBRIAR=Greenbriar Middle School
PILOT_TIMEZONE=America/New_York

# ============================================
# FEATURE FLAGS
# ============================================
ENABLE_PROPRIETARY_MODELS=true
ENABLE_FLAG_SYSTEM=true
ENABLE_ANALYTICS_LOGGING=true
ENABLE_SUPABASE_AUTH=true

# ============================================
# LOGGING & MONITORING
# ============================================
LOG_LEVEL=debug
# Options: debug, info, warn, error
EOF
```

Verify the file was created:

```bash
wc -l .env.example
# Should show approximately 85 lines
```

### Step 10: Create Root `README.md`

```bash
cat > README.md << 'EOF'
# LanguageBridge LLC: Phase 2 Backend Rebuild

**Status:** Pre-revenue SaaS | Greenbriar Middle School pilot (20 SLIFE students, live)

**Current Version:** v1.0.6-alpha (live on Netlify)

**Rebuild Target:** v2.0.0 (Azure Functions, Cosmos DB, Kokoro ML pipeline)

## Quick Start

### Prerequisites

- Node.js v22+
- Azure CLI logged in: `az login`
- Supabase project created
- SSH keys configured for GitHub

### First-Time Setup

```bash
# Clone this repository (you already have it)
cd ~/projects/languagebridge-rebuild

# Copy environment template
cp .env.example .env

# Edit .env with your real Azure credentials
nano .env

# Install all dependencies
npm run install-all

# Verify TypeScript compiles
npm run type-check
```

### Running Locally

**Backend (Azure Functions):**

```bash
npm run dev:backend
# Functions available at http://localhost:7071
```

**PWA (React Admin Dashboard):**

```bash
npm run dev:pwa
# Dashboard available at http://localhost:5173
```

### Building for Production

```bash
npm run build
```

### Running Tests

```bash
npm test
npm test:backend
```

## Project Structure

```
languagebridge-rebuild/
├── backend/                    # Azure Functions (Justin's domain)
│   ├── azure-functions/        # The four core functions
│   │   ├── tts-router/        # Route TTS requests to proprietary or Azure
│   │   ├── analytics-writer/  # Log anonymous session events
│   │   ├── flag-handler/      # Process pronunciation flags
│   │   └── auth-layer/        # Validate Supabase JWTs
│   ├── shared/                # Shared types & utilities
│   └── __tests__/             # Unit & integration tests
│
├── extension/                 # Chrome Extension (Prentice's domain)
│   ├── src/                   # Vanilla JS (no build step)
│   │   ├── ui/               # Toolbar, popup, CSS
│   │   ├── api/              # API client
│   │   └── utils/            # Helpers
│   ├── manifest.json         # Chrome MV3 manifest
│   └── __tests__/            # Extension tests
│
├── pwa/                       # React Admin Dashboard (Prentice's domain)
│   ├── src/                   # React components & pages
│   │   ├── pages/            # Dashboard, reports
│   │   └── components/       # Reusable UI
│   └── __tests__/            # PWA tests
│
├── ml-pipeline/               # Kokoro Fine-Tuning (Justin's domain)
│   ├── notebooks/            # Jupyter notebooks
│   ├── scripts/              # Python training scripts
│   ├── models/               # Fine-tuned weights (DO NOT COMMIT)
│   └── registry/             # Model manifest & metadata
│
├── tests/                      # Integration & E2E tests
│   ├── integration/           # Backend + DB tests
│   └── e2e/                  # Full system tests
│
├── docs/                       # Architecture & setup guides
│   ├── ARCHITECTURE.md        # System design
│   ├── API_REFERENCE.md       # Function signatures
│   └── DEPLOYMENT.md          # Azure setup
│
├── .env.example               # Environment variable template
├── .gitignore                 # Git ignore rules
├── package.json               # Root workspace config
├── tsconfig.json              # TypeScript config
└── README.md                  # This file
```

## The Four Azure Functions (Backend)

| Function | Purpose | Input | Output |
|----------|---------|-------|--------|
| **tts-router** | Route audio requests to proprietary models first, Azure fallback | `{ text, language, sessionToken, pilotId }` | `{ audioUrl, source: 'proprietary'\|'azure_cache'\|'azure_live' }` |
| **analytics-writer** | Log anonymous session events (no PII) | `{ sessionToken, language, eventType, timestamp, extensionVersion, pilotId }` | `{ logged: true, eventId: string }` |
| **flag-handler** | Process pronunciation flags with threshold escalation | `{ word, language, sessionToken, pilotId, timestamp }` | `{ flagId: string, count: number, status: 'logged'\|'review'\|'bounty'\|'high_priority' }` |
| **auth-layer** | Validate Supabase JWTs and return user context | `{ Authorization: 'Bearer [token]' }` | `{ userId: string, email: string, accessiblePilotIds: string[], isSuper-Admin: boolean }` |

## API Contracts (What Prentice Needs)

### Endpoint: POST /api/tts-router

**Request:**
```json
{
  "text": "photosynthesis",
  "language": "dari",
  "pilotId": "PCSD-2026",
  "sessionToken": "abc-123-def-456"
}
```

**Response (200):**
```json
{
  "audioUrl": "https://cache.azurewebsites.net/audio/dari/photosynthesis.mp3",
  "source": "proprietary",
  "durationMs": 2400,
  "cached": false
}
```

**Response (400):**
```json
{
  "error": "MISSING_FIELDS",
  "details": "text, language, pilotId, sessionToken are required"
}
```

### Endpoint: POST /api/analytics-writer

**Request:**
```json
{
  "sessionToken": "abc-123-def-456",
  "pilotId": "PCSD-2026",
  "language": "dari",
  "eventType": "tts_request",
  "timestamp": "2026-03-15T14:30:00Z",
  "extensionVersion": "2.0.0"
}
```

**Response (200):**
```json
{
  "logged": true,
  "eventId": "EVENT-12345"
}
```

**Response (400):**
```json
{
  "error": "PII_VIOLATION",
  "details": "Payload contains prohibited fields: email, name"
}
```

### Endpoint: POST /api/flag-handler

**Request:**
```json
{
  "word": "photosynthesis",
  "language": "dari",
  "sessionToken": "abc-123-def-456",
  "pilotId": "PCSD-2026",
  "timestamp": "2026-03-15T14:30:00Z"
}
```

**Response (200):**
```json
{
  "flagId": "FLAG-12345",
  "flagCount": 6,
  "status": "bounty",
  "requiresReview": true
}
```

### Endpoint: POST /api/auth-layer

**Request:**
```
Headers:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200):**
```json
{
  "userId": "USER-001",
  "email": "teacher@parma.k12.oh.us",
  "accessiblePilotIds": ["PCSD-2026"],
  "isSuper-Admin": false
}
```

**Response (401):**
```json
{
  "error": "INVALID_TOKEN",
  "details": "Token is expired or invalid"
}
```

## Developers

- **Justin Bernard** (CEO, Backend & ML) - `justin@languagebridge.app`
- **Prentice Howard** (CTO/Co-Founder, Frontend) - `prentice@languagebridge.app`

## Compliance & Legal

- **FERPA:** Student data is never collected. Session tokens are anonymous UUIDs.
- **COPPA:** No user tracking. No marketing data collection.
- **Ohio SB 29:** Technical audit passed January 2026.
- **Supabase:** Teachers/admins use Google SSO. No direct password storage.

## Git Workflow

1. **Create a feature branch:** `git checkout -b feat/your-feature-name`
2. **Make commits:** `git commit -m "feat: describe what you did"`
3. **Push branch:** `git push origin feat/your-feature-name`
4. **Create Pull Request:** Go to GitHub and request review
5. **Never push to main directly.** Require pull request review.

## Troubleshooting

### Cannot install dependencies

```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### TypeScript errors on build

```bash
npm run type-check
# Read the errors carefully. They tell you exactly what is wrong.
```

### Azure CLI not found

```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm
```

### SSH key not working

```bash
ssh -T git@github.com
# If this fails, re-read Volume 1 Part 5
```

## Next Steps

1. **Complete Part 2 Initialization** (this part)
2. **Part 3:** Set up Cosmos DB and test database connections
3. **Part 4-7:** Build the four Azure Functions
4. **Part 8:** Local testing with curl
5. **Part 9:** Deploy to Azure
6. **Part 10:** Validation checklist before Volume 3

---

**LanguageBridge LLC | Confidential | March 2026**

Contact: justin@languagebridge.app | prentice@languagebridge.app
EOF
```

### Step 11: Create Initial Git Commit

```bash
git add -A
git commit -m "feat: initialize Phase 2 rebuild structure with folders, configs, and documentation"
git push origin main
```

Verify the push:

```bash
git log --oneline | head -5
# Should show your new commit at the top
```

### Step 12: Create Backend `package.json`

Now create the package.json specifically for the backend workspace:

```bash
cat > backend/package.json << 'EOF'
{
  "name": "@languagebridge/backend",
  "version": "2.0.0",
  "description": "Azure Functions backend: tts-router, analytics-writer, flag-handler, auth-layer",
  "main": "dist/index.js",
  "scripts": {
    "dev": "func start",
    "build": "tsc --project tsconfig.backend.json",
    "start": "npm run build && func start",
    "test": "jest --config jest.config.js",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts",
    "type-check": "tsc --noEmit --project tsconfig.backend.json",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@azure/cosmos": "^4.0.0",
    "@azure/functions": "^4.5.0",
    "@azure/storage-blob": "^12.17.0",
    "@supabase/supabase-js": "^2.38.0",
    "axios": "^1.6.0",
    "crypto": "^1.0.1"
  },
  "devDependencies": {
    "@jest/globals": "^29.7.0",
    "@types/jest": "^29.5.8",
    "@types/node": "^20.10.0",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "eslint": "^8.56.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.1",
    "typescript": "^5.3.3"
  }
}
EOF
```

### Step 13: Create `backend/shared/types.ts`

This is the most important file. All TypeScript types that flow through your API are defined here. This is what Prentice will use to write the extension.

```bash
cat > backend/shared/types.ts << 'EOF'
/**
 * LanguageBridge Shared Types
 *
 * All types that flow between the Azure Functions and clients are defined here.
 * This file is the CONTRACT that Prentice (frontend) uses to understand what
 * the backend expects and what it returns.
 *
 * Never add PII types here. Never add fields that contain student names, emails, or IDs.
 * Session tokens are the ONLY identifier. Everything else is anonymous.
 */

// ============================================
// REQUEST TYPES (What clients send to backend)
// ============================================

export type TTSRequest = {
  text: string; // The text to translate to audio (max 500 chars)
  language: string; // Language code: 'dari', 'pashto', 'arabic', 'ukrainian', 'somali'
  pilotId: string; // Which school pilot: 'PCSD-2026', etc.
  sessionToken: string; // Anonymous device UUID
  extensionVersion?: string; // e.g. '2.0.0' (optional, for debugging)
};

export type AnalyticsWriterRequest = {
  sessionToken: string; // Anonymous device UUID
  pilotId: string; // Which school pilot
  language: string; // Which language was used
  eventType: 'session_start' | 'tts_request' | 'flag_event' | 'session_end' | 'glossary_view'; // Event type
  timestamp: string; // ISO 8601: "2026-03-15T14:30:00Z"
  extensionVersion: string; // Version of the extension that sent this
  // NEVER add: email, name, studentId, schoolId, or any PII
};

export type FlagEventRequest = {
  word: string; // The word that was flagged
  language: string; // Language code
  sessionToken: string; // Anonymous device UUID
  pilotId: string; // Which school pilot
  timestamp: string; // ISO 8601 format
  audioUrl?: string; // URL of the audio that was flagged (optional)
};

export type AuthRequest = {
  // Authorization header contains JWT: "Bearer eyJhbGc..."
  // Extracted and validated by auth-layer function
};

// ============================================
// RESPONSE TYPES (What backend returns)
// ============================================

export type TTSResponse = {
  audioUrl: string; // URL to play the audio
  source: 'proprietary' | 'azure_cache' | 'azure_live'; // Where the audio came from
  durationMs: number; // How long the audio is (milliseconds)
  cached: boolean; // Was this pulled from cache?
  textHash?: string; // SHA-256 hash of (text + language) for deduplication
};

export type TTSErrorResponse = {
  error:
    | 'MISSING_FIELDS'
    | 'INVALID_LANGUAGE'
    | 'TEXT_TOO_LONG'
    | 'RATE_LIMITED'
    | 'QUOTA_EXCEEDED'
    | 'AZURE_SERVICE_ERROR'
    | 'INTERNAL_ERROR';
  details: string; // Human-readable error explanation
  code?: number; // Internal error code for debugging
};

export type AnalyticsWriterResponse = {
  logged: true; // Confirm the event was logged
  eventId: string; // Reference ID
  timestamp: string; // Server timestamp
};

export type AnalyticsWriterErrorResponse = {
  error: 'PII_VIOLATION' | 'INVALID_EVENT_TYPE' | 'MISSING_FIELDS' | 'INTERNAL_ERROR';
  details: string;
  prohibitedFields?: string[]; // If PII_VIOLATION, which fields were problematic
};

export type FlagHandlerResponse = {
  flagId: string; // Unique identifier for this flag
  flagCount: number; // Total flags for this word (cumulative)
  status: 'logged' | 'review' | 'bounty' | 'high_priority'; // Flag escalation status
  requiresReview: boolean; // Should this be reviewed?
  bountyValue?: number; // If status is 'bounty', what is the bounty? (Phase 3)
};

export type FlagHandlerErrorResponse = {
  error: 'MISSING_FIELDS' | 'INVALID_LANGUAGE' | 'INTERNAL_ERROR';
  details: string;
};

export type AuthResponse = {
  userId: string; // Unique user ID from Supabase
  email: string; // User's email (from Supabase)
  accessiblePilotIds: string[]; // Pilot IDs this user can access
  isSuper-Admin: boolean; // True if email ends with @languagebridge.app
  permissions: string[]; // e.g. ['view_dashboard', 'export_data', 'manage_flags']
};

export type AuthErrorResponse = {
  error: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_TOKEN' | 'INTERNAL_ERROR';
  details: string;
};

// ============================================
// COSMOS DB DOCUMENT TYPES
// ============================================

export type SessionUsageDoc = {
  id: string; // Unique ID (UUID)
  sessionToken: string; // Anonymous session UUID
  pilotId: string; // Which school
  language: string; // Which language
  eventType: string; // Type of event
  timestamp: string; // When it happened
  extensionVersion: string; // Version of extension
  // Never include: student name, email, or identifying info
};

export type FlagDoc = {
  id: string; // Generated from (word + language) hash for deduplication
  word: string; // The flagged word
  language: string; // Language code
  flagCount: number; // How many times flagged
  status: 'logged' | 'review' | 'bounty' | 'high_priority'; // Escalation status
  pilotIds: string[]; // Which pilots reported this flag
  audioUrl?: string; // URL of the problematic audio
  createdAt: string; // ISO 8601
  lastFlaggedAt: string; // ISO 8601
  requiresReview: boolean;
};

export type ModelRegistryDoc = {
  id: string; // Language code: 'dari', 'pashto', etc.
  language: string; // Full language name
  modelName: string; // e.g. 'Kokoro-82M'
  modelVersion: string; // e.g. '1.0'
  sha256Hash: string; // SHA-256 hash of model weights (proof of ownership)
  trainingDataset: string; // Which dataset was used (e.g. 'Mozilla Common Voice')
  datasetVersion: string; // Version of dataset
  finetuningDate: string; // ISO 8601
  accuracy?: number; // Test accuracy (0-100)
  audioQualityScore?: number; // Internal quality metric
};

export type PilotDoc = {
  id: string; // e.g. 'PCSD-2026'
  name: string; // e.g. 'Greenbriar Middle School'
  district: string; // e.g. 'Parma City Schools'
  adminEmail: string; // Contact email
  studentCount: number; // How many students
  languages: string[]; // Which languages supported
  createdAt: string; // ISO 8601
  contractStartDate: string; // ISO 8601
  contractEndDate: string; // ISO 8601
};

// ============================================
// CONFIGURATION & CONSTANTS
// ============================================

export const SUPPORTED_LANGUAGES = ['dari', 'pashto', 'arabic', 'ukrainian', 'somali'];

export const FLAG_THRESHOLDS = {
  LOGGED: 1, // Initial flag
  REVIEW: 3, // Needs review
  BOUNTY: 6, // Add to bounty board
  HIGH_PRIORITY: 10, // Top of queue
} as const;

export const MAX_TEXT_LENGTH = 500; // Characters

export const CACHE_TTL_HOURS = 90; // How long to keep cached audio

// ============================================
// UTILITY TYPES
// ============================================

export type ErrorResponse = {
  error: string; // Error type
  details: string; // Human-readable message
  code?: number;
  timestamp: string; // When the error occurred
};

export type SuccessResponse<T> = T & {
  timestamp: string; // When the response was generated
};

// Type guard: check if response is an error
export function isErrorResponse(obj: any): obj is ErrorResponse {
  return obj && typeof obj === 'object' && 'error' in obj && 'details' in obj;
}

// Type guard: check if request has no PII
export function hasPII(obj: any): boolean {
  const prohibitedFields = ['email', 'name', 'studentId', 'schoolId', 'userId', 'ssn', 'phone'];
  const keys = Object.keys(obj || {});
  return keys.some((key) => prohibitedFields.includes(key.toLowerCase()));
}

// Utility: Generate SHA-256 hash (for cache keys)
export async function generateHash(text: string, language: string): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(`${text}::${language}`).digest('hex');
}

// Utility: Validate language code
export function isValidLanguage(lang: string): boolean {
  return SUPPORTED_LANGUAGES.includes(lang);
}

// Utility: Generate UUID for session tokens
export function generateSessionToken(): string {
  const { randomUUID } = await import('crypto');
  return randomUUID();
}
EOF
```

Verify the file was created:

```bash
wc -l backend/shared/types.ts
# Should be approximately 250 lines
```

### Step 14: Commit Backend Setup

```bash
git add backend/ tsconfig.backend.json
git commit -m "feat: add backend workspace with shared types and package.json"
git push origin main
```

### Step 15: Install Root Dependencies

```bash
cd ~/projects/languagebridge-rebuild

# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

Wait for this to complete. It may take 2-3 minutes.

Verify installation:

```bash
ls -la node_modules/ | head -20
# Should show hundreds of packages installed

node --version
npm --version
npx tsc --version
```

### Step 16: Verify TypeScript Setup

Test that TypeScript compiles correctly:

```bash
npm run type-check:backend
```

You should see no errors. If there are errors, something went wrong with the installation. Try:

```bash
npm cache clean --force
npm install
npm run type-check:backend
```

### Checkpoint: Part 2 Complete

You have now:

1. Created the central GitHub repository (`languagebridge-rebuild`)
2. Cloned it locally to `~/projects/languagebridge-rebuild`
3. Created the complete folder structure for backend, frontend, PWA, and ML
4. Set up root-level configuration (package.json, tsconfig.json, .gitignore)
5. Created the `.env.example` template
6. Created the comprehensive `README.md`
7. Created the backend workspace with `package.json`
8. Created the shared types file (`backend/shared/types.ts`)
9. Installed all npm dependencies
10. Verified TypeScript compiles

**Before moving to Part 3, answer these questions:**

1. What is the difference between a `type` and an `interface` in TypeScript?
2. What does `?` mean after a field name in TypeScript?
3. What are the four values that `TTSResponse.source` can be, and what does each mean?
4. Why do we define types BEFORE writing functions?
5. Where in your project structure should API keys be stored?

If you cannot answer all five, re-read Part 1 of this volume before moving forward.

---

## Part 3: Cosmos DB & Azure Blob Storage

*(To be continued in next section due to length limits - I'll create this as a separate file)*

---

**END OF PART 0-2**

This completes the project initialization. Before you move to Part 3, commit your work:

```bash
git status
git add .
git commit -m "feat: complete Part 2 initialization with all root configuration"
git push origin main
```

Your backend foundation is now ready. Part 3 will guide you through setting up Cosmos DB collections and writing the database connection code.

---

**LanguageBridge LLC | Phase 2 Bootcamp | March 2026**

Justin Bernard (CEO) - justin@languagebridge.app

Prentice Howard (CTO) - prentice@languagebridge.app
