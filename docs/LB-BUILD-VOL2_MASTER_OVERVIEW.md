# LanguageBridge Backend Rebuild: Master Overview & Start Guide

**Created:** March 15, 2026

**For:** Justin Bernard (CEO/Backend Developer) and Prentice Howard (CTO/Reference)

**Status:** Ready to execute immediately - Complete, unabridged, line-by-line copyable guides

---

## What You Have

You now have **four complete documents** that contain everything needed to rebuild LanguageBridge's backend:

### Document 1: Part 1-2 - Foundations & Setup (8,000+ words)
**File:** `LB-BUILD-VOL2_COMPLETE_UNABRIDGED_Part1-2.md`

**Contains:**
- TypeScript from scratch (all you need to know)
- Complete project initialization
- Folder structure with every directory needed
- Root-level configuration files (package.json, tsconfig.json, .gitignore)
- Environment variable setup
- Shared types file (the API contract)
- Database and storage clients

**Time to complete:** 3-4 hours

**Output:** A GitHub repository with everything configured and ready to build

---

### Document 2: Part 3-10 - Implementation & Deployment (12,000+ words)
**File:** `LB-BUILD-VOL2_COMPLETE_UNABRIDGED_Part3-10.md`

**Contains:**
- **Part 3:** Cosmos DB setup (6 collections with partition keys)
- **Part 4:** tts-router function (audio routing with caching)
- **Part 5:** analytics-writer function (PII-safe logging)
- **Part 6:** flag-handler function (threshold escalation)
- **Part 7:** auth-layer function (Supabase JWT validation)
- **Part 8:** Local testing with curl and Azure Functions emulator
- **Part 9:** Azure deployment
- **Part 10:** Validation checklist

**Time to complete:** 4-6 hours (including testing)

**Output:** Four deployed Azure Functions running in production

---

### Document 3: Summary & Integration (4,000+ words)
**File:** `LB-BUILD-VOL2_COMPLETE_Summary.md`

**Contains:**
- Overview of what you've accomplished
- How the four functions work together
- How Prentice's frontend integrates with your backend
- Architecture diagram
- Deployment architecture
- Next steps for Volume 3

**Time to read:** 30 minutes

**Purpose:** Understand the bigger picture

---

### Document 4: Command Reference (2,000+ words)
**File:** `LB-BUILD-VOL2_COMMAND_REFERENCE.md`

**Contains:**
- Copy-paste terminal commands for every step
- Quick navigation to each section
- Troubleshooting common issues
- Cheat sheet of commonly used commands

**Purpose:** Quick reference while executing

---

## How to Use These Documents

### Option A: Linear Reading (Recommended for First-Time)

1. **Start with Summary** (30 min)
   - Read `LB-BUILD-VOL2_COMPLETE_Summary.md`
   - Understand what you're building and why

2. **Execute Part 1-2** (3-4 hours)
   - Open `LB-BUILD-VOL2_COMPLETE_UNABRIDGED_Part1-2.md`
   - Follow every command line by line
   - Use `LB-BUILD-VOL2_COMMAND_REFERENCE.md` for copy-paste

3. **Execute Part 3-10** (4-6 hours)
   - Open `LB-BUILD-VOL2_COMPLETE_UNABRIDGED_Part3-10.md`
   - Follow every command line by line
   - Test as you go (Part 8)
   - Deploy to Azure (Part 9)
   - Validate (Part 10)

4. **Share with Prentice** (30 min)
   - Send Prentice the Summary document
   - Point him to `backend/shared/types.ts` in your GitHub repo
   - Tell him: "Read this file. It's the API contract."

**Total time:** 8-11 hours spread over 2-3 days

---

### Option B: Pairing with Prentice

If you and Prentice are working together:

1. **You execute Part 1-2** (3-4 hours)
   - Get the project structure set up
   - Create shared types
   - Install dependencies

2. **Prentice reads Part 2 and the Summary** (1 hour)
   - Understands the folder structure
   - Learns what the API contract is
   - Sees how everything connects

3. **You execute Part 3-7** (2-3 hours)
   - Create Cosmos DB
   - Build three main functions
   - Get tts-router, analytics-writer, flag-handler working

4. **Prentice starts looking at your code** (1 hour)
   - Reads the types in `backend/shared/types.ts`
   - Understands what each function expects
   - Sketches out his API client calls

5. **You finish Part 8-10** (2-3 hours)
   - Local testing
   - Azure deployment
   - Production validation

6. **Both of you review Part 9-10 results** (30 min)
   - Functions are deployed
   - Production endpoints are live
   - Ready for Volume 3

**Total time:** 8-11 hours but overlapping (can complete in 2-3 days)

---

### Option C: Reference Mode (After Setup)

Once you've executed Parts 1-2:

- Use the Summary when you need context
- Jump to specific Part (3, 4, 5, 6, 7) when building that function
- Use Command Reference for quick copy-paste
- Refer to types.ts constantly when building functions

---

## What Gets Built

### The Repository Structure

```
~/projects/languagebridge-rebuild/
├── backend/                          ← JUSTIN BUILDS THIS
│   ├── azure-functions/
│   │   ├── tts-router/              ← Audio routing with cache
│   │   ├── analytics-writer/        ← PII-safe logging
│   │   ├── flag-handler/            ← Threshold escalation
│   │   └── auth-layer/              ← JWT validation
│   ├── shared/
│   │   ├── types.ts                 ← API CONTRACT
│   │   ├── cosmos-client.ts          ← Database access
│   │   ├── blob-client.ts            ← File storage
│   │   └── validators.ts             ← Input validation
│   └── __tests__/
│
├── extension/                         ← PRENTICE BUILDS THIS (Vol 3)
│   ├── src/
│   │   ├── api/                     ← Calls your 4 functions
│   │   └── ui/
│   └── manifest.json
│
├── pwa/                              ← PRENTICE BUILDS THIS (Vol 3)
│   └── src/
│       ├── pages/
│       └── components/
│
├── ml-pipeline/                      ← JUSTIN BUILDS THIS (Vol 4)
│   ├── notebooks/
│   ├── scripts/
│   └── models/
│
└── .env                              ← YOUR AZURE CREDENTIALS (NOT COMMITTED)
```

### The Deployment

```
Students' Chromebooks
        ↓
Chrome Extension (Prentice builds)
        ↓
HTTPS POST to Azure Functions
        ↓
┌──────────────────────────────────┐
│  YOUR BACKEND (4 Functions)      │
│  ├─ tts-router                   │
│  ├─ analytics-writer             │
│  ├─ flag-handler                 │
│  └─ auth-layer                   │
└──────────────────────────────────┘
        ↓
        ├→ Cosmos DB (analytics database)
        ├→ Blob Storage (audio cache)
        └→ Azure Cognitive Services (audio generation)

Teachers' Browsers
        ↓
React PWA (Prentice builds)
        ↓
HTTPS POST to Azure Functions
        ↓
Uses auth-layer to validate login
```

---

## What's Different About These Documents

### vs. Original Vol 2

**Original Vol 1-2:**
- Conceptual and educational
- Explains "what" and "why"
- Less code
- More guidance
- Some missing details
- Readers had to fill in gaps

**New Unabridged Vol 2:**
- Practical and executable
- Shows exactly "how"
- All code included
- Copy-paste ready
- Every detail specified
- No gaps to fill in
- Terminal commands ready to run
- Can be used by someone who has never worked on this project

### Complete Code Samples

Every file you need to create is fully specified:
- `package.json` (exact dependencies)
- `tsconfig.json` (exact compiler settings)
- `.gitignore` (exact rules)
- `backend/shared/types.ts` (complete type definitions)
- `backend/shared/cosmos-client.ts` (database client)
- `backend/shared/blob-client.ts` (storage client)
- `backend/shared/validators.ts` (input validation)
- `backend/azure-functions/tts-router/index.ts` (full function)
- `backend/azure-functions/analytics-writer/index.ts` (full function)
- `backend/azure-functions/flag-handler/index.ts` (full function)
- `backend/azure-functions/auth-layer/index.ts` (full function)

### Terminal Commands Ready to Execute

Every command is:
- Copy-paste ready
- In the correct order
- With expected outputs shown
- With troubleshooting if it fails

---

## Start Now

### If you have 1 hour:
Read the Summary document to understand what you're building.

### If you have 3-4 hours:
Execute Part 1-2 (Project Setup). By the end, your GitHub repo is initialized and all dependencies are installed.

### If you have 8-11 hours:
Execute everything (Part 1-10). By the end, your four Azure Functions are deployed and tested in production.

### If you have 2-3 days:
Pair with Prentice and execute the full rebuild while keeping him informed about the API contract.

---

## Before You Start

### Confirm You Have:

```bash
# Check Node.js
node --version
# Should show v22.0.0 or higher

# Check npm
npm --version

# Check Git is configured
git config --global user.name
git config --global user.email

# Check SSH key works
ssh -T git@github.com
# Should say: "Hi [your-github-username]! You've successfully authenticated..."

# Check you can access Azure
az login
# Browser opens, you sign in

# Check you have GitHub organization
# Navigate to https://github.com/languagebridge-llc
# You should see the organization exists
```

If any of these fail, stop and fix it before proceeding.

---

## Support & Questions

### If You Get Stuck

1. **Check Command Reference**
   - Open `LB-BUILD-VOL2_COMMAND_REFERENCE.md`
   - Jump to the section you're stuck on
   - Look for Troubleshooting at the end

2. **Re-read the Relevant Part**
   - Each part is self-contained
   - Read the explanation + code + commands together
   - Copy commands exactly as shown

3. **Read Error Messages Carefully**
   - Errors are specific and helpful
   - They tell you exactly what went wrong
   - Most errors are easy to fix

4. **Contact**
   - Justin: justin@languagebridge.app
   - Prentice: prentice@languagebridge.app
   - Phone: 216-800-6020

---

## Next Steps After Completion

### When Part 1-2 is Complete:
- GitHub repository initialized
- Folder structure created
- Root configuration in place
- Shared types defined
- Ready to start Part 3

### When Part 3-7 is Complete:
- Cosmos DB set up with 6 collections
- Azure Blob Storage ready
- All four functions created locally
- Ready for local testing (Part 8)

### When Part 8-10 is Complete:
- All functions tested locally
- All functions deployed to Azure
- Production endpoints verified
- Ready for Prentice to start Volume 3
- Ready for Greenbriar cutover planning (Volume 5)

### Start Volume 3:
- Prentice builds Chrome extension
- Prentice builds React PWA
- Both wire to your four Azure Functions
- Backend and frontend integrate

---

## File Checklist

Print this and check off as you go:

```
DOCUMENTS:
☐ LB-BUILD-VOL2_COMPLETE_UNABRIDGED_Part1-2.md
☐ LB-BUILD-VOL2_COMPLETE_UNABRIDGED_Part3-10.md
☐ LB-BUILD-VOL2_COMPLETE_Summary.md
☐ LB-BUILD-VOL2_COMMAND_REFERENCE.md
☐ LB-BUILD-VOL2_MASTER_OVERVIEW.md (this file)

PART 1-2 COMPLETION:
☐ GitHub repository created
☐ Project cloned locally
☐ Folders created
☐ Root files created (.gitignore, package.json, tsconfig.json)
☐ .env.example created
☐ README.md created
☐ backend/package.json created
☐ backend/shared/types.ts created
☐ backend/shared/cosmos-client.ts created
☐ backend/shared/blob-client.ts created
☐ backend/shared/validators.ts created
☐ npm install completed
☐ npm run type-check:backend shows no errors

PART 3 COMPLETION:
☐ Cosmos DB account created
☐ Cosmos DB database created (languagebridge-prod)
☐ 6 collections created (sessions, flags, model_registry, pilots, admin_users, audio_cache_metadata)
☐ Azure Storage account created
☐ 3 blob containers created (tts-audio-cache, flag-data, model-weights)
☐ .env file populated with real Azure credentials

PART 4-7 COMPLETION:
☐ tts-router function.json created
☐ tts-router index.ts created
☐ analytics-writer function.json created
☐ analytics-writer index.ts created
☐ flag-handler function.json created
☐ flag-handler index.ts created
☐ auth-layer function.json created
☐ auth-layer index.ts created

PART 8 COMPLETION:
☐ All TypeScript compiles (npm run build:backend)
☐ func start runs locally
☐ tts-router responds to test curl
☐ analytics-writer responds to test curl
☐ analytics-writer rejects PII
☐ flag-handler responds to test curl
☐ flag-handler escalates at thresholds
☐ Cosmos DB documents appear

PART 9 COMPLETION:
☐ Function App created in Azure
☐ Environment variables set
☐ Functions deployed (func azure functionapp publish)
☐ Production endpoints tested

PART 10 COMPLETION:
☐ Production tts-router tested
☐ Production analytics-writer tested
☐ Production flag-handler tested
☐ Cosmos DB has production documents
☐ All validation tests passed

SHARE WITH PRENTICE:
☐ Send Summary document
☐ Share backend/shared/types.ts
☐ Point to GitHub API contract
☐ Explain the four functions
```

---

## Success Criteria

### You know Part 1-2 is done when:
- You can run `npm run type-check:backend` and see no errors
- All four functions are defined in `azure-functions/`
- Your `.env` file has real Azure credentials

### You know Part 3 is done when:
- Cosmos DB is created and you can see it in Azure Portal
- All 6 collections are listed
- Blob Storage account is created
- 3 blob containers are created

### You know Part 4-7 is done when:
- All 4 function folders have function.json and index.ts
- `npm run build:backend` compiles without errors
- Git history shows commits for each function

### You know Part 8 is done when:
- `npx func start` shows all 4 functions
- `curl` tests return valid JSON responses
- `curl` with PII returns error 400
- Cosmos DB has test documents

### You know Part 9 is done when:
- `func azure functionapp publish` succeeds
- Production endpoints respond to curl
- Azure Portal shows Function App is running

### You know Part 10 is done when:
- All validation tests in the checklist pass
- You can explain what each function does
- You can show Prentice the API contract

---

## You Are Ready

Everything is prepared. All documents are complete. All code is specified. Every terminal command is ready to copy-paste.

**The only thing left is to start.**

Choose your start time. Open the first document. Copy the first command. Execute it.

The rest will follow.

---

**LanguageBridge LLC | Phase 2 Backend Rebuild | Ready to Execute**

**Justin Bernard** (CEO/Backend Developer) - justin@languagebridge.app

**Prentice Howard** (CTO/Co-Founder) - prentice@languagebridge.app

**Contact:** 216-800-6020

**Start Date:** Today

---

*This rebuild represents 20+ hours of preparation, planning, and documentation to ensure that you can go from idea to production without gaps, without confusion, and without having to figure anything out on your own.*

*Every decision is documented. Every command is specified. Every test is defined.*

*You know exactly what to do. Now do it.*
