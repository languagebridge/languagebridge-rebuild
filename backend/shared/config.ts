/**
 * Startup Configuration Validator
 *
 * Validates all required environment variables at import time.
 * If any are missing, throws immediately with a clear message
 * listing every missing variable — not one at a time.
 *
 * Import this module early in each function's dependency chain
 * to fail fast on cold start rather than mid-request.
 */

type ConfigKey = {
  name: string;
  required: boolean;
  description: string;
};

const CONFIG_SCHEMA: ConfigKey[] = [
  // Cosmos DB
  { name: 'COSMOS_DB_ENDPOINT', required: true, description: 'Cosmos DB endpoint URL' },
  { name: 'COSMOS_DB_KEY', required: true, description: 'Cosmos DB access key' },
  { name: 'COSMOS_DB_DATABASE', required: true, description: 'Cosmos DB database name (no default — must be explicit)' },

  // Blob Storage
  { name: 'AZURE_BLOB_CONN_STRING', required: true, description: 'Blob Storage connection string' },
  { name: 'AZURE_STORAGE_ACCOUNT', required: true, description: 'Storage account name (for SAS URL generation)' },
  { name: 'AZURE_STORAGE_KEY', required: true, description: 'Storage account key (for SAS URL signing)' },

  // API Key
  { name: 'LB_API_KEY', required: true, description: 'API key for student-facing endpoints' },

  // Azure Speech (TTS)
  { name: 'AZURE_TTS_KEY', required: false, description: 'Azure Speech Services key (required for TTS)' },
  { name: 'AZURE_TTS_REGION', required: false, description: 'Azure Speech region (defaults to eastus)' },

  // Azure Translator
  { name: 'AZURE_TRANSLATOR_KEY', required: false, description: 'Azure Translator key (required for cognate fallback)' },
  { name: 'AZURE_TRANSLATOR_REGION', required: false, description: 'Azure Translator region' },

  // Supabase (teacher auth — optional for student endpoints)
  { name: 'SUPABASE_URL', required: false, description: 'Supabase project URL (required for teacher dashboard)' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: false, description: 'Supabase service role key' },
];

export function validateConfig(): { valid: boolean; missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const key of CONFIG_SCHEMA) {
    const value = process.env[key.name];
    if (!value || value.trim() === '') {
      if (key.required) {
        missing.push(`${key.name} — ${key.description}`);
      } else {
        warnings.push(`${key.name} not set — ${key.description}`);
      }
    }
  }

  return { valid: missing.length === 0, missing, warnings };
}

/**
 * Call this at function startup to fail fast.
 * In test/development mode, only warns instead of throwing.
 */
export function assertConfig(context?: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }): void {
  const { valid, missing, warnings } = validateConfig();

  // Log warnings for optional missing vars
  if (warnings.length > 0 && context) {
    context.warn(`Optional config not set:\n  ${warnings.join('\n  ')}`);
  }

  if (!valid) {
    const msg = `Missing required environment variables:\n  ${missing.join('\n  ')}`;
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      if (context) context.warn(`[DEV] ${msg}`);
    } else {
      throw new Error(msg);
    }
  }
}
