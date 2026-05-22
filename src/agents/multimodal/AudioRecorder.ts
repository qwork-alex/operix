/**
 * Lightweight MediaRecorder wrapper. Whisper-ready: returns a Blob the
 * pipeline can hand off to any speech-to-text provider later.
 */
export interface RecordingResult {
  blob: Blob;
  durationSec: number;
  mime: string;
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;
  private mime = "";

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
    );
  }

  isRecording(): boolean {
    return this.recorder?.state === "recording";
  }

  async start(): Promise<void> {
    if (!this.isSupported()) throw new Error("MediaRecorder not supported");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
    ];
    this.mime =
      candidates.find((c) => MediaRecorder.isTypeSupported(c)) || "";
    this.recorder = new MediaRecorder(
      this.stream,
      this.mime ? { mimeType: this.mime } : undefined,
    );
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(250);
    this.startedAt = Date.now();
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder;
      if (!rec) return reject(new Error("Recorder not started"));
      rec.onstop = () => {
        const mime = this.mime || rec.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type: mime });
        const durationSec = (Date.now() - this.startedAt) / 1000;
        this.cleanup();
        resolve({ blob, durationSec, mime });
      };
      try {
        rec.stop();
      } catch (e) {
        this.cleanup();
        reject(e);
      }
    });
  }

  cancel() {
    try {
      this.recorder?.stop();
    } catch {
      /* ignore */
    }
    this.cleanup();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}
