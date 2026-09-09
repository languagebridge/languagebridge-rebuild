// Talk to Teacher (PWA) — the /teacher route.
//
// A clone of the extension's floating-translator, rebuilt as a self-contained
// React component for languagebridge.app/teacher. One computer, two people:
// each taps THEIR language, speaks, and the app transcribes → translates → shows
// it in the transcript and reads it aloud in the other language. Manual
// turn-taking, kid-friendly errors. No Chrome APIs — pure browser + backend proxy.

import { useCallback, useEffect, useRef, useState } from 'react';
import { LANGUAGE_LIST, langInfo } from './languages';
import { MicRecorder, micErrorMessage } from './lib/audioWav';
import { transcribe, translate } from './lib/api';
import { TtsPlayer } from './lib/tts';
import './TalkToTeacher.css';

const MAX_RECORD_MS = 45000;

type Side = 'A' | 'B';
type StatusKind = 'listening' | 'error' | '';

interface Bubble {
  id: number;
  side: Side;
  original: string;
  translated: string;
  fromLang: string;
  toLang: string;
}

export interface TalkToTeacherProps {
  /** Enrolled student code (format LB-XXXX). Required — the backend rejects malformed codes. */
  studentCode: string;
  /** Language the student speaks. Defaults to 'dari'. Side A (partner) defaults to English. */
  studentLanguage?: string;
  /** Optional close handler; renders an × when provided. */
  onClose?: () => void;
}

let bubbleSeq = 0;

export default function TalkToTeacher({ studentCode, studentLanguage = 'dari', onClose }: TalkToTeacherProps) {
  const [langA, setLangA] = useState('english');       // partner / teacher
  const [langB, setLangB] = useState(studentLanguage);  // student
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [pendingSide, setPendingSide] = useState<Side | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: StatusKind }>({ text: '', kind: '' });
  const [showMicFix, setShowMicFix] = useState(false);
  const [picker, setPicker] = useState<Side | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Mutable, non-render state.
  const recorder = useRef(new MicRecorder());
  const tts = useRef(new TtsPlayer());
  const recordingRef = useRef(false);
  const processingRef = useRef(false);
  const activeSideRef = useRef<Side | null>(null);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const sideLang = (side: Side) => (side === 'A' ? langA : langB);
  const otherLang = (side: Side) => (side === 'A' ? langB : langA);

  useEffect(() => () => {
    // Cleanup on unmount.
    recorder.current.teardown();
    tts.current.stop();
    if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  }, []);

  useEffect(() => { setLangB(studentLanguage); }, [studentLanguage]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles, pendingSide]);

  const clearTimers = () => {
    if (autoStopTimer.current) { clearTimeout(autoStopTimer.current); autoStopTimer.current = null; }
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null; }
    setCountdown(null);
  };

  const finishError = useCallback((message: string, micIssue = false) => {
    clearTimers();
    recordingRef.current = false;
    processingRef.current = false;
    activeSideRef.current = null;
    setPendingSide(null);
    setStatus({ text: message, kind: 'error' });
    setShowMicFix(micIssue);
  }, []);

  const stopAndProcess = useCallback(async () => {
    if (!recordingRef.current || processingRef.current) return;
    const side = activeSideRef.current!;
    recordingRef.current = false;
    processingRef.current = true;
    clearTimers();
    setStatus({ text: 'Got it…', kind: 'listening' });

    const fromLang = sideLang(side);
    const toLang = otherLang(side);

    const audio = await recorder.current.stop();
    if (!audio.ok) {
      const micIssue = audio.code === 'mic-permission' || audio.code === 'no-mic' || audio.code === 'insecure-context';
      finishError(micErrorMessage(audio.code), micIssue);
      return;
    }
    if (audio.peak < 0.02) {
      finishError("I didn't hear anything. Check your sound is on and speak toward the mic.");
      return;
    }
    const noisy = audio.clipRatio > 0.25;

    setPendingSide(side); // show the "Translating…" bubble

    const stt = await transcribe(audio.wavBase64, fromLang, studentCode);
    if (!stt.ok) {
      setPendingSide(null);
      const msg = stt.code === 'empty'
        ? (noisy ? 'Too much background noise — try somewhere quieter.' : "I couldn't make that out. Try again.")
        : stt.error;
      finishError(msg);
      return;
    }

    const tr = await translate(stt.text, fromLang, toLang, studentCode);
    setPendingSide(null);
    if (!tr.ok) { finishError(tr.error); return; }

    setBubbles((prev) => [...prev, { id: ++bubbleSeq, side, original: stt.text, translated: tr.text, fromLang, toLang }]);
    setStatus({ text: '', kind: '' });
    processingRef.current = false;
    activeSideRef.current = null;

    try { await tts.current.speak(tr.text, toLang, studentCode); } catch { /* playback is best-effort */ }
  }, [langA, langB, studentCode, finishError]);

  const startSide = useCallback(async (side: Side) => {
    if (recordingRef.current || processingRef.current) return;
    setPicker(null);
    setShowMicFix(false);
    const start = await recorder.current.start();
    if (!start.ok) {
      const micIssue = start.code === 'mic-permission' || start.code === 'no-mic' || start.code === 'insecure-context';
      finishError(micErrorMessage(start.code), micIssue);
      return;
    }
    recordingRef.current = true;
    activeSideRef.current = side;
    setStatus({ text: '', kind: 'listening' });

    const startedAt = Date.now();
    const tick = () => setCountdown(Math.max(0, Math.ceil((MAX_RECORD_MS - (Date.now() - startedAt)) / 1000)));
    tick();
    countdownTimer.current = setInterval(tick, 250);
    autoStopTimer.current = setTimeout(() => { void stopAndProcess(); }, MAX_RECORD_MS);
  }, [finishError, stopAndProcess]);

  const onMic = (side: Side) => {
    if (recordingRef.current && activeSideRef.current === side) void stopAndProcess();
    else if (!recordingRef.current && !processingRef.current) void startSide(side);
  };

  const selectLanguage = (side: Side, code: string) => {
    if (side === 'A') setLangA(code); else setLangB(code);
    setPicker(null);
  };

  const recording = recordingRef.current;
  const statusText = status.kind === 'listening' && countdown !== null && recording
    ? `Listening… ${countdown}s  (tap Stop when done)`
    : status.text;

  return (
    <div className="lb-ttt-panel">
      <div className="lb-ttt-header">
        <span className="lb-ttt-title">Talk to Teacher</span>
        {onClose && <button className="lb-ttt-close" onClick={onClose} title="Close" type="button">×</button>}
      </div>

      <div className="lb-ttt-transcript" ref={transcriptRef}>
        {bubbles.length === 0 && !pendingSide && (
          <div className="lb-ttt-empty">Tap a language below and start talking.</div>
        )}
        {bubbles.map((b) => (
          <div key={b.id} className={`lb-ttt-bubble lb-ttt-bubble-${b.side}`}>
            <div className="lb-ttt-orig" dir={langInfo(b.fromLang).rtl ? 'rtl' : 'ltr'}>{b.original}</div>
            <div className="lb-ttt-trans" dir={langInfo(b.toLang).rtl ? 'rtl' : 'ltr'}>{b.translated}</div>
          </div>
        ))}
        {pendingSide && (
          <div className={`lb-ttt-bubble lb-ttt-bubble-${pendingSide} lb-ttt-pending`}>
            <span className="lb-ttt-spinner" /><span>Translating…</span>
          </div>
        )}
      </div>

      {(statusText || showMicFix) && (
        <div className={`lb-ttt-statusbar lb-ttt-${status.kind || 'listening'}`}>
          {statusText}
          {showMicFix && (
            <>
              <br />
              <button
                className="lb-ttt-micfix"
                type="button"
                onClick={() => { setShowMicFix(false); void startSide(activeSideRef.current ?? 'A'); }}
              >
                Turn on microphone
              </button>
            </>
          )}
        </div>
      )}

      {recording && (
        <button className="lb-ttt-stop" type="button" onClick={() => void stopAndProcess()}>
          ■ Stop &amp; translate
        </button>
      )}

      <div className="lb-ttt-footer">
        {(['A', 'B'] as Side[]).map((side) => {
          const info = langInfo(sideLang(side));
          const disabled = recording && activeSideRef.current !== side;
          const isRec = recording && activeSideRef.current === side;
          return (
            <div key={side} className={`lb-ttt-side${disabled ? ' disabled' : ''}`}>
              <button className="lb-ttt-langchip" type="button" onClick={() => setPicker(picker === side ? null : side)}>
                <span className="lb-ttt-langname">
                  {info.nativeLabel === info.label ? info.label : `${info.nativeLabel} ${info.label}`}
                </span>
                <span className="lb-ttt-chev">▾</span>
              </button>
              <button className={`lb-ttt-mic${isRec ? ' recording' : ''}`} type="button" onClick={() => onMic(side)}>
                <MicIcon />
                <span className="lb-ttt-mic-label">{isRec ? 'Recording…' : 'Tap to talk'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {picker && (
        <div className="lb-ttt-picker open">
          {LANGUAGE_LIST.map((info) => (
            <button
              key={info.code}
              type="button"
              className={`lb-ttt-picker-opt${info.code === sideLang(picker) ? ' selected' : ''}`}
              onClick={() => selectLanguage(picker, info.code)}
            >
              <span className="lb-ttt-langname">{info.nativeLabel}</span>
              <span className="lb-ttt-picker-en">{info.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26" aria-hidden="true">
      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
    </svg>
  );
}
