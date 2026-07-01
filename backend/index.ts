/**
 * LanguageBridge Backend Entry Point
 *
 * Imports all Azure Functions so they register with the runtime.
 * Azure Functions v4 discovers functions via this file (set as "main" in package.json).
 */

import { validateEnvironment } from './shared/env-validation';

// Validate required env vars on cold start — fail fast, not mid-request
validateEnvironment();

import './azure-functions/tts-router/index';
import './azure-functions/analytics-writer/index';
import './azure-functions/flag-handler/index';
import './azure-functions/auth-layer/index';
import './azure-functions/lexicon-lookup/index';
import './azure-functions/onboarding/index';
import './azure-functions/dashboard/index';
import './azure-functions/speech-to-text/index';
import './azure-functions/translate/index';
