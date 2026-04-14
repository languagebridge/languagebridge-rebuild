/**
 * LanguageBridge - Toolbar Audio Controller
 * Handles play/pause/resume, sentence splitting, TTS generation.
 * Adds methods to LanguageBridgeToolbar.prototype.
 */

const _TB = LanguageBridgeToolbar.prototype;

_TB.splitSentences = function (text) {
  return (text.match(/[^.!?\u061F]+[.!?\u061F]+/g) || [text])
    .map(s => s.trim()).filter(s => s.length > 0);
};

_TB.toggleReading = function () {
  if (this.isReading) this.pauseReading();
  else if (this.isPaused && this.cachedTranslation) this.resumeReading();
  else if (this.selectedText) this.readText(this.selectedText);
  else this.showStatus('Please select some text first', 'error');
};

_TB.readText = async function (text) {
  if (this.isTranslating) { this.showStatus('Please wait \u2014 translation in progress', 'info'); return; }
  if (this.isReading) window.LBTTSService?.stop();

  this.isTranslating = true;
  this.isReading = true;
  this.isPaused = false;
  this.lastReadTime = Date.now();
  this.updatePlayPauseButton(true);

  try {
    const result = await window.LBTranslationService.translate(text, this.userLanguage);
    if (!result || result.error) {
      this.showStatus(result?.error || 'Translation failed', 'error');
      return;
    }

    this.cachedTranslation = result;
    this.cachedOriginalText = text;

    // Show tooltip
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) this.showTranslationTooltip(result, selection);

    // Split into sentences for pause support
    const fullText = result.cognate || result.bridgeScaffold || result.bridgeAnchor || text;
    this.sentences = this.splitSentences(fullText);
    this.currentSentenceIndex = 0;

    await this.playSentences();

    // Analytics (fire and forget)
    chrome.runtime.sendMessage({
      action: 'api-fetch', endpoint: 'analytics-writer',
      body: {
        eventType: 'tts_request', language: this.userLanguage,
        studentCode: window.LBState.studentCode,
        timestamp: new Date().toISOString(),
        extensionVersion: window.CONFIG.version,
      },
    }).catch(() => {});

  } catch (err) {
    if (err.message !== 'Paused') {
      LBLog.error('Read failed:', err);
      this.showStatus('Error reading text', 'error');
    }
  } finally {
    if (!this.isPaused) {
      this.isReading = false;
      this.isTranslating = false;
      this.updatePlayPauseButton(false);
      if (!this.isPaused) this.showStatus('Active', 'info');
    }
  }
};

_TB.playSentences = async function () {
  while (this.currentSentenceIndex < this.sentences.length) {
    if (this.isPaused) throw new Error('Paused');

    const sentence = this.sentences[this.currentSentenceIndex];
    const total = this.sentences.length;
    this.showStatus(`Playing sentence ${this.currentSentenceIndex + 1}/${total}`, 'info');

    // Use cached audio if single sentence, otherwise generate per-sentence
    if (this.cachedTranslation?.audioUrl && total === 1) {
      await window.LBTTSService.play(this.cachedTranslation.audioUrl);
    } else {
      await window.LBTTSService.generateAndPlay(sentence, this.userLanguage);
    }

    this.currentSentenceIndex++;
    if (this.isPaused) throw new Error('Paused');

    // Natural pause between sentences
    if (this.currentSentenceIndex < total) {
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  }
  this.showStatus('Completed', 'info');
};

_TB.pauseReading = function () {
  window.LBTTSService?.stop();
  this.isReading = false;
  this.isPaused = true;
  this.isTranslating = false;
  this.updatePlayPauseButton(false);
  const remaining = (this.sentences?.length || 0) - (this.currentSentenceIndex || 0);
  this.showStatus(`Paused \u2014 ${remaining} sentence${remaining !== 1 ? 's' : ''} remaining`, 'info');
};

_TB.resumeReading = async function () {
  if (!this.sentences || this.currentSentenceIndex >= this.sentences.length) return;
  this.isReading = true;
  this.isPaused = false;
  this.isTranslating = true;
  this.lastReadTime = Date.now();
  this.updatePlayPauseButton(true);
  const remaining = this.sentences.length - this.currentSentenceIndex;
  this.showStatus(`Resuming \u2014 ${remaining} sentence${remaining !== 1 ? 's' : ''} left`, 'info');

  try {
    await this.playSentences();
  } catch (err) {
    if (err.message !== 'Paused') LBLog.error('Resume failed:', err);
  } finally {
    if (!this.isPaused) {
      this.isReading = false;
      this.isTranslating = false;
      this.updatePlayPauseButton(false);
    }
  }
};

_TB.updatePlayPauseButton = function (isPlaying) {
  const btn = this.toolbar?.querySelector('#lb-play-pause');
  if (!btn) return;
  const svg = btn.querySelector('svg');
  if (!svg) return;
  svg.innerHTML = '';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', isPlaying ? 'M6 4h4v16H6V4zm8 0h4v16h-4V4z' : 'M8 5v14l11-7z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
};

_TB.showWrittenTranslation = async function () {
  if (!this.selectedText) { this.showStatus('Please select some text first', 'error'); return; }
  this.showStatus('Translating...', 'info');
  try {
    const result = await window.LBTranslationService.translate(this.selectedText, this.userLanguage);
    if (!result || result.error) { this.showStatus(result?.error || 'Translation failed', 'error'); return; }
    this.cachedTranslation = result;
    this.cachedOriginalText = this.selectedText;

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) this.showTranslationTooltip(result, selection);
    else this.showTranslationTooltipCentered(result);
    this.showStatus('Translation shown', 'info');
  } catch (err) {
    LBLog.error('Translation display failed:', err);
    this.showStatus('Error translating text', 'error');
  }
};
