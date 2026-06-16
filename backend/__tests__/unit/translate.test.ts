import { translate } from '../../azure-functions/translate/index';
import { HttpRequest, InvocationContext } from '@azure/functions';

jest.mock('../../shared/cosmos-client', () => ({
  getRateLimitContainer: () => ({
    item: () => ({ patch: jest.fn().mockResolvedValue({ resource: { count: 1 } }) }),
    items: { create: jest.fn().mockResolvedValue({}) },
  }),
}));

jest.mock('axios');

function makeRequest(body: Record<string, unknown>): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/translate',
    headers: new Map([['x-lb-api-key', 'test-api-key-for-jest']]),
    query: new Map(),
    params: {},
    json: async () => body,
  } as unknown as HttpRequest;
}

function ctx(): InvocationContext {
  return { log: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as InvocationContext;
}

const validBody = {
  text: 'I have a stomach ache',
  fromLanguage: 'english',
  toLanguage: 'dari',
  studentCode: 'LB-TEST7',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AZURE_TRANSLATOR_KEY = 'test-key';
  process.env.AZURE_TRANSLATOR_REGION = 'eastus';
});

afterEach(() => {
  delete process.env.AZURE_TRANSLATOR_KEY;
  delete process.env.AZURE_TRANSLATOR_REGION;
});

describe('translate', () => {
  it('translates text between two supported languages', async () => {
    const axios = require('axios');
    axios.post.mockResolvedValue({
      data: [{ translations: [{ text: 'من درد شکم دارم' }] }],
    });

    const res = await translate(makeRequest(validBody), ctx());
    expect(res.status).toBe(200);

    const body = res.jsonBody as Record<string, unknown>;
    expect(body.translatedText).toBe('من درد شکم دارم');
    expect(body.fromLanguage).toBe('english');
    expect(body.toLanguage).toBe('dari');
  });

  it('short-circuits when source and target map to same code (dari→persian)', async () => {
    const res = await translate(
      makeRequest({ ...validBody, fromLanguage: 'dari', toLanguage: 'persian', text: 'hello' }),
      ctx()
    );
    expect(res.status).toBe(200);

    const body = res.jsonBody as Record<string, unknown>;
    expect(body.translatedText).toBe('hello'); // Returned verbatim
  });

  it('rejects missing required fields', async () => {
    const res = await translate(makeRequest({ text: 'hello' }), ctx());
    expect(res.status).toBe(400);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('MISSING_FIELDS');
  });

  it('rejects empty text', async () => {
    const res = await translate(
      makeRequest({ ...validBody, text: '   ' }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it('rejects text over 2000 characters', async () => {
    const res = await translate(
      makeRequest({ ...validBody, text: 'a'.repeat(2001) }),
      ctx()
    );
    expect(res.status).toBe(400);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('TEXT_TOO_LONG');
  });

  it('rejects invalid languages', async () => {
    const res = await translate(
      makeRequest({ ...validBody, fromLanguage: 'klingon' }),
      ctx()
    );
    expect(res.status).toBe(400);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('INVALID_LANGUAGE');
  });

  it('returns 502 when Azure returns empty translation', async () => {
    const axios = require('axios');
    axios.post.mockResolvedValue({ data: [{ translations: [] }] });

    const res = await translate(makeRequest(validBody), ctx());
    expect(res.status).toBe(502);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('TRANSLATION_FAILED');
  });

  it('returns 502 when Azure service errors', async () => {
    const axios = require('axios');
    const axiosError = new Error('Network error');
    (axiosError as unknown as { isAxiosError: boolean }).isAxiosError = true;
    axios.post.mockRejectedValue(axiosError);
    axios.isAxiosError = jest.fn().mockReturnValue(true);

    const res = await translate(makeRequest(validBody), ctx());
    expect(res.status).toBe(502);
  });

  it('returns 500 when Translator key is not configured', async () => {
    delete process.env.AZURE_TRANSLATOR_KEY;
    const res = await translate(makeRequest(validBody), ctx());
    expect(res.status).toBe(500);
  });
});
