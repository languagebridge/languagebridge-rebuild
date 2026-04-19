import { speechToText } from '../../azure-functions/speech-to-text/index';
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
    url: 'http://localhost/api/speech-to-text',
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
  audioBase64: Buffer.from('fake-audio-data').toString('base64'),
  audioFormat: 'webm',
  language: 'dari',
  studentCode: 'LB-TEST1',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AZURE_TTS_KEY = 'test-key';
  process.env.AZURE_TTS_REGION = 'eastus';
});

afterEach(() => {
  delete process.env.AZURE_TTS_KEY;
  delete process.env.AZURE_TTS_REGION;
});

describe('speech-to-text', () => {
  it('transcribes audio and returns text', async () => {
    const axios = require('axios');
    axios.post.mockResolvedValue({
      data: {
        RecognitionStatus: 'Success',
        DisplayText: 'من درد شکم دارم',
        NBest: [{ Display: 'من درد شکم دارم', Confidence: 0.92 }],
      },
    });

    const res = await speechToText(makeRequest(validBody), ctx());
    expect(res.status).toBe(200);

    const body = res.jsonBody as Record<string, unknown>;
    expect(body.text).toBe('من درد شکم دارم');
    expect(body.language).toBe('dari');
    expect(body.confidence).toBe(0.92);
  });

  it('rejects missing required fields', async () => {
    const res = await speechToText(makeRequest({ audioBase64: 'abc' }), ctx());
    expect(res.status).toBe(400);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('MISSING_FIELDS');
  });

  it('rejects invalid language', async () => {
    const res = await speechToText(
      makeRequest({ ...validBody, language: 'klingon' }),
      ctx()
    );
    expect(res.status).toBe(400);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('INVALID_LANGUAGE');
  });

  it('rejects languages not supported by Azure STT', async () => {
    const res = await speechToText(
      makeRequest({ ...validBody, language: 'kinyarwanda' }),
      ctx()
    );
    expect(res.status).toBe(400);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('LANGUAGE_NOT_SUPPORTED');
  });

  it('rejects invalid audio format', async () => {
    const res = await speechToText(
      makeRequest({ ...validBody, audioFormat: 'flac' }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it('rejects oversized audio (>4MB)', async () => {
    const bigAudio = Buffer.alloc(5 * 1024 * 1024).toString('base64');
    const res = await speechToText(
      makeRequest({ ...validBody, audioBase64: bigAudio }),
      ctx()
    );
    expect(res.status).toBe(400);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('AUDIO_TOO_LARGE');
  });

  it('returns 422 when Azure STT cannot transcribe', async () => {
    const axios = require('axios');
    axios.post.mockResolvedValue({
      data: { RecognitionStatus: 'NoMatch' },
    });

    const res = await speechToText(makeRequest(validBody), ctx());
    expect(res.status).toBe(422);
    expect((res.jsonBody as Record<string, unknown>).error).toBe('TRANSCRIPTION_FAILED');
  });

  it('returns 502 when Azure STT service errors', async () => {
    const axios = require('axios');
    const axiosError = new Error('Network error');
    (axiosError as unknown as { isAxiosError: boolean }).isAxiosError = true;
    axios.post.mockRejectedValue(axiosError);
    axios.isAxiosError = jest.fn().mockReturnValue(true);

    const res = await speechToText(makeRequest(validBody), ctx());
    expect(res.status).toBe(502);
  });

  it('returns 500 when TTS key is not configured', async () => {
    delete process.env.AZURE_TTS_KEY;
    const res = await speechToText(makeRequest(validBody), ctx());
    expect(res.status).toBe(500);
  });
});
