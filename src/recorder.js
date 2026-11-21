// Enregistre le canvas + l'audio traité dans un fichier vidéo (MP4 si le
// navigateur le permet, sinon WebM).

const CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export class VideoRecorder {
  constructor(canvas, audioStream, fps = 60) {
    const video = canvas.captureStream(fps);
    this.stream = new MediaStream([...video.getVideoTracks(), ...audioStream.getAudioTracks()]);
    this.mimeType = pickMimeType();
    this.chunks = [];
  }

  start() {
    const opts = { videoBitsPerSecond: 14_000_000, audioBitsPerSecond: 256_000 };
    if (this.mimeType) opts.mimeType = this.mimeType;
    this.rec = new MediaRecorder(this.stream, opts);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
  }

  stop() {
    return new Promise((resolve) => {
      this.rec.onstop = () => {
        const type = this.rec.mimeType || this.mimeType || 'video/webm';
        resolve({ blob: new Blob(this.chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' });
      };
      this.rec.stop();
    });
  }
}
