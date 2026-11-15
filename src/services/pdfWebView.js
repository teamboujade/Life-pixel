// Page HTML de rendu PDF (pdf.js, Mozilla, licence Apache 2.0) dans une WebView.
// Le fichier est passé en base64 : il reste sur l'appareil.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build';

export function buildPdfHtml(base64, startPage = 1) {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=4">
<style>
  html,body{margin:0;background:#0f172a;color:#e2e8f0;font-family:sans-serif}
  .page{margin:8px auto;background:#fff;position:relative;width:calc(100% - 16px)}
  .page canvas{width:100%;height:100%;display:block}
  #msg{padding:24px;text-align:center;color:#94a3b8}
</style></head>
<body><div id="msg">Ouverture du document…</div><div id="pages"></div>
<script>window.PDF_B64 = ${JSON.stringify(base64)};</script>
<script type="module">
import * as pdfjsLib from '${PDFJS}/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.mjs';
const post = (m) => (window.ReactNativeWebView ? window.ReactNativeWebView.postMessage(JSON.stringify(m)) : window.parent.postMessage(JSON.stringify(m), '*'));

function b64ToBytes(b64) {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

try {
  const pdf = await pdfjsLib.getDocument({ data: b64ToBytes(window.PDF_B64) }).promise;
  window.PDF_B64 = null;
  document.getElementById('msg').style.display = 'none';
  const first = await pdf.getPage(1);
  const ratio = first.getViewport({ scale: 1 }).height / first.getViewport({ scale: 1 }).width;
  const container = document.getElementById('pages');
  const rendered = new Set();
  const slots = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const d = document.createElement('div');
    d.className = 'page'; d.dataset.page = i;
    d.style.aspectRatio = (1 / ratio).toString();
    container.appendChild(d); slots.push(d);
  }

  async function render(i) {
    if (rendered.has(i)) return; rendered.add(i);
    const page = await pdf.getPage(i);
    const slot = slots[i - 1];
    const base = page.getViewport({ scale: 1 });
    slot.style.aspectRatio = (base.width / base.height).toString();
    const scale = (slot.clientWidth * (window.devicePixelRatio || 1)) / base.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    slot.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) render(Number(e.target.dataset.page)); });
  }, { rootMargin: '800px 0px' });
  slots.forEach((s) => io.observe(s));

  let current = 0, lastActivity = 0;
  function onScroll() {
    const mid = window.innerHeight / 2;
    let best = 1, bestDist = Infinity;
    for (const s of slots) {
      const r = s.getBoundingClientRect();
      const dist = Math.abs(r.top + r.height / 2 - mid);
      if (dist < bestDist) { bestDist = dist; best = Number(s.dataset.page); }
      if (r.top > window.innerHeight) break;
    }
    if (best !== current) { current = best; post({ type: 'page', page: best }); }
    const now = Date.now();
    if (now - lastActivity > 2000) { lastActivity = now; post({ type: 'activity' }); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('touchstart', () => post({ type: 'activity' }), { passive: true });

  post({ type: 'loaded', numPages: pdf.numPages });
  const start = Math.min(${Number(startPage) || 1}, pdf.numPages);
  if (start > 1) { await render(start); slots[start - 1].scrollIntoView(); }
  onScroll();
} catch (e) {
  const m = document.getElementById('msg'); m.style.display = 'block'; m.textContent = 'Impossible d’ouvrir ce PDF : ' + e.message;
  post({ type: 'error', message: e.message });
}
</script></body></html>`;
}
