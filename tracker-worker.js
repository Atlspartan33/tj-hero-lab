// tracker-worker.js — runs the body cut-out and the hand model off the main thread, in parallel with the face model,
// so the drawing never waits on them. The page posts a camera frame (ImageBitmap); we answer with the person mask and
// the hand landmarks. Module worker: MediaPipe's loader calls importScripts, which always throws in module workers,
// so it's replaced with a small synchronous stand-in (sync XHR + global eval is allowed in workers).
self.importScripts = (...urls) => {
  for (const url of urls) { const x = new XMLHttpRequest(); x.open('GET', url, false); x.send(); (0, eval)(x.responseText + `\n//# sourceURL=${url}`); }
};
let seg = null, hands = null;

async function init({ base, wantSeg, wantHands }) {
  const m = await import(base + 'vendor/vision_bundle.mjs');
  const files = await m.FilesetResolver.forVisionTasks(base + 'vendor/wasm');
  const make = async (Task, opts) => {
    try { return await Task.createFromOptions(files, opts('GPU')); } catch { return await Task.createFromOptions(files, opts('CPU')); }
  };
  if (wantSeg && !seg) seg = await make(m.ImageSegmenter, (delegate) => ({ baseOptions: { modelAssetPath: base + 'vendor/selfie_segmenter.tflite', delegate }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false }));
  if (wantHands && !hands) hands = await make(m.GestureRecognizer, (delegate) => ({ baseOptions: { modelAssetPath: base + 'vendor/gesture_recognizer.task', delegate }, runningMode: 'VIDEO', numHands: 4, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5 }));
}

self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try { await init(d); self.postMessage({ type: 'ready', seg: !!seg, hands: !!hands }); }
    catch (err) { self.postMessage({ type: 'error', message: String(err?.message || err) }); }
    return;
  }
  if (d.type !== 'frame') return;
  const { bitmap, ts, doSeg, doHands, id } = d;
  const out = { type: 'result', id, t0: d.t0 };
  const transfer = [];
  try {
    if (doSeg && seg) {
      seg.segmentForVideo(bitmap, ts, (res) => {
        const mk = res.confidenceMasks?.[0];
        if (mk) { const a = new Float32Array(mk.getAsFloat32Array()); out.mask = a; out.mw = mk.width; out.mh = mk.height; transfer.push(a.buffer); }
      });
    }
    if (doHands && hands) {
      const r = hands.recognizeForVideo(bitmap, ts);
      out.hands = { landmarks: r.landmarks, gestures: r.gestures, handedness: r.handedness || r.handednesses };
    }
  } catch (err) { out.error = String(err?.message || err); }
  bitmap.close?.();
  self.postMessage(out, transfer);
};
