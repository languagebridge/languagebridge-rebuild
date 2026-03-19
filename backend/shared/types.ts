/**
 * LanguageBridge Shared Types
 *
 * This file is the API contract between the backend and all clients.
 * - Justin: every Azure Function imports from here
 * - Prentice: read this to know what to send and what you get back
 *
 * Rules:
 * - Never add PII fields (no student names, emails, school IDs)
 * - sessionToken is the ONLY identifier — it is an anonymous UUID
 * - All changes here must be backwards-compatible during the pilot
 */

// ============================================
// SUPPORTED LANGUAGES
// To add a new language: add it to this array.
// TypeScript will enforce it everywhere automatically.
// ============================================

export const SUPPORTED_LANGUAGES = [
  'dari',
  'pashto',
  'persian',
  'arabic',
  'urdu',
  'somali',
  'ukrainian',
  'spanish',
  'english',
  // Coming soon:
  // 'nepali',
  // 'hmong',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// ============================================
// REQUEST TYPES (what clients send to backend)
// ============================================

export type TTSRequest = {
  text: string;           // Text to convert to audio (max 500 chars)
  language: SupportedLanguage;
  pilotId: string;        // e.g. 'PCSD-2026'
  sessionToken: string;   // Anonymous device UUID
  extensionVersion?: string; // e.g. '2.0.0' (optional, for debugging)
};

export type AnalyticsWriterRequest = {
  sessionToken: string;   // Anonymous device UUID
  pilotId: string;
  language: SupportedLanguage;
  eventType: 'session_start' | 'tts_request' | 'flag_event' | 'session_end' | 'glossary_view';
  timestamp: string;      // ISO 8601: "2026-03-15T14:30:00Z"
  extensionVersion: string;
  // NEVER ADD: email, name, studentId, schoolId, or any PII
};

export type FlagEventRequest = {
  word: string;           // The word that was flagged
  language: SupportedLanguage;
  sessionToken: string;
  pilotId: string;
  timestamp: string;      // ISO 8601
  audioUrl?: string;      // URL of the audio that was flagged (optional)
};

export type LexiconLookupRequest = {
  term: string;              // Word or phrase to look up
  language: SupportedLanguage;
  domain?: 'k12_academic' | 'school_navigation' | 'medical' | 'legal_immigration' | 'social_services';
  context?: string;          // Subject context for disambiguation (e.g. "science", "social_studies")
  pilotId: string;
  sessionToken: string;
};

// auth-layer reads the Authorization header directly — no request body type needed

// ============================================
// RESPONSE TYPES (what backend returns)
// ============================================

export type TTSResponse = {
  audioUrl: string;       // URL to play the audio
  source: 'proprietary' | 'azure_cache' | 'azure_live';
  durationMs: number;
  cached: boolean;
  textHash?: string;      // SHA-256 of (text + language) for deduplication
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
  details: string;
  code?: number;
};

export type AnalyticsWriterResponse = {
  logged: true;
  eventId: string;
  timestamp: string;
};

export type AnalyticsWriterErrorResponse = {
  error: 'PII_VIOLATION' | 'INVALID_EVENT_TYPE' | 'MISSING_FIELDS' | 'INTERNAL_ERROR';
  details: string;
  prohibitedFields?: string[]; // which fields triggered the PII check
};

export type FlagHandlerResponse = {
  flagId: string;
  flagCount: number;
  status: 'logged' | 'review' | 'bounty' | 'high_priority';
  requiresReview: boolean;
  bountyValue?: number;   // Phase 3: interpreter marketplace
};

export type FlagHandlerErrorResponse = {
  error: 'MISSING_FIELDS' | 'INVALID_LANGUAGE' | 'INTERNAL_ERROR';
  details: string;
};

export type AuthResponse = {
  userId: string;
  email: string;
  accessiblePilotIds: string[];
  isSuperAdmin: boolean;
  permissions: Array<'view_dashboard' | 'export_data' | 'manage_flags' | 'manage_users'>;
};

export type AuthErrorResponse = {
  error: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_TOKEN' | 'INTERNAL_ERROR';
  details: string;
};

export type LexiconLookupResponse = {
  term: string;
  language: SupportedLanguage;
  type: 'bridge' | 'cognate';
  cognate: string | null;
  bridge_definition: string | null;
  bridge_definition_en: string | null;
  audio_url: string | null;
  audio_source: 'proprietary' | 'azure' | null;
  source: 'lexicon' | 'translator_fallback';
};

export type LexiconLookupErrorResponse = {
  error: 'MISSING_FIELDS' | 'INVALID_LANGUAGE' | 'TRANSLATOR_ERROR' | 'INTERNAL_ERROR';
  details: string;
};

// ============================================
// COSMOS DB DOCUMENT TYPES
// ============================================

export type SessionUsageDoc = {
  id: string;             // UUID
  sessionToken: string;   // Anonymous session UUID
  pilotId: string;
  language: SupportedLanguage;
  eventType: string;
  timestamp: string;
  extensionVersion: string;
  // Never include: student name, email, or any identifying info
};

export type FlagDoc = {
  id: string;             // SHA-256 hash of (word + language) for deduplication
  word: string;
  language: SupportedLanguage;
  flagCount: number;
  status: 'logged' | 'review' | 'bounty' | 'high_priority';
  pilotIds: string[];
  audioUrl?: string;
  createdAt: string;
  lastFlaggedAt: string;
  requiresReview: boolean;
};

export type ModelRegistryDoc = {
  id: string;             // Language code: 'dari', 'pashto', etc.
  language: SupportedLanguage;
  modelName: string;      // e.g. 'Kokoro-82M'
  modelVersion: string;
  blobPath: string;       // Path in Azure Blob Storage
  sha256Hash: string;     // Integrity check
  isActive: boolean;
  uploadedAt: string;
};

export type PilotDoc = {
  id: string;             // e.g. 'PCSD-2026'
  name: string;           // e.g. 'Greenbriar Middle School'
  district: string;
  languages: SupportedLanguage[];
  studentCount: number;
  timezone: string;
  isActive: boolean;
  startDate: string;
};

export type AdminUserDoc = {
  id: string;
  email: string;
  pilotIds: string[];
  permissions: Array<'view_dashboard' | 'export_data' | 'manage_flags' | 'manage_users'>;
  isSuperAdmin: boolean;
  createdAt: string;
  lastLoginAt?: string;
};

export type AudioCacheMetadataDoc = {
  id: string;             // SHA-256 hash of (text + language)
  textHash: string;
  language: SupportedLanguage;
  audioUrl: string;       // Full blob storage URL
  blobName: string;       // Just the filename in blob storage
  source: 'proprietary' | 'azure_live';
  durationMs: number;
  cachedAt: string;
  hitCount: number;       // How many times this cache entry was used
};

// ============================================
// FLAG ESCALATION THRESHOLDS
// ============================================

export type LexiconDoc = {
  id: string;               // e.g. "photosynthesis_dari_v1"
  term: string;
  language: SupportedLanguage;
  domain: 'k12_academic' | 'school_navigation' | 'medical' | 'legal_immigration' | 'social_services';
  subject?: string;         // For disambiguation: "science", "social_studies", etc.
  grade_band?: string;      // "K-2", "3-5", "6-8", "9-12"
  ohio_standard?: string;   // e.g. "SCI.5.LS.1"
  cognate: string | null;
  bridge_definition: string | null;
  bridge_definition_en: string | null;
  audio_blob_path: string | null;
  audio_source: 'proprietary' | 'azure' | null;
  audio_model?: string;     // e.g. "dari_tts_v1"
  status: 'auto_generated' | 'pending_review' | 'approved' | 'deprecated';
  version: number;
  usage_count: number;
  flag_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export const FLAG_THRESHOLDS = {
  REVIEW: 3,        // Flag goes to review queue
  BOUNTY: 6,        // Flag becomes a bounty for interpreter marketplace
  HIGH_PRIORITY: 10 // Escalate immediately
} as const;
