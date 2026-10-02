// engine.js — the Hero Lab renderer. One WebGL pipeline:
//   1. composite shader: camera (or backdrop) + glow + speed ghosts + behind-gear + the cut-out person
//      (rim-lit, optionally invisible) + front 2D gear, with shockwave / heat-haze distortion
//   2. 3D: helmets + head occluders + robot buddy, GPU particles, glowing ribbons, shield
//   3. selective bloom (only things on the BLOOM layer glow)
//   4. final pass: bloom add, mirror, Looks filters (comic, cartoon, pixel, night vision, thermal, hologram), frost
// Everything happens in source (camera) space; the mirror flip is the very last step.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BLOOM, buildHelmet, buildOccluder, headMatrix, buildRoboBuddy, HEAD_CENTER } from './helmets3d.js';
import { Particles, Ribbons, boltPath, buildShield, hsl } from './fx3d.js';

const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }';

const COMPOSITE_FRAG = `
uniform sampler2D tVideo, tMask, tBg, tBehind, tFront, tG0, tG1, tG2, tG3;
uniform float uUseBg, uUseMask, uUseBehind, uUseFront, uAura, uInvis, uSpeed, uTime, uRim, uAuraTaps;
uniform vec3 uRimColor, uAuraA, uAuraB, uBgTint;
uniform vec4 uRipple[4];
uniform vec4 uHeat;
uniform vec2 uAspect;
varying vec2 vUv;
float mk(vec2 uv) { return texture2D(tMask, vec2(uv.x, 1.0 - uv.y)).r; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 uv = vUv, d = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 r = uRipple[i];
    if (r.w <= 0.0) continue;
    vec2 dv = (uv - r.xy) * uAspect; float dist = length(dv) + 1e-5;
    float radius = r.z * 0.85;
    float band = exp(-pow((dist - radius) * 16.0, 2.0));
    d += (dv / dist) / uAspect * band * 0.018 * r.w * (1.0 - clamp(r.z / 1.1, 0.0, 1.0)) * smoothstep(0.02, 0.12, radius);
  }
  if (uHeat.w > 0.0) {
    vec2 dv = (uv - uHeat.xy) * uAspect; float fall = 1.0 - smoothstep(0.0, uHeat.z, length(dv));
    d += (vec2(noise(uv * 38.0 + vec2(0.0, uTime * 4.0)), noise(uv * 38.0 + vec2(7.3, uTime * 4.0))) - 0.5) * 0.016 * fall * uHeat.w;
  }
  vec2 uvd = uv + d;
  vec3 video = texture2D(tVideo, uvd).rgb;
  vec3 base = uUseBg > 0.5 ? texture2D(tBg, uvd).rgb : video;
  if (uUseMask > 0.5) {
    float mm = smoothstep(0.35, 0.75, mk(uvd));
    if (uAura > 0.0) {
      float acc = 0.0, n = 0.0;
      for (int i = 0; i < 16; i++) {
        if (float(i) >= uAuraTaps) break;
        float a = float(i) / uAuraTaps * 6.2832;
        float rad = 0.03 + 0.014 * sin(uTime * 3.0 + float(i) * 1.7);
        acc += mk(uvd + vec2(cos(a), sin(a)) * rad / uAspect); n += 1.0;
      }
      acc /= max(n, 1.0);
      float glow = clamp(acc * 1.5 - mm, 0.0, 1.0);
      float flick = 0.55 + 0.45 * noise(uvd * vec2(14.0, 6.0) + vec2(0.0, -uTime * 2.5));
      base += mix(uAuraB, uAuraA, uv.y) * glow * flick * 2.6 * uAura;
    }
    if (uSpeed > 0.0) {
      vec4 g;
      g = texture2D(tG3, uvd); base = mix(base, g.rgb * vec3(0.35, 0.55, 1.7), g.a * 0.3 * uSpeed);
      g = texture2D(tG2, uvd); base = mix(base, g.rgb * vec3(0.45, 0.9, 1.6), g.a * 0.38 * uSpeed);
      g = texture2D(tG1, uvd); base = mix(base, g.rgb * vec3(1.5, 1.2, 0.5), g.a * 0.46 * uSpeed);
      g = texture2D(tG0, uvd); base = mix(base, g.rgb * vec3(1.6, 0.6, 0.5), g.a * 0.55 * uSpeed);
    }
    if (uUseBehind > 0.5) { vec4 b = texture2D(tBehind, uv); base = mix(base, b.rgb, b.a); }
    vec3 person = video;
    if (uInvis > 0.0) {
      float e = 0.004;
      vec2 grad = vec2(mk(uvd + vec2(e, 0.0)) - mk(uvd - vec2(e, 0.0)), mk(uvd + vec2(0.0, e)) - mk(uvd - vec2(0.0, e)));
      vec2 off = grad * 0.06 + (vec2(noise(uvd * 16.0 + uTime), noise(uvd * 16.0 - uTime)) - 0.5) * 0.025;
      vec3 seen = uUseBg > 0.5 ? texture2D(tBg, uvd + off).rgb : texture2D(tVideo, uvd + off * 3.0).rgb * vec3(0.8, 0.95, 1.15);
      float edge = clamp(length(grad) * 10.0, 0.0, 1.0);
      float shimmer = 0.5 + 0.5 * sin(uvd.y * 120.0 + uTime * 6.0);
      person = mix(person, seen + vec3(0.55, 0.85, 1.0) * edge * (0.6 + 0.4 * shimmer), uInvis * 0.9);
    }
    if (uRim > 0.0) {
      float s = 0.0045;
      float mn = min(min(mk(uvd + vec2(s, 0.0)), mk(uvd - vec2(s, 0.0))), min(mk(uvd + vec2(0.0, s * 1.4)), mk(uvd - vec2(0.0, s * 1.4))));
      float rim = clamp(mm - smoothstep(0.35, 0.75, mn), 0.0, 1.0);
      person = mix(person, person * uBgTint, 0.18 * uUseBg);
      person += uRimColor * rim * uRim * 0.5;
    }
    base = mix(base, person, mm);
  }
  if (uUseFront > 0.5) { vec4 f = texture2D(tFront, uv); base = mix(base, f.rgb, f.a); }
  gl_FragColor = vec4(base, 1.0);
}`;

const GHOST_FRAG = `
uniform sampler2D tVideo, tMask; varying vec2 vUv;
void main(){ float m = smoothstep(0.35, 0.75, texture2D(tMask, vec2(vUv.x, 1.0 - vUv.y)).r); gl_FragColor = vec4(texture2D(tVideo, vUv).rgb, m); }`;

const FINAL_FRAG = `
uniform sampler2D tScene, tBloom;
uniform float uBloom, uMirror, uLook, uTime, uFrost, uLookMix;
uniform vec2 uRes;
varying vec2 vUv;
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 at(vec2 uv) { return toSRGB(texture2D(tScene, uv).rgb + texture2D(tBloom, uv).rgb * uBloom); }
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float edges(vec2 uv, vec2 px) {
  float tl = lum(at(uv + px * vec2(-1.0, 1.0))), t = lum(at(uv + px * vec2(0.0, 1.0))), tr = lum(at(uv + px * vec2(1.0, 1.0)));
  float l = lum(at(uv + px * vec2(-1.0, 0.0))), r = lum(at(uv + px * vec2(1.0, 0.0)));
  float bl = lum(at(uv + px * vec2(-1.0, -1.0))), b = lum(at(uv + px * vec2(0.0, -1.0))), br = lum(at(uv + px * vec2(1.0, -1.0)));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br, gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return length(vec2(gx, gy));
}
vec3 sat(vec3 c, float s) { float L = lum(c); return mix(vec3(L), c, s); }
vec3 thermal(float t) {
  vec3 a = vec3(0.05, 0.0, 0.25), b = vec3(0.55, 0.0, 0.65), c = vec3(1.0, 0.25, 0.1), d = vec3(1.0, 0.85, 0.1), e = vec3(1.0, 1.0, 0.95);
  return t < 0.25 ? mix(a, b, t / 0.25) : t < 0.5 ? mix(b, c, (t - 0.25) / 0.25) : t < 0.75 ? mix(c, d, (t - 0.5) / 0.25) : mix(d, e, (t - 0.75) / 0.25);
}
vec3 palette16(vec3 c) {
  vec3 P[16];
  P[0]=vec3(0.0); P[1]=vec3(0.11,0.17,0.33); P[2]=vec3(0.49,0.15,0.33); P[3]=vec3(0.0,0.53,0.32);
  P[4]=vec3(0.67,0.32,0.21); P[5]=vec3(0.37,0.34,0.31); P[6]=vec3(0.76,0.76,0.78); P[7]=vec3(1.0,0.95,0.91);
  P[8]=vec3(1.0,0.0,0.3); P[9]=vec3(1.0,0.64,0.0); P[10]=vec3(1.0,0.93,0.15); P[11]=vec3(0.0,0.89,0.21);
  P[12]=vec3(0.16,0.68,1.0); P[13]=vec3(0.51,0.46,0.61); P[14]=vec3(1.0,0.47,0.66); P[15]=vec3(1.0,0.8,0.67);
  vec3 best = P[0]; float bd = 9.0;
  for (int i = 0; i < 16; i++) { float dd = distance(c, P[i]); if (dd < bd) { bd = dd; best = P[i]; } }
  return best;
}
void main() {
  vec2 uv = vUv; if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  vec2 px = 1.0 / uRes;
  int look = int(uLook + 0.5);
  vec3 c;
  if (look == 3) {                                                   // video game: chunky pixels + 16 colors
    vec2 blocks = vec2(110.0, 110.0 * uRes.y / uRes.x);
    c = palette16(at((floor(uv * blocks) + 0.5) / blocks));
  } else c = at(uv);
  vec3 orig = c;
  if (look == 1) {                                                   // comic book: ink lines, flat color, halftone
    float e = edges(uv, px * 1.5);
    vec3 q = floor(sat(c, 1.5) * 4.0 + 0.5) / 4.0;
    float L = lum(c);
    vec2 g = uv * uRes / 7.0; vec2 cell = fract(g) - 0.5;
    float dotR = (1.0 - L) * 0.62;
    float halftone = step(length(cell), dotR);
    c = q * (1.0 - halftone * 0.35 * step(L, 0.65));
    c = mix(c, vec3(0.05), smoothstep(0.25, 0.5, e));
  } else if (look == 2) {                                            // cartoon: soft posterize + outlines
    float e = edges(uv, px);
    c = floor(sat(c, 1.35) * 6.0 + 0.5) / 6.0;
    c = mix(c, vec3(0.08, 0.06, 0.12), smoothstep(0.35, 0.7, e) * 0.85);
  } else if (look == 4) {                                            // night vision
    float L = lum(c) * 1.6 + 0.05;
    c = vec3(0.15, 1.0, 0.3) * L;
    c += (hash(uv * uRes + uTime * 60.0) - 0.5) * 0.18;
    c *= 0.82 + 0.18 * sin(uv.y * uRes.y * 1.6);
    vec2 v = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    c *= smoothstep(0.85, 0.35, length(v));
  } else if (look == 5) {                                            // heat vision
    float L = lum(c);
    c = thermal(clamp(pow(L, 0.9) * 1.1, 0.0, 1.0));
  } else if (look == 6) {                                            // hologram
    vec3 sh = vec3(at(uv + vec2(0.004, 0.0)).r, c.g, at(uv - vec2(0.004, 0.0)).b);
    float L = lum(sh);
    c = vec3(0.25, 0.85, 1.0) * (L * 1.4 + 0.08);
    c *= 0.75 + 0.25 * sin((uv.y + uTime * 0.12) * uRes.y * 0.9);
    c += vec3(0.1, 0.4, 0.6) * step(0.985, fract(uv.y * 3.0 - uTime * 0.6)) ;
    c *= 0.9 + 0.1 * hash(vec2(floor(uTime * 20.0), 1.0));
  }
  c = mix(orig, c, uLookMix);
  if (uFrost > 0.0) {                                                // frosty screen edges for ice breath
    vec2 v = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float ring = smoothstep(0.42, 0.75, length(v));
    float crystals = hash(floor(uv * uRes / 6.0)) * 0.6 + 0.4;
    c = mix(c, vec3(0.85, 0.95, 1.0), ring * crystals * 0.75 * uFrost);
  }
  vec2 vv = (uv - 0.5); c *= 1.0 - dot(vv, vv) * 0.35;                // gentle vignette
  gl_FragColor = vec4(c, 1.0);
}`;

function quad(material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  m.frustumCulled = false;
  return m;
}
function layerCanvas() {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  return { canvas: c, ctx: c.getContext('2d'), tex: t, used: false };
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' }));
    r.setPixelRatio(1);
    r.autoClear = true;
    this.maxPoint = r.getContext().getParameter(r.getContext().ALIASED_POINT_SIZE_RANGE)[1] || 256;
    this.W = 4; this.H = 4; this.quality = 2; this.bloomOn = true;
    const ext = r.extensions;
    this.floatRT = !!(ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.rtType = this.floatRT ? THREE.HalfFloatType : THREE.UnsignedByteType;
    if (!this.floatRT) this.bloomOn = false;

    // 3D scene in pixel space (y up)
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(0, 4, 4, 0, -1e5, 1e5);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x404060, 1.1);
    this.key = new THREE.DirectionalLight(0xffffff, 2.2); this.key.position.set(-0.5, 1, 1.2);
    this.scene.add(this.hemi, this.key, this.key.target);

    // layer canvases the app paints into
    this.layers = { bg: layerCanvas(), behind: layerCanvas(), front: layerCanvas(), top: layerCanvas() };
    this.layerScale = 0.75;

    this.maskTex = new THREE.DataTexture(new Uint8Array(4), 2, 2, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.minFilter = this.maskTex.magFilter = THREE.LinearFilter; this.maskTex.needsUpdate = true;
    this.videoTex = null;

    const ghostRT = () => new THREE.WebGLRenderTarget(4, 4, { type: this.rtType });
    this.ghosts = [ghostRT(), ghostRT(), ghostRT(), ghostRT()]; this.ghostFrame = 0;

    this.comp = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tVideo: { value: null }, tMask: { value: this.maskTex }, tBg: { value: this.layers.bg.tex }, tBehind: { value: this.layers.behind.tex }, tFront: { value: this.layers.front.tex },
        tG0: { value: this.ghosts[0].texture }, tG1: { value: this.ghosts[1].texture }, tG2: { value: this.ghosts[2].texture }, tG3: { value: this.ghosts[3].texture },
        uUseBg: { value: 0 }, uUseMask: { value: 0 }, uUseBehind: { value: 0 }, uUseFront: { value: 0 }, uAura: { value: 0 }, uInvis: { value: 0 }, uSpeed: { value: 0 },
        uTime: { value: 0 }, uRim: { value: 0 }, uAuraTaps: { value: 12 },
        uRimColor: { value: new THREE.Color() }, uAuraA: { value: new THREE.Color(1.0, 0.85, 0.2) }, uAuraB: { value: new THREE.Color(0.1, 0.6, 1.0) }, uBgTint: { value: new THREE.Color(1, 1, 1) },
        uRipple: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uHeat: { value: new THREE.Vector4() }, uAspect: { value: new THREE.Vector2(1, 1) },
      },
    });
    this.bgQuad = quad(this.comp); this.bgQuad.renderOrder = -10;
    this.scene.add(this.bgQuad);
    // 2D stickers that must sit ON TOP of the 3D helmets (comic words, bubbles, the dino buddy)
    this.topQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.layers.top.tex, transparent: true, depthTest: false, depthWrite: false }));
    this.topQuad.renderOrder = 30; this.topQuad.frustumCulled = false; this.topQuad.visible = false;
    this.scene.add(this.topQuad);

    this.ghostMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: GHOST_FRAG, uniforms: { tVideo: { value: null }, tMask: { value: this.maskTex } } });
    this.ghostScene = new THREE.Scene(); this.ghostScene.add(quad(this.ghostMat));
    this.flatCam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);

    this.final = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.6 }, uMirror: { value: 0 }, uLook: { value: 0 }, uLookMix: { value: 1 }, uTime: { value: 0 }, uFrost: { value: 0 }, uRes: { value: new THREE.Vector2(4, 4) } },
    });
    this.finalScene = new THREE.Scene(); this.finalScene.add(quad(this.final));
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;

    // effects
    this.fx = {
      fire: new Particles(700), smoke: new Particles(160, { additive: false, glow: false }), ember: new Particles(220, { shape: 1 }),
      ice: new Particles(600, { additive: false }), flake: new Particles(160, { shape: 1 }), rainbow: new Particles(600, { additive: false }), spark: new Particles(400, { shape: 1 }),
      flare: new Particles(64),
    };
    for (const p of Object.values(this.fx)) { p.mat.uniforms.uMax.value = this.maxPoint; this.scene.add(p.points); }
    this.smokeFirst();
    this.ribbons = new Ribbons(); this.scene.add(this.ribbons.mesh);
    this.heads = new Map();                                    // faceId → { anchor, occluder, helmet, robo, shield }
    this.lightning = new Map();
  }
  smokeFirst() { this.fx.smoke.points.renderOrder = 15; }

  setSource(el, W, H, isVideo) {
    if (this.videoTex?.image !== el) {
      this.videoTex?.dispose();
      this.videoTex = isVideo ? new THREE.VideoTexture(el) : new THREE.Texture(el);
      this.videoTex.colorSpace = THREE.SRGBColorSpace; this.videoTex.minFilter = THREE.LinearFilter; this.videoTex.generateMipmaps = false;
      if (!isVideo) this.videoTex.needsUpdate = true;
      this.comp.uniforms.tVideo.value = this.videoTex; this.ghostMat.uniforms.tVideo.value = this.videoTex;
    }
    if (W !== this.W || H !== this.H) this.resize(W, H);
  }
  resize(W, H) {
    this.W = W; this.H = H;
    this.r.setSize(W, H, false);
    this.cam.left = 0; this.cam.right = W; this.cam.top = H; this.cam.bottom = 0; this.cam.updateProjectionMatrix();
    this.bgQuad.scale.set(W, H, 1); this.bgQuad.position.set(W / 2, H / 2, -5e4);
    this.topQuad.scale.set(W, H, 1); this.topQuad.position.set(W / 2, H / 2, 5e4);
    this.main?.dispose();
    this.main = new THREE.WebGLRenderTarget(W, H, { type: this.rtType, samples: this.quality >= 2 && this.floatRT ? 4 : 0 });
    for (const g of this.ghosts) g.setSize(Math.round(W / 2), Math.round(H / 2));
    this.setupBloom();
    this.comp.uniforms.uAspect.value.set(W / H, 1);
    this.final.uniforms.uRes.value.set(W, H);
    this.final.uniforms.tScene.value = this.main.texture;
    this.sizeLayers();
  }
  setupBloom() {
    this.bloom?.dispose?.();
    const div = this.quality >= 2 ? 2 : 3, w = Math.round(this.W / div), h = Math.round(this.H / div);
    if (!this.floatRT) return;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.bloom = new EffectComposer(this.r, rt);
    this.bloom.renderToScreen = false;
    this.bloom.setPixelRatio(1); this.bloom.setSize(w, h);
    const rp = new RenderPass(this.scene, this.cam); rp.clearColor = new THREE.Color(0, 0, 0); rp.clearAlpha = 1;
    this.bloom.addPass(rp);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.3, 0.0);
    this.bloom.addPass(this.bloomPass);
  }
  sizeLayers() {
    const s = this.layerScale, w = Math.round(this.W * s), h = Math.round(this.H * s);
    for (const L of Object.values(this.layers)) {
      if (L.canvas.width !== w || L.canvas.height !== h) {
        L.canvas.width = w; L.canvas.height = h;
        L.tex.dispose();                                     // texture size changed: re-allocate on the GPU
      }
    }
  }
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    this.bloomOn = q >= 1 && this.floatRT;
    this.layerScale = q >= 2 ? 0.75 : q === 1 ? 0.6 : 0.5;
    this.comp.uniforms.uAuraTaps.value = q >= 2 ? 12 : q === 1 ? 8 : 6;
    if (this.W > 4) this.resize(this.W, this.H);
  }
  // Begin painting a 2D layer: cleared, scaled so the app can draw in camera pixels.
  layer(name) {
    const L = this.layers[name];
    L.used = true;
    L.ctx.setTransform(1, 0, 0, 1, 0, 0);
    L.ctx.clearRect(0, 0, L.canvas.width, L.canvas.height);
    L.ctx.setTransform(this.layerScale, 0, 0, this.layerScale, 0, 0);
    return L.ctx;
  }
  setMask(alpha, w, h) {
    const img = this.maskTex.image;
    if (img.width !== w || img.height !== h) {
      this.maskTex.dispose();
      this.maskTex = new THREE.DataTexture(alpha, w, h, THREE.RedFormat, THREE.UnsignedByteType);
      this.maskTex.minFilter = this.maskTex.magFilter = THREE.LinearFilter;
      this.comp.uniforms.tMask.value = this.maskTex; this.ghostMat.uniforms.tMask.value = this.maskTex;
    } else img.data.set(alpha);
    this.maskTex.needsUpdate = true;
  }
  // Tint the 3D lighting toward the room's average color so helmets sit in the scene.
  setAmbient(r, g, b) {
    this.hemi.color.setRGB(0.55 + r * 0.45, 0.55 + g * 0.45, 0.55 + b * 0.45);
  }

  // ───────────────────────────────────────────── per-face 3D
  head(f) {
    let h = this.heads.get(f.id);
    if (!h) {
      const anchor = new THREE.Group(); anchor.matrixAutoUpdate = false;
      const occ = buildOccluder(); anchor.add(occ);
      this.scene.add(anchor);
      h = { anchor, occ, helmet: null, helmetId: null, robo: null, shield: null, seen: 0 };
      this.heads.set(f.id, h);
    }
    headMatrix(f, this.H, h.anchor.matrix);
    h.anchor.matrixWorldNeedsUpdate = true;
    return h;
  }
  setHelmet(f, id, k, t, bs) {
    const h = this.head(f);
    if (h.helmetId !== id) {
      if (h.helmet) { h.anchor.remove(h.helmet.group); dispose(h.helmet.group); }
      h.helmet = id ? buildHelmet(id) : null; h.helmetId = id;
      if (h.helmet) { h.pop = new THREE.Group(); h.pop.add(h.helmet.group); h.helmet.group = h.pop; h.anchor.add(h.pop); }
    }
    if (h.helmet) { h.helmet.group.scale.setScalar(Math.max(0.001, k)); BUILDERS_UPDATE(h, t, bs); }
  }
  setRobo(f, on, k, t) {
    const h = this.head(f);
    if (on && !h.robo) { h.robo = buildRoboBuddy(); h.anchor.add(h.robo.group); }
    if (!on && h.robo) { h.anchor.remove(h.robo.group); dispose(h.robo.group); h.robo = null; }
    if (h.robo) { h.robo.group.scale.setScalar(Math.max(0.001, k)); h.robo.update(t); }
  }
  setShield(f, on, pulse, t) {
    const h = this.head(f);
    if (on && !h.shield) { h.shield = buildShield(); h.shield.position.set(HEAD_CENTER.x, HEAD_CENTER.y - 0.15, HEAD_CENTER.z + 0.1); h.shield.scale.set(1.15, 1.3, 1.15); h.anchor.add(h.shield); }
    if (!on && h.shield) { h.anchor.remove(h.shield); h.shield.geometry.dispose(); h.shield.material.dispose(); h.shield = null; }
    if (h.shield) { h.shield.material.uniforms.uTime.value = t; h.shield.material.uniforms.uPulse.value = pulse; }
  }
  // Drop 3D for faces that left; show the occluder only when something 3D is on the head.
  syncHeads(faces) {
    const live = new Set(faces.map((f) => f.id));
    for (const [id, h] of this.heads) {
      if (!live.has(id)) { this.scene.remove(h.anchor); dispose(h.anchor); this.heads.delete(id); continue; }
      h.occ.visible = !!(h.helmet || h.robo);
    }
  }

  // ───────────────────────────────────────────── effects (positions in camera pixels, y down — converted here)
  breath(f, kind, level, dt) {
    if (level < 0.04 || !kind) return;
    const H = this.H, P = f.P;
    const m = { x: (P[13].x + P[14].x) / 2, y: H - (P[13].y + P[14].y) / 2 };
    const down = { x: -Math.sin(f.ang), y: -Math.cos(f.ang) };     // screen-down, in y-up world
    const fw = f.fw;
    const emit = (sys, rate, mk) => { const n = rate * dt * level; let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); while (k--) sys.spawn(mk()); };
    const dir = (spread, sp, a = (Math.random() - 0.5) * spread) => {
      const c = Math.cos(a), s = Math.sin(a);
      return { vx: (down.x * c - down.y * s) * sp, vy: (down.x * s + down.y * c) * sp };
    };
    if (kind === 'fire') {
      emit(this.fx.fire, 120, () => ({ x: m.x, y: m.y, ...dir(0.75, fw * (1.3 + Math.random() * 0.9)), age: 0, life: 0.5 + Math.random() * 0.3, size0: fw * 0.07, size1: fw * (0.28 + Math.random() * 0.14), grav: fw * 1.4, drag: 0.965, wobble: fw * 2.5, seed: Math.random() * 9,
        color: (u) => (u < 0.12 ? [1.5, 1.35, 0.8] : u < 0.4 ? [1.4, 0.6, 0.12] : [0.85, 0.16, 0.03]), alpha: (u) => (1 - u) * (u < 0.1 ? u * 10 : 1) * 0.42 }));
      emit(this.fx.ember, 30, () => ({ x: m.x, y: m.y, ...dir(1.6, fw * (0.8 + Math.random() * 1.6)), age: 0, life: 0.9 + Math.random() * 0.8, size0: fw * 0.045, size1: fw * 0.015, grav: fw * 2.2, drag: 0.97, color: () => [2.2, 1.0, 0.2] }));
      emit(this.fx.smoke, 14, () => ({ x: m.x, y: m.y - fw * 0.5, ...dir(1.2, fw * 0.6), age: 0, life: 1.4, size0: fw * 0.25, size1: fw * 0.8, grav: fw * 0.9, drag: 0.97, color: () => [0.12, 0.1, 0.1], alpha: (u) => Math.sin(u * Math.PI) * 0.35 }));
    } else if (kind === 'ice') {
      emit(this.fx.ice, 140, () => ({ x: m.x, y: m.y, ...dir(0.8, fw * (1.3 + Math.random() * 0.9)), age: 0, life: 0.6 + Math.random() * 0.3, size0: fw * 0.09, size1: fw * 0.36, drag: 0.96,
        color: (u) => (u < 0.3 ? [0.5, 0.85, 1.0] : [0.15, 0.45, 1.0]), alpha: (u) => (1 - u) * 0.3 }));
      emit(this.fx.flake, 26, () => ({ x: m.x, y: m.y, ...dir(1.2, fw * (0.9 + Math.random())), age: 0, life: 1.1, size0: fw * 0.09, size1: fw * 0.05, grav: -fw * 0.4, drag: 0.97, color: () => [1.6, 1.9, 2.2] }));
    } else if (kind === 'rainbow') {
      // a fan: each direction out of the mouth is one color band, red on one side to violet on the other
      emit(this.fx.rainbow, 170, () => { const band = Math.floor(Math.random() * 7), a = (band / 6 - 0.5) * 0.9 + (Math.random() - 0.5) * 0.06; return { x: m.x, y: m.y, ...dir(0, fw * (1.7 + Math.random() * 0.4), a), age: 0, life: 0.75, size0: fw * 0.06, size1: fw * 0.2, drag: 0.975, color: () => hsl(band / 7.5, 1, 0.5, 1.0), alpha: (u) => (1 - u) * 0.8 }; });
      emit(this.fx.spark, 40, () => ({ x: m.x, y: m.y, ...dir(1.5, fw * (1 + Math.random())), age: 0, life: 0.9, size0: fw * 0.09, size1: fw * 0.03, drag: 0.96, color: () => hsl(Math.random(), 1, 0.65, 1.6) }));
    }
  }
  lasers(f, level, t) {
    if (level < 0.05) return;
    const H = this.H, P = f.P, R = this.ribbons, lv = Math.min(1, level);
    const eyesMid = { x: (P[33].x + P[263].x) / 2, y: (P[33].y + P[263].y) / 2 };
    const fwd = { x: (P[4].x - eyesMid.x) / f.fw, y: (P[4].y - eyesMid.y) / f.fw };
    for (const [iris, s] of [[468, -1], [473, 1]]) {
      const e = P[iris];
      const side = { x: Math.cos(f.ang) * s, y: Math.sin(f.ang) * s };
      let dx = fwd.x * 2.2 + side.x * 0.55, dy = Math.max(0.35, fwd.y * 1.6) + side.y * 0.55;
      const len = Math.hypot(dx, dy); dx /= len; dy /= len;
      const L = f.fw * 5 * lv, a = { x: e.x, y: H - e.y }, b = { x: e.x + dx * L, y: H - (e.y + dy * L) };
      const flick = 0.85 + 0.15 * Math.sin(t * 45 + s);
      const line = [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b];
      R.strip(line, () => f.fw * 0.13 * flick * lv, () => [0.9, 0.03, 0.03, 0.3]);
      R.strip(line, () => f.fw * 0.055 * flick * lv, () => [1.8, 0.15, 0.12, 0.85]);
      R.strip(line, () => f.fw * 0.018 * lv, () => [1.8, 1.6, 1.6, 1]);
      this.fx.flare.flash(a.x, a.y, f.fw * 0.3 * flick * lv, 1.3, 0.18, 0.15, 0.8);
      this.fx.flare.flash(a.x, a.y, f.fw * 0.1 * lv, 1.6, 1.6, 1.6, 1);
      if (Math.random() < 0.6) this.fx.spark.spawn({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * f.fw * 3, vy: (Math.random() - 0.2) * f.fw * 3, age: 0, life: 0.4, size0: f.fw * 0.12, size1: 0, grav: -f.fw * 4, drag: 0.94, color: () => [3, 1.2, 0.4] });
    }
  }
  hypno(f, level, t) {
    if (level < 0.05) return;
    const H = this.H, P = f.P;
    for (const iris of [468, 473]) {
      const e = { x: P[iris].x, y: H - P[iris].y };
      for (let i = 0; i < 5; i++) {
        const u = (t * 0.9 + i / 5) % 1, r = f.fw * (0.04 + u * 0.75 * level);
        this.ribbons.ring(e.x, e.y, r, f.fw * 0.024 * (1 - u * 0.5), () => [...hsl(t * 0.3 + i * 0.2, 1, 0.55, 1.3), (1 - u) * 0.85], 40);
      }
      this.fx.flare.flash(e.x, e.y, f.fw * 0.16, ...hsl(t * 0.5, 1, 0.6, 1.4), 0.7);
    }
  }
  lightningFx(f, on, t, boost) {
    if (!on) { this.lightning.delete(f.id); return; }
    const H = this.H, P = f.P, OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 109, 67, 103, 54, 21, 162, 127, 234, 93, 132, 58];
    let st = this.lightning.get(f.id);
    const every = boost ? 0.045 : 0.09;
    if (!st || t - st.t > every) {
      const n = boost ? 7 : 3, bolts = [];
      const cx = (P[234].x + P[454].x) / 2, cy = (P[10].y + P[152].y) / 2;
      for (let i = 0; i < n; i++) {
        const o = P[OVAL[Math.floor(Math.random() * OVAL.length)]];
        const a = Math.atan2(o.y - cy, o.x - cx) + (Math.random() - 0.5) * 0.8;
        const L = f.fw * (0.5 + Math.random() * (boost ? 1.4 : 0.8));
        const start = { x: o.x, y: H - o.y }, end = { x: o.x + Math.cos(a) * L, y: H - (o.y + Math.sin(a) * L) };
        const path = boltPath(start, end, 0.28, 5);
        bolts.push(path);
        if (Math.random() < 0.5) { const k = Math.floor(path.length * (0.3 + Math.random() * 0.4)); bolts.push(boltPath(path[k], { x: path[k].x + (Math.random() - 0.5) * L * 0.8, y: path[k].y + (Math.random() - 0.5) * L * 0.8 }, 0.3, 4)); }
      }
      st = { t, bolts }; this.lightning.set(f.id, st);
    }
    for (const b of st.bolts) {
      this.ribbons.strip(b, (u) => f.fw * 0.06 * (1 - u * 0.6), () => [0.25, 0.45, 1.6, 0.5]);
      this.ribbons.strip(b, (u) => f.fw * 0.016 * (1 - u * 0.5), () => [1.8, 2.0, 2.5, 1]);
    }
  }
  auraSparks(f, dt) {
    const H = this.H;
    if (Math.random() < 0.8) {
      const ang = Math.PI * (0.85 + Math.random() * 1.3), R = f.fw * (0.8 + Math.random() * 0.45);
      this.fx.spark.spawn({ x: f.eyes.x + Math.cos(ang) * R * 1.35, y: H - (f.eyes.y + Math.sin(ang) * R + f.fw * 0.5), vx: 0, vy: f.fw * (0.4 + Math.random() * 0.4), age: 0, life: 1 + Math.random() * 0.6, size0: f.fw * 0.12, size1: f.fw * 0.03, drag: 0.99, color: () => [2.8, 2.3, 0.8], alpha: (u) => Math.sin(u * Math.PI) });
    }
  }
  jetFlames(nozzles, dt) {
    const H = this.H;
    for (const n of nozzles) {
      const k = Math.floor(70 * dt) + 1;
      for (let i = 0; i < k; i++) this.fx.fire.spawn({ x: n.x + (Math.random() - 0.5) * n.w * 0.4, y: H - n.y, vx: (Math.random() - 0.5) * n.w * 1.2, vy: -n.w * (7 + Math.random() * 4), age: 0, life: 0.35 + Math.random() * 0.2, size0: n.w * 0.9, size1: n.w * 1.6, drag: 0.97, color: (u) => (u < 0.25 ? [3, 2.8, 2.2] : u < 0.55 ? [2.6, 1.2, 0.3] : [1.2, 0.3, 0.1]), alpha: (u) => 1 - u });
    }
  }

  // ───────────────────────────────────────────── frame
  render(o) {
    const u = this.comp.uniforms, W = this.W, H = this.H;
    for (const name of ['bg', 'behind', 'front', 'top']) {
      const L = this.layers[name];
      if (L.used) L.tex.needsUpdate = true;
    }
    this.topQuad.visible = this.layers.top.used;
    u.uUseBg.value = o.useBg && this.layers.bg.used ? 1 : 0;
    u.uUseMask.value = o.useMask ? 1 : 0;
    u.uUseBehind.value = this.layers.behind.used ? 1 : 0;
    u.uUseFront.value = this.layers.front.used ? 1 : 0;
    u.uAura.value = o.aura || 0; u.uInvis.value = o.invis || 0; u.uSpeed.value = o.speed || 0;
    u.uTime.value = o.t; u.uRim.value = o.rim || 0;
    if (o.rimColor) u.uRimColor.value.setRGB(...o.rimColor);
    if (o.bgTint) u.uBgTint.value.setRGB(...o.bgTint);
    for (let i = 0; i < 4; i++) { const r = o.ripples?.[i]; u.uRipple.value[i].set(r ? r.x : 0, r ? r.y : 0, r ? r.age : 0, r ? r.str : 0); }
    if (o.heat) u.uHeat.value.set(o.heat.x, o.heat.y, o.heat.r, o.heat.str); else u.uHeat.value.set(0, 0, 0, 0);

    // speed ghosts: snapshot the cut-out person every few frames into a ring of textures
    if (o.speed > 0 && o.useMask) {
      this.ghostFrame++;
      if (this.ghostFrame % 3 === 0) {
        const g = this.ghosts.pop(); this.ghosts.unshift(g);
        this.r.setRenderTarget(g); this.r.render(this.ghostScene, this.flatCam);
        u.tG0.value = this.ghosts[0].texture; u.tG1.value = this.ghosts[1].texture; u.tG2.value = this.ghosts[2].texture; u.tG3.value = this.ghosts[3].texture;
      }
    }

    // particles + ribbons were filled by the app this frame
    for (const p of Object.values(this.fx)) { p.step(o.dt); p.upload(); }
    this.ribbons.end();

    this.r.setRenderTarget(this.main);
    this.r.render(this.scene, this.cam);

    if (this.bloomOn) {
      this.cam.layers.set(BLOOM);
      this.bloom.render();
      this.cam.layers.set(0);
      this.final.uniforms.tBloom.value = this.bloom.readBuffer.texture;
    } else this.final.uniforms.tBloom.value = this.black;

    const fu = this.final.uniforms;
    fu.uMirror.value = o.mirror ? 1 : 0; fu.uLook.value = o.look || 0; fu.uTime.value = o.t; fu.uFrost.value = o.frost || 0;
    fu.uBloom.value = this.bloomOn ? 0.6 : 0; fu.uLookMix.value = 1;
    this.r.setRenderTarget(null);
    this.r.render(this.finalScene, this.flatCam);

    this.ribbons.begin();
    for (const L of Object.values(this.layers)) L.used = false;
  }
}

// ───────────────────────────────────────────── tile pictures
// Render one 3D piece onto a transparent canvas, posed on the preview face (100×100 tile units, y down).
Engine.prototype.preview3D = function (build, f, size = 184) {
  const r = this.r;
  if (!this.pv) {
    const scene = new THREE.Scene();
    scene.environment = this.scene.environment;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-0.5, 1, 1.2); scene.add(key, key.target);
    const rt = new THREE.WebGLRenderTarget(size, size); rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.pv = { scene, rt, cam: new THREE.OrthographicCamera(0, 100, 100, 0, -1e4, 1e4), buf: new Uint8Array(size * size * 4) };
  }
  const { scene, rt, cam, buf } = this.pv;
  const anchor = new THREE.Group(); anchor.matrixAutoUpdate = false;
  headMatrix(f, 100, anchor.matrix);
  const piece = build();
  anchor.add(buildOccluder(), piece.group);
  piece.update?.(1.3, {});
  scene.add(anchor); anchor.updateMatrixWorld(true);
  const prevColor = new THREE.Color(); r.getClearColor(prevColor); const prevAlpha = r.getClearAlpha();
  r.setClearColor(0x000000, 0); r.setRenderTarget(rt); r.clear(); r.render(scene, cam);
  r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  r.setRenderTarget(null); r.setClearColor(prevColor, prevAlpha);
  scene.remove(anchor); dispose(anchor);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const img = c.getContext('2d').createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);   // GL rows are bottom-up
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
};
// Run a Looks filter over a 2D picture (for the Looks tiles).
Engine.prototype.previewLook = function (look, source) {
  const r = this.r, size = source.width;
  const tex = new THREE.CanvasTexture(source); tex.colorSpace = THREE.SRGBColorSpace;
  const rt = new THREE.WebGLRenderTarget(size, size);
  const u = this.final.uniforms, keep = { s: u.tScene.value, b: u.tBloom.value, res: u.uRes.value.clone() };
  u.tScene.value = tex; u.tBloom.value = this.black; u.uRes.value.set(size, size); u.uMirror.value = 0; u.uLook.value = look; u.uFrost.value = 0; u.uTime.value = 1.3;
  r.setRenderTarget(rt); r.render(this.finalScene, this.flatCam);
  const buf = new Uint8Array(size * size * 4);
  r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  r.setRenderTarget(null);
  u.tScene.value = keep.s; u.tBloom.value = keep.b; u.uRes.value.copy(keep.res);
  tex.dispose(); rt.dispose();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const img = c.getContext('2d').createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
};

// Helmet updates: kept outside the class so a missing update never throws mid-frame.
function BUILDERS_UPDATE(h, t, bs) {
  try { h.helmet?.update?.(t, bs); } catch (e) { console.warn(e); }
}
function dispose(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose?.();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { m.map?.dispose?.(); m.alphaMap?.dispose?.(); m.dispose?.(); }
  });
}
