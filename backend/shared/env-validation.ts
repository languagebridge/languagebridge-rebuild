/**
 * Environment Variable Validation
 *
 * Validates all required env vars exist on cold start.
 * Fail fast instead of cryptic runtime errors mid-request.
 */

const REQUIRED_VARS = [
  'COSMOS_DB_ENDPOINT',
  'COSMOS_DB_KEY',
  'AZURE_BLOB_CONN_STRING',
  'LB_API_KEY',
] as const;

const OPTIONAL_WITH_WARNINGS = [
  'AZURE_TTS_KEY',
  'AZURE_TTS_REGION',
  'AZURE_TRANSLATOR_KEY',
  'AZURE_TRANSLATOR_REGION',
  'AZURE_STORAGE_ACCOUNT',
  'AZURE_STORAGE_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LB_TTS_SERVICE_URL',
] as const;

export function validateEnvironment(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  for (const key of OPTIONAL_WITH_WARNINGS) {
    if (!process.env[key]) {
      warnings.push(key);
    }
  }

  if (warnings.length > 0) {
    console.warn(`[env-validation] Optional env vars not set (some features may be degraded): ${warnings.join(', ')}`);
  }

  if (missing.length > 0) {
    const msg = `[env-validation] Missing required environment variables: ${missing.join(', ')}`;
    if (process.env.NODE_ENV === 'development') {
      console.warn(msg + ' — continuing in development mode');
    } else {
      throw new Error(msg);
    }
  }
}
