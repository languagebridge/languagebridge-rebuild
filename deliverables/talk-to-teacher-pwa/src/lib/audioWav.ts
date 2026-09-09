// Talk to Teacher (PWA) — microphone capture + WAV transcode.
//
// This is the extension's offscreen.js pipeline, ported to run directly in the
// page. In a PWA there is NO offscreen document and NO background worker: a
// secure-context (https) page can call getUserMedia itself. Everything else —
// record → decode → resample to 16 kHz mono → 16-bit PCM WAV → measure levels —
// is carried over verbatim, because Azure STT's REST endpoint needs exactly that
// format and the level stats power the "I didn't hear anything / too noisy"
// diagnostics.

export type MicErrorCode =
  | 'mic-permission'
  | 'no-mic'
  | 'no-audio'
  | 'decode-failed'
  | 'insecure-context';

export interface WavResult {
  ok: true;
  wavBase64: string;
  durationMs: number;
  peak: number;      // 0..1 loudest sample — < 0.02 ⇒ effectively silence
  rms: number;       // 0..1 average energy
  clipRatio: number; // fraction of samples at rail — > 0.25 ⇒ too loud / noisy
}

export interface MicError {
  ok: false;
  code: MicErrorCode;
  details?: string;
}

const HARD_CAP_MS = 50000; // slightly above the UI's 45s so the UI timer wins first

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = '';
  private hardCapTimer: ReturnType<typeof setTimeout> | null = null;

  /** Begin capture. Returns {ok:true} or a typed MicError. */
  async start(): Promise<{ ok: true } | MicError> {
    this.teardown();

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return { ok: false, code: 'insecure-context' };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
        return { ok: false, code: 'no-mic' };
      }
      // NotAllowedError / SecurityError = permission denied/blocked.
      return { ok: false, code: 'mic-permission' };
    }

    this.chunks = [];
    this.mimeType = pickMimeType();
    try {
      this.recorder = this.mimeType
        ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
        : new MediaRecorder(this.stream);
    } catch {
      this.recorder = new MediaRecorder(this.stream);
    }
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.start();

    this.hardCapTimer = setTimeout(() => {
      try { if (this.recorder && this.recorder.state === 'recording') this.recorder.stop(); } catch { /* noop */ }
    }, HARD_CAP_MS);

    return { ok: true };
  }

  /** Stop capture and return the transcoded 16 kHz WAV + level stats. */
  stop(): Promise<WavResult | MicError> {
    return new Promise((resolve) => {
      if (this.hardCapTimer) { clearTimeout(this.hardCapTimer); this.hardCapTimer = null; }
      if (!this.recorder) { this.teardown(); resolve({ ok: false, code: 'no-audio' }); return; }

      const finish = async () => {
        try {
          const blob = new Blob(this.chunks, { type: this.mimeType || 'audio/webm' });
          if (blob.size < 256) { this.teardown(); resolve({ ok: false, code: 'no-audio' }); return; }
          const result = await transcodeToWav(blob);
          this.teardown();
          resolve(result);
        } catch (err) {
          this.teardown();
          resolve({ ok: false, code: 'decode-failed', details: String((err as Error)?.message) });
        }
      };

      if (this.recorder.state === 'inactive') { finish(); return; }
      this.recorder.onstop = finish;
      try { this.recorder.stop(); } catch { finish(); }
    });
  }

  teardown(): void {
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
}

// Decode recorded audio, resample to 16 kHz mono, measure levels, encode WAV.
async function transcodeToWav(blob: Blob): Promise<WavResult> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    decodeCtx.close();
  }

  const targetRate = 16000;
  const durationSec = decoded.duration;
  const frameCount = Math.max(1, Math.ceil(durationSec * targetRate));
  const offline = new OfflineAudioContext(1, frameCount, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  let peak = 0, sumSq = 0, clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    sumSq += samples[i] * samples[i];
    if (a > 0.98) clipped++;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  const clipRatio = clipped / samples.length;

  const wavBuffer = encodeWav(samples, targetRate);
  return {
    ok: true,
    wavBase64: arrayBufferToBase64(wavBuffer),
    durationMs: Math.round(durationSec * 1000),
    peak, rms, clipRatio,
  };
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);        // PCM chunk size
  view.setUint16(20, 1, true);         // PCM format
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);         // block align
  view.setUint16(34, 16, true);        // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export function micErrorMessage(code: MicErrorCode): string {
  switch (code) {
    case 'mic-permission':    return 'The microphone is off. Tap "Turn on microphone" and allow it.';
    case 'no-mic':            return 'No microphone found. Plug one in and try again.';
    case 'no-audio':          return "I didn't hear anything. Check your sound is on, then speak toward the mic.";
    case 'decode-failed':     return "I couldn't read that audio. Try again.";
    case 'insecure-context':  return 'The microphone needs a secure (https) connection.';
    default:                  return 'Microphone problem. Please try again.';
  }
}
