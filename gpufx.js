// gpufx.js — the WebGPU particle engine. Up to 131k particles live entirely on the GPU: compute shaders spawn and
// move them (curl-noise flow, hands that push, palms that pull, a star storm orbiting the hero), and a render pass
// draws them into a small offscreen canvas. The WebGL engine picks that canvas up as a texture each frame and adds it
// to the scene (so it gets bloom, the mirror flip and the Looks filters like everything else).
// No WebGPU (older tablet, old Chrome)? createGpuFx() returns null and the app simply skips these extras.
//
// World space = camera pixels, y up (same as engine.js). Kinds:
export const K = { FIRE: 0, ICE: 1, SPARK: 2, STORM: 3, MAGIC: 4, ENERGY: 5, BURST: 6 };
const MAX_EMIT = 64, MAX_FIELD = 16;
const OUT_SCALE = 0.4;            // the canvas is 8-bit: store colour ×0.4 so the WebGL side can bring back brights up to 2.5

const COMMON = /* wgsl */`
struct Particle { pos: vec2f, vel: vec2f, life: f32, maxLife: f32, size: f32, info: u32, aux: vec4f };
struct Emitter { pos: vec2f, dir: vec2f, spread: f32, speed: f32, life: f32, size: f32, info: u32, start: u32, count: u32, jitter: f32, aux: vec4f };
struct Field { pos: vec2f, radius: f32, strength: f32, swirl: f32, kind: u32, tilt: f32, pad: f32 };
struct U { res: vec2f, time: f32, dt: f32, head: u32, total: u32, nEmit: u32, nField: u32, maskOn: f32, unit: f32, n: u32, outScale: f32 };
fn pcg(v: u32) -> u32 { let s = v * 747796405u + 2891336453u; let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
fn hsv(h: f32, s: f32, v: f32) -> vec3f { let k = vec3f(1.0, 2.0 / 3.0, 1.0 / 3.0); let p = abs(fract(vec3f(h) + k) * 6.0 - 3.0); return v * mix(vec3f(1.0), clamp(p - 1.0, vec3f(0.0), vec3f(1.0)), s); }
`;

const SIM = COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> ps: array<Particle>;
@group(0) @binding(2) var<storage, read> em: array<Emitter>;
@group(0) @binding(3) var<storage, read> fl: array<Field>;
@group(0) @binding(4) var maskTex: texture_2d<f32>;
@group(0) @binding(5) var samp: sampler;

fn rnd(seed: ptr<function, u32>) -> f32 { *seed = pcg(*seed); return f32(*seed) / 4294967295.0; }
fn h2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vnoise(p: vec2f) -> f32 { let i = floor(p); var f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2f(1.0, 0.0)), f.x), mix(h2(i + vec2f(0.0, 1.0)), h2(i + vec2f(1.0, 1.0)), f.x), f.y); }
fn pot(p: vec2f, t: f32) -> f32 { return vnoise(p + vec2f(0.0, t)) + 0.5 * vnoise(p * 2.1 - vec2f(t * 1.3, 0.0)); }
fn curl(p: vec2f, t: f32) -> vec2f {
  let e = 0.06;
  let dx = pot(p + vec2f(e, 0.0), t) - pot(p - vec2f(e, 0.0), t);
  let dy = pot(p + vec2f(0.0, e), t) - pot(p - vec2f(0.0, e), t);
  return vec2f(dy, -dx) / (2.0 * e);
}
fn maskAt(pos: vec2f) -> f32 { return textureSampleLevel(maskTex, samp, vec2f(pos.x / u.res.x, 1.0 - pos.y / u.res.y), 0.0).r; }

@compute @workgroup_size(64) fn emit(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u.total) { return; }
  var e = em[0];
  for (var k = 0u; k < u.nEmit; k++) { let c = em[k]; if (i >= c.start && i < c.start + c.count) { e = c; break; } }
  var seed = pcg(i * 1973u + u32(u.time * 997.0) * 9277u + u.head * 31u);
  let a = atan2(e.dir.y, e.dir.x) + (rnd(&seed) - 0.5) * e.spread;
  let sp = e.speed * (0.55 + 0.9 * rnd(&seed));
  let r = sqrt(rnd(&seed)) * e.jitter;
  let ra = rnd(&seed) * 6.2831853;
  var p: Particle;
  p.pos = e.pos + vec2f(cos(ra), sin(ra)) * r;
  p.vel = vec2f(cos(a), sin(a)) * sp;
  p.maxLife = e.life * (0.6 + 0.8 * rnd(&seed));
  p.life = p.maxLife;
  p.size = e.size * (0.45 + 1.1 * rnd(&seed));
  p.info = (e.info & 0xFFFFu) | ((pcg(seed) & 0xFFFFu) << 16u);
  p.aux = vec4f(0.0);
  if ((e.info & 0xFFu) == 3u) {
    // storm: three tilted rings at different heights. aux = (orbit angle, height, band*10 + radius factor, field index)
    let band = floor(rnd(&seed) * 3.0);
    let rf = (0.88 + 0.24 * rnd(&seed)) * select(1.0, 0.62, band == 2.0);          // the top ring is a halo
    let hgt = select(select(e.aux.y, e.aux.z, band == 1.0), e.aux.w, band == 2.0);
    p.aux = vec4f(rnd(&seed) * 6.2831853, hgt + (rnd(&seed) - 0.5) * 0.12, band * 10.0 + rf, e.aux.x);
    let f = fl[u32(e.aux.x)];
    let tilt0 = f.tilt * select(1.0, -1.0, band == 1.0);
    p.pos = f.pos + vec2f(cos(p.aux.x) * f.radius * rf, p.aux.y * u.unit + sin(p.aux.x) * tilt0 * f.radius);
    p.vel = vec2f(0.0);
  }
  ps[(u.head + i) % u.n] = p;
}

@compute @workgroup_size(64) fn sim(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u.n) { return; }
  var p = ps[i];
  if (p.life <= 0.0) { return; }
  let dt = u.dt;
  let U1 = u.unit;
  let kind = p.info & 0xFFu;
  var acc = vec2f(0.0);
  var drag = 0.98;
  var curlK = 0.0;
  switch kind {
    case 0u: { acc.y += 2.4 * U1; drag = 0.955; curlK = 1.8; }
    case 1u: { acc.y -= 0.25 * U1; drag = 0.93; curlK = 1.0; }
    case 2u: { acc.y -= 3.2 * U1; drag = 0.985; curlK = 0.25; }
    case 3u: { drag = 1.0; curlK = 0.0; }
    case 4u: { acc.y += 0.3 * U1; drag = 0.93; curlK = 0.9; }
    case 5u: { drag = 0.9; curlK = 0.45; }
    default: { drag = 0.935; curlK = 0.5; }
  }
  if (curlK > 0.0) { acc += curl(p.pos / U1 * 2.2, u.time * 0.4) * curlK * U1 * 2.6; }
  if (kind == 3u) {
    // storm: ride a tilted ring around the hero (a spring pulls toward the ring point; hands knock particles off it)
    let f = fl[u32(p.aux.w)];
    let band = floor(p.aux.z / 10.0);
    let rf = p.aux.z - band * 10.0;
    let w = f.swirl * (0.9 + 0.2 * f32((p.info >> 16u) & 0xFFu) / 255.0) * select(1.0, -1.0, band == 1.0);
    p.aux.x += w * dt;
    let tilt0 = f.tilt * select(1.0, -1.0, band == 1.0);
    let goal = f.pos + vec2f(cos(p.aux.x) * f.radius * rf, p.aux.y * U1 + sin(p.aux.x) * tilt0 * f.radius);
    acc += (goal - p.pos) * 26.0 - p.vel * 7.5;
  }
  for (var k = 0u; k < u.nField; k++) {
    let f = fl[k];
    let dd = p.pos - f.pos;
    let dist = length(dd) + 0.001;
    let n = dd / dist;
    let fall = clamp(1.0 - dist / f.radius, 0.0, 1.0);
    if (f.kind == 0u && (kind == 3u || kind == 4u || kind == 1u)) {
      acc += n * f.strength * fall * fall * U1 * 260.0;                       // hand pushes
    } else if (f.kind == 1u && kind == 5u) {
      acc -= n * f.strength * U1 * 16.0 * (0.25 + fall);                      // palm pulls energy in…
      acc += vec2f(-n.y, n.x) * f.swirl * U1 * 14.0 * fall;                   // …and spins it
    }
  }
  if (u.maskOn > 0.5 && kind == 4u) {                                           // magic dust slides off the body
    let m = maskAt(p.pos);
    if (m > 0.4) {
      let e = 3.0;
      let g = vec2f(maskAt(p.pos + vec2f(e, 0.0)) - maskAt(p.pos - vec2f(e, 0.0)), maskAt(p.pos + vec2f(0.0, e)) - maskAt(p.pos - vec2f(0.0, e)));
      let gl = length(g);
      if (gl > 0.0001) { acc -= g / gl * m * U1 * 30.0; }
    }
  }
  p.vel += acc * dt;
  p.vel *= pow(drag, dt * 60.0);
  p.pos += p.vel * dt;
  p.life -= dt;
  ps[i] = p;
}`;

const DRAW = COMMON + /* wgsl */`
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> ps: array<Particle>;
@group(0) @binding(2) var maskTex: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
struct VOut { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) col: vec3f, @location(2) scr: vec2f, @location(3) behind: f32, @location(4) hard: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var o: VOut;
  let p = ps[ii];
  if (p.life <= 0.0) { o.pos = vec4f(-9.0, -9.0, 0.0, 1.0); return o; }
  let corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let uu = clamp(1.0 - p.life / p.maxLife, 0.0, 1.0);
  let kind = p.info & 0xFFu;
  let hue = f32((p.info >> 8u) & 0xFFu) / 255.0;
  let seed = f32((p.info >> 16u) & 0xFFFFu) / 65535.0;
  var col = vec3f(1.0);
  var size = p.size;
  var a = 1.0 - uu;
  o.behind = 0.0;
  o.hard = 0.0;
  switch kind {
    case 0u: {
      col = select(mix(vec3f(2.0, 1.15, 0.35), vec3f(0.75, 0.12, 0.02), (uu - 0.25) / 0.75), mix(vec3f(2.2, 2.0, 1.2), vec3f(2.0, 1.15, 0.35), uu / 0.25), uu < 0.25);
      a = (1.0 - uu) * min(1.0, uu * 10.0);
      size = p.size * (0.6 + uu * 1.2);
    }
    case 1u: { col = mix(vec3f(0.8, 1.15, 1.6), vec3f(0.15, 0.45, 1.3), uu); a = (1.0 - uu) * 0.7; size = p.size * (0.7 + uu); }
    case 2u: { col = vec3f(2.4, 1.7, 0.7); a = 1.0 - uu; o.hard = 1.0; }
    case 3u: {
      let ang = p.aux.x;
      let band = floor(p.aux.z / 10.0);
      let depth = sin(ang) * select(1.0, -1.0, band == 1.0);                                // > 0: the near side of the ring, < 0: behind the hero
      o.behind = select(0.0, 1.0, depth < 0.0);
      let tw = 0.65 + 0.35 * sin(u.time * (3.0 + seed * 7.0) + seed * 60.0);
      col = hsv(hue + seed * 0.12, 0.5 + 0.4 * seed, 1.0) * (1.5 + 0.8 * step(0.97, seed)) * tw;
      size = p.size * (0.75 + 0.45 * depth);
      a = min(1.0, p.life * 1.5) * min(1.0, (p.maxLife - p.life) * 3.0) * (0.55 + 0.45 * depth);
      o.hard = step(0.9, seed);
    }
    case 4u: { col = hsv(hue + u.time * 0.15 + seed * 0.25, 0.8, 1.0) * 1.7; a = (1.0 - uu) * (1.0 - uu); o.hard = step(0.7, seed); }
    case 5u: { col = mix(vec3f(0.35, 0.85, 2.3), vec3f(2.0, 2.2, 2.6), step(0.8, seed)); a = min(1.0, p.life * 4.0); }
    default: { col = hsv(hue + seed * 0.06, 0.75, 1.0) * 1.3; a = pow(1.0 - uu, 1.5); o.hard = step(0.75, seed); size = p.size * (1.0 - uu * 0.5); }
  }
  let px = p.pos + c * size * 0.5;
  o.pos = vec4f(px / u.res * 2.0 - 1.0, 0.0, 1.0);
  o.q = c;
  o.col = col * a;
  o.scr = vec2f(px.x / u.res.x, 1.0 - px.y / u.res.y);
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let r = length(i.q);
  if (r > 1.0) { discard; }
  var a = pow(1.0 - r, 1.6);
  if (i.hard > 0.5) { a = max(a * 0.6, (1.0 - smoothstep(0.0, 0.18, abs(i.q.x * i.q.y) * 4.0 + r * 0.3)) * (1.0 - r)); }   // twinkle cross
  if (i.behind > 0.5) { a *= 1.0 - 0.96 * textureSampleLevel(maskTex, samp, i.scr, 0.0).r; }             // passes behind the hero
  return vec4f(i.col * a * u.outScale, 1.0);
}`;

export async function createGpuFx(W, H, { n = 131072 } = {}) {
  if (!navigator.gpu) return null;
  let device;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch (e) { console.warn('WebGPU unavailable', e); return null; }
  try { return new GpuFx(device, W, H, n); } catch (e) { console.warn('WebGPU fx failed', e); return null; }
}

class GpuFx {
  constructor(device, W, H, n) {
    this.device = device; this.n = n; this.head = 0; this.time = 0;
    this.lost = false;
    device.lost.then(() => { this.lost = true; });
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' });
    this.W = 4; this.H = 4;
    this.emitters = []; this.fields = [];
    this.particles = device.createBuffer({ size: n * 48, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.ubuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.ebuf = device.createBuffer({ size: MAX_EMIT * 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.fbuf = device.createBuffer({ size: MAX_FIELD * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.eData = new ArrayBuffer(MAX_EMIT * 64); this.fData = new ArrayBuffer(MAX_FIELD * 32); this.uData = new ArrayBuffer(48);
    this.samp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.setMask(new Uint8Array(4), 2, 2);
    const sim = device.createShaderModule({ code: SIM }), draw = device.createShaderModule({ code: DRAW });
    this.emitPipe = device.createComputePipeline({ layout: 'auto', compute: { module: sim, entryPoint: 'emit' } });
    this.simPipe = device.createComputePipeline({ layout: 'auto', compute: { module: sim, entryPoint: 'sim' } });
    this.drawPipe = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: draw, entryPoint: 'vs' },
      fragment: { module: draw, entryPoint: 'fs', targets: [{ format: this.format, blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] },
      primitive: { topology: 'triangle-list' },
    });
    this.groups();
    this.resize(W, H);
  }
  groups() {
    const d = this.device;
    const tv = this.mask.createView();
    this.emitGroup = d.createBindGroup({ layout: this.emitPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: this.particles } }, { binding: 2, resource: { buffer: this.ebuf } },
      { binding: 3, resource: { buffer: this.fbuf } }] });
    this.simGroup = d.createBindGroup({ layout: this.simPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: this.particles } },
      { binding: 3, resource: { buffer: this.fbuf } }, { binding: 4, resource: tv }, { binding: 5, resource: this.samp }] });
    this.drawGroup = d.createBindGroup({ layout: this.drawPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: this.particles } }, { binding: 2, resource: tv }, { binding: 3, resource: this.samp }] });
  }
  resize(W, H) {
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    this.canvas.width = Math.max(2, Math.round(W / 2)); this.canvas.height = Math.max(2, Math.round(H / 2));   // half-res: particles are soft anyway
  }
  // Person cut-out from the segmenter (row 0 = top of the picture), so storm particles can pass behind the hero.
  setMask(alpha, w, h) {
    if (!this.mask || this.maskW !== w || this.maskH !== h) {
      this.mask?.destroy();
      this.mask = this.device.createTexture({ size: [w, h], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      this.maskW = w; this.maskH = h;
      if (this.drawPipe) this.groups();
    }
    this.device.queue.writeTexture({ texture: this.mask }, alpha, { bytesPerRow: w }, [w, h]);
    this.maskOn = w > 2;
  }
  // count: particles this frame (fractions carry over per emitter key). e = { x, y, dx, dy, spread, speed, life, size, kind, hue(0..1), jitter, key, aux }
  emit(e, count) {
    if (this.emitters.length >= MAX_EMIT) return;
    const n = Math.floor(count) + (Math.random() < count % 1 ? 1 : 0);
    if (n > 0) this.emitters.push({ ...e, count: Math.min(n, 60000) });
  }
  field(f) { if (this.fields.length < MAX_FIELD) this.fields.push(f); return this.fields.length - 1; }
  // Runs one simulation step and draws. Call once per frame, then read this.canvas in the same task.
  frame(dt, t, unit) {
    if (this.lost) return false;
    const d = this.device;
    let total = 0;
    const ev = new DataView(this.eData);
    this.emitters.forEach((e, i) => {
      const o = i * 64;
      ev.setFloat32(o, e.x, true); ev.setFloat32(o + 4, e.y, true); ev.setFloat32(o + 8, e.dx ?? 0, true); ev.setFloat32(o + 12, e.dy ?? 1, true);
      ev.setFloat32(o + 16, e.spread ?? 0.5, true); ev.setFloat32(o + 20, e.speed ?? 0, true); ev.setFloat32(o + 24, e.life ?? 1, true); ev.setFloat32(o + 28, e.size ?? 4, true);
      ev.setUint32(o + 32, (e.kind & 0xff) | ((Math.round(((e.hue ?? 0) % 1) * 255) & 0xff) << 8), true);
      ev.setUint32(o + 36, total, true); ev.setUint32(o + 40, e.count, true); ev.setFloat32(o + 44, e.jitter ?? 0, true);
      const aux = e.aux || [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) ev.setFloat32(o + 48 + k * 4, aux[k], true);
      total += e.count;
    });
    total = Math.min(total, this.n);
    const fv = new DataView(this.fData);
    this.fields.forEach((f, i) => {
      const o = i * 32;
      fv.setFloat32(o, f.x, true); fv.setFloat32(o + 4, f.y, true); fv.setFloat32(o + 8, f.radius, true); fv.setFloat32(o + 12, f.strength ?? 1, true);
      fv.setFloat32(o + 16, f.swirl ?? 0, true); fv.setUint32(o + 20, f.kind ?? 0, true); fv.setFloat32(o + 24, f.tilt ?? 0, true); fv.setFloat32(o + 28, 0, true);
    });
    const uv = new DataView(this.uData);
    uv.setFloat32(0, this.W, true); uv.setFloat32(4, this.H, true); uv.setFloat32(8, t, true); uv.setFloat32(12, Math.min(0.05, dt), true);
    uv.setUint32(16, this.head, true); uv.setUint32(20, total, true); uv.setUint32(24, this.emitters.length, true); uv.setUint32(28, this.fields.length, true);
    uv.setFloat32(32, this.maskOn ? 1 : 0, true); uv.setFloat32(36, unit, true); uv.setUint32(40, this.n, true); uv.setFloat32(44, OUT_SCALE, true);
    d.queue.writeBuffer(this.ubuf, 0, this.uData);
    if (this.emitters.length) d.queue.writeBuffer(this.ebuf, 0, this.eData, 0, this.emitters.length * 64);
    if (this.fields.length) d.queue.writeBuffer(this.fbuf, 0, this.fData, 0, this.fields.length * 32);

    const enc = d.createCommandEncoder();
    const cp = enc.beginComputePass();
    if (total > 0) { cp.setPipeline(this.emitPipe); cp.setBindGroup(0, this.emitGroup); cp.dispatchWorkgroups(Math.ceil(total / 64)); }
    cp.setPipeline(this.simPipe); cp.setBindGroup(0, this.simGroup); cp.dispatchWorkgroups(Math.ceil(this.n / 64));
    cp.end();
    const rp = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
    rp.setPipeline(this.drawPipe); rp.setBindGroup(0, this.drawGroup); rp.draw(6, this.n);
    rp.end();
    d.queue.submit([enc.finish()]);
    this.head = (this.head + total) % this.n;
    this.alive = Math.min(this.n, (this.alive || 0) + total);
    this.emitters.length = 0; this.fields.length = 0;
    return true;
  }
  clear() { this.device.queue.writeBuffer(this.particles, 0, new Float32Array(this.n * 12)); this.alive = 0; }
  static get OUT_SCALE() { return OUT_SCALE; }
}
export { OUT_SCALE };
