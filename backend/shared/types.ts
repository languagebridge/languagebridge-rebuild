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
  'dari',       // uses Persian Piper; Azure has no Dari voice, so its Azure voice is Persian too
  'pashto',     // uses Persian Piper
  'urdu',       // uses Arabic Piper
  'somali',     // uses Swahili Piper
  // Tier 2 — Azure TTS only (no local model yet)
  'burmese',
  'tagalog',
  'amharic',
  'uzbek',
] as const;

// NOTE: kinyarwanda, twi, and tigrinya were removed (2026-06) because their
// endpoint paths were not working. Re-add here to restore them — TypeScript
// will flag every place that needs a corresponding entry.
// amharic and uzbek were removed with them and restored 2026-10: Azure covers
// both natively (Translator `am`/`uz`, TTS + STT `am-ET`/`uz-UZ`).

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
  variant?: string | null;  // Optional "which sounds most like home" — a language preference, never a country of origin
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
  variant?: string | null;  // BCP 47 dialect tag, e.g. 'es-HN' (shared/variants.ts). Omitted = core language
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

export const FLAG_TYPES = ['translation', 'pronunciation', 'recognition'] as const;
export type FlagType = typeof FLAG_TYPES[number];
// 'translation'   = wrong meaning (mistranslation, still in English, confusing wording)
//                   → fixed by a corrected target term / phrase in the Lexicon
// 'pronunciation' = wrong sound (bad TTS, wrong accent/dialect)
//                   → fixed by a phonetic transcription (SSML phoneme / custom lexicon)
// 'recognition'   = misheard (speech-to-text heard something else, so the input was wrong)
//                   → fixed by a per-language/subject recognition phrase list
// See flywheel/SPEC.md §2. The three are stored together as flags but are fixed
// in three different places — never merge their counts.

export type SeatRole = 'student' | 'teacher';
export type FlagSurface = 'lookup' | 'passage' | 'talk_to_teacher' | 'audio';

export type FlagEventRequest = {
  flaggedText: string;    // The highlighted text (up to 500 chars). For 'recognition', the misheard transcript (up to 200)
  language: SupportedLanguage;  // Target language — for 'recognition', the language that was SPOKEN
  studentCode: string;
  timestamp: string;      // ISO 8601
  flagType: FlagType;
  // ── Optional context (flywheel Phase 1). Older clients omit these. ──
  context?: string;       // Surrounding sentence. Scrubbed + trimmed server-side before storage
  intendedText?: string;  // 'recognition' only: what the speaker actually meant to say (optional)
  subject?: string;       // "math" | "science" | "ela" | "social_studies" — drives sense grouping
  variant?: string | null; // Dialect of `language`. Defaults to the enrollment's variant when languages match
  seatRole?: SeatRole;    // Defaults to 'student'
  surface?: FlagSurface;  // Where in the product the flag was raised
  // NOTE: no audio, no audioUrl, no identity. Grade band and school are resolved
  // server-side from the enrollment, never trusted from the client.
};

export type LexiconLookupRequest = {
  term: string;              // Word or phrase to look up
  language: SupportedLanguage;
  domain?: 'k12_academic' | 'school_navigation' | 'medical' | 'legal_immigration' | 'social_services';
  context?: string;          // Subject context for disambiguation (e.g. "science", "social_studies")
  variant?: string | null;   // Dialect, e.g. 'es-HN' — prefers variant entries, falls back to core
  studentCode: string;
};

// auth-layer reads the Authorization header directly — no request body type needed

// ============================================
// TALK TO TEACHER — STT + TRANSLATE
// ============================================
//
// PRIVACY NOTE: Both endpoints are ephemeral. Audio and translated text are
// never persisted to the database. We pass through to Azure, return the result,
// and forget it. This is more sensitive data than vocabulary lookups because
// conversations can include anything a student says to a teacher.

export type SpeechToTextRequest = {
  audioBase64: string;       // Audio file encoded as base64 (webm/opus, wav, or mp3)
  audioFormat: 'webm' | 'wav' | 'mp3' | 'ogg';
  language: SupportedLanguage;
  variant?: string | null;  // BCP 47 dialect tag, e.g. 'es-HN' (shared/variants.ts). Omitted = core language
  studentCode: string;
};

export type SpeechToTextResponse = {
  text: string;              // Transcribed text in the source language
  language: SupportedLanguage;
  confidence?: number;       // Azure's confidence score (0-1)
};

export type SpeechToTextErrorResponse = {
  error:
    | 'UNAUTHORIZED'
    | 'RATE_LIMITED'
    | 'MISSING_FIELDS'
    | 'INVALID_LANGUAGE'
    | 'LANGUAGE_NOT_SUPPORTED'  // Some languages don't have STT support
    | 'AUDIO_TOO_LARGE'
    | 'TRANSCRIPTION_FAILED'
    | 'AZURE_SERVICE_ERROR'
    | 'INTERNAL_ERROR';
  details: string;
};

export type TranslateRequest = {
  text: string;              // Text to translate (max 2000 chars)
  fromLanguage: SupportedLanguage;
  toLanguage: SupportedLanguage;
  toVariant?: string | null;  // Dialect of the target language; selects Lexicon overrides
  studentCode: string;
};

export type TranslateResponse = {
  translatedText: string;
  fromLanguage: SupportedLanguage;
  toLanguage: SupportedLanguage;
};

export type TranslateErrorResponse = {
  error:
    | 'UNAUTHORIZED'
    | 'RATE_LIMITED'
    | 'MISSING_FIELDS'
    | 'INVALID_LANGUAGE'
    | 'TEXT_TOO_LONG'
    | 'TRANSLATION_FAILED'
    | 'AZURE_SERVICE_ERROR'
    | 'INTERNAL_ERROR';
  details: string;
};

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
  error: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'PII_VIOLATION' | 'INVALID_EVENT_TYPE' | 'MISSING_FIELDS' | 'INVALID_STUDENT_CODE' | 'INTERNAL_ERROR';
  details: string;
  prohibitedFields?: string[]; // which fields triggered the PII check
};

export type FlagHandlerResponse = {
  flagId: string;
  flagCount: number;
  status: FlagDoc['status'];
  requiresReview: boolean;
  // Phase 3: bountyValue will be set when status='bounty' — interpreter marketplace
  // Bounty only contains (word + language), never Azure-derived content
};

export type FlagHandlerErrorResponse = {
  error: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'MISSING_FIELDS' | 'INVALID_LANGUAGE' | 'INVALID_FLAG_TYPE' | 'INVALID_TEXT' | 'PII_VIOLATION' | 'TEXT_TOO_LONG' | 'INTERNAL_ERROR';
  details: string;
};

export type AuthResponse = {
  userId: string;
  email: string;
  accessiblePilotIds: string[];
  isSuperAdmin: boolean;
  permissions: Array<'view_dashboard' | 'export_data' | 'manage_flags' | 'manage_users'>;
  role?: AdminRole;           // super_admin | district_admin | champion
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

  // Provenance (flywheel Phase 1, additive). Clients may show a "verified" badge
  // for 'human_verified'; usage logs record entry_id so we can count what fired.
  entry_id?: string | null;
  provenance?: LexiconProvenance;
  variant?: string | null;  // Variant of the entry served (null = core)
};

// Where a served translation came from — ranked best first.
//   human_verified — passed the two-approval review gate (status 'approved')
//   glossary       — seeded from a published glossary (RBERN) or the bridge pipeline
//   machine        — Azure Translator output cached on a lookup miss
export type LexiconProvenance = 'human_verified' | 'glossary' | 'machine';

export type LexiconLookupErrorResponse = {
  error: 'UNAUTHORIZED' | 'RATE_LIMITED' | 'MISSING_FIELDS' | 'INVALID_STUDENT_CODE' | 'INVALID_LANGUAGE' | 'TRANSLATOR_ERROR' | 'INTERNAL_ERROR';
  details: string;
};

// ============================================
// COSMOS DB DOCUMENT TYPES
// ============================================

export type SessionUsageDoc = {
  id: string;             // UUID
  studentCode: string;    // Pseudonymous code (e.g. "LB-7K2M")
  pilotId: string;        // Partition key. Resolved from studentCode at write time ('unknown' if unresolved)
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
  variant?: string | null;
  createdAt: string;
  // Teacher sees this code and nicknames it on their side
  // We never store the nickname or the student's real name
};

// A flag document is a CANDIDATE: every report of the same text, in the same
// language and subject, increments one document. The subject is part of the key
// because it is the best sense signal we have at capture time ("table" in math
// and "table" at lunch are two candidates). See flywheel/DATA-MODEL.md.
export type FlagDoc = {
  id: string;             // SHA-256 of `${text}::${language}` (+ `::${subject}`, + `::${variant}` when known)
  flaggedText: string;    // Normalized text (lower-cased, trimmed). Never contains detected PII
  language: SupportedLanguage;
  subject?: string | null;
  variant?: string | null;            // Part of the key — a Honduran fix is a different candidate from a core one
  scope?: 'term' | 'passage';         // > FLAG_MAX_TERM_WORDS words = passage: the fixer must name the wrong word
  flagCount: number;                  // Total flags across all types
  pronunciationFlagCount: number;     // "wrong sound"
  translationFlagCount: number;       // "wrong meaning"
  recognitionFlagCount?: number;      // "misheard" (absent on docs created before Phase 1)
  status: 'logged' | 'review' | 'bounty' | 'high_priority' | 'in_review' | 'resolved' | 'dismissed';
  schoolCodes: string[];              // Distinct schools reporting — internal only, NEVER shown to contributors
  gradeBands?: GradeBand[];           // Distinct grade bands reporting
  seatRoles?: SeatRole[];
  surfaces?: FlagSurface[];
  contexts?: FlagContextSample[];     // Up to FLAG_CONTEXT_SAMPLE_CAP scrubbed samples
  contentSource: 'student_input' | 'speech_recognition';
  createdAt: string;
  lastFlaggedAt: string;
  requiresReview: boolean;
  resolution?: {                      // Set by the admin flag queue
    action: 'dismissed' | 'in_review' | 'resolved';
    note: string | null;
    entryId: string | null;           // Lexicon entry that fixed it, when resolved
    by: string;                       // Admin user id (never shown to contributors)
    at: string;
  };
  resolutionHistory?: Array<NonNullable<FlagDoc['resolution']>>;  // Every admin action, oldest first
};

// Admin flag queue (internal, super-admin only). School codes are reduced to a
// count — the queue is cross-district and must not leak which school reported what.
export type FlagQueueItem = Omit<FlagDoc, 'schoolCodes' | 'resolutionHistory'> & { schoolCount: number };
export type FlagQueueAction = 'in_review' | 'resolved' | 'dismissed' | 'reopen';

export type FlagContextSample = {
  text: string;           // Scrubbed window around the term (≤ 200 chars)
  flagType: FlagType;
  intendedText?: string | null;  // recognition only, scrubbed
  gradeBand: GradeBand | null;
  seatRole: SeatRole;
  surface: FlagSurface | null;
  at: string;
};

export const FLAG_CONTEXT_SAMPLE_CAP = 10;
export const FLAG_MAX_TERM_WORDS = 6;

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

export type AdminRole = 'super_admin' | 'district_admin' | 'champion';

export type AdminUserDoc = {
  id: string;
  email: string;              // Adult staff account (teacher / district admin). Never a student.
  pilotIds: string[];         // School license record ids this user can see
  districtIds?: string[];     // District ids — every school in the district, including ones added later
  permissions: Array<'view_dashboard' | 'export_data' | 'manage_flags' | 'manage_users'>;
  isSuperAdmin: boolean;
  role?: AdminRole;
  displayName?: string | null;
  invitedBy?: string;
  invitedAt?: string;
  createdAt: string;
  lastLoginAt?: string;
};

// ============================================
// DISTRICT ANALYTICS & OPS (docs/PRD-DISTRICT-ANALYTICS.md)
// ============================================

export type LicenseStatus = 'trial' | 'active' | 'expired' | 'suspended';
export type PricingModel = 'free_pilot' | 'per_seat' | 'building' | 'custom';

/**
 * One school's license record, stored in `pilots` (id = school record id).
 * company/PROVISIONING-AND-LICENSING.md §2. Seats USED are derived from
 * enrollments, never stored here.
 */
export type SchoolLicenseDoc = {
  id: string;                 // e.g. 'greenbriar'
  type?: 'school';
  schoolCode: string;         // analytics scope key
  schoolName: string;
  pilotId: string;            // district id — the partition key of sessions/analytics
  gradeBands: GradeBand[];
  isActive: boolean;
  isDemo?: boolean;
  seats?: number;             // EL-student seats purchased
  tier?: 'Starter' | 'Growth' | 'District' | 'Enterprise' | 'Building' | 'Pilot' | 'Custom';
  pricingModel?: PricingModel;
  annualPriceUsd?: number;    // what this school's license brings in per year
  termStart?: string;         // ISO date
  termEnd?: string;
  status?: LicenseStatus;
  dpaRef?: string | null;
  updatedAt?: string;
};

export type DistrictDoc = {
  id: string;                 // 'district:<pilotId>'
  type: 'district';
  pilotId: string;            // e.g. 'PCSD-2026'
  name: string;
  state?: string | null;
  contractAnnualUsd?: number | null;  // set when the district buys one contract instead of per-school licenses
  isDemo?: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HealthSeverity = 'info' | 'warning' | 'critical';

/** A banner the dashboard shows to super-admins. Ids are stable so the UI can dismiss/snooze. */
export type HealthBanner = {
  id: string;                 // e.g. 'quota.translator', 'cosmos.throttling'
  severity: HealthSeverity;
  title: string;
  detail: string;
  metric?: string;
  value?: number;
  threshold?: number;
  action?: string;
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

  // Dialect. null/absent = core language entry, shared by every variant. A variant
  // entry is stored only where the variant genuinely differs (shared/variants.ts).
  variant?: string | null;

  // Override layer (Dual Codex, flywheel Phase 2). Absent on plain glossary rows.
  //   phrase     — whole classroom phrase, substituted as a unit ("line up for lunch")
  //   fixed_term — non-inflecting term / proper noun, sent as Azure dynamic dictionary
  //   term       — a single word with stored inflected forms (post-translation substitution)
  entry_kind?: 'phrase' | 'fixed_term' | 'term';
  sense_key?: string;       // e.g. "table#math" — entries are keyed by English SENSE, not spelling
  sense_gloss?: string;     // Short English gloss shown to contributors ("rows and columns of numbers")

  // Quality + lifecycle
  status: 'auto_generated' | 'pending_review' | 'approved' | 'deprecated';
  version: number;
  usage_count: number;
  flag_count: number;
  frequency?: number;       // How often this term appears in Ohio standards
  is_bridge_priority?: boolean;

  // Authorship trail — required on every 'approved' entry (TRAINING-DATA-POLICY §2).
  // Contributor IDs only (e.g. "C-007"), never names.
  authored_by?: string;
  reviewed_by?: string[];   // Two distinct reviewers, neither the author
  ai_assisted?: boolean;
  approved_at?: string;
  source_flag_id?: string;  // Flag candidate this entry resolved, if any

  created_by: string;       // 'rbern_glossary' | 'bridge_pipeline_v1' | 'translator_fallback' | 'manual' | 'flywheel_publish'
  created_at: string;
  updated_at: string;
};

export const FLAG_THRESHOLDS = {
  REVIEW: 3,        // Flag goes to review queue
  BOUNTY: 6,        // Flag becomes a bounty for interpreter marketplace
  HIGH_PRIORITY: 10 // Escalate immediately
} as const;
