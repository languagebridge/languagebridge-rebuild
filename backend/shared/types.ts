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
  // Tier 1 — Piper TTS (production-ready voices)
  'arabic',
  'french',
  'portuguese',
  'ukrainian',
  'vietnamese',
  'spanish',
  'persian',
  'english',
  // Tier 1.5 — Piper TTS (beta, using related language model)
  'nepali',
  'swahili',
  'dari',       // uses Persian Piper
  'pashto',     // uses Persian Piper
  'urdu',       // uses Arabic Piper
  'somali',     // uses Swahili Piper
  'kinyarwanda', // uses Swahili Piper
  'twi',        // uses Swahili Piper
  // Tier 2 — Azure TTS only (no local model yet)
  'burmese',
  'uzbek',
  'amharic',
  'tagalog',
  'tigrinya',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// ============================================
// PILOT CONFIGURATION
// School admin provides this. We store it as config, not user data.
// ============================================

export type GradeBand = 'K-2' | '3-5' | '6-8' | '9-12';

export type PilotSchool = {
  schoolCode: string;       // e.g. "greenbriar"
  schoolName: string;       // e.g. "Greenbriar Middle School"
  pilotId: string;          // e.g. "PCSD-2026"
  gradeBands: GradeBand[];  // which grade bands this school covers
};

export type TeacherRouting = {
  pilotId: string;
  schoolCode: string;
  teacherId: string;        // Supabase UUID
  gradeBands: GradeBand[];  // teacher handles these grade bands
};

// ============================================
// ONBOARDING (first install only)
// ============================================

export type OnboardingSchoolsResponse = {
  schools: Array<{
    schoolCode: string;
    schoolName: string;
    gradeBands: GradeBand[];
  }>;
};

export type OnboardingEnrollRequest = {
  schoolCode: string;
  gradeBand: GradeBand;
  language: SupportedLanguage;
};

export type OnboardingEnrollResponse = {
  studentCode: string;      // e.g. "LB-7K2M" — show once, accessible in help menu
  schoolCode: string;
  gradeBand: GradeBand;
  language: SupportedLanguage;
};

// ============================================
// REQUEST TYPES (what clients send to backend)
// ============================================

export type TTSRequest = {
  text: string;           // Text to convert to audio (max 500 chars)
  language: SupportedLanguage;
  studentCode: string;    // Pseudonymous code from onboarding (e.g. "LB-7K2M")
  extensionVersion?: string;
};

export type AnalyticsEventType =
  | 'session_start'
  | 'session_end'
  | 'term_lookup'       // student highlighted a word
  | 'scaffold_view'     // student tapped "More"
  | 'tts_play'          // student played audio
  | 'flag_event'
  | 'glossary_view';

export type AnalyticsWriterRequest = {
  studentCode: string;    // Pseudonymous code from onboarding
  language: SupportedLanguage;
  eventType: AnalyticsEventType;
  timestamp: string;      // ISO 8601: "2026-03-15T14:30:00Z"
  extensionVersion: string;
  term?: string;          // which word (sent with term_lookup, scaffold_view, tts_play)
  subject?: string;       // "science", "math", "ela", "social_studies"
  source?: 'lexicon' | 'translator_fallback';
  difficulty?: 'high' | 'medium' | 'low';
  // NEVER ADD: email, name, studentId, schoolId, or any PII
};

export type FlagEventRequest = {
  flaggedText: string;    // The full highlighted text the student flagged (up to 500 chars)
  language: SupportedLanguage;
  studentCode: string;
  timestamp: string;      // ISO 8601
  // NOTE: We intentionally do NOT accept or store audioUrl or any Azure-generated
  // content in flags. The bounty pipeline must only contain student-highlighted
  // text (original input) + target language. Azure translations and audio are
  // ephemeral placeholders, not our IP to redistribute.
};

export type LexiconLookupRequest = {
  term: string;              // Word or phrase to look up
  language: SupportedLanguage;
  domain?: 'k12_academic' | 'school_navigation' | 'medical' | 'legal_immigration' | 'social_services';
  context?: string;          // Subject context for disambiguation (e.g. "science", "social_studies")
  studentCode: string;
};

// auth-layer reads the Authorization header directly — no request body type needed

// ============================================
// RESPONSE TYPES (what backend returns)
// ============================================

export type TTSResponse = {
  audioUrl: string;       // URL to play the audio
  source: 'proprietary' | 'azure_cache' | 'azure_live';
  backend?: 'piper' | 'azure';  // Which TTS engine produced this audio
  quality?: 'production' | 'beta' | 'experimental'; // Voice quality tier
  durationMs: number;
  cached: boolean;
  textHash?: string;      // SHA-256 of (text + language) for deduplication
};

export type TTSErrorResponse = {
  error:
    | 'UNAUTHORIZED'
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
  error: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'PII_VIOLATION' | 'INVALID_EVENT_TYPE' | 'MISSING_FIELDS' | 'INTERNAL_ERROR';
  details: string;
  prohibitedFields?: string[]; // which fields triggered the PII check
};

export type FlagHandlerResponse = {
  flagId: string;
  flagCount: number;
  status: 'logged' | 'review' | 'bounty' | 'high_priority';
  requiresReview: boolean;
  // Phase 3: bountyValue will be set when status='bounty' — interpreter marketplace
  // Bounty only contains (word + language), never Azure-derived content
};

export type FlagHandlerErrorResponse = {
  error: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'MISSING_FIELDS' | 'INVALID_LANGUAGE' | 'INTERNAL_ERROR';
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

  // Bridge phrases — Prentice: display anchor first, scaffold on tap/expand
  bridge_anchor: string | null;       // Short: "the answer" (always show this)
  bridge_scaffold: string | null;     // Expanded: "what you get when you work through a problem" (show on tap)
  bridge_definition: string | null;   // Legacy alias for bridge_scaffold
  bridge_definition_en: string | null;

  // Grammatical forms — show noun/verb/adj tabs if available
  grammatical_forms?: {
    noun: string | null;
    verb: string | null;
    adjective: string | null;
  };

  // Audio
  audio_url: string | null;
  audio_source: 'proprietary' | 'azure' | null;
  tts_backend?: 'piper' | 'azure';

  // Metadata for UI hints
  subject?: string;
  grade_band?: string;
  transliteration_difficulty?: 'high' | 'medium' | 'low';
  source: 'lexicon' | 'translator_fallback';
};

export type LexiconLookupErrorResponse = {
  error: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'MISSING_FIELDS' | 'INVALID_LANGUAGE' | 'TRANSLATOR_ERROR' | 'INTERNAL_ERROR';
  details: string;
};

// ============================================
// COSMOS DB DOCUMENT TYPES
// ============================================

export type SessionUsageDoc = {
  id: string;             // UUID
  studentCode: string;    // Pseudonymous code (e.g. "LB-7K2M")
  schoolCode: string;     // Resolved from studentCode at write time
  gradeBand: GradeBand;   // Resolved from studentCode at write time
  language: SupportedLanguage;
  eventType: AnalyticsEventType;
  timestamp: string;
  extensionVersion: string;
  term?: string;
  subject?: string;
  source?: 'lexicon' | 'translator_fallback';
  difficulty?: 'high' | 'medium' | 'low';
  // Never include: student name, email, or any identifying info
};

export type EnrollmentDoc = {
  id: string;             // The student code itself (e.g. "LB-7K2M")
  schoolCode: string;
  gradeBand: GradeBand;
  language: SupportedLanguage;
  createdAt: string;
  // Teacher sees this code and nicknames it on their side
  // We never store the nickname or the student's real name
};

export type FlagDoc = {
  id: string;             // SHA-256 hash of (flaggedText + language) for deduplication
  flaggedText: string;    // Full highlighted text (up to 500 chars) — student input only, never Azure output
  language: SupportedLanguage;
  flagCount: number;
  status: 'logged' | 'review' | 'bounty' | 'high_priority';
  schoolCodes: string[];
  contentSource: 'student_input';  // Provenance tag — this data is user-generated, not Azure-derived
  createdAt: string;
  lastFlaggedAt: string;
  requiresReview: boolean;
  // NOTE: No audioUrl, cognate, or translation fields here. The bounty pipeline
  // sends ONLY (flaggedText + language) to interpreters. Azure-generated content is
  // never forwarded to the interpreter marketplace.
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
  subjects?: string;        // Pipe-delimited: "math|science|ela"
  grade_band?: string;      // "K-2", "3-5", "6-8", "9-12"
  grade_bands?: string;     // Pipe-delimited: "3-5|6-8|9-12"
  ohio_standard?: string;   // e.g. "SCI.5.LS.1"
  cognate: string | null;

  // Bridge phrases — two tiers of plain-language definitions
  bridge_anchor: string | null;      // Shortest form (2-5 words): "the answer"
  bridge_scaffold: string | null;    // Expanded form (5-15 words): "what you get when you work through a problem"
  bridge_definition: string | null;  // Legacy: same as bridge_scaffold (for backwards compat)
  bridge_definition_en: string | null;

  // Grammatical forms — bridges for noun/verb/adjective usage
  grammatical_forms?: {
    noun: string | null;
    verb: string | null;
    adjective: string | null;
  };

  // Etymology + transliteration metadata
  awl_match?: boolean;               // Academic Word List match
  is_latin_derived?: boolean;
  is_greek_derived?: boolean;
  etymology_evidence?: string | null; // e.g. "L-suffix:tion|L-root:duc"
  transliteration_difficulty?: 'high' | 'medium' | 'low';

  // Audio
  audio_blob_path: string | null;
  audio_source: 'proprietary' | 'azure' | null;
  audio_model?: string;     // e.g. "dari_tts_v1"
  tts_backend?: 'piper' | 'azure';  // Which TTS system generated audio

  // Quality + lifecycle
  status: 'auto_generated' | 'pending_review' | 'approved' | 'deprecated';
  version: number;
  usage_count: number;
  flag_count: number;
  frequency?: number;       // How often this term appears in Ohio standards
  is_bridge_priority?: boolean;

  created_by: string;       // 'rbern_glossary' | 'bridge_pipeline_v1' | 'translator_fallback' | 'manual'
  created_at: string;
  updated_at: string;
};

export const FLAG_THRESHOLDS = {
  REVIEW: 3,        // Flag goes to review queue
  BOUNTY: 6,        // Flag becomes a bounty for interpreter marketplace
  HIGH_PRIORITY: 10 // Escalate immediately
} as const;
