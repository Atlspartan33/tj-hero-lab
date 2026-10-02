// sw.js — cache-first so the studio opens with no Wi-Fi after the first visit.
const CACHE = 'hero-v2';   // bump on every release so tablets pick up new files
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'face.js', 'gear.js', 'sfx.js', 'voice.js', 'lines.js', 'gallery.js', 'preview-face.json',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'vendor/vision_bundle.mjs', 'vendor/face_landmarker.task', 'vendor/selfie_segmenter.tflite',
  'vendor/wasm/vision_wasm_internal.js', 'vendor/wasm/vision_wasm_internal.wasm',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(SHELL);
    // narrator lines: audio/lines.json lists every recorded clip
    try { const ids = await (await fetch('audio/lines.json')).json(); await c.addAll(ids.map((id) => `audio/${id}.mp3`)); } catch {}
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  })));
});
