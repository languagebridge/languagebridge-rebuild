# LanguageBridge Backend Rebuild: Complete Startup Checklist

**Date:** March 15, 2026

**For:** Justin Bernard & Prentice Howard

**Status:** Ready to execute immediately

---

## Phase 0: Pre-Rebuild Setup (Do This First)

### SAN SSD Setup (2-3 hours)

- [ ] SAN SSD physically connected via Thunderbolt 3
- [ ] SAN SSD formatted to APFS
- [ ] Directory structure created on SAN SSD:
  - [ ] `/Volumes/LanguageBridge-Backup/projects`
  - [ ] `/Volumes/LanguageBridge-Backup/documents`
  - [ ] `/Volumes/LanguageBridge-Backup/ml-models`
  - [ ] `/Volumes/LanguageBridge-Backup/audio-cache-test`
  - [ ] `/Volumes/LanguageBridge-Backup/archives`
- [ ] Symlinks created: `ln -s /Volumes/LanguageBridge-Backup ~/LanguageBridge-Backup`
- [ ] Backup script created: `~/backup-to-san.sh`
- [ ] Backup script tested: `~/backup-to-san.sh` runs successfully
- [ ] LaunchAgent auto-sync configured (optional but recommended)
- [ ] Decision made: GitHub as primary source of truth, SAN SSD as backup
- [ ] Backup integrity verified: Both Justin and Prentice understand the workflow

### Machine Preparation (1-2 hours)

**Both Justin and Prentice:**

- [ ] Node.js v22+ installed: `node --version`
- [ ] npm configured: `npm --version`
- [ ] Git configured: `git config --global user.name` and `git config --global user.email`
- [ ] SSH keys working: `ssh -T git@github.com` returns success message
- [ ] Azure CLI installed: `az --version`
- [ ] Azure CLI logged in: `az account show` shows your subscription
- [ ] VS Code (or editor) installed and ready
- [ ] Two M4 MacBooks set up identically
- [ ] Both can access the SAN SSD

### GitHub Organization (30 minutes)

- [ ] GitHub organization `languagebridge-llc` exists
- [ ] Justin can access it
- [ ] Prentice can access it
- [ ] Repository `languagebridge-rebuild` created
- [ ] Repository is private (can change later)
- [ ] Both developers have write access

### Azure Subscription (30 minutes)

- [ ] Azure subscription active and funded
- [ ] Azure CLI can authenticate: `az login`
- [ ] Subscription ID known
- [ ] Can create resources in your region (eastus)
- [ ] Cost limits understood (use free tier where possible)

### Document Preparation (15 minutes)

- [ ] Downloaded/printed all five rebuild guides:
  1. [ ] `LB-BUILD-VOL2_MASTER_OVERVIEW.md`
  2. [ ] `LB-BUILD-VOL2_COMPLETE_UNABRIDGED_Part1-2.md`
  3. [ ] `LB-BUILD-VOL2_COMPLETE_UNABRIDGED_Part3-10.md`
  4. [ ] `LB-BUILD-VOL2_COMPLETE_Summary.md`
  5. [ ] `LB-BUILD-VOL2_COMMAND_REFERENCE.md`
- [ ] Downloaded: `LB-SAN-SSD-INTEGRATION-GUIDE.md`
- [ ] All documents organized and accessible
- [ ] PDF printed or digital copies ready

**PHASE 0 COMPLETE WHEN:**
✓ SAN SSD is set up and tested
✓ Both machines are identical
✓ GitHub org is ready
✓ Azure subscription is active
✓ All documents are available

---

## Phase 1: Backend Setup (Part 1-2)

**Estimated Time:** 3-4 hours

**Justin:** Execute all commands
**Prentice:** Read along, understand structure

### Create GitHub Repository

- [ ] Repository cloned locally: `git clone git@github.com:languagebridge-llc/languagebridge-rebuild.git`
- [ ] Working directory: `~/projects/languagebridge-rebuild`
- [ ] Directory listing verified: `pwd` returns `/Users/[username]/projects/languagebridge-rebuild`

### Create Folder Structure

- [ ] Backend folders created (8 directories)
- [ ] Extension folders created (5 directories)
- [ ] PWA folders created (5 directories)
- [ ] ML Pipeline folders created (6 directories)
- [ ] Documentation folders created (1 directory)
- [ ] Test folders created (2 directories)
- [ ] All .gitkeep files created
- [ ] Tree structure verified: `tree -L 3 -I 'node_modules'`

### Create Root-Level Files

- [ ] `.gitignore` created with all rules
- [ ] `package.json` created with workspace configuration
- [ ] `tsconfig.json` created with TypeScript settings
- [ ] `tsconfig.backend.json` created for backend-specific settings
- [ ] `.env.example` created with all environment variables
- [ ] `README.md` created with complete documentation
- [ ] All files committed to Git

### Create Backend Files

- [ ] `backend/package.json` created with all dependencies
- [ ] `backend/shared/types.ts` created (THE API CONTRACT)
  - [ ] TTSRequest & TTSResponse types
  - [ ] AnalyticsWriterRequest & AnalyticsWriterResponse types
  - [ ] FlagEventRequest & FlagHandlerResponse types
  - [ ] AuthRequest & AuthResponse types
  - [ ] SUPPORTED_LANGUAGES constant
  - [ ] FLAG_THRESHOLDS constant
  - [ ] Utility functions (hasPII, isValidLanguage, generateHash)
- [ ] `backend/shared/cosmos-client.ts` created (database access)
- [ ] `backend/shared/blob-client.ts` created (file storage)
- [ ] `backend/shared/validators.ts` created (input validation)

### Install Dependencies

- [ ] Root npm install: `npm install`
- [ ] Backend npm install: `cd backend && npm install`
- [ ] No errors during installation
- [ ] TypeScript compiles: `npm run type-check:backend`

### Backup to SAN SSD

- [ ] First backup: `~/backup-to-san.sh`
- [ ] Backup verified: files appear on SAN SSD

**PHASE 1 COMPLETE WHEN:**
✓ GitHub repository initialized
✓ All folders and root files created
✓ All backend shared files created
✓ npm install succeeds
✓ TypeScript type-check passes
✓ First backup on SAN SSD

---

## Phase 2: Azure & Database Setup (Part 3)

**Estimated Time:** 2-3 hours

**Justin:** Execute all Azure CLI commands
**Prentice:** Watch, understand what's created

### Azure Login

- [ ] Logged in: `az login`
- [ ] Subscription shown: `az account show`
- [ ] Correct subscription selected (if multiple)

### Create Azure Resources

- [ ] Resource group created: `languagebridge-rg`
- [ ] Resource group verified in Azure Portal
- [ ] Cosmos DB account created: `languagebridge-cosmos`
- [ ] Cosmos DB account available in Azure Portal

### Create Cosmos DB Database

- [ ] Database created: `languagebridge-prod`
- [ ] Database verified: `az cosmosdb sql database list`

### Create Collections (6 total)

- [ ] `sessions` collection created (partition key: /pilotId)
- [ ] `flags` collection created (partition key: /language)
- [ ] `model_registry` collection created (partition key: /language)
- [ ] `pilots` collection created (partition key: /id)
- [ ] `admin_users` collection created (partition key: /email)
- [ ] `audio_cache_metadata` collection created (partition key: /language)
- [ ] All collections verified in Data Explorer

### Create Azure Storage Account

- [ ] Storage account created: `languagbridgeaudio`
- [ ] Storage account verified in Azure Portal

### Create Blob Containers (3 total)

- [ ] `tts-audio-cache` container created
- [ ] `flag-data` container created
- [ ] `model-weights` container created
- [ ] All containers verified

### Gather Azure Credentials

- [ ] Cosmos DB endpoint copied
- [ ] Cosmos DB key copied
- [ ] Cosmos DB connection string copied
- [ ] Azure Storage account key copied
- [ ] Azure TTS key available (from Azure Cognitive Services)
- [ ] Azure TTS region known (eastus)
- [ ] Supabase URL known
- [ ] Supabase service role key known

### Update .env File

- [ ] `.env` created from `.env.example`
- [ ] All Azure credentials filled in
- [ ] All Supabase credentials filled in
- [ ] `.env` is in `.gitignore` (verified)
- [ ] `.env` is NOT committed to GitHub (verified: `git status` shows `.env` as untracked)

### Backup to SAN SSD

- [ ] Second backup: `~/backup-to-san.sh`

**PHASE 2 COMPLETE WHEN:**
✓ Cosmos DB account exists with 6 collections
✓ Azure Storage account exists with 3 containers
✓ `.env` file is populated with real credentials
✓ All Azure resources visible in Azure Portal

---

## Phase 3: Build Four Azure Functions (Part 4-7)

**Estimated Time:** 3-4 hours

**Justin:** Create all function files
**Prentice:** Read and understand each function's purpose

### tts-router Function

- [ ] `backend/azure-functions/tts-router/` folder exists
- [ ] `function.json` created with HTTP trigger binding
- [ ] `tsconfig.json` created
- [ ] `index.ts` created with complete implementation
  - [ ] Validates input (text, language, pilotId, sessionToken)
  - [ ] Checks cache first
  - [ ] Checks proprietary model registry
  - [ ] Falls back to Azure TTS
  - [ ] Uploads to Blob Storage
  - [ ] Logs usage to Cosmos DB
  - [ ] Returns TTSResponse

### analytics-writer Function

- [ ] `backend/azure-functions/analytics-writer/` folder exists
- [ ] `function.json` created
- [ ] `tsconfig.json` created
- [ ] `index.ts` created with complete implementation
  - [ ] Validates input (sessionToken, pilotId, language, eventType, timestamp, extensionVersion)
  - [ ] CRITICAL: Rejects PII (email, name, studentId, schoolId)
  - [ ] Writes to Cosmos DB sessions collection
  - [ ] Returns AnalyticsWriterResponse

### flag-handler Function

- [ ] `backend/azure-functions/flag-handler/` folder exists
- [ ] `function.json` created
- [ ] `tsconfig.json` created
- [ ] `index.ts` created with complete implementation
  - [ ] Validates input (word, language, sessionToken, pilotId, timestamp)
  - [ ] Generates deterministic ID from (word + language)
  - [ ] Creates or updates flag document
  - [ ] Increments flag count
  - [ ] Escalates status at thresholds (3, 6, 10)
  - [ ] Upserts to Cosmos DB
  - [ ] Returns FlagHandlerResponse

### auth-layer Function

- [ ] `backend/azure-functions/auth-layer/` folder exists
- [ ] `function.json` created
- [ ] `tsconfig.json` created
- [ ] `index.ts` created with complete implementation
  - [ ] Extracts JWT from Authorization header
  - [ ] Validates with Supabase
  - [ ] Checks if super-admin (email ends with @languagebridge.app)
  - [ ] Returns accessible pilot IDs and permissions
  - [ ] Returns AuthResponse

### Verify All Functions

- [ ] All 4 functions compile: `npm run build:backend`
- [ ] No TypeScript errors
- [ ] All 4 function.json files exist
- [ ] All 4 index.ts files exist
- [ ] All 4 tsconfig.json files exist
- [ ] All functions committed to Git

### Backup to SAN SSD

- [ ] Third backup: `~/backup-to-san.sh`

**PHASE 3 COMPLETE WHEN:**
✓ All four functions are implemented
✓ All functions compile without errors
✓ All functions committed to Git
✓ Ready for local testing

---

## Phase 4: Local Testing (Part 8)

**Estimated Time:** 2-3 hours

**Justin:** Execute all tests
**Prentice:** Watch and understand API behavior

### Build TypeScript

- [ ] Compile: `npm run build:backend`
- [ ] No errors

### Start Local Azure Functions

- [ ] Terminal 1: `cd backend && npx func start`
- [ ] All 4 functions listed with their URLs
- [ ] No errors during startup

### Test tts-router

- [ ] Terminal 2: Test with valid request
- [ ] Response: audioUrl, source, durationMs, cached
- [ ] Test again: Cache hit (source: "azure_cache")
- [ ] Test with missing text field: 400 MISSING_FIELDS
- [ ] Test with invalid language: 400 INVALID_LANGUAGE
- [ ] Test with text > 500 chars: 400 TEXT_TOO_LONG

### Test analytics-writer

- [ ] Test with valid request: logged: true
- [ ] Check Cosmos DB: document appears in sessions collection
- [ ] Test with email field: 400 PII_VIOLATION
- [ ] Test with name field: 400 PII_VIOLATION
- [ ] Test with studentId field: 400 PII_VIOLATION
- [ ] Test with invalid eventType: 400 INVALID_EVENT_TYPE

### Test flag-handler

- [ ] Test first flag: flagCount: 1, status: "logged"
- [ ] Run 2 more times, same word/language: flagCount: 3, status: "review"
- [ ] Run 3 more times: flagCount: 6, status: "bounty"
- [ ] Run 4 more times: flagCount: 10, status: "high_priority"
- [ ] Check Cosmos DB: flag documents with escalating status

### Verify Cosmos DB

- [ ] Azure Portal: Data Explorer
- [ ] Query `sessions` collection: See analytics events
- [ ] Query `flags` collection: See flag documents
- [ ] All data has correct structure

### Stop Local Server

- [ ] Terminal 1: Press Ctrl+C to stop `func start`

### Backup to SAN SSD

- [ ] Fourth backup: `~/backup-to-san.sh`

**PHASE 4 COMPLETE WHEN:**
✓ All 4 functions respond to local requests
✓ tts-router caches on second request
✓ analytics-writer rejects PII
✓ flag-handler escalates at thresholds
✓ Cosmos DB has all test documents

---

## Phase 5: Azure Deployment (Part 9)

**Estimated Time:** 2-3 hours

**Justin:** Deploy to Azure
**Prentice:** Watch, understand production setup

### Create Function App in Azure

- [ ] Function App created: `lb-backend-functions`
- [ ] Function App visible in Azure Portal
- [ ] In same resource group: `languagebridge-rg`
- [ ] Runtime: Node.js 20
- [ ] Functions version: 4

### Set Environment Variables

- [ ] All 11 settings configured in Function App:
  - [ ] COSMOS_DB_ENDPOINT
  - [ ] COSMOS_DB_KEY
  - [ ] COSMOS_DB_DATABASE
  - [ ] AZURE_STORAGE_ACCOUNT
  - [ ] AZURE_STORAGE_KEY
  - [ ] AZURE_STORAGE_CONTAINER_AUDIO
  - [ ] AZURE_TTS_KEY
  - [ ] AZURE_TTS_REGION
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_SERVICE_ROLE_KEY
  - [ ] NODE_ENV=production
- [ ] Settings verified in Azure Portal

### Deploy Functions

- [ ] Deploy command: `func azure functionapp publish lb-backend-functions`
- [ ] Deployment successful (no errors)
- [ ] All 4 functions deployed:
  - [ ] tts-router
  - [ ] analytics-writer
  - [ ] flag-handler
  - [ ] auth-layer

### Test Production Endpoints

- [ ] Terminal: Test tts-router production URL
  - [ ] https://lb-backend-functions.azurewebsites.net/api/tts-router
  - [ ] Returns valid audio URL
- [ ] Test analytics-writer production URL
  - [ ] https://lb-backend-functions.azurewebsites.net/api/analytics-writer
  - [ ] Returns logged: true
- [ ] Test flag-handler production URL
  - [ ] https://lb-backend-functions.azurewebsites.net/api/flag-handler
  - [ ] Returns flagCount and status

### Verify Production Data

- [ ] Cosmos DB has production documents
- [ ] Query Azure Portal Data Explorer
- [ ] See documents from production endpoints
- [ ] All data correct and timestamped

### Backup to SAN SSD

- [ ] Fifth backup: `~/backup-to-san.sh`

**PHASE 5 COMPLETE WHEN:**
✓ Functions deployed to Azure
✓ Production endpoints return 200 OK
✓ Production documents in Cosmos DB
✓ Ready for Volume 3 (Frontend)

---

## Phase 6: Validation (Part 10)

**Estimated Time:** 1-2 hours

**Justin:** Run validation tests
**Prentice:** Start reading Volume 3

### Complete Validation Checklist

All of Part 10 from LB-BUILD-VOL2:

**tts-router:**
- [ ] Registered word returns proprietary source
- [ ] Cache hit on second request returns azure_cache
- [ ] New word returns azure_live source
- [ ] Missing fields returns 400 MISSING_FIELDS
- [ ] All 5 tts-router tests pass

**analytics-writer:**
- [ ] Valid event creates document in sessions
- [ ] PII field returns 400 PII_VIOLATION
- [ ] PII violation alert triggered
- [ ] All 3 analytics-writer tests pass

**flag-handler:**
- [ ] First flag creates document with count 1
- [ ] Sixth flag changes status to bounty
- [ ] Tenth flag changes status to high_priority
- [ ] All 3 flag-handler tests pass

**auth-layer:**
- [ ] Valid JWT returns user data
- [ ] Invalid JWT returns 401
- [ ] Super-admin gets full access
- [ ] Regular admin gets pilot-specific access
- [ ] All 2 auth-layer tests pass

**Deployment:**
- [ ] func azure functionapp publish succeeds
- [ ] Production endpoints respond
- [ ] No 404 errors
- [ ] No 500 errors

### Checkpoint Quiz

Can you answer all 10 questions from Part 1 Checkpoint?

- [ ] What command confirms Node.js version?
- [ ] What does FileVault protect against?
- [ ] Difference between ~/projects and ~/documents?
- [ ] Should .env be committed to GitHub?
- [ ] What is a session token and why use it?
- [ ] Difference between current Netlify and rebuild Azure?
- [ ] Name 4 Azure Functions and their purposes?
- [ ] What does SHA-256 do for audio cache?
- [ ] Why Kokoro-82M over Coqui TTS?
- [ ] What is a Pull Request and why not push to main?

All 10 answered correctly: ✓ Ready for Volume 3

### Final Commit

- [ ] All work committed to Git
- [ ] Commit message: "feat: complete Phase 2 backend rebuild with production Azure Functions"
- [ ] Pushed to origin: `git push origin main`
- [ ] GitHub shows latest commit

### Share with Prentice

- [ ] Send summary document
- [ ] Share `backend/shared/types.ts` link
- [ ] Explain the four functions
- [ ] Point to API examples in README.md
- [ ] Set meeting to start Volume 3

### Final Backup to SAN SSD

- [ ] Sixth backup: `~/backup-to-san.sh`

**PHASE 6 COMPLETE WHEN:**
✓ All validation tests pass
✓ Checkpoint quiz answered
✓ Final commit pushed
✓ Prentice understands API contract
✓ Ready to start Volume 3

---

## Success Criteria

### You Know You Succeeded When:

✓ Four Azure Functions deployed to production
✓ All functions respond to HTTPS requests
✓ Cosmos DB has 6 collections with documents
✓ Blob Storage has audio cache
✓ TypeScript compiles without errors
✓ .env has real Azure credentials
✓ .env is NOT in GitHub
✓ All tests pass locally and in production
✓ Prentice can read types.ts and understand the API
✓ Code is ready for Volume 3 (Frontend Rebuild)

---

## Start Now

1. **Print this checklist**
2. **Setup SAN SSD first** (Phase 0)
3. **Start Part 1** (Phase 1 - 3-4 hours)
4. **Don't skip any step**
5. **Test as you go**
6. **Backup frequently** (every 1-2 hours)

**Total Time:** 12-16 hours spread over 3 days

**Total Checkboxes:** 200+ (keeps you on track)

**Total Confidence:** 100% (nothing is hidden)

---

**LanguageBridge LLC | Complete Startup Checklist | March 2026**

Justin Bernard - justin@languagebridge.app

Prentice Howard - prentice@languagebridge.app

**Contact:** 216-800-6020

**Next Document:** Start with `LB-BUILD-VOL2_MASTER_OVERVIEW.md`
