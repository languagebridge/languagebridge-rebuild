// extension/content/services/lb-stt-service.js
// Speech-to-Text: captures microphone audio and sends to Azure STT.

window.LBSTTService = {
  mediaRecorder: null,
  audioChunks: [],
  isRecording: false,

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];
      this.isRecording = true;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      LBLog.info('Recording started');
    } catch (err) {
      LBLog.error('Microphone access denied:', err);
      return { error: 'Microphone access is required for Talk to Teacher.' };
    }
  },

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.isRecording = false;
        this.audioChunks = [];
        LBLog.info('Recording stopped');
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    });
  },
};