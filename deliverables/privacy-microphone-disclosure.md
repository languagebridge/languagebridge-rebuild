# Microphone / voice disclosure — paste into languagebridge.app/privacy

Purpose: add the voice-capture disclosure the Chrome Web Store requires before a mic-permission
extension can be approved. The current policy discloses text-to-speech but NOT recording the
user's voice for speech-to-text (Talk to Teacher). This is additive — nothing to remove.

Insert each block into the matching existing section. Then bump the policy's "effective date."
This must be LIVE before the Chrome Web Store submission.

---

## 1 → Section "What We Collect" — add this item

**Voice recordings (only in Talk to Teacher).** When you use the Talk to Teacher conversation
feature — and only after you allow microphone access — we capture audio from your microphone
while you are actively recording. We send that audio to Microsoft Azure to convert it into text
(transcription), and then discard it. We never turn on your microphone at any other time, and we
never store voice recordings.

---

## 2 → Section "How It Works" — add this step

**Talk to Teacher (voice).** You tap to record, speak, and tap to stop. Your recorded audio is
sent over encrypted HTTPS to Microsoft Azure Speech Services, transcribed into text, and
immediately discarded. That text is then translated and read aloud in the other person's
language. The audio is never saved.

---

## 3 → Section "Third-Party Services" — add / update the Azure entry

**Microsoft Azure Speech Services.** Processes selected text (to generate read-aloud audio) and,
in Talk to Teacher, your spoken audio (to transcribe it into text). Audio and text are used only
to produce the translation or transcription and are not retained by Azure or by LanguageBridge.

---

## 4 → Section "Data Retention" — add this line (or extend the existing "Translated text & audio" line)

**Voice recordings:** Not stored by LanguageBridge. Sent to Microsoft Azure for transcription,
then discarded (0 seconds retained).

---

## 5 → Section "Children's Privacy (COPPA)" — add this sentence

The Talk to Teacher voice feature records audio only while a student is actively speaking, uses
it solely to produce a transcription, and never stores it. No voice recordings of children are
retained by LanguageBridge.

---

## 6 → Section "Plain English Summary" — add this line

If you use Talk to Teacher, we record your voice only while you're speaking, send it to be turned
into text, and then delete it — we never keep voice recordings.

---

### Why the store needs this
Chrome Web Store policy requires that any extension requesting microphone access disclose, in its
linked privacy policy, that it collects audio/voice input. Without it, the review is rejected on
a data-disclosure violation regardless of anything else. Blocks 1 and 4 are the minimum; 2, 3, 5,
and 6 make it airtight and consistent with the rest of the policy.
