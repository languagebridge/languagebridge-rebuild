import { describe, it, expect, vi, beforeAll } from 'vitest';

// background.js is the MV3 service worker: it registers chrome listeners on import
// and imports the gitignored config.local.js. Stub both before loading it.
vi.mock('../../extension/config.local.js', () => ({ LB_API_KEY: 'test' }));

const syncStore: Record<string, unknown> = {};
const listener = { addListener: () => {} };
(globalThis as any).chrome = {
  runtime: { onInstalled: listener, onMessage: listener, onStartup: listener },
  commands: { onCommand: listener },
  action: { onClicked: listener },
  tabs: { onUpdated: listener, onActivated: listener },
  storage: {
    local: { get: async () => ({}), set: async () => {} },
    sync: {
      get: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, syncStore[k]])),
      set: async () => {},
    },
  },
};

let withVariant: (endpoint: string, body: any) => Promise<any>;

beforeAll(async () => {
  ({ withVariant } = await import('../../extension/background.js'));
});

describe('background withVariant', () => {
  it('adds the saved dialect to calls in the student’s language', async () => {
    Object.assign(syncStore, { defaultLanguage: 'spanish', languageVariant: 'es-HN' });
    expect(await withVariant('tts-router', { text: 'hola', language: 'spanish' })).toMatchObject({ variant: 'es-HN' });
    expect(await withVariant('translate', { text: 'hi', fromLanguage: 'english', toLanguage: 'spanish' })).toMatchObject({ toVariant: 'es-HN' });
  });

  it('leaves calls in another language alone', async () => {
    Object.assign(syncStore, { defaultLanguage: 'spanish', languageVariant: 'es-HN' });
    const body = { text: 'hello', language: 'english' };
    expect(await withVariant('speech-to-text', body)).toBe(body);
  });

  it('never overrides an explicit variant', async () => {
    Object.assign(syncStore, { defaultLanguage: 'spanish', languageVariant: 'es-HN' });
    expect(await withVariant('flag-handler', { language: 'spanish', variant: 'es-CU' })).toMatchObject({ variant: 'es-CU' });
  });

  it('does nothing without a saved dialect or for unrelated endpoints', async () => {
    Object.assign(syncStore, { defaultLanguage: 'spanish', languageVariant: '' });
    const body = { language: 'spanish' };
    expect(await withVariant('lexicon-lookup', body)).toBe(body);
    Object.assign(syncStore, { languageVariant: 'es-HN' });
    expect(await withVariant('analytics-writer', body)).toBe(body);
  });
});
