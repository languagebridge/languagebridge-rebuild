// Talk to Teacher (PWA) — spoken playback of the translated line.
//
// Ported from the extension's lb-tts-service, with one PWA-friendly change: the
// extension fetched audio bytes through its background worker (to dodge CORS) and
// played them via WebAudio. A page can't do that cross-origin, so we play the
// returned SAS URL with an <audio> element instead — HTMLAudioElement plays
// cross-origin media without CORS, which is exactly what we want here. Long text
// is chunked (backend TTS caps at 500 chars) and chunks play in sequence.

import { synthesize } from './api';

export class TtsPlayer {
  private current: HTMLAudioElement | null = null;
  private gen = 0; // bumping this supersedes any in-flight sequence
  private rate = 1.0;

  setRate(rate: number): void { this.rate = rate; }

  /** Synthesize `text` in `language` and play it. Supersedes any prior playback. */
  async speak(text: string, language: string, studentCode: string): Promise<void> {
    const gen = ++this.gen;
    this.stopAudioEl();
    for (const chunk of chunkText(text, 480)) {
      if (gen !== this.gen) return; // stopped / superseded
      const url = await synthesize(chunk, language, studentCode);
      if (gen !== this.gen || !url) continue;
      await this.playUrl(url, gen);
    }
  }

  stop(): void {
    this.gen++;
    this.stopAudioEl();
  }

  private playUrl(url: string, gen: number): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.playbackRate = this.rate;
      this.current = audio;
      const done = () => { if (this.current === audio) this.current = null; resolve(); };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
      // Guard: if this sequence was superseded mid-load, bail.
      if (gen !== this.gen) { this.stopAudioEl(); done(); }
    });
  }

  private stopAudioEl(): void {
    if (this.current) {
      try { this.current.pause(); this.current.currentTime = 0; } catch { /* noop */ }
      this.current = null;
    }
  }
}

// Split text into <=max-char pieces on sentence boundaries; hard-split any
// single sentence longer than max. Matches lb-tts-service._chunkText.
export function chunkText(text: string, max: number): string[] {
  text = (text || '').trim();
  if (!text) return [];
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?؟۔。]+[.!?؟۔。]*\s*/g) || [text];
  const chunks: string[] = [];
  let cur = '';
  const flush = () => { if (cur.trim()) { chunks.push(cur.trim()); cur = ''; } };
  for (const s of sentences) {
    if (s.length > max) {
      flush();
      let part = '';
      for (const w of s.split(/\s+/)) {
        if ((part + ' ' + w).trim().length > max) { if (part) chunks.push(part.trim()); part = w; }
        else part = part ? part + ' ' + w : w;
      }
      if (part) cur = part;
    } else if ((cur + s).length > max) {
      flush();
      cur = s;
    } else {
      cur += s;
    }
  }
  flush();
  return chunks;
}
