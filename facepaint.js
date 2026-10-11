// facepaint.js — paint wrapped onto the tracked face mesh, so it bends with every smile, blink and jaw drop.
// The mesh is MediaPipe's canonical face (468 landmarks as vertices, its UV layout, 898 triangles); the live
// landmarks move the vertices every frame. Paint is relit by the real skin under it (sampled from the camera),
// so the shadows and the room's light stay on the face — it reads as paint, not a sticker.
import * as THREE from 'three';
import { BLOOM } from './helmets3d.js';
import { FACE_OVAL, LIPS_OUT, R_BROW, L_BROW } from './face.js';

export const PAINTS = ['tiger', 'chrome', 'galaxy', 'lava', 'circuit', 'frost'];
const MODE = { tiger: 0, frost: 0, chrome: 1, galaxy: 2, lava: 3, circuit: 4 };
const R_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const L_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];

let GEO = null;                     // { uv: [[u,v]...468], tri: [...] }
export async function loadFaceGeo() {
  if (!GEO) GEO = await (await fetch('facegeo.json')).json();
  return GEO;
}
export const faceGeoReady = () => !!GEO;

// ───────────────────────────────────────────── paint textures (drawn in UV space)
const S = 1024;
const toPx = ([u, v]) => [u * S, (1 - v) * S];
const uvOf = (i) => toPx(GEO.uv[i]);
function poly(x, ids) { x.beginPath(); ids.forEach((i, n) => { const [px, py] = uvOf(i); n ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); }
function canvas() { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}
const centroid = (ids) => { let x = 0, y = 0; for (const i of ids) { const [a, b] = uvOf(i); x += a; y += b; } return [x / ids.length, y / ids.length]; };

// R = where paint goes (soft at the face edge), G = lips (left bare), B = right around the eyes
let MASK = null;
function maskTex() {
  if (MASK) return MASK;
  // each channel drawn on its own, then blurred into place
  const chan = (draw) => { const [c, x] = canvas(); x.fillStyle = '#000'; x.fillRect(0, 0, S, S); draw(x); return c; };
  // R: the face, pulled in from the edge of the mesh so the paint fades out before the hairline/jaw (no hard rim)
  const r = chan((x) => { poly(x, FACE_OVAL); x.fillStyle = '#F00'; x.fill(); x.lineWidth = 190; x.strokeStyle = '#000'; x.stroke(); });
  const gr = chan((x) => { poly(x, LIPS_OUT); x.fillStyle = '#0F0'; x.fill(); });
  const b = chan((x) => { for (const eye of [R_EYE, L_EYE]) { poly(x, eye); x.lineWidth = 34; x.strokeStyle = '#00F'; x.stroke(); } });
  const [c, x] = canvas();
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  x.globalCompositeOperation = 'lighter';
  x.filter = 'blur(34px)'; x.drawImage(r, 0, 0);
  x.filter = 'blur(5px)'; x.drawImage(gr, 0, 0);
  x.filter = 'blur(10px)'; x.drawImage(b, 0, 0);
  return (MASK = tex(c, false));
}

const TEX = {};
function paintTex(id) {
  if (TEX[id]) return TEX[id];
  const [c, x] = canvas();
  const mouth = centroid(LIPS_OUT), nose = uvOf(1), fore = uvOf(10), chin = uvOf(152);
  const eyeR = centroid(R_EYE), eyeL = centroid(L_EYE);
  const faceW = uvOf(454)[0] - uvOf(234)[0];
  if (id === 'tiger') {
    x.fillStyle = '#F07A12'; x.fillRect(0, 0, S, S);
    // warm shading toward the edges
    const g = x.createRadialGradient(nose[0], nose[1], faceW * 0.1, nose[0], nose[1], faceW * 0.62);
    g.addColorStop(0, 'rgba(255,190,80,.55)'); g.addColorStop(1, 'rgba(160,40,0,.55)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // white muzzle + chin + brow patches
    x.fillStyle = '#FFF6E8';
    x.beginPath(); x.ellipse(mouth[0] - faceW * 0.1, mouth[1] - faceW * 0.04, faceW * 0.14, faceW * 0.1, 0.2, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(mouth[0] + faceW * 0.1, mouth[1] - faceW * 0.04, faceW * 0.14, faceW * 0.1, -0.2, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(chin[0], chin[1] - faceW * 0.07, faceW * 0.16, faceW * 0.1, 0, 0, Math.PI * 2); x.fill();
    for (const [e, s] of [[eyeR, -1], [eyeL, 1]]) { x.beginPath(); x.ellipse(e[0] + s * faceW * 0.02, e[1] - faceW * 0.11, faceW * 0.1, faceW * 0.05, s * 0.25, 0, Math.PI * 2); x.fill(); }
    // black stripes: wedges in from the sides and down from the forehead (mirror symmetric)
    x.fillStyle = '#16100C';
    const wedge = (x0, y0, len, ang, w) => {
      x.save(); x.translate(x0, y0); x.rotate(ang);
      x.beginPath(); x.moveTo(0, -w); x.quadraticCurveTo(len * 0.55, -w * 0.6, len, 0); x.quadraticCurveTo(len * 0.55, w * 0.6, 0, w); x.closePath(); x.fill(); x.restore();
    };
    for (const s of [-1, 1]) {
      const edgeX = nose[0] + s * faceW * 0.5, dir = s > 0 ? Math.PI : 0;
      for (const [dy, len, tilt, w] of [[-0.3, 0.2, 0.25, 0.035], [-0.16, 0.26, 0.12, 0.04], [0.02, 0.22, -0.05, 0.035], [0.16, 0.18, -0.18, 0.03], [0.3, 0.14, -0.3, 0.025]])
        wedge(edgeX, nose[1] + dy * faceW, len * faceW, dir - s * tilt, w * faceW);
    }
    for (const dx of [-0.07, 0, 0.07]) wedge(fore[0] + dx * faceW, fore[1] - faceW * 0.02, faceW * (dx ? 0.13 : 0.18), Math.PI / 2 + dx * 2, faceW * 0.022);
    // nose + whisker dots
    x.beginPath(); x.ellipse(nose[0], nose[1] + faceW * 0.01, faceW * 0.055, faceW * 0.04, 0, 0, Math.PI * 2); x.fill();
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(mouth[0] + s * faceW * (0.07 + i * 0.045), mouth[1] - faceW * (0.08 - (i % 2) * 0.03), faceW * 0.009, 0, Math.PI * 2); x.fill(); }
  } else if (id === 'frost') {
    const g = x.createLinearGradient(0, fore[1], 0, chin[1]);
    g.addColorStop(0, '#E9FBFF'); g.addColorStop(0.5, '#A9E6FF'); g.addColorStop(1, '#5FB6F2');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // crystal spikes fanning out from each eye, plus a snowflake on the forehead
    x.strokeStyle = '#FFFFFF'; x.lineCap = 'round';
    for (const [e, s] of [[eyeR, -1], [eyeL, 1]]) {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + s * (0.3 + i * 0.32), L = faceW * (0.12 + (i % 2) * 0.07);
        x.lineWidth = faceW * 0.012;
        x.beginPath(); x.moveTo(e[0] + Math.cos(a) * faceW * 0.08, e[1] + Math.sin(a) * faceW * 0.07); x.lineTo(e[0] + Math.cos(a) * (faceW * 0.08 + L), e[1] + Math.sin(a) * (faceW * 0.07 + L)); x.stroke();
      }
    }
    const flake = (cx, cy, r) => {
      x.lineWidth = r * 0.12;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, ex = cx + Math.cos(a) * r, ey = cy + Math.sin(a) * r;
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(ex, ey); x.stroke();
        for (const k of [0.45, 0.7]) { const bx = cx + Math.cos(a) * r * k, by = cy + Math.sin(a) * r * k; for (const d of [-0.6, 0.6]) { x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a + d) * r * 0.25, by + Math.sin(a + d) * r * 0.25); x.stroke(); } }
      }
    };
    flake(fore[0], fore[1] + faceW * 0.1, faceW * 0.075);
    for (const s of [-1, 1]) flake(nose[0] + s * faceW * 0.3, mouth[1] - faceW * 0.02, faceW * 0.04);
    // scattered glints
    x.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 160; i++) { const px = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1, py = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1; x.beginPath(); x.arc(px * S, py * S, 1.5 + (i % 3), 0, Math.PI * 2); x.fill(); }
  } else if (id === 'circuit') {
    x.fillStyle = '#2A313D'; x.fillRect(0, 0, S, S);
    // brushed panels: a few plate seams (stored in rgb), traces in alpha-free channel are drawn by the shader from tCircuit
    x.strokeStyle = 'rgba(10,14,20,.8)'; x.lineWidth = 4;
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(nose[0] + s * faceW * 0.06, fore[1]); x.lineTo(nose[0] + s * faceW * 0.06, nose[1] - faceW * 0.06); x.lineTo(nose[0] + s * faceW * 0.3, mouth[1]); x.stroke(); }
  } else {
    x.fillStyle = '#FFF'; x.fillRect(0, 0, S, S);   // modes that are fully procedural
  }
  return (TEX[id] = tex(c));
}
// Circuit traces: R = trace, G = pulse phase along the trace. Symmetric so the mirror view reads the same.
let CIRCUIT = null;
function circuitTex() {
  if (CIRCUIT) return CIRCUIT;
  const [c, x] = canvas();
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  const nose = uvOf(1), fore = uvOf(10), mouth = centroid(LIPS_OUT), faceW = uvOf(454)[0] - uvOf(234)[0];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const traces = [];
  for (let n = 0; n < 15; n++) {
    let px = nose[0] + faceW * (0.04 + rnd() * 0.12), py = fore[1] + rnd() * (mouth[1] - fore[1] + faceW * 0.15);
    const pts = [[px, py]];
    for (let k = 0; k < 4; k++) {
      const horiz = k % 2 === 0, L = faceW * (0.05 + rnd() * 0.12);
      if (horiz) px += L; else py += (rnd() < 0.5 ? -1 : 1) * L;
      if (k === 2) { px += L * 0.5; py += L * 0.5; }
      pts.push([px, py]);
    }
    traces.push(pts);
  }
  for (const s of [1, -1]) {
    for (const [ti, pts] of traces.entries()) {
      const m = pts.map(([px, py]) => [s > 0 ? px : 2 * nose[0] - px, py]);
      let total = 0; for (let i = 1; i < m.length; i++) total += Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]);
      let run = 0;
      for (let i = 1; i < m.length; i++) {
        const seg = Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]);
        const g = x.createLinearGradient(m[i - 1][0], m[i - 1][1], m[i][0], m[i][1]);
        const p0 = ((run / total) * 0.8 + ti * 0.13) % 1, p1 = (((run + seg) / total) * 0.8 + ti * 0.13) % 1;
        g.addColorStop(0, `rgb(255,${Math.round(p0 * 255)},0)`); g.addColorStop(1, `rgb(255,${Math.round((p1 < p0 ? p0 : p1) * 255)},0)`);
        x.strokeStyle = g; x.lineWidth = 7; x.lineCap = 'round';
        x.beginPath(); x.moveTo(m[i - 1][0], m[i - 1][1]); x.lineTo(m[i][0], m[i][1]); x.stroke();
        run += seg;
      }
      const e = m[m.length - 1];
      x.fillStyle = 'rgb(255,250,0)'; x.beginPath(); x.arc(e[0], e[1], 13, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.arc(e[0], e[1], 6, 0, Math.PI * 2); x.fill();
    }
  }
  return (CIRCUIT = tex(c, false));
}
// Chrome: a studio matcap (sky above, dark floor, a bright window), looked up by the surface normal.
let MATCAP = null;
function matcapTex() {
  if (MATCAP) return MATCAP;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#F4FAFF'); g.addColorStop(0.4, '#AFC3DA'); g.addColorStop(0.5, '#56607A'); g.addColorStop(0.62, '#3A4150'); g.addColorStop(1, '#9AA3B4');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.ellipse(84, 70, 30, 18, -0.6, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(120,200,255,.35)'; x.beginPath(); x.ellipse(190, 120, 22, 60, 0.3, 0, Math.PI * 2); x.fill();
  return (MATCAP = tex(c));
}

// ───────────────────────────────────────────── shader
const VERT = `
uniform vec2 uSize;
varying vec2 vUv; varying vec3 vN; varying vec2 vScr;
void main() {
  vUv = uv; vN = normalize(normalMatrix * normal); vScr = position.xy / uSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
uniform sampler2D tPaint, tMask, tVideo, tMatcap, tCircuit;
uniform float uMode, uTime, uK, uSkin, uGlowOnly;
varying vec2 vUv; varying vec3 vN; varying vec2 vScr;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
vec2 voro(vec2 p) {                                  // distance to nearest cell edge, cell id
  vec2 ip = floor(p), fp = fract(p); float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), o = vec2(hash(ip + g), hash(ip + g + 17.0));
    float d = length(g + o - fp);
    if (d < d1) { d2 = d1; d1 = d; id = hash(ip + g + 3.0); } else if (d < d2) d2 = d;
  }
  return vec2(d2 - d1, id);
}
void main() {
  vec4 mk = texture2D(tMask, vUv);
  vec3 n = normalize(vN);
  float facing = smoothstep(0.3, 0.8, abs(n.z));      // fade where the face turns away (cheeks, temples) — no hard rim
  float area = mk.r * (1.0 - mk.g) * uK * facing;
  if (area < 0.003) discard;
  vec3 skin = texture2D(tVideo, vScr).rgb;
  float shade = clamp(mix(1.0, lum(skin) / max(uSkin, 0.04), 0.85), 0.25, 1.9);   // the real light on his face
  float spec = pow(max(0.0, dot(reflect(vec3(0.0, 0.0, -1.0), n), normalize(vec3(-0.4, 0.6, 0.7)))), 24.0);
  vec3 col = vec3(0.0), glow = vec3(0.0);
  float a = area;
  int mode = int(uMode + 0.5);
  if (mode == 0) {                                   // painted texture (tiger, frost)
    vec4 p = texture2D(tPaint, vUv);
    col = p.rgb * mix(1.0, shade, 0.9) + spec * 0.25;
    float tw = step(0.996, hash(floor(vUv * 300.0) + floor(uTime * 3.0)));      // frost glints twinkle
    glow = vec3(1.4, 1.8, 2.2) * tw * step(0.75, lum(p.rgb));
    a *= 0.88;
  } else if (mode == 1) {                            // chrome skin
    vec3 mc = texture2D(tMatcap, n.xy * 0.48 + 0.5).rgb;
    col = mc * mix(1.0, shade, 0.6) + spec * 0.6;
    a = mk.r * (1.0 - mk.g * 0.6) * uK * facing * 0.95;
  } else if (mode == 2) {                            // galaxy: drifting nebula + twinkling stars
    vec2 q = vUv * 3.2;
    float neb = fbm(q + vec2(uTime * 0.03, -uTime * 0.02) + fbm(q * 1.7 - uTime * 0.05));
    col = mix(vec3(0.03, 0.02, 0.12), vec3(0.35, 0.08, 0.6), smoothstep(0.35, 0.75, neb));
    col = mix(col, vec3(0.1, 0.45, 0.95), smoothstep(0.6, 0.9, fbm(q * 2.3 + 5.0 - uTime * 0.04)));
    col = mix(col, vec3(0.95, 0.3, 0.6), smoothstep(0.72, 0.95, neb) * 0.6);
    col *= mix(1.0, shade, 0.75);
    a *= 0.85;
    vec2 cell = floor(vUv * 140.0); float st = hash(cell);
    float star = step(0.985, st) * (0.5 + 0.5 * sin(uTime * (2.0 + st * 6.0) + st * 40.0));
    vec2 f = fract(vUv * 140.0) - 0.5; star *= smoothstep(0.35, 0.0, length(f));
    glow = vec3(1.6, 1.7, 2.0) * star + col * 0.25;
  } else if (mode == 3) {                            // lava: cooled rock cracked with glowing magma
    vec2 v = voro(vUv * 9.0 + vec2(0.0, uTime * 0.02));
    float crack = 1.0 - smoothstep(0.02, 0.09, v.x);
    float heat = 0.65 + 0.35 * sin(uTime * 2.2 + v.y * 12.0);
    vec3 rock = mix(vec3(0.09, 0.07, 0.07), vec3(0.22, 0.15, 0.13), fbm(vUv * 18.0)) * shade;
    vec3 magma = mix(vec3(1.8, 0.35, 0.05), vec3(2.6, 1.6, 0.4), crack * heat);
    col = mix(rock + spec * 0.2, magma, crack);
    glow = magma * crack * heat;
  } else {                                            // circuit: gunmetal plates + light running along the traces
    vec4 p = texture2D(tPaint, vUv);
    vec4 c = texture2D(tCircuit, vUv);
    float run = fract(c.g - uTime * 0.45);
    float pulse = c.r * (0.35 + 1.2 * smoothstep(0.82, 1.0, run));
    vec3 cyan = vec3(0.2, 1.4, 2.2);
    col = mix(p.rgb * shade + spec * 0.5, cyan, clamp(pulse, 0.0, 1.0));
    glow = cyan * pulse;
  }
  if (uGlowOnly > 0.5) { gl_FragColor = vec4(glow * area, 0.0); return; }
  gl_FragColor = vec4(col + glow * 0.4, a);
}`;

// One mesh per face. `glowMesh` shares the geometry and only exists on the bloom layer, so just the
// lit parts (magma, stars, circuit light) bloom — not the whole face.
export function buildPaintMesh(videoTex) {
  const n = 468;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(GEO.uv.flat(), 2));
  g.setIndex(GEO.tri);
  const uniforms = {
    tPaint: { value: null }, tMask: { value: maskTex() }, tVideo: { value: videoTex }, tMatcap: { value: matcapTex() }, tCircuit: { value: circuitTex() },
    uMode: { value: 0 }, uTime: { value: 0 }, uK: { value: 1 }, uSkin: { value: 0.3 }, uGlowOnly: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = -5;
  const glowMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { ...uniforms, uGlowOnly: { value: 1 } }, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const glowMesh = new THREE.Mesh(g, glowMat);
  glowMesh.frustumCulled = false; glowMesh.renderOrder = -4; glowMesh.layers.set(BLOOM);
  const group = new THREE.Group(); group.add(mesh, glowMesh);
  return { group, mesh, glowMesh, uniforms, glowUniforms: glowMat.uniforms, id: null };
}
// Move the vertices to this frame's landmarks (camera pixels, y up, z toward the camera).
export function updatePaintMesh(pm, f, id, k, t, W, H, skin, videoTex) {
  const pos = pm.mesh.geometry.attributes.position.array, P = f.P;
  for (let i = 0; i < 468; i++) { pos[i * 3] = P[i].x; pos[i * 3 + 1] = H - P[i].y; pos[i * 3 + 2] = -P[i].z; }
  const g = pm.mesh.geometry;
  g.attributes.position.needsUpdate = true;
  g.computeVertexNormals();
  for (const u of [pm.uniforms, pm.glowUniforms]) {
    if (pm.id !== id) { u.tPaint.value = paintTex(id); u.uMode.value = MODE[id]; }
    u.uTime.value = t; u.uK.value = Math.min(1, Math.max(0, k)); u.uSkin.value = skin; u.uSize.value.set(W, H); u.tVideo.value = videoTex;
  }
  pm.id = id;
}
