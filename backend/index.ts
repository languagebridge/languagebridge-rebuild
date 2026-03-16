/**
 * LanguageBridge Backend Entry Point
 *
 * Imports all four Azure Functions so they register with the runtime.
 * Azure Functions v4 discovers functions via this file (set as "main" in package.json).
 */

import './azure-functions/tts-router/index';
import './azure-functions/analytics-writer/index';
import './azure-functions/flag-handler/index';
import './azure-functions/auth-layer/index';
