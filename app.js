// app.js — TJ's Hero Lab. Camera → MediaPipe face landmarks + body cut-out (on-device) → WebGL engine (engine.js):
// 3D helmets, GPU particles + bloom, shader effects, and 2D sticker gear painted into layers the engine composites.
// Built for a 4-year-old pre-reader: every tap is spoken, previews instead of words, powers fire from the face
// OR from tapping the screen.  ?demo uses test/face.jpg instead of the camera (&jaw=0.7 / &brow=0.8 fake a face).
import { Tracker, computeFrame, FACE_OVAL } from './face.js';
import {
  MASKS, PAINTS, POWERS, HAND_POWERS, GEAR, LOOKS, DRAWERS, ALL, BG_LIGHT, popIn, drawMask, drawBadge, drawCape, drawCapeClasps, drawWings,
  updateBreath, drawBreath, drawMouthGlow, drawLasers, breathLevel, surpriseLevel, setMirror,
} from './gear.js';
import { drawJetpack, drawDinoBuddy, drawPowerPreview, drawSpeedGhosts, drawAnyBackground } from './gear3.js';
import { Engine } from './engine.js';
import { buildHelmet, buildRoboBuddy, loadHelmetModels, hasModel } from './helmets3d.js';
import { HandTracker } from './hands.js';
import { loadFaceGeo, faceGeoReady } from './facepaint.js';
import { createGpuFx, K } from './gpufx.js';
import {
  G, handPower, updateBalls, drawTrails, drawWords, drawPlayerBadge, stormField, stormEmit, shake, shakeOffset, bigWord,
  PLAYER_HUE, drawHandPreview, drawStormPreview,
} from './play.js';
import * as sfx from './sfx.js';
import * as voice from './voice.js';
import * as gallery from './gallery.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const DEMO = Q.has('demo');
const FAKE = { jaw: parseFloat(Q.get('jaw') || '0'), brow: parseFloat(Q.get('brow') || '0'), hand: Q.get('hand') };

const S = {
  facing: 'user', stream: null, landmarker: null, segmenter: null, gen: 0, raf: 0,
  lastVideoTime: -1, lastTs: 0, lastSegTs: 0, lastT: 0, tab: 'masks', busy: false,
  noFaceSince: 0, lumaAt: 0, dark: false, wake: null, saidFindAt: 0,
  boostUntil: 0, powerUsedAt: 0, tapHinted: false, shieldAt: 0, ripples: [], rippleAt: 0, frost: 0,
  frameMs: 33, quality: 2, qAt: 0, ambAt: 0, segSkip: 0, capture: null,
  gesture: null, player: 0, twoSeen: false, twoSince: 0, firedAt: [0, 0], comboAt: 0, combo: null, hi5At: 0, skin: 0.25, gpuUntil: 0, handsShown: 0, noHandSince: 0, saidHandAt: 0,
};
// Two heroes can dress up differently. Backgrounds and Looks change the whole picture, so they're shared.
const ITEM = Object.fromEntries(ALL.map((it) => [it.id, it]));
const SHARED = (it) => it.group === 'bg' || it.group === 'look';
const newSel = () => Object.fromEntries(ALL.filter((it) => !SHARED(it)).map((it) => [it.id, { on: false, at: 0 }]));
S.shared = Object.fromEntries(ALL.filter(SHARED).map((it) => [it.id, { on: false, at: 0 }]));
S.players = [newSel(), newSel()];
const rec = (id, p = S.player) => (SHARED(ITEM[id]) ? S.shared[id] : S.players[p][id]);
function bindSel() { S.sel = Object.fromEntries(ALL.map((it) => [it.id, rec(it.id)])); }   // the active hero's view (tests use it)
bindSel();
const tracker = new Tracker();
const hands = new HandTracker();
let gfx = null;                                     // WebGPU particles (null = not supported → extras skipped)
const video = $('video'), canvas = $('canvas');
let engine = null;
try { engine = new Engine(canvas); } catch (e) { console.error('WebGL engine failed', e); }
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); location.reload(); });
let demoImg = null;
const isOn = (id, p = S.player) => rec(id, p).on;
const pick = (list, p) => list.find((it) => isOn(it.id, p)) || null;
const maskOf = (p) => pick(MASKS, p);
const paintOf = (p) => pick(PAINTS, p)?.id || null;
const handOf = (p) => pick(HAND_POWERS, p)?.id || null;
const breathOf = (p) => POWERS.find((it) => it.group === 'breath' && isOn(it.id, p))?.id || null;
const eyesOf = (p) => POWERS.find((it) => it.group === 'eyes' && isOn(it.id, p))?.id || null;

// ───────────────────────────────────────────── models (vendored, no CDN)
const VENDOR = (p) => new URL(`vendor/${p}`, location.href).href;
let visionPromise = null, modelPromise = null, segPromise = null;
const vision = () => (visionPromise ??= import('./vendor/vision_bundle.mjs').then(async (m) => ({ m, files: await m.FilesetResolver.forVisionTasks(VENDOR('wasm')) })));

function loadModel() {
  return (modelPromise ??= (async () => {
    const { m, files } = await vision();
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: VENDOR('face_landmarker.task'), delegate },
      runningMode: 'VIDEO', numFaces: 3, outputFaceBlendshapes: true,
    });
    try { S.landmarker = await m.FaceLandmarker.createFromOptions(files, opts('GPU')); }
    catch { S.landmarker = await m.FaceLandmarker.createFromOptions(files, opts('CPU')); }
  })().catch((e) => { modelPromise = null; e.stage = 'model'; throw e; }));
}
// The body cut-out is only needed for the cape, the glow and backgrounds; if it fails, the rest still works.
function loadSegmenter() {
  return (segPromise ??= (async () => {
    const { m, files } = await vision();
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: VENDOR('selfie_segmenter.tflite'), delegate },
      runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
    });
    try { S.segmenter = await m.ImageSegmenter.createFromOptions(files, opts('GPU')); }
    catch { S.segmenter = await m.ImageSegmenter.createFromOptions(files, opts('CPU')); }
  })().catch((e) => { segPromise = null; console.warn('segmenter unavailable', e); }));
}

// Hands: MediaPipe's gesture recognizer (hand landmarks + open palm / fist / pointing). Loaded the first time a
// hand power is picked, so heroes who never use one don't pay for it.
let handPromise = null;
function loadHands() {
  return (handPromise ??= (async () => {
    const { m, files } = await vision();
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: VENDOR('gesture_recognizer.task'), delegate }, runningMode: 'VIDEO', numHands: 4, minHandDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { S.gesture = await m.GestureRecognizer.createFromOptions(files, opts('GPU')); }
    catch { S.gesture = await m.GestureRecognizer.createFromOptions(files, opts('CPU')); }
  })().catch((e) => { handPromise = null; console.warn('hands unavailable', e); }));
}

// ───────────────────────────────────────────── body cut-out
// The segmenter's person mask is smoothed over time and handed to the engine as a GPU texture.
const seg = { prev: null, alpha: null, ready: false, w: 0, h: 0, stamp: 0 };
const smooth = (v) => { const t = Math.max(0, Math.min(1, (v - 0.3) / 0.45)); return t * t * (3 - 2 * t); };
function segment(src, ts) {
  try {
    S.segmenter.segmentForVideo(src, ts, (res) => {
      const m = res.confidenceMasks?.[0];
      if (m) applyMask(m.getAsFloat32Array(), m.width, m.height);
    });
  } catch (e) { console.warn(e); }
}
function applyMask(a, w, h) {
  if (!seg.prev || seg.prev.length !== a.length) { seg.prev = new Float32Array(a); seg.alpha = new Uint8Array(a.length); }
  const p = seg.prev, out = seg.alpha;
  for (let i = 0; i < a.length; i++) { p[i] = p[i] * 0.35 + a[i] * 0.65; out[i] = smooth(p[i]) * 255; }   // temporal smoothing kills edge flicker
  engine.setMask(out, w, h);
  seg.w = w; seg.h = h; seg.stamp++;
  seg.ready = true;
}

// ───────────────────────────────────────────── tracking worker
// The body cut-out and the hand model run in tracker-worker.js, in parallel with the face model on this thread,
// so turning on a cape or a hand power doesn't slow the picture down. If the worker can't start, both run here instead.
const TW = { w: null, ready: { seg: false, hands: false }, initing: false, failed: Q.has('noworker'), busy: false, dims: [0, 0], sent: 0 };
function workerFor(wantSeg, wantHands) {
  if (TW.failed) return false;
  if (!TW.w) {
    try { TW.w = new Worker(new URL('tracker-worker.js', location.href), { type: 'module' }); }
    catch (e) { console.warn('tracking worker', e); TW.failed = true; return false; }
    TW.w.onerror = (e) => { console.warn('tracking worker failed', e.message); TW.failed = true; TW.busy = false; };
    TW.w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'ready') { TW.ready.seg ||= d.seg; TW.ready.hands ||= d.hands; TW.initing = false; return; }
      if (d.type === 'error') { console.warn('tracking worker', d.message); TW.failed = true; TW.initing = false; return; }
      if (d.type !== 'result') return;
      TW.busy = false;
      if (d.id !== TW.gen) return;                      // a frame from before Home / camera flip
      if (d.mask) applyMask(d.mask, d.mw, d.mh);
      if (d.hands) hands.update(d.hands, TW.dims[0], TW.dims[1], performance.now());
    };
  }
  if (!TW.initing && ((wantSeg && !TW.ready.seg) || (wantHands && !TW.ready.hands))) {
    TW.initing = true;
    TW.w.postMessage({ type: 'init', base: new URL('./', location.href).href, wantSeg: wantSeg || TW.ready.seg, wantHands: wantHands || TW.ready.hands });
  }
  return true;
}
TW.gen = 1;
function workerFrame(src, ts, W, H, doSeg, doHands) {
  if (TW.busy || !TW.w) return;
  TW.busy = true; TW.dims = [W, H];
  const gen = TW.gen;
  createImageBitmap(src).then((bitmap) => {
    TW.w.postMessage({ type: 'frame', bitmap, ts, doSeg, doHands, id: gen }, [bitmap]);
  }).catch(() => { TW.busy = false; });
}

// ───────────────────────────────────────────── camera
async function startSource(my) {
  stopSource();
  if (DEMO) {
    demoImg = new Image();
    await new Promise((res, rej) => { demoImg.onload = res; demoImg.onerror = rej; demoImg.src = Q.get('img') || 'test/face.jpg'; });
    if (Q.has('two')) {                             // two heroes: the test face twice, side by side
      const c = document.createElement('canvas'); c.width = demoImg.naturalWidth * 2; c.height = demoImg.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(demoImg, 0, 0); x.drawImage(demoImg, demoImg.naturalWidth, 0);
      demoImg = c;
    }
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no camera api'), { name: 'InsecureError' });
  const s = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: S.facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  });
  if (my !== S.gen) { s.getTracks().forEach((t) => t.stop()); return; }
  S.stream = s;
  video.srcObject = s;
  await video.play();
  try { S.wake = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length;
    $('flipBtn').hidden = cams < 2;
  } catch {}
}
function stopSource() {
  cancelAnimationFrame(S.raf); S.raf = 0;
  S.stream?.getTracks().forEach((t) => t.stop()); S.stream = null; video.srcObject = null;
  S.wake?.release?.().catch(() => {}); S.wake = null;
  tracker.reset(); hands.reset(); seg.ready = false; seg.prev = null; S.ripples = []; TW.gen++; TW.busy = false;
  S.lastVideoTime = -1; S.noFaceSince = 0;
  sfx.silenceLoops();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') { sfx.silenceLoops(); voice.stop(); return; }
  if (S.stream && (!S.wake || S.wake.released)) { try { S.wake = await navigator.wakeLock?.request('screen'); } catch {} }
});
const isMirror = () => (DEMO ? Q.has('mirror') : S.facing === 'user');
const demoSource = () => demoImg;

// ───────────────────────────────────────────── screens
function showScreen(name) { document.body.dataset.screen = name; }
function syncOverlay() { document.body.classList.toggle('overlay-up', !$('loading').hidden || !$('error').hidden); }
function loading(on, text) { $('loading').hidden = !on; if (text) $('loadingText').textContent = text; syncOverlay(); }
const STANDALONE = matchMedia('(display-mode: standalone)').matches;
function showError(e) {
  loading(false);
  const n = e?.name;
  let title = 'Uh-oh!', text;
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    title = 'The camera is turned off';
    text = STANDALONE
      ? 'Grown-up: open Settings → Apps → Chrome → Permissions → Camera → Allow, then tap Try again.'
      : 'Grown-up: tap the 🔒 next to the web address, turn Camera on, then tap Try again.';
  } else if (n === 'NotFoundError' || n === 'OverconstrainedError') {
    text = "This tablet doesn't have that camera. Tap Home and try again.";
  } else if (n === 'NotReadableError' || n === 'AbortError') {
    text = 'Another app is using the camera. Close it, then tap Try again.';
  } else if (n === 'InsecureError') {
    text = 'The camera only works from the real Hero Lab link (https). Open it from the home-screen icon.';
  } else if (n === 'NoWebGL') {
    text = "This tablet's graphics can't run the Hero Lab. Try updating Chrome.";
  } else if (e?.stage === 'model') {
    text = "The Hero Lab couldn't finish loading. Check the Wi-Fi, then tap Try again.";
  } else {
    text = 'Something went wrong starting the camera. Tap Try again.';
  }
  $('errTitle').textContent = title;
  $('errText').textContent = text;
  $('error').hidden = false;
  syncOverlay();
  sfx.off(); voice.say('oops');
  console.error(e);
}

async function openStudio(facing, push = false) {
  sfx.unlock();
  if (!engine) { showScreen('studio'); showError(Object.assign(new Error('no webgl'), { name: 'NoWebGL' })); return; }
  S.facing = facing;
  if (push && document.body.dataset.screen !== 'studio') openLayer('studio');
  showScreen('studio');
  $('error').hidden = true;
  loading(true, 'Powering up…');
  const my = ++S.gen;
  loadSegmenter();                                  // in the background; gear that needs it waits for it
  try {
    await Promise.all([loadModel(), startSource(my)]);
    if (my !== S.gen) return;
    loading(false);
    S.noFaceSince = performance.now();
    loop();
    peekTray();
  } catch (e) {
    if (my === S.gen) showError(e);
  }
}
function goHome() {
  S.gen++;
  stopSource();
  voice.stop();
  $('error').hidden = true; loading(false); setHint(''); setPowerHint('');
  showScreen('start');
  sfx.pop();
}

// ───────────────────────────────────────────── render loop
function loop() {
  cancelAnimationFrame(S.raf);
  const tick = () => { S.raf = requestAnimationFrame(tick); frame(); };
  S.raf = requestAnimationFrame(tick);
}
const bgId = () => GEAR.find((it) => it.group === 'bg' && isOn(it.id))?.id || null;
const lookOn = () => LOOKS.find((it) => isOn(it.id))?.look || 0;
const ambCanvas = document.createElement('canvas'); ambCanvas.width = ambCanvas.height = 8;
const ambCtx = ambCanvas.getContext('2d', { willReadFrequently: true });

function frame() {
  const src = DEMO ? demoSource() : video;
  if (!src) return;
  const W = DEMO ? src.width || src.naturalWidth : src.videoWidth, H = DEMO ? src.height || src.naturalHeight : src.videoHeight;
  if (!W || !H) return;
  engine.setSource(src, W, H, !DEMO);
  const now = performance.now(), t = now / 1000;
  const dt = Math.min(0.05, Math.max(0.001, t - (S.lastT || t))); S.lastT = t;
  governor(dt * 1000, now);
  const fresh = S.landmarker && (DEMO || video.currentTime !== S.lastVideoTime);
  const bg = bgId(), look = lookOn();
  const anyP = (pred) => pred(0) || pred(1);
  const onAny = (id) => anyP((p) => isOn(id, p));
  const behindAny = anyP((p) => GEAR.some((g) => g.behind && isOn(g.id, p)));
  const needSeg = behindAny || onAny('aura') || onAny('speed') || onAny('invisible') || (onAny('storm') && !!gfx) || !!bg;
  const needHands = anyP((p) => !!handOf(p)) || (onAny('storm') && !!gfx) || S.twoSeen;
  const inWorker = (needSeg || needHands) && workerFor(needSeg, needHands);
  if (!inWorker && needHands) loadHands();
  const wantSeg = needSeg && (inWorker ? TW.ready.seg || !!S.segmenter : !!S.segmenter);
  const wantHands = needHands;

  if (fresh) {
    S.lastVideoTime = video.currentTime;
    const ts = Math.max(now, S.lastTs + 1); S.lastTs = ts;     // timestamps must strictly increase
    let res = null;
    try { res = S.landmarker.detectForVideo(src, ts); } catch (e) { console.warn(e); }
    if (res) {
      tracker.update(res, W, H, FAKE.jaw);
      if (FAKE.brow) for (const f of tracker.faces) f.bs.browInnerUp = FAKE.brow;
    }
    // The face model runs every frame. The body cut-out and the hand model are the expensive extras: when both are
    // needed they take turns (each still updates ~15×/s on a 30 fps camera), and the lowest quality tier halves them again.
    const wSeg = inWorker && TW.ready.seg, wHands = inWorker && TW.ready.hands;
    if ((needSeg && wSeg) || (needHands && wHands)) workerFrame(src, ts, W, H, needSeg && wSeg, needHands && wHands);
    const runHands = wantHands && !!S.gesture && !wHands, runSeg = wantSeg && !wSeg && !!S.segmenter;
    const tick = S.heavyTick = (S.heavyTick || 0) + 1;
    const every = S.quality > 0 ? 1 : 2;
    let doSeg = runSeg && tick % every === 0, doHands = runHands && tick % every === 0;
    if (runSeg && runHands) { doSeg = tick % (2 * every) === 0; doHands = tick % (2 * every) === every; }
    if (doHands) {
      try { hands.update(S.gesture.recognizeForVideo(src, ts), W, H, now); } catch (e) { console.warn(e); }
    }
    if (doSeg) { const st = Math.max(now, S.lastSegTs + 1); S.lastSegTs = st; segment(src, st); }
  }
  if (!wantHands && hands.hands.length) hands.reset();
  if (FAKE.hand) fakeHands(W, H, t, now);
  const segOK = wantSeg && seg.ready;
  const m = isMirror();
  setMirror(m);
  const boost = now < S.boostUntil ? 1 : 0;
  const faces = tracker.faces;
  assignPlayers(faces, W, m, now);
  for (const h of hands.hands) h.player = nearestPlayer(h, faces);
  const kf = (f, id) => popIn(rec(id, f.player).at, t);

  // ── 2D layers (painted in camera pixels; the engine scales them)
  if (bg && segOK) drawAnyBackground(engine.layer('bg'), bg, W, H, t);
  let nozzles = [];
  if (segOK && behindAny) {
    const c = engine.layer('behind');
    for (const f of faces) {
      const p = f.player;
      if (isOn('wings', p)) drawWings(c, f, kf(f, 'wings'), t);
      if (isOn('jetpack', p)) nozzles = nozzles.concat(drawJetpack(c, f, kf(f, 'jetpack'), t));
      if (isOn('cape', p)) drawCape(c, f, kf(f, 'cape'), t, H);
    }
  }
  const two = faces.length >= 2;
  const twoD = faces.some((f) => { const mk = maskOf(f.player); return (mk && !mk.is3d) || isOn('cape', f.player) || isOn('badge', f.player); });
  const topD = two || G.words.length > 0 || faces.some((f) => isOn('dinobud', f.player) || ['bubble', 'shout'].includes(breathOf(f.player)));
  const lv = { fire: 0, ice: 0, bubble: 0, shout: 0, laser: 0, crackle: 0 };
  const front = twoD && faces.length ? engine.layer('front') : null;
  const top = topD ? engine.layer('top') : null;
  let heat = null;
  const fireLv = [0, 0];
  const ctx = { engine, gfx, W, H, t, dt, now, ripple: addRipple, fire: (p) => { S.firedAt[p ?? 0] = now; } };

  // ── Star Storm orbits first, so their field slots stay put frame to frame
  if (gfx) {
    for (const f of [...faces].sort((a, b) => a.player - b.player)) {
      if (!isOn('storm', f.player)) continue;
      const idx = stormField(gfx, f, H, boost, PLAYER_HUE[f.player]);
      stormEmit(gfx, f, dt, idx, PLAYER_HUE[f.player] + 0.02);
      S.gpuUntil = now + 4000;
    }
    for (const h of hands.hands) {
      const sp = Math.hypot(h.vel.x, h.vel.y) / h.size;
      gfx.field({ x: h.palm.x, y: H - h.palm.y, radius: h.size * 2.6, strength: Math.min(3, 0.6 + sp * 0.08), kind: 0 });
    }
  }

  // ── per face: 2D stickers, 3D pieces, face paint, effects
  engine.syncHeads(faces);
  for (const f of faces) {
    const p = f.player, mask = maskOf(p), breath = breathOf(p), eyes = eyesOf(p), paint = paintOf(p);
    const bl = breath ? Math.max(breathLevel(f), boost) : 0;
    const el = eyes ? Math.max(surpriseLevel(f), boost) : 0;
    fireLv[p] = Math.max(fireLv[p], breath ? breathLevel(f) : 0, eyes ? surpriseLevel(f) : 0);
    if (front) {
      if (isOn('cape', p) && segOK) drawCapeClasps(front, f, kf(f, 'cape'));
      if (isOn('badge', p)) drawBadge(front, f, kf(f, 'badge'), t);
      if (mask && !mask.is3d) drawMask(front, f, mask.id, kf(f, mask.id), t);
    }
    if (top) {
      if (isOn('dinobud', p)) drawDinoBuddy(top, f, kf(f, 'dinobud'), t);
      if (breath === 'bubble' || breath === 'shout') { updateBreath(f, breath, bl, dt); drawBreath(top, f); }
    }
    engine.setPaint(f, paint && faceGeoReady() ? paint : null, paint ? kf(f, paint) : 1, t, S.skin);
    engine.setHelmet(f, mask?.is3d ? mask.id : null, mask?.is3d ? kf(f, mask.id) : 1, t, f.bs);
    engine.setRobo(f, isOn('robo', p), kf(f, 'robo'), t);
    engine.setShield(f, isOn('shield', p), Math.max(0, 1 - (now - S.shieldAt) / 700), t);
    if (breath === 'fire' || breath === 'ice' || breath === 'rainbow') {
      engine.breath(f, breath, bl, dt);
      if (gfx && bl > 0.05) {
        const P = f.P, mx = (P[13].x + P[14].x) / 2, my = H - (P[13].y + P[14].y) / 2;
        gfx.emit({ x: mx, y: my, dx: -Math.sin(f.ang), dy: -Math.cos(f.ang), spread: 0.75, speed: f.fw * 2.4, life: 0.9, size: f.fw * (breath === 'ice' ? 0.08 : 0.05), kind: breath === 'fire' ? K.FIRE : breath === 'ice' ? K.ICE : K.MAGIC, jitter: f.fw * 0.05, hue: t * 0.3 }, 3200 * dt * bl);
        S.gpuUntil = now + 2000;
      }
    }
    if (breath) { const key = breath === 'rainbow' ? 'ice' : breath; lv[key] = Math.max(lv[key], bl * (breath === 'rainbow' ? 0.6 : 1)); }
    if (breath === 'fire' && bl > 0.05) {
      const mx = (f.P[13].x + f.P[14].x) / 2, my = (f.P[13].y + f.P[14].y) / 2 + f.fw * 0.55;
      heat = { x: mx / W, y: 1 - my / H, r: (f.fw * 0.9) / H, str: bl };
    }
    if (breath === 'shout' && bl > 0.3 && t - S.rippleAt > 0.35) {
      S.rippleAt = t;
      addRipple((f.P[13].x + f.P[14].x) / 2, (f.P[13].y + f.P[14].y) / 2, bl);
    }
    if (eyes === 'laser') engine.lasers(f, el, t);
    if (eyes === 'hypno') engine.hypno(f, el, t);
    if (eyes) lv.laser = Math.max(lv.laser, el * (eyes === 'hypno' ? 0.5 : 1));
    engine.lightningFx(f, isOn('lightning', p), t, !!boost);
    if (isOn('lightning', p)) lv.crackle = Math.max(lv.crackle, boost ? 1 : 0.35);
    if (isOn('aura', p)) engine.auraSparks(f, dt);
    if (top && two) drawPlayerBadge(top, f, m);
  }
  if (nozzles.length) engine.jetFlames(nozzles, dt);

  // ── hands
  let handsShown = 0;
  for (const h of hands.hands) {
    const power = handOf(h.player);
    if (!power) continue;
    handsShown++;
    const r = handPower(ctx, h, power);
    if (r.loop) lv[r.loop] = Math.max(lv[r.loop] || 0, r.lv);
    if (gfx) S.gpuUntil = now + 2500;
  }
  S.handsShown = handsShown;
  for (const p of [0, 1]) if (now - (S.firedAt[p] || 0) < 450) fireLv[p] = 1;
  updateBalls(ctx);
  drawTrails(engine, dt, now);
  combos(faces, fireLv, now, W, H);
  if (top) drawWords(top, dt, m);

  for (const r of S.ripples) r.age += dt;
  S.ripples = S.ripples.filter((r) => r.age < 1.1);
  const iceTarget = Math.max(G.frostKick, ...faces.filter((f) => breathOf(f.player) === 'ice').map((f) => Math.max(breathLevel(f), boost)), 0);
  G.frostKick = Math.max(0, G.frostKick - dt * 1.2);
  S.frost += (iceTarget - S.frost) * Math.min(1, dt * 3);

  // match the 3D lighting to the room every half second; measure the skin under the face paint
  if (now - S.ambAt > 400) {
    S.ambAt = now;
    try {
      ambCtx.drawImage(src, 0, 0, 8, 8);
      const d = ambCtx.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = (d.length / 4) * 255; engine.setAmbient(r / n, g / n, b / n);
      const f = faces[0];
      if (f && faces.some((x) => paintOf(x.player))) S.skin = skinLuma(src, f);
    } catch {}
  }

  // per-hero glow / invisible / speed: split the picture between the two heroes
  const fxOf = (p) => [isOn('aura', p) ? 1 : 0, isOn('invisible', p) ? 1 : 0, isOn('speed', p) ? 1 : 0];
  let split = 2, fxA = fxOf(faces[0]?.player ?? 0), fxB = fxA;
  if (two) {
    const [a, b] = [...faces].sort((x, y) => x.eyes.x - y.eyes.x);    // source-image left → right
    split = (a.eyes.x + b.eyes.x) / 2 / W; fxA = fxOf(a.player); fxB = fxOf(b.player);
  }
  let gpuDrawn = false;
  if (gfx && now < S.gpuUntil) {
    gfx.resize(W, H);
    if (segOK && seg.alpha && seg.gpuStamp !== seg.stamp) { gfx.setMask(seg.alpha, seg.w, seg.h); seg.gpuStamp = seg.stamp; }
    gpuDrawn = gfx.frame(dt, t, faces[0]?.fw || H * 0.3);
  } else if (gfx && gfx.alive) { gfx.clear(); }
  const light = bg ? BG_LIGHT[bg] : null;
  engine.render({
    t, dt, mirror: m, look, useBg: !!(bg && segOK), useMask: segOK,
    aura: onAny('aura') ? 1 : 0, invis: onAny('invisible') ? 1 : 0, speed: onAny('speed') ? 1 : 0, split, fxA, fxB,
    rim: light ? 0.9 : onAny('aura') ? 0.5 : 0, rimColor: light ? light.rim : [1.0, 0.85, 0.3], bgTint: light ? light.tint : [1, 1, 1],
    ripples: S.ripples, heat, frost: S.frost, shake: shakeOffset(now), gpu: gpuDrawn,
  });
  if (S.capture) { const c = S.capture; S.capture = null; c(); }   // read the canvas in the same task it was drawn

  for (const [kind, level] of Object.entries(lv)) sfx.loop(kind, level);
  if (Math.max(lv.fire, lv.ice, lv.bubble, lv.shout, lv.laser) > 0.5 && !boost) S.powerUsedAt = now;
  powerHints(lv);
  hints(now, src);
}

// ───────────────────────────────────────────── two heroes
// Left-to-right on screen = hero 1, hero 2. A hero alone keeps the number they had.
function assignPlayers(faces, W, m, now) {
  if (faces.length >= 2) {
    const sx = (f) => (m ? W - f.eyes.x : f.eyes.x);
    [...faces].sort((a, b) => sx(a) - sx(b)).forEach((f, i) => { f.player = i % 2; });
    S.twoSince ||= now;
    if (!S.twoSeen && now - S.twoSince > 1200) showPlayers(true);
    S.oneSince = 0;
  } else {
    S.twoSince = 0;
    for (const f of faces) if (f.player === undefined) f.player = 0;
    // one hero left: the drawer follows the hero who's still here, and the 1/2 switch tucks away after a moment
    if (S.twoSeen && faces.length === 1) {
      if (faces[0].player !== S.player) setPlayer(faces[0].player, true);
      S.oneSince ||= now;
      if (now - S.oneSince > 2500) hidePlayers();
    }
  }
}
function nearestPlayer(h, faces) {
  let best = 0, bd = Infinity;
  for (const f of faces) { const d = Math.hypot(f.eyes.x - h.palm.x, f.eyes.y - h.palm.y) / f.fw; if (d < bd) { bd = d; best = f.player; } }
  return best;
}
function addRipple(x, y, str) {
  const W = engine.W, H = engine.H;
  S.ripples.push({ x: x / W, y: 1 - y / H, age: 0, str });
  if (S.ripples.length > 4) S.ripples.shift();
}
// Both heroes firing at once → TEAM POWER. Two hands from different heroes meeting → HIGH FIVE.
function combos(faces, fireLv, now, W, H) {
  const a = faces.find((f) => f.player === 0), b = faces.find((f) => f.player === 1);
  if (S.combo && now - S.combo.at < 1400 && a && b) {
    const seed = Math.floor(now / 110);
    engine.arc(a.eyes, b.eyes, Math.min(a.fw, b.fw) * 0.16, [1.2, 0.6, 2.2], seed);
    engine.arc({ x: a.eyes.x, y: a.eyes.y - a.fw * 0.3 }, { x: b.eyes.x, y: b.eyes.y - b.fw * 0.3 }, Math.min(a.fw, b.fw) * 0.1, [0.4, 1.4, 2.2], seed + 7);
    if (gfx) S.gpuUntil = now + 2500;
  }
  if (a && b && fireLv[0] > 0.5 && fireLv[1] > 0.5 && now - S.comboAt > 4500) {
    S.comboAt = now; S.combo = { at: now };
    const mid = { x: (a.eyes.x + b.eyes.x) / 2, y: Math.min(a.eyes.y, b.eyes.y) - (a.fw + b.fw) * 0.45 };
    gfx?.emit({ x: mid.x, y: H - mid.y, spread: Math.PI * 2, speed: (a.fw + b.fw) * 4, life: 1.6, size: a.fw * 0.03, kind: K.BURST, hue: Math.random() }, 12000);
    gfx?.emit({ x: mid.x, y: H - mid.y, spread: Math.PI * 2, speed: (a.fw + b.fw) * 2, life: 1.8, size: a.fw * 0.04, kind: K.MAGIC, hue: 0 }, 5000);
    engine.boom(mid, a.fw * 0.5, [2.2, 1.5, 2.4], 90);
    addRipple(a.eyes.x, a.eyes.y, 1); addRipple(b.eyes.x, b.eyes.y, 1); addRipple(mid.x, mid.y, 1);
    shake(now, 600, 0.016);
    bigWord('TEAM POWER!', mid.x, mid.y, (a.fw + b.fw) * 0.26);
    sfx.boom(); sfx.tada(); voice.say('team');
  }
  // high five
  if (now - S.hi5At > 2500) {
    const hs = hands.hands;
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const h1 = hs[i], h2 = hs[j];
      if (h1.player === h2.player || h1.open < 0.5 || h2.open < 0.5) continue;
      if (Math.hypot(h1.palm.x - h2.palm.x, h1.palm.y - h2.palm.y) > (h1.size + h2.size) * 1.1) continue;
      S.hi5At = now;
      const mid = { x: (h1.palm.x + h2.palm.x) / 2, y: (h1.palm.y + h2.palm.y) / 2 };
      gfx?.emit({ x: mid.x, y: H - mid.y, spread: Math.PI * 2, speed: h1.size * 12, life: 1.2, size: h1.size * 0.07, kind: K.BURST, hue: 0.13 }, 6000);
      engine.boom(mid, h1.size * 0.9, [2.6, 2.0, 0.6], 70);
      addRipple(mid.x, mid.y, 0.9);
      shake(now, 300, 0.008);
      bigWord('HIGH FIVE!', mid.x, mid.y - h1.size * 1.8, h1.size * 1.3);
      sfx.tada(); voice.say('high_five');
      if (gfx) S.gpuUntil = now + 2500;
      return;
    }
  }
}
// Average linear luminance of the cheeks/nose, so painted faces keep the room's real light.
const skinCanvas = document.createElement('canvas'); skinCanvas.width = skinCanvas.height = 6;
const skinCtx = skinCanvas.getContext('2d', { willReadFrequently: true });
function skinLuma(src, f) {
  const P = f.P, x0 = P[234].x + f.fw * 0.15, y0 = P[6].y, w = f.fw * 0.7, h = (P[152].y - P[6].y) * 0.6;
  skinCtx.drawImage(src, x0, y0, w, h, 0, 0, 6, 6);
  const d = skinCtx.getImageData(0, 0, 6, 6).data;
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.299 * lin(d[i]) + 0.587 * lin(d[i + 1]) + 0.114 * lin(d[i + 2]);
  return Math.max(0.03, s / (d.length / 4));
}
// ?demo&hand=open|fist|blast|point: a fake hand beside the test face, for screenshots without a camera.
function fakeHands(W, H, t, now) {
  const f = tracker.faces[0];
  const wave = FAKE.hand === 'wave' ? 1 : 0;
  const cx = (f ? f.eyes.x + f.fw * 1.1 : W * 0.7) + wave * Math.cos(t * 3) * (f?.fw || 100) * 0.5, cy = (f ? f.eyes.y + f.fw * 0.6 : H * 0.6) + wave * Math.sin(t * 3) * (f?.fw || 100) * 0.4, s = f ? f.fw * 0.42 : H * 0.12;
  const open = FAKE.hand === 'fist' ? 0 : 1;
  const P = [];
  const add = (x, y) => P.push({ x: cx + x * s, y: cy + y * s, z: 0 });
  add(0, 0.9);                                                                  // wrist
  const fingers = [[-0.75, 0.55, -0.5], [-0.35, -0.2, -0.15], [0, -0.25, 0], [0.33, -0.2, 0.15], [0.62, -0.05, 0.35]];
  fingers.forEach(([bx, by, ang], i) => {
    for (let k = 1; k <= 4; k++) {
      const L = (i === 0 ? 0.28 : 0.32) * k * (open ? 1 : 0.35), a = ang - Math.PI / 2;
      add(bx + Math.cos(a) * L * (k > 1 ? 1 : 0.2), by + Math.sin(a) * L * (k > 1 ? 1 : 0.2));
    }
  });
  let h = hands.hands[0];
  if (!h) { hands.update({ landmarks: [P.map((p) => ({ x: p.x / W, y: p.y / H, z: 0 }))], gestures: [[{ categoryName: open ? 'Open_Palm' : 'Closed_Fist', score: 0.9 }]] }, W, H, now); h = hands.hands[0]; }
  else { hands.update({ landmarks: [P.map((p) => ({ x: p.x / W, y: p.y / H, z: 0 }))], gestures: [[{ categoryName: FAKE.hand === 'point' ? 'Pointing_Up' : open ? 'Open_Palm' : 'Closed_Fist', score: 0.9 }]] }, W, H, now); }
  if (FAKE.hand === 'blast' && Math.floor(t * 0.8) !== S.fakeBlast) { S.fakeBlast = Math.floor(t * 0.8); if (h) { h.blastAt = now; h.blastPower = 1; h.throwAt = now; h.throwVel = { x: s * 30, y: -s * 25 }; } }
}

// Keep it smooth on a mid-range tablet: step effects down when frames get slow, back up when there's headroom.
function governor(ms, now) {
  S.frameMs += (ms - S.frameMs) * 0.05;
  if (now - S.qAt < 2500 || Q.has('hq')) return;
  if (S.frameMs > 48 && S.quality > 0) { S.quality--; S.qAt = now; engine.setQuality(S.quality); console.info('quality →', S.quality); }
  else if (S.frameMs < 26 && S.quality < 2 && now - S.qAt > 8000) { S.quality++; S.qAt = now; engine.setQuality(S.quality); console.info('quality →', S.quality); }
}

// ───────────────────────────────────────────── hints
function setPowerHint(text) {
  const el = $('powerHint');
  if (el.textContent !== text) el.textContent = text;
  el.hidden = !text;
}
// Show "😮 → 🔥" for each selected power that has a face trigger, until he's using it.
function powerHints(lv) {
  const now = performance.now();
  const active = POWERS.filter((p) => p.trigger && isOn(p.id));
  const firing = Math.max(lv.fire, lv.ice, lv.bubble, lv.shout, lv.laser) > 0.3;
  const hand = HAND_POWERS.find((p) => isOn(p.id));
  const needHand = hand && !S.handsShown;
  if (hand && S.handsShown) S.noHandSince = 0;
  else if (needHand && !S.noHandSince) S.noHandSince = now;
  if (needHand && now - S.noHandSince > 4000 && now - S.saidHandAt > 15000 && !S.busy) { S.saidHandAt = now; voice.say('show_hand'); }
  const parts = [...(firing ? [] : active.map((p) => p.hint)), ...(needHand ? [hand.hint] : [])];
  setPowerHint(parts.length && tracker.faces.length ? parts.join('   ') : '');
}
const lumaCanvas = document.createElement('canvas'); lumaCanvas.width = lumaCanvas.height = 24;
const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true });
function luma(src) {
  lumaCtx.drawImage(src, 0, 0, 24, 24);
  const d = lumaCtx.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4);
}
let hintText = '';
function setHint(text) {
  if (text === hintText) return;
  hintText = text;
  $('hint').textContent = text;
  $('hint').hidden = !text;
}
function hints(now, src) {
  if (!S.landmarker) return;
  if (tracker.faces.length) { S.noFaceSince = 0; setHint(''); return; }
  if (!S.noFaceSince) S.noFaceSince = now;
  if (now - S.noFaceSince < 1500) return;
  if (now - S.lumaAt > 1000) { S.lumaAt = now; S.dark = luma(src) < 55; }
  setHint(S.dark ? '💡 Too dark! Turn on a light.' : '👀 Where\'s the hero? Look at the screen!');
  if (now - S.saidFindAt > 20000 && !S.busy) { S.saidFindAt = now; voice.say(S.dark ? 'dark' : 'find'); }
}

// ───────────────────────────────────────────── drawers (picture tiles, no reading needed)
let PREVIEW = null;                                 // a real face's landmarks, normalized, for the tile pictures
async function loadPreviewFace() {
  try { PREVIEW = await (await fetch('preview-face.json')).json(); } catch { PREVIEW = null; }
}
function previewFace(cx, cy, fw, bs = {}) {
  const f = { P: PREVIEW.map(([x, y, z = 0]) => ({ x: cx + x * fw, y: cy + y * fw, z: z * fw })), bs };
  computeFrame(f);
  return f;
}
function cartoonHead(x, f, mouthOpen, skin = '#6B3E1F') {
  const P = f.P;
  // shoulders + shirt
  x.beginPath(); x.ellipse(P[152].x, P[152].y + f.fw * 0.95, f.fw * 0.95, f.fw * 0.6, 0, 0, Math.PI * 2);
  x.fillStyle = '#2E7BFF'; x.fill();
  x.beginPath(); x.rect(P[152].x - f.fw * 0.16, P[152].y - f.fw * 0.1, f.fw * 0.32, f.fw * 0.4); x.fillStyle = '#5A3418'; x.fill();
  // head (deep brown) from the face outline
  x.beginPath();
  FACE_OVAL.forEach((i, n) => (n ? x.lineTo(P[i].x, P[i].y) : x.moveTo(P[i].x, P[i].y)));
  x.closePath(); x.fillStyle = skin; x.fill();
  // hair cap
  x.beginPath(); x.ellipse(P[10].x, P[10].y + f.fw * 0.05, f.fw * 0.5, f.fw * 0.2, 0, Math.PI, Math.PI * 2); x.fillStyle = '#1B1210'; x.fill();
  for (const i of [468, 473]) { x.beginPath(); x.arc(P[i].x, P[i].y, f.fw * 0.055, 0, Math.PI * 2); x.fillStyle = '#FFFFFF'; x.fill(); x.beginPath(); x.arc(P[i].x, P[i].y, f.fw * 0.03, 0, Math.PI * 2); x.fillStyle = '#14161C'; x.fill(); }
  const m = { x: (P[13].x + P[14].x) / 2, y: (P[13].y + P[14].y) / 2 };
  x.beginPath();
  if (mouthOpen) x.ellipse(m.x, m.y + f.fw * 0.03, f.fw * 0.09, f.fw * 0.08, 0, 0, Math.PI * 2);
  else x.arc(m.x, m.y - f.fw * 0.05, f.fw * 0.12, 0.2 * Math.PI, 0.8 * Math.PI);
  if (mouthOpen) { x.fillStyle = '#3A0E0E'; x.fill(); } else { x.strokeStyle = '#1B1210'; x.lineWidth = f.fw * 0.03; x.lineCap = 'round'; x.stroke(); }
}
function renderPreview(cv, item) {
  setMirror(false);
  const dpr = Math.min(2, devicePixelRatio || 1), px = Math.round(92 * dpr);
  cv.width = cv.height = px;
  const x = cv.getContext('2d');
  x.scale(px / 100, px / 100);
  const t = 1.3;
  if (item.group === 'hands') { drawHandPreview(x, item.id); return; }
  if (item.group === 'paint') {                      // the real paint shader on the cartoon head
    const f = previewFace(50, 56, 46);
    cartoonHead(x, f, false);
    try { const pic = engine.previewPaint(item.id, f, 184); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(pic, 0, 0, px, px); x.restore(); } catch (e) { console.warn(e); }
    return;
  }
  if (item.id === 'storm') {
    x.fillStyle = '#121633'; x.fillRect(0, 0, 100, 100);
    const f = previewFace(50, 40, 30);
    drawStormPreview(x, f, 'back'); cartoonHead(x, f, false); drawStormPreview(x, f, 'front');
    return;
  }
  if (item.group === 'bg') {
    drawAnyBackground(x, item.id, 100, 100, t);
    cartoonHead(x, previewFace(50, 52, 30), false);
    return;
  }
  if (item.group === 'look') {                       // run the real filter over a little hero scene
    const src = document.createElement('canvas'); src.width = src.height = 184;
    const sx = src.getContext('2d'); sx.scale(1.84, 1.84);
    drawAnyBackground(sx, 'city', 100, 100, t);
    const f = previewFace(50, 56, 40); cartoonHead(sx, f, false); drawMask(sx, f, 'eye', 1, t);
    if (item.id === 'comic') { f.fx = { parts: [], rings: [], words: [{ x: 74, y: 24, age: 0.4, fw: 44, w: 'POW!', rot: -0.15 }] }; drawBreath(sx, f); }
    x.setTransform(1, 0, 0, 1, 0, 0);
    try { x.drawImage(engine.previewLook(item.look, src), 0, 0, px, px); } catch (e) { console.warn(e); x.drawImage(src, 0, 0, px, px); }
    return;
  }
  const layout = {
    badge: [50, 26, 30], cape: [50, 30, 26], wings: [50, 40, 22], jetpack: [50, 30, 24], dinobud: [42, 34, 34], robo: [50, 74, 40],
    fire: [50, 30, 34], ice: [50, 30, 34], rainbow: [50, 26, 34], bubble: [50, 18, 52], shout: [50, 18, 48], laser: [50, 30, 34], hypno: [50, 44, 46],
    aura: [50, 42, 34], lightning: [50, 50, 34], shield: [50, 52, 36], speed: [62, 50, 38], invisible: [50, 50, 40],
    astro: [50, 54, 30], lion: [50, 54, 32], diver: [50, 54, 30], crown: [50, 64, 34], viking: [50, 62, 32], dragon: [50, 62, 34], knight: [50, 60, 34], samurai: [50, 56, 34],
  }[item.id] || [50, 62, 46];
  const f = previewFace(...layout, { jawOpen: 1, browInnerUp: 1 });
  if (item.id === 'cape') drawCape(x, f, 1, t, 100);
  if (item.id === 'wings') drawWings(x, f, 1, t);
  if (item.id === 'jetpack') drawJetpack(x, f, 1, t);
  if (item.id === 'speed') drawSpeedGhosts(x, f, (col) => cartoonHead(x, f, false, col));
  if (item.id === 'aura') {
    x.save(); x.filter = 'blur(4px)'; x.globalAlpha = 0.9;
    x.beginPath(); x.ellipse(50, 56, 40, 46, 0, 0, Math.PI * 2);
    const g = x.createLinearGradient(0, 10, 0, 100); g.addColorStop(0, '#FFE45C'); g.addColorStop(1, '#25B5FF');
    x.fillStyle = g; x.fill(); x.restore();
  }
  if (item.id === 'invisible') { x.save(); x.globalAlpha = 0.28; cartoonHead(x, f, false, '#9FD8FF'); x.restore(); }
  else cartoonHead(x, f, item.trigger === 'mouth');
  if (item.id === 'cape') drawCapeClasps(x, f, 1);
  if (item.id === 'badge') drawBadge(x, f, 1, t);
  if (item.id === 'dinobud') drawDinoBuddy(x, f, 1, t);
  if (MASKS.includes(item) && !item.is3d) drawMask(x, f, item.id, 1, t);
  if (item.is3d) {                                   // real 3D render of the helmet / robot buddy on the cartoon head
    try {
      const build = item.id === 'robo' ? () => { const p = buildRoboBuddy(); p.group.children[0].scale.setScalar(2.4); return p; } : () => buildHelmet(item.id);
      const pic = engine.preview3D(build, f, 184, item.id === 'robo' ? 0 : 1.3);   // t=0 parks the robot buddy in front
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(pic, 0, 0, px, px); x.restore();
    } catch (e) { console.warn(e); }
  }
  if (item.id === 'fire' || item.id === 'ice' || item.id === 'bubble' || item.id === 'shout') {
    for (let i = 0; i < 26; i++) updateBreath(f, item.id, 1, 1 / 30);
    // the simulated bubbles/words come out too small to read at tile size: stage a bigger version
    if (item.id === 'bubble') f.fx.parts = [[28, 58, 9, 0], [44, 76, 11, 90], [64, 64, 8, 200], [73, 84, 6, 300], [24, 84, 6, 140]]
      .map(([bx, by, r, hue]) => ({ kind: 'bubble', x: bx, y: by, r, hue, age: 0.6, life: 2, vx: 0, vy: 0, spin: 0 }));
    if (item.id === 'shout') f.fx.words = [{ x: 50, y: 82, age: 0.4, fw: 56, w: 'POW!', rot: -0.12 }];
    drawMouthGlow(x, f, item.id, 1); drawBreath(x, f);
  }
  if (item.id === 'laser') drawLasers(x, f, 1.5, t);
  drawPowerPreview(x, f, item.id);
}
const EMOJI = {
  eye: '🦸🏿‍♂️', robot: '🤖', thunder: '⚡', dino: '🦖', race: '🏎️', astro: '🧑🏿‍🚀', knight: '🛡️', dragon: '🐉', ninja: '🥷🏿', viking: '🪓', crown: '👑', mech: '🤖', lion: '🦁', samurai: '⛩️', diver: '🤿', fireman: '🚒',
  fire: '🔥', ice: '❄️', rainbow: '🌈', bubble: '🫧', shout: '💥', laser: '👀', hypno: '🌀', lightning: '⚡', aura: '✨', shield: '🛡️', speed: '💨', invisible: '👻',
  cape: '🧣', wings: '🪽', jetpack: '🚀', badge: '⚡', robo: '🤖', dinobud: '🦕', city: '🌃', space: '🪐', dinoland: '🌋', sky: '☁️', underwater: '🐠', snow: '🏔️', track: '🏁', hq: '🖥️',
  tiger: '🐯', chrome: '🪞', galaxy: '🌌', lava: '🌋', circuit: '🔌', frost: '🧊', blast: '✊', fireball: '☄️', zap: '⚡', frosthand: '❄️', magic: '✨', storm: '🌀',
  comic: '💬', cartoon: '🎨', pixel: '👾', night: '🌙', thermal: '🌡️', holo: '💠',
};
// Tile pictures are rendered once, one per frame in the background (3D ones are real renders and not free),
// with the item's emoji standing in until its picture is ready. The open drawer's tiles go first.
const previews = new Map(), previewQueue = [];
let previewPump = 0;
function previewFor(item) {
  if (!previews.has(item.id)) {
    const cv = document.createElement('canvas');
    const px = Math.round(92 * Math.min(2, devicePixelRatio || 1));
    cv.width = cv.height = px;
    const x = cv.getContext('2d');
    x.font = `${Math.round(px * 0.5)}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(EMOJI[item.id] || '⭐', px / 2, px / 2);
    previews.set(item.id, { cv, done: false, item });
  }
  const p = previews.get(item.id);
  if (!p.done) {                                       // (re)queue at the front: it's on screen now
    const i = previewQueue.indexOf(p); if (i >= 0) previewQueue.splice(i, 1);
    previewQueue.unshift(p);
    if (!previewPump) previewPump = setTimeout(pumpPreviews, 30);
  }
  return p.cv;
}
function pumpPreviews() {
  previewPump = 0;
  const p = previewQueue.shift();
  if (!p) return;
  if (PREVIEW && engine) { try { renderPreview(p.cv, p.item); } catch (e) { console.warn(e); } }
  p.done = true;
  if (previewQueue.length) previewPump = setTimeout(pumpPreviews, 16);
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
}
function renderTray(popId) {
  const items = DRAWERS[S.tab].filter((it) => !it.gpu || gfx);
  const tray = $('tray');
  tray.replaceChildren(...items.map((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = ['tile', isOn(it.id) && 'on', it.id === popId && 'pop'].filter(Boolean).join(' ');
    b.dataset.id = it.id;
    b.setAttribute('aria-pressed', String(isOn(it.id)));
    b.setAttribute('aria-label', it.name);
    if (PREVIEW && engine) b.append(previewFor(it));
    else { const e = document.createElement('span'); e.className = 'tile-ico'; e.textContent = EMOJI[it.id]; b.append(e); }
    const n = document.createElement('span'); n.className = 'tile-name'; n.textContent = it.name; n.setAttribute('aria-hidden', 'true');
    const c = document.createElement('span'); c.className = 'tile-check'; c.textContent = '✓'; c.setAttribute('aria-hidden', 'true');
    b.append(n, c);
    return b;
  }));
}

// The first time a drawer opens, slide it over and back so he sees there are more tiles to swipe to.
const peeked = new Set();
function peekTray() {
  const tray = $('tray');
  if (peeked.has(S.tab) || document.body.dataset.screen !== 'studio') return;
  const landscape = matchMedia('(orientation: landscape) and (min-width: 600px)').matches;
  const room = landscape ? tray.scrollHeight - tray.clientHeight : tray.scrollWidth - tray.clientWidth;
  if (room < 20) return;
  peeked.add(S.tab);
  const go = (v) => tray.scrollTo(landscape ? { top: v, behavior: 'smooth' } : { left: v, behavior: 'smooth' });
  setTimeout(() => { go(Math.min(160, room)); sfx.swoosh(); }, 350);
  setTimeout(() => go(0), 1100);
}

function toggle(id) {
  const it = ITEM[id], s = S.sel[id];
  if (s.on) {
    s.on = false; sfx.off();
  } else {
    // one mask at a time; one face paint, one hand power, one breath, one eye power, one background, one look at a time
    const rivals = MASKS.includes(it) ? MASKS : it.group ? ALL.filter((x) => x.group === it.group) : [];
    for (const r of rivals) S.sel[r.id].on = false;
    if (it.group === 'hands' || it.id === 'storm') { if (!workerFor(false, true)) loadHands(); }
    s.on = true; s.at = performance.now() / 1000;
    if (POWERS.includes(it)) sfx.zap(); else sfx.boing();
    voice.say(it.line);
    if (it.trigger) scheduleTapHint(id);
  }
  renderTray(id);
}
// If he hasn't managed the face move after a while, tell him tapping works too (once per session).
function scheduleTapHint(id) {
  const since = performance.now();
  setTimeout(() => {
    if (S.tapHinted || !isOn(id) || document.body.dataset.screen !== 'studio') return;
    if (S.powerUsedAt > since || performance.now() < S.boostUntil) return;
    S.tapHinted = true;
    voice.say('tap_hint');
  }, 7000);
}
function clearAll() {
  const any = ALL.some((it) => isOn(it.id));
  for (const it of ALL) S.sel[it.id].on = false;          // this hero's things (+ background and look)
  G.balls = []; G.trails.clear();
  renderTray();
  sfx.swoosh();
  if (any) { voice.say('off'); toast('All off! 🧺'); }
}

// Tap anywhere on the camera picture to fire every power that's on.
$('stage').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button') || document.body.dataset.screen !== 'studio' || !$('loading').hidden || !$('error').hidden) return;
  if (isOn('shield') && performance.now() - S.shieldAt > 700) S.shieldAt = performance.now();   // cooldown: mashing can't strobe it
  const now = performance.now();
  const handPw = [0, 1].some((p) => handOf(p));
  if (handPw) for (const h of hands.hands) if (handOf(h.player)) { h.blastAt = now; h.blastPower = 1; h.throwAt = now; h.throwVel = { x: 0, y: -h.size * 16 }; }
  if (onAnyHero('storm')) S.boostUntil = now + 1600;
  if (!handPw && !POWERS.some((p) => (p.trigger || p.id === 'shield' || p.id === 'lightning' || p.id === 'storm') && isOn(p.id))) {
    // no power to fire yet: answer the tap anyway and point at the Powers drawer
    sfx.sparkle(); voice.say('pick_power');
    const tab = document.querySelector('[data-tab=powers]');
    tab.classList.remove('pop'); void tab.offsetWidth; tab.classList.add('pop');
    return;
  }
  S.boostUntil = performance.now() + 1600;
  sfx.zap();
});

const onAnyHero = (id) => isOn(id, 0) || isOn(id, 1);

// ───────────────────────────────────────────── hero 1 / hero 2
function showPlayers(say) {
  if (S.twoSeen) return;
  S.twoSeen = true; S.oneSince = 0;
  $('players').hidden = false;
  document.body.classList.add('two');
  if (say && !S.busy && !S.saidTwo) { S.saidTwo = true; voice.say('two_heroes'); }
  peekTray();
}
function hidePlayers() {
  S.twoSeen = false; S.oneSince = 0;
  $('players').hidden = true;
  document.body.classList.remove('two');
}
function setPlayer(p, quiet = false) {
  const btn = document.querySelector(`.player[data-p="${p}"]`);
  if (p !== S.player) {
    S.player = p; bindSel();
    document.body.dataset.player = String(p);
    document.querySelectorAll('.player').forEach((b) => {
      const on = +b.dataset.p === p;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
    renderTray();
  }
  if (quiet) return;
  sfx.pop(); voice.say(p ? 'player2' : 'player1');              // tapping your own number still answers
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
}
document.querySelectorAll('.player').forEach((b) => { b.onclick = () => setPlayer(+b.dataset.p); b.tabIndex = +b.dataset.p === S.player ? 0 : -1; });
$('players').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault(); setPlayer(1 - S.player);
  document.querySelector(`.player[data-p="${S.player}"]`).focus();
});

// ───────────────────────────────────────────── camera button
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function shoot() {
  if (S.busy || document.body.dataset.screen !== 'studio') return;
  if (!$('loading').hidden) { sfx.off(); voice.say('wait'); toast('Wait for the camera! ⏳'); return; }
  if (!$('error').hidden) { sfx.off(); voice.say('oops'); return; }
  S.busy = true; $('shutter').disabled = true;
  try {
    if (isMirror()) {                              // selfie: 3-2-1, hero pose!
      for (const n of [3, 2, 1]) {
        const c = $('count');
        c.textContent = n; c.hidden = false;
        c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick');
        voice.say(`n${n}`);
        await wait(850);
      }
      $('count').textContent = '💥';
      voice.say('pose');
      await wait(700);
      $('count').hidden = true;
    }
    const pending = snapshot();                    // grabs the canvas now; JPEG encoding finishes in the background
    sfx.shutter();
    const fl = $('flash'); fl.hidden = false; fl.style.animation = 'none'; void fl.offsetWidth; fl.style.animation = '';
    setTimeout(() => { fl.hidden = true; }, 500);
    const blob = await pending;
    await gallery.add(blob);
    flyToGallery(blob);
    setTimeout(() => { sfx.tada(); voice.say('saved'); toast('Saved! ⭐'); }, 450);
  } catch (e) {
    console.error(e);
    sfx.off(); voice.say('oops');
    toast("Oops — that picture didn't save. Try again!");
  } finally {
    $('count').hidden = true;
    S.busy = false; $('shutter').disabled = false;
  }
}
// WebGL clears its picture after each frame, so the copy happens inside the next frame, right after it's drawn.
function snapshot() {
  return new Promise((res, rej) => { S.capture = () => { try { copyFrame().then(res, rej); } catch (e) { rej(e); } }; });
}
// Save exactly what's on screen: the canvas is object-fit: cover, so crop to the visible part.
function copyFrame() {
  const r = canvas.getBoundingClientRect(), cw = canvas.width, ch = canvas.height;
  const scale = Math.max(r.width / cw, r.height / ch);
  const vw = r.width / scale, vh = r.height / scale;
  const out = document.createElement('canvas');
  out.width = Math.round(vw); out.height = Math.round(vh);
  const o = out.getContext('2d');
  o.drawImage(canvas, (cw - vw) / 2, (ch - vh) / 2, vw, vh, 0, 0, out.width, out.height);
  const fs = Math.round(out.width * 0.045);
  o.font = `${fs}px Bangers, Impact, sans-serif`;
  o.textAlign = 'right'; o.textBaseline = 'bottom';
  o.lineWidth = fs * 0.25; o.strokeStyle = 'rgba(16,19,28,.85)'; o.lineJoin = 'round';
  const txt = "TJ'S HERO LAB ⚡";
  o.strokeText(txt, out.width - fs * 0.6, out.height - fs * 0.5);
  o.fillStyle = '#FFD400'; o.fillText(txt, out.width - fs * 0.6, out.height - fs * 0.5);
  return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.92));
}
function flyToGallery(blob) {
  const url = URL.createObjectURL(blob);
  const from = $('stage').getBoundingClientRect(), to = $('thumb').getBoundingClientRect();
  const img = document.createElement('img');
  img.className = 'fly'; img.src = url; img.alt = '';
  Object.assign(img.style, { left: `${from.left + from.width * 0.2}px`, top: `${from.top + from.height * 0.15}px`, width: `${from.width * 0.6}px`, height: `${from.height * 0.6}px` });
  document.body.appendChild(img);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    Object.assign(img.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: '0.9' });
  }));
  setTimeout(() => { img.remove(); URL.revokeObjectURL(url); setThumb(blob); }, 600);
}
let thumbUrl = null;
function setThumb(blob) {
  if (thumbUrl) URL.revokeObjectURL(thumbUrl);
  const t = $('thumb');
  if (!blob) { thumbUrl = null; t.innerHTML = '<span aria-hidden="true">🖼️</span>'; return; }
  thumbUrl = URL.createObjectURL(blob);
  t.innerHTML = `<img src="${thumbUrl}" alt="">`;
  t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
}

// ───────────────────────────────────────────── gallery
let gridUrls = [], viewing = null;
async function openGallery() {
  sfx.pop(); voice.say('gallery');
  openLayer('gallery');
  await renderGallery();
  $('gallery').hidden = false;
}
async function renderGallery() {
  let rows = [];
  try { rows = await gallery.all(); } catch (e) { console.error(e); }
  gridUrls.forEach(URL.revokeObjectURL);
  gridUrls = rows.map((r) => URL.createObjectURL(r.blob));
  $('grid').innerHTML = rows.map((r, i) => `<button type="button" data-i="${i}" aria-label="Picture ${i + 1}"><img src="${gridUrls[i]}" alt=""></button>`).join('');
  $('grid').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.dataset.i; viewing = { row: rows[i], url: gridUrls[i] };
    $('viewerImg').src = viewing.url; $('viewer').hidden = false; sfx.pop();
    openLayer('viewer');
  };
  $('empty').hidden = rows.length > 0;
}
async function share() {
  if (!viewing) return;
  const file = new File([viewing.row.blob], `tj-hero-${viewing.row.id}.jpg`, { type: 'image/jpeg' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "TJ's Hero Lab" });
    } else {
      const a = document.createElement('a'); a.href = viewing.url; a.download = file.name; a.click();
      toast('Saved to Downloads! 📥');
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast("Couldn't share that one. Try again!");
  }
}
async function trash() {
  if (!viewing) return;
  await gallery.remove(viewing.row.id);
  viewing = null;
  closeLayers(['confirm', 'viewer'], true);
  sfx.swoosh(); toast('Thrown away! 🗑️');
  const last = await gallery.latest().catch(() => null);
  setThumb(last?.blob || null);
  renderGallery();
}

// ───────────────────────────────────────────── layers + Android Back
// Every screen that opens on top pushes a history entry, so the Back gesture closes it instead of leaving the app.
const layers = [];
function openLayer(name) { layers.push(name); history.pushState({ d: layers.length }, ''); }
function hideLayer(name, quiet) {
  if (name === 'studio') { goHome(); return; }
  if (name === 'gallery') $('gallery').hidden = true;
  if (name === 'viewer') $('viewer').hidden = true;
  if (name === 'confirm') $('confirm').hidden = true;
  if (!quiet) sfx.pop();
}
function closeTop() { if (layers.length) history.back(); }
// Close named top layers now (no waiting on popstate), then rewind history to match.
function closeLayers(names, quiet) {
  let n = 0;
  for (const name of names) if (layers[layers.length - 1] === name) { hideLayer(layers.pop(), quiet); n++; }
  if (n) { skipPops += 1; history.go(-n); }
}
let skipPops = 0;
addEventListener('popstate', (e) => {
  if (skipPops) { skipPops--; return; }
  const target = e.state?.d ?? 0;
  while (layers.length > target) hideLayer(layers.pop());
});

// ───────────────────────────────────────────── toast
let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

// ───────────────────────────────────────────── wire up
$('goBtn').onclick = () => { sfx.unlock(); voice.preload(); voice.say('start'); openStudio('user', true); };
$('startGallery').onclick = () => { sfx.unlock(); voice.preload(); openGallery(); };
$('homeBtn').onclick = () => (layers.includes('studio') ? closeTop() : goHome());
$('flipBtn').onclick = () => { sfx.pop(); openStudio(S.facing === 'user' ? 'environment' : 'user'); };
$('retryBtn').onclick = () => openStudio(S.facing);
$('shutter').onclick = shoot;
$('clearBtn').onclick = clearAll;
$('galleryBtn').onclick = openGallery;
$('galleryClose').onclick = closeTop;
$('viewerBack').onclick = closeTop;
$('shareBtn').onclick = share;
$('trashBtn').onclick = () => { $('confirm').hidden = false; sfx.pop(); voice.say('toss'); openLayer('confirm'); };
$('keepBtn').onclick = closeTop;
$('tossBtn').onclick = trash;
// While loading, the drawer is dimmed — still answer taps so he knows to wait.
document.querySelector('.dock').addEventListener('pointerdown', (e) => {
  if ($('loading').hidden || e.target.closest('#shutter')) return;
  sfx.off(); voice.say('wait'); toast('Wait for the camera! ⏳');
});
$('tray').onclick = (e) => { const b = e.target.closest('.tile'); if (b) toggle(b.dataset.id); };
document.querySelectorAll('.tab').forEach((b) => {
  b.onclick = () => { S.tab = b.dataset.tab; sfx.pop(); voice.say(`t_${S.tab}`); renderTabs(); renderTray(); $('tray').scrollTo(0, 0); peekTray(); };
});

renderTabs();
document.body.dataset.player = '0';
loadFaceGeo().catch((e) => console.warn('face paint data', e));
// Sculpted helmets replace the code-built ones as they arrive; redo their tile pictures.
loadHelmetModels().then((n) => {
  if (!n || !engine) return;
  for (const h of engine.heads.values()) h.helmetId = undefined;
  for (const it of MASKS) if (it.is3d && hasModel(it.id)) { const p = previews.get(it.id); if (p) { p.done = false; } }
  renderTray();
}).catch((e) => console.warn('helmet models', e));
// WebGPU particles: if this browser has them, the extra-big effects and the Star Storm switch on.
if (engine && !Q.has('nogpu')) createGpuFx(1280, 720).then((g) => {
  if (!g) return;
  gfx = g; engine.attachGpu(g.canvas);
  renderTray();
}).catch((e) => console.warn('webgpu', e));
renderTray();
loadPreviewFace().then(() => { if (PREVIEW) renderTray(); });
gallery.latest().then((r) => r && setThumb(r.blob)).catch(() => {});
if (Q.has('go')) openStudio('user', true);          // dev shortcut: ?demo&go skips the start screen

// Offline support once hosted (not on localhost, where it would cache stale dev files).
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// test hook
window.__hero = { S, tracker, hands, toggle, frame, seg, engine, G, setPlayer, showPlayers, TW, get gfx() { return gfx; } };
