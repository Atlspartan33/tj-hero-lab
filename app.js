// app.js — TJ's Hero Lab. Camera → MediaPipe face landmarks + body cut-out (on-device) → WebGL engine (engine.js):
// 3D helmets, GPU particles + bloom, shader effects, and 2D sticker gear painted into layers the engine composites.
// Built for a 4-year-old pre-reader: every tap is spoken, previews instead of words, powers fire from the face
// OR from tapping the screen.  ?demo uses test/face.jpg instead of the camera (&jaw=0.7 / &brow=0.8 fake a face).
import { Tracker, computeFrame, FACE_OVAL } from './face.js';
import {
  MASKS, POWERS, GEAR, LOOKS, DRAWERS, ALL, BG_LIGHT, popIn, drawMask, drawBadge, drawCape, drawCapeClasps, drawWings,
  updateBreath, drawBreath, drawMouthGlow, drawLasers, breathLevel, surpriseLevel, setMirror,
} from './gear.js';
import { drawJetpack, drawDinoBuddy, drawPowerPreview, drawSpeedGhosts, drawAnyBackground } from './gear3.js';
import { Engine } from './engine.js';
import { buildHelmet, buildRoboBuddy } from './helmets3d.js';
import * as sfx from './sfx.js';
import * as voice from './voice.js';
import * as gallery from './gallery.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const DEMO = Q.has('demo');
const FAKE = { jaw: parseFloat(Q.get('jaw') || '0'), brow: parseFloat(Q.get('brow') || '0') };

const S = {
  facing: 'user', stream: null, landmarker: null, segmenter: null, gen: 0, raf: 0,
  lastVideoTime: -1, lastTs: 0, lastSegTs: 0, lastT: 0, tab: 'masks', busy: false,
  noFaceSince: 0, lumaAt: 0, dark: false, wake: null, saidFindAt: 0,
  boostUntil: 0, powerUsedAt: 0, tapHinted: false, shieldAt: 0, ripples: [], rippleAt: 0, frost: 0,
  frameMs: 33, quality: 2, qAt: 0, ambAt: 0, segSkip: 0, capture: null,
  sel: Object.fromEntries(ALL.map((it) => [it.id, { on: false, at: 0 }])),
};
const tracker = new Tracker();
const video = $('video'), canvas = $('canvas');
let engine = null;
try { engine = new Engine(canvas); } catch (e) { console.error('WebGL engine failed', e); }
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); location.reload(); });
let demoImg = null;
const isOn = (id) => S.sel[id].on;

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

// ───────────────────────────────────────────── body cut-out
// The segmenter's person mask is smoothed over time and handed to the engine as a GPU texture.
const seg = { prev: null, alpha: null, ready: false };
const smooth = (v) => { const t = Math.max(0, Math.min(1, (v - 0.3) / 0.45)); return t * t * (3 - 2 * t); };
function segment(src, ts) {
  try {
    S.segmenter.segmentForVideo(src, ts, (res) => {
      const m = res.confidenceMasks?.[0];
      if (!m) return;
      const a = m.getAsFloat32Array();
      if (!seg.prev || seg.prev.length !== a.length) { seg.prev = new Float32Array(a); seg.alpha = new Uint8Array(a.length); }
      const p = seg.prev, out = seg.alpha;
      for (let i = 0; i < a.length; i++) { p[i] = p[i] * 0.35 + a[i] * 0.65; out[i] = smooth(p[i]) * 255; }   // temporal smoothing kills edge flicker
      engine.setMask(out, m.width, m.height);
      seg.ready = true;
    });
  } catch (e) { console.warn(e); }
}

// ───────────────────────────────────────────── camera
async function startSource(my) {
  stopSource();
  if (DEMO) {
    demoImg = new Image();
    await new Promise((res, rej) => { demoImg.onload = res; demoImg.onerror = rej; demoImg.src = 'test/face.jpg'; });
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
  tracker.reset(); seg.ready = false; seg.prev = null; S.ripples = [];
  S.lastVideoTime = -1; S.noFaceSince = 0;
  sfx.silenceLoops();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') { sfx.silenceLoops(); voice.stop(); return; }
  if (S.stream && (!S.wake || S.wake.released)) { try { S.wake = await navigator.wakeLock?.request('screen'); } catch {} }
});
const isMirror = () => (DEMO ? Q.has('mirror') : S.facing === 'user');

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
const breathOn = () => POWERS.find((it) => it.group === 'breath' && isOn(it.id))?.id || null;
const eyesOn = () => POWERS.find((it) => it.group === 'eyes' && isOn(it.id))?.id || null;
const lookOn = () => LOOKS.find((it) => isOn(it.id))?.look || 0;
const ambCanvas = document.createElement('canvas'); ambCanvas.width = ambCanvas.height = 8;
const ambCtx = ambCanvas.getContext('2d', { willReadFrequently: true });

function frame() {
  const src = DEMO ? demoImg : video;
  if (!src) return;
  const W = DEMO ? src.naturalWidth : src.videoWidth, H = DEMO ? src.naturalHeight : src.videoHeight;
  if (!W || !H) return;
  engine.setSource(src, W, H, !DEMO);
  const now = performance.now(), t = now / 1000;
  const dt = Math.min(0.05, Math.max(0.001, t - (S.lastT || t))); S.lastT = t;
  governor(dt * 1000, now);
  const fresh = S.landmarker && (DEMO || video.currentTime !== S.lastVideoTime);
  const bg = bgId(), look = lookOn(), mask = MASKS.find((it) => isOn(it.id)), breath = breathOn(), eyes = eyesOn();
  const behind = GEAR.filter((g) => g.behind && isOn(g.id));
  const wantSeg = !!S.segmenter && (behind.length > 0 || isOn('aura') || isOn('speed') || isOn('invisible') || !!bg);

  if (fresh) {
    S.lastVideoTime = video.currentTime;
    const ts = Math.max(now, S.lastTs + 1); S.lastTs = ts;     // timestamps must strictly increase
    let res = null;
    try { res = S.landmarker.detectForVideo(src, ts); } catch (e) { console.warn(e); }
    if (res) {
      tracker.update(res, W, H, FAKE.jaw);
      if (FAKE.brow) for (const f of tracker.faces) f.bs.browInnerUp = FAKE.brow;
    }
    // on the lowest quality tier, cut out the body every other frame
    if (wantSeg && (S.quality > 0 || (S.segSkip++ % 2 === 0))) { const st = Math.max(now, S.lastSegTs + 1); S.lastSegTs = st; segment(src, st); }
  }
  const segOK = wantSeg && seg.ready;
  const m = isMirror();
  setMirror(m);
  const k = (id) => popIn(S.sel[id].at, t);
  const boost = now < S.boostUntil ? 1 : 0;
  const faces = tracker.faces;

  // ── 2D layers (painted in camera pixels; the engine scales them)
  if (bg && segOK) drawAnyBackground(engine.layer('bg'), bg, W, H, t);
  let nozzles = [];
  if (segOK && behind.length) {
    const c = engine.layer('behind');
    for (const f of faces) {
      if (isOn('wings')) drawWings(c, f, k('wings'), t);
      if (isOn('jetpack')) nozzles = nozzles.concat(drawJetpack(c, f, k('jetpack'), t));
      if (isOn('cape')) drawCape(c, f, k('cape'), t, H);
    }
  }
  const twoD = (mask && !mask.is3d) || isOn('cape') || isOn('badge');
  const topD = isOn('dinobud') || breath === 'bubble' || breath === 'shout';
  const lv = { fire: 0, ice: 0, bubble: 0, shout: 0, laser: 0, crackle: 0 };
  const front = twoD && faces.length ? engine.layer('front') : null;
  const top = topD && faces.length ? engine.layer('top') : null;
  let heat = null;

  // ── per face: 2D stickers, 3D pieces, GPU effects
  engine.syncHeads(faces);
  for (const f of faces) {
    const bl = breath ? Math.max(breathLevel(f), boost) : 0;
    const el = eyes ? Math.max(surpriseLevel(f), boost) : 0;
    if (front) {
      if (isOn('cape') && segOK) drawCapeClasps(front, f, k('cape'));
      if (isOn('badge')) drawBadge(front, f, k('badge'), t);
      if (mask && !mask.is3d) drawMask(front, f, mask.id, k(mask.id), t);
    }
    if (top) {
      if (isOn('dinobud')) drawDinoBuddy(top, f, k('dinobud'), t);
      if (breath === 'bubble' || breath === 'shout') { updateBreath(f, breath, bl, dt); drawBreath(top, f); }
    }
    engine.setHelmet(f, mask?.is3d ? mask.id : null, mask?.is3d ? k(mask.id) : 1, t, f.bs);
    engine.setRobo(f, isOn('robo'), k('robo'), t);
    engine.setShield(f, isOn('shield'), Math.max(0, 1 - (now - S.shieldAt) / 700), t);
    if (breath === 'fire' || breath === 'ice' || breath === 'rainbow') engine.breath(f, breath, bl, dt);
    if (breath) { const key = breath === 'rainbow' ? 'ice' : breath; lv[key] = Math.max(lv[key], bl * (breath === 'rainbow' ? 0.6 : 1)); }
    if (breath === 'fire' && bl > 0.05) {
      const mx = (f.P[13].x + f.P[14].x) / 2, my = (f.P[13].y + f.P[14].y) / 2 + f.fw * 0.55;
      heat = { x: mx / W, y: 1 - my / H, r: (f.fw * 0.9) / H, str: bl };
    }
    if (breath === 'shout' && bl > 0.3 && t - S.rippleAt > 0.35) {
      S.rippleAt = t;
      const mx = (f.P[13].x + f.P[14].x) / 2, my = (f.P[13].y + f.P[14].y) / 2;
      S.ripples.push({ x: mx / W, y: 1 - my / H, age: 0, str: bl });
      if (S.ripples.length > 4) S.ripples.shift();
    }
    if (eyes === 'laser') engine.lasers(f, el, t);
    if (eyes === 'hypno') engine.hypno(f, el, t);
    if (eyes) lv.laser = Math.max(lv.laser, el * (eyes === 'hypno' ? 0.5 : 1));
    engine.lightningFx(f, isOn('lightning'), t, !!boost);
    if (isOn('lightning')) lv.crackle = Math.max(lv.crackle, boost ? 1 : 0.35);
    if (isOn('aura')) engine.auraSparks(f, dt);
  }
  if (nozzles.length) engine.jetFlames(nozzles, dt);
  for (const r of S.ripples) r.age += dt;
  S.ripples = S.ripples.filter((r) => r.age < 1.1);
  const iceTarget = breath === 'ice' ? Math.max(0, ...faces.map((f) => Math.max(breathLevel(f), boost))) : 0;
  S.frost += (iceTarget - S.frost) * Math.min(1, dt * 3);

  // match the 3D lighting to the room every half second
  if (now - S.ambAt > 500) {
    S.ambAt = now;
    try {
      ambCtx.drawImage(src, 0, 0, 8, 8);
      const d = ambCtx.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = (d.length / 4) * 255; engine.setAmbient(r / n, g / n, b / n);
    } catch {}
  }

  const light = bg ? BG_LIGHT[bg] : null;
  engine.render({
    t, dt, mirror: m, look, useBg: !!(bg && segOK), useMask: segOK,
    aura: isOn('aura') ? 1 : 0, invis: isOn('invisible') ? 1 : 0, speed: isOn('speed') ? 1 : 0,
    rim: light ? 0.9 : isOn('aura') ? 0.5 : 0, rimColor: light ? light.rim : [1.0, 0.85, 0.3], bgTint: light ? light.tint : [1, 1, 1],
    ripples: S.ripples, heat, frost: S.frost,
  });
  if (S.capture) { const c = S.capture; S.capture = null; c(); }   // read the canvas in the same task it was drawn

  for (const [kind, level] of Object.entries(lv)) sfx.loop(kind, level);
  if (Math.max(lv.fire, lv.ice, lv.bubble, lv.shout, lv.laser) > 0.5 && !boost) S.powerUsedAt = now;
  powerHints(lv);
  hints(now, src);
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
  const active = POWERS.filter((p) => p.trigger && isOn(p.id));
  const firing = Math.max(lv.fire, lv.ice, lv.bubble, lv.shout, lv.laser) > 0.3;
  setPowerHint(active.length && tracker.faces.length && !firing ? active.map((p) => p.hint).join('   ') : '');
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
    x.setTransform(1, 0, 0, 1, 0, 0);
    try { x.drawImage(engine.previewLook(item.look, src), 0, 0, px, px); } catch (e) { console.warn(e); x.drawImage(src, 0, 0, px, px); }
    return;
  }
  const layout = {
    badge: [50, 26, 30], cape: [50, 30, 26], wings: [50, 40, 22], jetpack: [50, 30, 24], dinobud: [42, 34, 34], robo: [38, 74, 52],
    fire: [50, 30, 34], ice: [50, 30, 34], rainbow: [50, 26, 34], bubble: [50, 18, 52], shout: [50, 18, 48], laser: [50, 30, 34], hypno: [50, 44, 46],
    aura: [50, 42, 34], lightning: [50, 50, 34], shield: [50, 52, 36], speed: [62, 50, 38], invisible: [50, 50, 40],
    astro: [50, 54, 30], lion: [50, 54, 32], diver: [50, 54, 30], crown: [50, 64, 34], viking: [50, 62, 32], dragon: [50, 62, 34], knight: [50, 60, 34], samurai: [50, 56, 34],
  }[item.id] || [50, 58, 40];
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
      const pic = engine.preview3D(() => (item.id === 'robo' ? buildRoboBuddy() : buildHelmet(item.id)), f);
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
  comic: '💬', cartoon: '🎨', pixel: '👾', night: '🌙', thermal: '🌡️', holo: '💠',
};
const previews = new Map();                         // rendered once, re-used on every tray render
function previewFor(item) {
  if (!previews.has(item.id)) {
    const cv = document.createElement('canvas');
    if (PREVIEW && engine) { try { renderPreview(cv, item); } catch (e) { console.warn(e); } }
    previews.set(item.id, cv);
  }
  return previews.get(item.id);
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
}
function renderTray(popId) {
  const items = DRAWERS[S.tab];
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

function toggle(id) {
  const it = ALL.find((x) => x.id === id), s = S.sel[id];
  if (s.on) {
    s.on = false; sfx.off();
  } else {
    // one mask at a time; one breath, one eye power, one background, one look at a time
    const rivals = MASKS.includes(it) ? MASKS : it.group ? ALL.filter((x) => x.group === it.group) : [];
    for (const r of rivals) S.sel[r.id].on = false;
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
  for (const it of ALL) S.sel[it.id].on = false;
  renderTray();
  sfx.swoosh();
  if (any) { voice.say('off'); toast('All off! 🧺'); }
}

// Tap anywhere on the camera picture to fire every power that's on.
$('stage').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button') || document.body.dataset.screen !== 'studio' || !$('loading').hidden || !$('error').hidden) return;
  if (isOn('shield')) S.shieldAt = performance.now();
  if (!POWERS.some((p) => (p.trigger || p.id === 'shield' || p.id === 'lightning') && isOn(p.id))) {
    // no power to fire yet: answer the tap anyway and point at the Powers drawer
    sfx.sparkle(); voice.say('pick_power');
    const tab = document.querySelector('[data-tab=powers]');
    tab.classList.remove('pop'); void tab.offsetWidth; tab.classList.add('pop');
    return;
  }
  S.boostUntil = performance.now() + 1600;
  sfx.zap();
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
  b.onclick = () => { S.tab = b.dataset.tab; sfx.pop(); voice.say(`t_${S.tab}`); renderTabs(); renderTray(); };
});

renderTabs();
renderTray();
loadPreviewFace().then(() => { if (PREVIEW) renderTray(); });
gallery.latest().then((r) => r && setThumb(r.blob)).catch(() => {});
if (Q.has('go')) openStudio('user', true);          // dev shortcut: ?demo&go skips the start screen

// Offline support once hosted (not on localhost, where it would cache stale dev files).
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// test hook
window.__hero = { S, tracker, toggle, frame, seg, engine };
