// gear.js — every mask, power and piece of hero gear, drawn in code onto the tracked face.
// All original designs (no Marvel/DC look-alikes) so the app can be hosted publicly.
// Units: most things draw in face-local space (origin at the eyes, rotated with the head, 1 = face width, -y up).

export const MASKS = [
  { id: 'eye', name: 'Hero Mask', line: 'm_eye' },
  { id: 'robot', name: 'Robot', line: 'm_robot' },
  { id: 'thunder', name: 'Thunder', line: 'm_thunder' },
  { id: 'dino', name: 'Dino Hood', line: 'm_dino' },
];
export const POWERS = [
  { id: 'fire', name: 'Fire Breath', trigger: 'mouth', hint: '😮 → 🔥', line: 'p_fire', group: 'breath' },
  { id: 'ice', name: 'Ice Breath', trigger: 'mouth', hint: '😮 → ❄️', line: 'p_ice', group: 'breath' },
  { id: 'laser', name: 'Laser Eyes', trigger: 'surprise', hint: '😲 → 🔴', line: 'p_laser' },
  { id: 'aura', name: 'Power Glow', trigger: null, line: 'p_aura' },
];
export const GEAR = [
  { id: 'cape', name: 'Cape', line: 'g_cape' },
  { id: 'badge', name: 'Badge', line: 'g_badge' },
  { id: 'city', name: 'Hero City', line: 'g_city', group: 'bg' },
  { id: 'space', name: 'Space', line: 'g_space', group: 'bg' },
];
export const DRAWERS = { masks: MASKS, powers: POWERS, gear: GEAR };
export const ALL = [...MASKS, ...POWERS, ...GEAR];

// ───────────────────────────────────────────── helpers
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const mid = (a, b) => lerp(a, b, 0.5);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function local(ctx, f, anchor, fn, roll = 1) {
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(f.ang * roll);
  ctx.scale(f.fw, f.fw);
  fn();
  ctx.restore();
}
// Springy pop-in when an item goes on.
export function popIn(at, t) {
  const d = (t - at) / 0.5;
  if (d >= 1) return 1;
  if (d <= 0) return 0;
  return 1 - Math.pow(2, -10 * d) * Math.cos(d * Math.PI * 2.5);
}
// Sticker look: fat white outline under a dark keyline.
function sticker(ctx, fill, key, w, rule = 'nonzero') {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = w * 3; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill(rule);
  ctx.strokeStyle = key; ctx.lineWidth = w; ctx.stroke();
}
function bolt(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x + 0.1 * s, y - 0.5 * s);
  ctx.lineTo(x - 0.25 * s, y + 0.05 * s);
  ctx.lineTo(x - 0.02 * s, y + 0.05 * s);
  ctx.lineTo(x - 0.12 * s, y + 0.5 * s);
  ctx.lineTo(x + 0.25 * s, y - 0.08 * s);
  ctx.lineTo(x + 0.02 * s, y - 0.08 * s);
  ctx.closePath();
}
function shine(ctx, x, y, rx, ry, a = 0.5) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
}
// eye centers + half the distance between them, in face-local units
function eyeGeom(f) {
  const P = f.P;
  const r = mid(P[33], P[133]), l = mid(P[263], P[362]);
  return { half: Math.hypot(l.x - r.x, l.y - r.y) / 2 / f.fw, ew: Math.hypot(P[133].x - P[33].x, P[133].y - P[33].y) / f.fw };
}
// An arch-shaped helmet shell with the face showing through (open at the bottom).
function helmetShell(ctx, f, { side = 0.62, low = 0.55, top, open = 0.44 }) {
  const brow = -f.d10 * 0.72;
  ctx.beginPath();
  ctx.moveTo(-side, low);
  ctx.lineTo(-side, -f.d10 * 0.3);
  ctx.bezierCurveTo(-side, top - 0.06, side, top - 0.06, side, -f.d10 * 0.3);
  ctx.lineTo(side, low);
  ctx.lineTo(open, low);
  ctx.lineTo(open, brow + 0.14);
  ctx.quadraticCurveTo(open, brow, open - 0.14, brow);
  ctx.lineTo(-open + 0.14, brow);
  ctx.quadraticCurveTo(-open, brow, -open, brow + 0.14);
  ctx.lineTo(-open, low);
  ctx.closePath();
}

// ───────────────────────────────────────────── masks
function heroMask(ctx, f, k) {
  const { half, ew } = eyeGeom(f);
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const h = half;
    ctx.beginPath();
    ctx.moveTo(0, -0.07);
    ctx.bezierCurveTo(0.08, -0.15, h - 0.05, -0.17, h + 0.05, -0.15);
    ctx.bezierCurveTo(h + 0.14, -0.14, h + 0.22, -0.16, h + 0.3, -0.2);   // tail
    ctx.bezierCurveTo(h + 0.26, -0.08, h + 0.2, 0.06, h + 0.08, 0.11);
    ctx.bezierCurveTo(h - 0.02, 0.15, 0.1, 0.1, 0.06, 0.06);
    ctx.quadraticCurveTo(0, 0.02, -0.06, 0.06);
    ctx.bezierCurveTo(-0.1, 0.1, -h + 0.02, 0.15, -h - 0.08, 0.11);
    ctx.bezierCurveTo(-h - 0.2, 0.06, -h - 0.26, -0.08, -h - 0.3, -0.2);
    ctx.bezierCurveTo(-h - 0.22, -0.16, -h - 0.14, -0.14, -h - 0.05, -0.15);
    ctx.bezierCurveTo(-h + 0.05, -0.17, -0.08, -0.15, 0, -0.07);
    ctx.closePath();
    const rx = Math.max(0.09, ew * 0.62), ry = rx * 0.62;
    for (const s of [-1, 1]) { ctx.moveTo(s * h + rx, 0); ctx.ellipse(s * h, 0, rx, ry, 0, 0, Math.PI * 2); }
    const g = ctx.createLinearGradient(0, -0.2, 0, 0.15);
    g.addColorStop(0, '#FF3B3B'); g.addColorStop(1, '#C40024');
    sticker(ctx, g, '#5A0010', 0.016, 'evenodd');
    shine(ctx, -h - 0.12, -0.09, 0.06, 0.02, 0.45);
  });
}

function robotHelmet(ctx, f, k, t) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const top = -f.d10 - 0.34;
    helmetShell(ctx, f, { top, low: 0.55 });
    const g = ctx.createLinearGradient(-0.6, top, 0.6, 0.5);
    g.addColorStop(0, '#F4F8FC'); g.addColorStop(0.5, '#B9C6D4'); g.addColorStop(1, '#7C8B9C');
    sticker(ctx, g, '#243040', 0.02);
    // center stripe
    ctx.beginPath(); ctx.moveTo(-0.07, top + 0.02); ctx.lineTo(0.07, top + 0.02); ctx.lineTo(0.07, -f.d10 * 0.72); ctx.lineTo(-0.07, -f.d10 * 0.72); ctx.closePath();
    ctx.fillStyle = '#2E7BFF'; ctx.fill();
    // visor across the eyes (see-through)
    ctx.beginPath(); ctx.roundRect(-0.56, -0.13, 1.12, 0.24, 0.1);
    ctx.fillStyle = 'rgba(40, 220, 255, 0.32)'; ctx.fill();
    ctx.strokeStyle = '#243040'; ctx.lineWidth = 0.022; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.45, -0.07); ctx.lineTo(-0.2, -0.07);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.02; ctx.stroke();
    // ear bolts
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * 0.62, 0.22, 0.085, 0, Math.PI * 2);
      ctx.fillStyle = '#2E7BFF'; ctx.fill(); ctx.strokeStyle = '#243040'; ctx.lineWidth = 0.016; ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.62, 0.22, 0.03, 0, Math.PI * 2); ctx.fillStyle = '#DDF4FF'; ctx.fill();
    }
    // antenna with a blinking light
    ctx.beginPath(); ctx.moveTo(0, top + 0.02); ctx.lineTo(0, top - 0.16);
    ctx.strokeStyle = '#243040'; ctx.lineWidth = 0.025; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, top - 0.19, 0.05, 0, Math.PI * 2);
    ctx.fillStyle = Math.floor(t * 2) % 2 ? '#FF3B3B' : '#3BFF7A'; ctx.fill();
    ctx.strokeStyle = '#243040'; ctx.lineWidth = 0.014; ctx.stroke();
  });
}

function wing(ctx, s) {
  ctx.save();
  ctx.scale(s, 1);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(-0.5 - i * 0.32);
    ctx.beginPath();
    ctx.ellipse(0.16, 0, 0.17 - i * 0.025, 0.05, 0, 0, Math.PI * 2);
    sticker(ctx, '#FFFFFF', '#5C6B80', 0.012);
    ctx.restore();
  }
  ctx.restore();
}
function thunderHelmet(ctx, f, k) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const top = -f.d10 - 0.3;
    // wings first, so the helmet overlaps their roots
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 0.55, -f.d10 * 0.5); wing(ctx, s); ctx.restore(); }
    helmetShell(ctx, f, { top, low: -0.02, side: 0.58, open: 0.46 });
    const g = ctx.createLinearGradient(0, top, 0, 0);
    g.addColorStop(0, '#FFF1A0'); g.addColorStop(0.5, '#FFC933'); g.addColorStop(1, '#E09A00');
    sticker(ctx, g, '#7A4B00', 0.02);
    bolt(ctx, 0, (top - f.d10 * 0.72) / 2, 0.3);
    sticker(ctx, '#2E7BFF', '#0B2A66', 0.014);
    // lightning face paint under the eyes
    const { half } = eyeGeom(f);
    for (const s of [-1, 1]) { bolt(ctx, s * (half + 0.02), 0.2, 0.17); ctx.fillStyle = '#FFD400'; ctx.fill(); ctx.strokeStyle = '#7A4B00'; ctx.lineWidth = 0.01; ctx.stroke(); }
  });
}

function dinoHood(ctx, f, k, t) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const top = -f.d10 - 0.42, brow = -f.d10 * 0.72;
    // spikes along the crest
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.32, x = Math.sin(a) * 0.5, y = top + 0.05 + (1 - Math.cos(a)) * 0.35;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a * 0.9);
      ctx.beginPath(); ctx.moveTo(-0.07, 0.02); ctx.lineTo(0, -0.15); ctx.lineTo(0.07, 0.02); ctx.closePath();
      sticker(ctx, '#FF8A1F', '#7A3500', 0.012);
      ctx.restore();
    }
    helmetShell(ctx, f, { top, low: 0.6, side: 0.66, open: 0.45 });
    const g = ctx.createLinearGradient(0, top, 0, 0.6);
    g.addColorStop(0, '#7BE36A'); g.addColorStop(1, '#2FA84F');
    sticker(ctx, g, '#0E4A22', 0.02);
    // teeth hanging over the forehead
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const x0 = -0.4 + i * (0.8 / 7), x1 = x0 + 0.8 / 7;
      ctx.moveTo(x0, brow); ctx.lineTo((x0 + x1) / 2, brow + 0.09); ctx.lineTo(x1, brow);
    }
    ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = '#0E4A22'; ctx.lineWidth = 0.01; ctx.stroke();
    // big cartoon eyes on top of the hood (they blink)
    const blink = (t % 4) < 0.15 ? 0.15 : 1;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 0.2, top + 0.2, 0.09, 0.09 * blink, 0, 0, Math.PI * 2);
      sticker(ctx, '#FFFFFF', '#0E4A22', 0.014);
      if (blink === 1) { ctx.beginPath(); ctx.arc(s * 0.2 + 0.015, top + 0.21, 0.045, 0, Math.PI * 2); ctx.fillStyle = '#14161C'; ctx.fill(); shine(ctx, s * 0.2, top + 0.19, 0.015, 0.012, 0.9); }
    }
    // belly-color spots
    for (const [x, y, r] of [[-0.5, -0.1, 0.05], [0.52, 0.05, 0.06], [-0.55, 0.3, 0.04], [0.32, top + 0.32, 0.04]]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(14, 74, 34, .35)'; ctx.fill();
    }
  });
}

// ───────────────────────────────────────────── powers
// Particle sprites, built once.
function sprite(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return c;
}
let SPR = null;
function sprites() {
  return (SPR ??= {
    fireHot: sprite([[0, 'rgba(255,255,220,1)'], [0.35, 'rgba(255,210,60,.9)'], [1, 'rgba(255,120,0,0)']]),
    fireWarm: sprite([[0, 'rgba(255,170,40,.95)'], [0.5, 'rgba(255,70,0,.6)'], [1, 'rgba(200,0,0,0)']]),
    ice: sprite([[0, 'rgba(225,248,255,.95)'], [0.3, 'rgba(120,210,255,.8)'], [1, 'rgba(30,120,255,0)']]),
    glow: sprite([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,80,80,.9)'], [1, 'rgba(255,0,0,0)']]),
  });
}

export function breathLevel(f) { return clamp01(((f.bs.jawOpen ?? 0) - 0.22) / 0.3); }
export function surpriseLevel(f) {
  const wide = ((f.bs.eyeWideLeft ?? 0) + (f.bs.eyeWideRight ?? 0)) / 2;
  return clamp01((Math.max(f.bs.browInnerUp ?? 0, wide * 1.3) - 0.28) / 0.25);
}

// Breath: particles pour out of the mouth and spread. State lives on the face object.
export function updateBreath(f, kind, level, dt) {
  const fx = (f.fx ??= { parts: [] });
  const P = f.P, m = mid(P[13], P[14]);
  if (level > 0.05) {
    const n = Math.round(4 * level);
    const down = { x: -Math.sin(f.ang), y: Math.cos(f.ang) };
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * 0.9, c = Math.cos(spread), s = Math.sin(spread);
      const dir = { x: down.x * c - down.y * s, y: down.x * s + down.y * c };
      const sp = f.fw * (1.1 + Math.random() * 0.8) * (0.6 + 0.4 * level);
      fx.parts.push({ x: m.x, y: m.y, vx: dir.x * sp, vy: dir.y * sp, age: 0, life: 0.7 + Math.random() * 0.4, r: f.fw * (0.05 + Math.random() * 0.04), kind, spin: Math.random() * 6 });
    }
  }
  for (const p of fx.parts) {
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.97; p.vy *= 0.97;
    if (p.kind === 'fire') p.vy -= f.fw * 0.6 * dt;          // flames curl upward a little
  }
  fx.parts = fx.parts.filter((p) => p.age < p.life).slice(-260);
}
export function drawBreath(ctx, f) {
  const parts = f.fx?.parts;
  if (!parts?.length) return;
  const S = sprites();
  ctx.save();
  for (const p of parts) {
    const u = p.age / p.life, size = p.r * (1 + u * 3.2);
    ctx.globalCompositeOperation = p.kind === 'fire' ? 'lighter' : 'source-over';   // additive ice washes out to white
    ctx.globalAlpha = (1 - u) * (p.kind === 'fire' ? 0.9 : 0.55);
    const img = p.kind === 'fire' ? (u < 0.35 ? S.fireHot : S.fireWarm) : S.ice;
    ctx.drawImage(img, p.x - size, p.y - size, size * 2, size * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  // snowflakes riding the ice breath
  for (const p of parts) {
    if (p.kind !== 'ice' || p.spin < 4.2) continue;
    const u = p.age / p.life, s = p.r * (0.6 + u);
    ctx.globalAlpha = 1 - u;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin + u * 3);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, s * 0.18); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(-Math.cos(a) * s, -Math.sin(a) * s); ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); }
    ctx.stroke(); ctx.restore();
  }
  ctx.restore();
}

export function drawLasers(ctx, f, level, t) {
  if (level < 0.05) return;
  const P = f.P, S = sprites();
  const eyesMid = mid(P[33], P[263]);
  const fwd = { x: (P[4].x - eyesMid.x) / f.fw, y: (P[4].y - eyesMid.y) / f.fw };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [iris, s] of [[468, -1], [473, 1]]) {
    const e = P[iris] || (s < 0 ? mid(P[33], P[133]) : mid(P[263], P[362]));
    // beams fan down and outward from each eye, steered by where the head points
    const side = { x: Math.cos(f.ang) * s, y: Math.sin(f.ang) * s };
    let dx = fwd.x * 2.2 + side.x * 0.55, dy = Math.max(0.35, fwd.y * 1.6) + side.y * 0.55;
    const len = Math.hypot(dx, dy); dx /= len; dy /= len;
    const L = f.fw * 4 * level, x2 = e.x + dx * L, y2 = e.y + dy * L;
    const flick = 0.8 + 0.2 * Math.sin(t * 40 + s);
    for (const [w, col] of [[0.09, 'rgba(255,30,30,.35)'], [0.05, 'rgba(255,60,60,.8)'], [0.018, 'rgba(255,255,255,.95)']]) {
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x2, y2);
      ctx.strokeStyle = col; ctx.lineWidth = f.fw * w * flick * level; ctx.lineCap = 'round'; ctx.stroke();
    }
    const g = f.fw * 0.22 * level * flick;
    ctx.drawImage(S.glow, e.x - g, e.y - g, g * 2, g * 2);
  }
  ctx.restore();
}

// ───────────────────────────────────────────── gear
function neckOf(f) {
  const P = f.P, down = { x: -Math.sin(f.ang), y: Math.cos(f.ang) };
  return { x: P[152].x + down.x * f.fw * 0.22, y: P[152].y + down.y * f.fw * 0.22 };
}
// Drawn BEHIND the person (the app layers the cut-out person on top), so only the sides show.
export function drawCape(ctx, f, k, t, H) {
  const n = neckOf(f);
  local(ctx, f, n, () => {
    const L = Math.max(1.5, (H - n.y) / f.fw + 0.3);
    ctx.scale(k, 1);
    const wave = (x) => Math.sin(t * 2.2 + x * 3) * 0.06;
    const R = 2.3;
    ctx.beginPath();
    ctx.moveTo(-0.45, -0.1);
    ctx.bezierCurveTo(-1.5, 0.05, -2.0, 0.5, -R, L + wave(-R));
    for (let x = -R; x <= R; x += 0.46) ctx.lineTo(x, L + wave(x));
    ctx.bezierCurveTo(2.0, 0.5, 1.5, 0.05, 0.45, -0.1);
    ctx.closePath();
    const g = ctx.createLinearGradient(-R, 0, R, 0);
    g.addColorStop(0, '#9E0B22'); g.addColorStop(0.5, '#E3122C'); g.addColorStop(1, '#9E0B22');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#5A0010'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.strokeStyle = 'rgba(90,0,16,.35)'; ctx.lineWidth = 0.05;
    for (const x of [-1.4, -0.7, 0.7, 1.4]) { ctx.beginPath(); ctx.moveTo(x * 0.5, 0.15); ctx.quadraticCurveTo(x * 1.1, L * 0.5, x * 1.4 + wave(x) * 2, L); ctx.stroke(); }
  }, 0.5);
}
export function drawCapeClasps(ctx, f, k) {
  local(ctx, f, neckOf(f), () => {
    ctx.scale(k, k);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * 0.36, -0.02, 0.07, 0, Math.PI * 2);
      sticker(ctx, '#FFC933', '#7A4B00', 0.014);
      shine(ctx, s * 0.36 - 0.02, -0.04, 0.025, 0.015, 0.8);
    }
  }, 0.5);
}
export function drawBadge(ctx, f, k, t) {
  const P = f.P, down = { x: -Math.sin(f.ang), y: Math.cos(f.ang) };
  const c = { x: P[152].x + down.x * f.fw * 0.85, y: P[152].y + down.y * f.fw * 0.85 };
  local(ctx, f, c, () => {
    ctx.scale(k * (1 + Math.sin(t * 3) * 0.02), k * (1 + Math.sin(t * 3) * 0.02));
    ctx.beginPath();
    ctx.moveTo(0, -0.27);
    ctx.quadraticCurveTo(0.2, -0.2, 0.3, -0.22);
    ctx.quadraticCurveTo(0.3, 0.08, 0, 0.3);
    ctx.quadraticCurveTo(-0.3, 0.08, -0.3, -0.22);
    ctx.quadraticCurveTo(-0.2, -0.2, 0, -0.27);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -0.27, 0, 0.3);
    g.addColorStop(0, '#FF3B3B'); g.addColorStop(1, '#B0001F');
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 0.09; ctx.stroke();
    ctx.strokeStyle = '#FFC933'; ctx.lineWidth = 0.045; ctx.stroke();
    ctx.fillStyle = g; ctx.fill();
    bolt(ctx, 0, 0.0, 0.42);
    sticker(ctx, '#FFD400', '#7A4B00', 0.012);
    ctx.scale(0.01, 0.01);                       // sub-pixel font sizes render unreliably; draw text at 100x
    ctx.font = '700 12px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#5A0010'; ctx.strokeText('TJ', 15, -14);
    ctx.fillStyle = '#FFFFFF'; ctx.fillText('TJ', 15, -14);
  }, 0.5);
}

// ───────────────────────────────────────────── backgrounds (static part cached per size)
const bgCache = new Map();
function seeded(n) { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function buildBg(id, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), rnd = seeded(id === 'city' ? 7 : 11), U = Math.max(W, H);
  if (id === 'city') {
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0B1033'); sky.addColorStop(0.55, '#3A1C6B'); sky.addColorStop(0.85, '#FF6A3D'); sky.addColorStop(1, '#FFB347');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; x.fillRect(rnd() * W, rnd() * H * 0.5, U * 0.002, U * 0.002); }
    x.beginPath(); x.arc(W * 0.8, H * 0.14, U * 0.05, 0, Math.PI * 2); x.fillStyle = '#FFF4D6'; x.fill();
    for (const [col, hMin, hMax, win] of [['#2A1F4D', 0.25, 0.55, 0.25], ['#17122E', 0.15, 0.4, 0.5]]) {
      let px = -U * 0.02;
      while (px < W) {
        const bw = U * (0.06 + rnd() * 0.08), bh = H * (hMin + rnd() * (hMax - hMin));
        x.fillStyle = col; x.fillRect(px, H - bh, bw, bh);
        const ws = U * 0.012;
        for (let wy = H - bh + ws; wy < H - ws; wy += ws * 2) for (let wx = px + ws * 0.8; wx < px + bw - ws; wx += ws * 1.8) {
          if (rnd() < win) { x.fillStyle = rnd() < 0.8 ? '#FFD66B' : '#7FE0FF'; x.fillRect(wx, wy, ws * 0.8, ws); }
        }
        px += bw + U * 0.004;
      }
    }
  } else {
    const sky = x.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, U * 0.8);
    sky.addColorStop(0, '#2A1559'); sky.addColorStop(1, '#050816');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    for (const [cx, cy, r, col] of [[0.2, 0.3, 0.35, 'rgba(255,79,163,.18)'], [0.85, 0.65, 0.3, 'rgba(37,181,255,.16)']]) {
      const g = x.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, U * r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 220; i++) { const s = U * (0.001 + rnd() * 0.003); x.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; x.beginPath(); x.arc(rnd() * W, rnd() * H, s, 0, Math.PI * 2); x.fill(); }
    // ringed planet
    const px = W * 0.15, py = H * 0.82, pr = U * 0.13;
    x.save(); x.translate(px, py); x.rotate(-0.35);
    x.beginPath(); x.ellipse(0, 0, pr * 1.9, pr * 0.45, 0, Math.PI, Math.PI * 2); x.strokeStyle = '#F6C177'; x.lineWidth = U * 0.012; x.stroke();
    const pg = x.createLinearGradient(-pr, -pr, pr, pr); pg.addColorStop(0, '#FFB86B'); pg.addColorStop(1, '#C2410C');
    x.beginPath(); x.arc(0, 0, pr, 0, Math.PI * 2); x.fillStyle = pg; x.fill();
    x.beginPath(); x.ellipse(0, 0, pr * 1.9, pr * 0.45, 0, 0, Math.PI); x.stroke();
    x.restore();
    // little blue world
    const eg = x.createRadialGradient(W * 0.86, H * 0.12, 0, W * 0.86, H * 0.12, U * 0.05);
    eg.addColorStop(0, '#7FD3FF'); eg.addColorStop(1, '#1F5FD1');
    x.beginPath(); x.arc(W * 0.86, H * 0.12, U * 0.05, 0, Math.PI * 2); x.fillStyle = eg; x.fill();
  }
  return c;
}
export function drawBackground(ctx, id, W, H, t) {
  const key = `${id}:${W}x${H}`;
  if (!bgCache.has(key)) { bgCache.clear(); bgCache.set(key, buildBg(id, W, H)); }
  ctx.drawImage(bgCache.get(key), 0, 0);
  const U = Math.max(W, H);
  ctx.save();
  if (id === 'city') {
    // two searchlights sweeping the sky
    ctx.globalCompositeOperation = 'lighter';
    for (const [bx, sp, ph] of [[0.25, 0.5, 0], [0.7, 0.4, 2]]) {
      const a = -Math.PI / 2 + Math.sin(t * sp + ph) * 0.45;
      ctx.save(); ctx.translate(W * bx, H); ctx.rotate(a + Math.PI / 2);
      const g = ctx.createLinearGradient(0, 0, 0, -U); g.addColorStop(0, 'rgba(255,250,200,.35)'); g.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.beginPath(); ctx.moveTo(-U * 0.01, 0); ctx.lineTo(-U * 0.09, -U); ctx.lineTo(U * 0.09, -U); ctx.lineTo(U * 0.01, 0); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
    }
  } else {
    // a shooting star every few seconds
    const cyc = (t % 5) / 1.2;
    if (cyc < 1) {
      const sx = W * (0.3 + cyc * 0.5), sy = H * (0.1 + cyc * 0.2);
      const g = ctx.createLinearGradient(sx, sy, sx - U * 0.12, sy - U * 0.05); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = U * 0.004; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - U * 0.12, sy - U * 0.05); ctx.stroke();
    }
  }
  ctx.restore();
}

// ───────────────────────────────────────────── compose
export function drawMask(ctx, f, id, k, t) {
  if (id === 'eye') heroMask(ctx, f, k);
  else if (id === 'robot') robotHelmet(ctx, f, k, t);
  else if (id === 'thunder') thunderHelmet(ctx, f, k);
  else if (id === 'dino') dinoHood(ctx, f, k, t);
}
