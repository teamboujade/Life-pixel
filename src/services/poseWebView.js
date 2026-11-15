// Page HTML exécutée dans une WebView : caméra + MediaPipe Pose Landmarker.
// L'inférence tourne entièrement sur le téléphone (WebAssembly / GPU WebGL).
// Seuls le moteur (~8 Mo) et le modèle (~5 Mo) sont téléchargés une fois,
// gratuitement, depuis les CDN publics ; aucune image ne quitte l'appareil.

const TASKS_VERSION = '0.10.21';

export const POSE_HTML = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden}
  video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .mirror{transform:scaleX(-1)}
</style></head>
<body>
<video id="v" autoplay playsinline muted></video>
<script type="module">
import { FilesetResolver, PoseLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/vision_bundle.mjs';

const NAMES = { 11:'left_shoulder',12:'right_shoulder',13:'left_elbow',14:'right_elbow',
  15:'left_wrist',16:'right_wrist',23:'left_hip',24:'right_hip',25:'left_knee',26:'right_knee',
  27:'left_ankle',28:'right_ankle', 0:'nose' };
const post = (m) => (window.ReactNativeWebView ? window.ReactNativeWebView.postMessage(JSON.stringify(m)) : window.parent.postMessage(JSON.stringify(m), '*'));
const video = document.getElementById('v');
let landmarker = null, stream = null, facing = 'user', lastTs = -1, lastPost = 0;

async function startCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
  video.srcObject = stream;
  video.classList.toggle('mirror', facing === 'user');
  await video.play();
}

window.setFacing = async (f) => {
  facing = f;
  try { await startCamera(); } catch (e) { post({ type: 'error', message: 'Caméra : ' + e.message }); }
};

function loop() {
  if (landmarker && video.readyState >= 2) {
    const now = performance.now();
    if (now !== lastTs) {
      lastTs = now;
      const res = landmarker.detectForVideo(video, now);
      // ~15 messages / s suffisent et ménagent le pont JS.
      if (now - lastPost > 66) {
        lastPost = now;
        const lm = res.landmarks && res.landmarks[0];
        const w = video.videoWidth, h = video.videoHeight, mirrored = facing === 'user';
        post({ type: 'pose', w, h, ts: Date.now(),
          keypoints: lm ? Object.entries(NAMES).map(([i, name]) => {
            const p = lm[i];
            return { name, x: (mirrored ? 1 - p.x : p.x) * w, y: p.y * h, score: p.visibility ?? 0 };
          }) : [] });
      }
    }
  }
  requestAnimationFrame(loop);
}

(async () => {
  try {
    post({ type: 'status', message: 'Démarrage de la caméra…' });
    await startCamera();
    post({ type: 'status', message: 'Chargement du modèle IA…' });
    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm');
    const opts = (delegate) => ({
      baseOptions: { delegate, modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
      runningMode: 'VIDEO', numPoses: 1 });
    try { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU')); }
    catch (_) { landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU')); }
    post({ type: 'ready' });
    loop();
  } catch (e) {
    post({ type: 'error', message: e && e.message ? e.message : String(e) });
  }
})();
</script>
</body></html>`;
