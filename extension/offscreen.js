// extension/offscreen.js
// Microphone capture for Talk to Teacher. Runs in the extension's own origin
// so getUserMedia works on any page. Records, then transcodes to 16kHz mono
// 16-bit PCM WAV (the format the backend's Azure STT REST endpoint accepts)
// and measures audio levels for error diagnostics.

let mediaRecorder = null;
let stream = null;
let chunks = [];
let mimeType = '';

// Hard cap slightly above the UI's 45s so the UI timer always wins first.
const HARD_CAP_MS = 50000;
let hardCapTimer = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  if (msg.cmd === 'start') {
    startRecording().then(sendResponse);
    return true;
  }
  if (msg.cmd === 'stop') {
    stopRecording().then(sendResponse);
    return true;
  }
  return false;
});

async function startRecording() {
  // Clean up any prior session.
  teardown();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    // NotAllowedError/SecurityError = permission blocked; NotFoundError = no device.
    const name = err && err.name;
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      return { ok: false, errorCode: 'no-mic' };
    }
    return { ok: false, errorCode: 'mic-permission' };
  }

  chunks = [];
  mimeType = pickMimeType();
  try {
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  } catch {
    mediaRecorder = new MediaRecorder(stream);
  }
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.start();

  hardCapTimer = setTimeout(() => { try { mediaRecorder && mediaRecorder.state === 'recording' && mediaRecorder.stop(); } catch {} }, HARD_CAP_MS);

  return { ok: true };
}

function stopRecording() {
  return new Promise((resolve) => {
    if (hardCapTimer) { clearTimeout(hardCapTimer); hardCapTimer = null; }
    if (!mediaRecorder) { teardown(); resolve({ ok: false, errorCode: 'no-audio' }); return; }

    const finish = async () => {
      try {
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        if (blob.size < 256) { teardown(); resolve({ ok: false, errorCode: 'no-audio' }); return; }
        const result = await transcodeToWav(blob);
        teardown();
        resolve(result);
      } catch (err) {
        teardown();
        resolve({ ok: false, errorCode: 'decode-failed', details: String(err && err.message) });
      }
    };

    if (mediaRecorder.state === 'inactive') { finish(); return; }
    mediaRecorder.onstop = finish;
    try { mediaRecorder.stop(); } catch { finish(); }
  });
}

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

// Decode the recorded audio, resample to 16kHz mono, measure levels, encode WAV.
async function transcodeToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  let decoded;
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

  // Level analysis for diagnostics.
  let peak = 0;
  let sumSq = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    sumSq += samples[i] * samples[i];
    if (a > 0.98) clipped++;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  const clipRatio = clipped / samples.length;

  const wavBuffer = encodeWav(samples, targetRate);
  const wavBase64 = arrayBufferToBase64(wavBuffer);

  return {
    ok: true,
    wavBase64,
    durationMs: Math.round(durationSec * 1000),
    peak,
    rms,
    clipRatio,
  };
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function teardown() {
  try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch {}
  stream = null;
  mediaRecorder = null;
  chunks = [];
}
