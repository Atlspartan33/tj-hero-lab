// fx3d.js — GPU effects: particle systems, glowing ribbons (lasers, lightning, rings) and the power shield.
// World space = canvas pixels, y up. Colors above 1.0 are intentional: they feed the bloom.
import * as THREE from 'three';
import { BLOOM } from './helmets3d.js';

const VERT = `
attribute float psize; attribute float palpha; attribute vec3 pcolor;
varying vec3 vColor; varying float vAlpha;
uniform float uMax;
void main() {
  vColor = pcolor; vAlpha = palpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(psize, uMax);
}`;
const FRAG = `
varying vec3 vColor; varying float vAlpha;
uniform float uShape;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p);
  float a;
  if (uShape < 0.5) a = pow(clamp(1.0 - r, 0.0, 1.0), 1.7);                                   // soft puff
  else a = clamp(1.0 - abs(p.x * p.y) * 14.0 - r * 0.55, 0.0, 1.0) * clamp(1.0 - r, 0.0, 1.0)   // twinkle star
           + pow(clamp(1.0 - r, 0.0, 1.0), 4.0) * 0.6;
  a *= vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, a);                                                            // premultiplied
}`;

export class Particles {
  constructor(max, { additive = true, shape = 0, glow = true } = {}) {
    this.max = max; this.items = []; this.flashes = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uShape: { value: shape }, uMax: { value: 256 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 20;
    if (glow) this.points.layers.enable(BLOOM);
  }
  spawn(p) { if (this.items.length < this.max) this.items.push(p); }
  flash(x, y, size, r, g, b, a = 1) { this.flashes.push({ x, y, size, r, g, b, a }); }   // lives one frame
  // p: {x,y,vx,vy,age,life,size0,size1,grav,drag,color(u)->[r,g,b], alpha(u)}
  step(dt) {
    const it = this.items;
    for (const p of it) {
      p.age += dt;
      p.vy += (p.grav || 0) * dt;
      const d = Math.pow(p.drag ?? 0.98, dt * 60); p.vx *= d; p.vy *= d;
      if (p.wobble) { p.vx += Math.sin(p.age * 9 + p.seed) * p.wobble * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.items = it.filter((p) => p.age < p.life);
  }
  upload() {
    let n = 0;
    for (const p of this.items) {
      if (n >= this.max) break;
      const u = p.age / p.life, c = p.color(u, p);
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = 0;
      this.col[n * 3] = c[0]; this.col[n * 3 + 1] = c[1]; this.col[n * 3 + 2] = c[2];
      this.size[n] = p.size0 + (p.size1 - p.size0) * u;
      this.alpha[n] = p.alpha ? p.alpha(u, p) : 1 - u;
      n++;
    }
    for (const f of this.flashes) {
      if (n >= this.max) break;
      this.pos[n * 3] = f.x; this.pos[n * 3 + 1] = f.y; this.pos[n * 3 + 2] = 0;
      this.col[n * 3] = f.r; this.col[n * 3 + 1] = f.g; this.col[n * 3 + 2] = f.b;
      this.size[n] = f.size; this.alpha[n] = f.a; n++;
    }
    this.flashes.length = 0;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'psize', 'palpha']) { const a = g.attributes[k]; a.needsUpdate = true; a.clearUpdateRanges?.(); a.addUpdateRange?.(0, n * a.itemSize); }
  }
  clear() { this.items.length = 0; this.flashes.length = 0; }
}

// Glowing ribbons: camera-facing strips with soft edges. Rebuilt every frame.
export class Ribbons {
  constructor(maxVerts = 24000) {
    this.max = maxVerts; this.n = 0;
    this.pos = new Float32Array(maxVerts * 3); this.col = new Float32Array(maxVerts * 4); this.side = new Float32Array(maxVerts);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rside', new THREE.BufferAttribute(this.side, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'attribute vec4 rcolor; attribute float rside; varying vec4 vC; varying float vS; void main(){ vC = rcolor; vS = rside; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec4 vC; varying float vS; void main(){ float a = vC.a * (1.0 - vS * vS); gl_FragColor = vec4(vC.rgb * a, a); }',
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 21;
    this.mesh.layers.enable(BLOOM);
  }
  begin() { this.n = 0; }
  // pts: [{x,y}] world. width(u) px, color(u) -> [r,g,b,a]
  strip(pts, width, color) {
    if (pts.length < 2) return;
    const N = pts.length;
    const nx = [], ny = [];
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      nx.push(-dy); ny.push(dx);
    }
    for (let i = 0; i < N - 1; i++) {
      if (this.n + 6 > this.max) return;
      const u0 = i / (N - 1), u1 = (i + 1) / (N - 1), w0 = width(u0) / 2, w1 = width(u1) / 2, c0 = color(u0), c1 = color(u1);
      const A = [pts[i].x + nx[i] * w0, pts[i].y + ny[i] * w0, 1], Bv = [pts[i].x - nx[i] * w0, pts[i].y - ny[i] * w0, -1];
      const Cv = [pts[i + 1].x + nx[i + 1] * w1, pts[i + 1].y + ny[i + 1] * w1, 1], D = [pts[i + 1].x - nx[i + 1] * w1, pts[i + 1].y - ny[i + 1] * w1, -1];
      for (const [v, c] of [[A, c0], [Bv, c0], [Cv, c1], [Bv, c0], [D, c1], [Cv, c1]]) {
        const k = this.n++;
        this.pos[k * 3] = v[0]; this.pos[k * 3 + 1] = v[1]; this.pos[k * 3 + 2] = 0;
        this.col[k * 4] = c[0]; this.col[k * 4 + 1] = c[1]; this.col[k * 4 + 2] = c[2]; this.col[k * 4 + 3] = c[3];
        this.side[k] = v[2];
      }
    }
  }
  ring(cx, cy, r, width, color, seg = 48) {
    const pts = [];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
    this.strip(pts, () => width, color);
  }
  end() {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'rcolor', 'rside']) { const a = g.attributes[k]; a.needsUpdate = true; a.clearUpdateRanges?.(); a.addUpdateRange?.(0, this.n * a.itemSize); }
  }
}

// Jagged lightning path from a to b (midpoint displacement).
export function boltPath(a, b, jag = 0.22, depth = 5) {
  let pts = [a, b];
  let amp = Math.hypot(b.x - a.x, b.y - a.y) * jag;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
      const off = (Math.random() - 0.5) * amp;
      next.push({ x: mx - (dy / l) * off, y: my + (dx / l) * off }, q);
    }
    pts = next; amp *= 0.55;
  }
  return pts;
}

// Hex-grid energy bubble (fresnel edges + rolling hex lines). Attached to the head.
export function buildShield() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uColor: { value: new THREE.Color(0.25, 0.7, 1.3) } },
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vN; varying vec3 vP; uniform float uTime; uniform float uPulse; uniform vec3 uColor;
      float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0,1.732))), p.x); }
      vec4 hexCoords(vec2 uv){ vec2 r = vec2(1.0,1.732), h = r*0.5; vec2 a = mod(uv, r)-h, b = mod(uv-h, r)-h; vec2 gv = dot(a,a)<dot(b,b)?a:b; return vec4(gv, uv-gv); }
      void main(){
        vec3 n = normalize(vN);
        float fres = pow(1.0 - abs(n.z), 2.2);
        vec2 uv = vec2(atan(vP.z, vP.x) * 2.2, acos(clamp(vP.y, -1.0, 1.0)) * 2.6);
        vec4 hc = hexCoords(uv * 3.0);
        float edge = smoothstep(0.42, 0.5, hexDist(hc.xy));
        float wave = 0.5 + 0.5 * sin(hc.w * 0.8 - uTime * 3.0 + hc.z * 0.5);
        float a = fres * 0.55 + edge * fres * (0.1 + 0.25 * wave) + edge * 0.05 + uPulse * (0.05 + edge * 0.25);
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
  m.renderOrder = 22;
  m.layers.enable(BLOOM);
  return m;
}

export const hsl = (h, s, l, k = 1) => { const c = new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l); return [c.r * k, c.g * k, c.b * k]; };
