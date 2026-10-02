// gear.js — every mask, power and piece of hero gear, drawn in code onto the tracked face.
// All original designs (no Marvel/DC look-alikes) so the app can be hosted publicly.
// Units: most things draw in face-local space (origin at the eyes, rotated with the head, 1 = face width, -y up).
// Drawn in code (not sprites) on purpose: every piece is fitted to the real face — eyeholes to his eyes,
// helmets to his forehead and chin — which a flat picture can't do.

export const MASKS = [
  { id: 'eye', name: 'Hero Mask', line: 'm_eye' },
  { id: 'robot', name: 'Robot', line: 'm_robot' },
  { id: 'thunder', name: 'Thunder', line: 'm_thunder' },
  { id: 'dino', name: 'Dino Hood', line: 'm_dino' },
  { id: 'ninja', name: 'Ninja', line: 'm_ninja' },
  { id: 'astro', name: 'Astronaut', line: 'm_astro' },
  { id: 'lion', name: 'Lion', line: 'm_lion' },
  { id: 'knight', name: 'Knight', line: 'm_knight' },
];
export const POWERS = [
  { id: 'fire', name: 'Fire Breath', trigger: 'mouth', hint: '😮 → 🔥', line: 'p_fire', group: 'breath' },
  { id: 'ice', name: 'Ice Breath', trigger: 'mouth', hint: '😮 → ❄️', line: 'p_ice', group: 'breath' },
  { id: 'bubble', name: 'Bubbles', trigger: 'mouth', hint: '😮 → 🫧', line: 'p_bubble', group: 'breath' },
  { id: 'shout', name: 'Super Shout', trigger: 'mouth', hint: '😮 → 💥', line: 'p_shout', group: 'breath' },
  { id: 'laser', name: 'Laser Eyes', trigger: 'surprise', hint: '😲 → 🔴', line: 'p_laser' },
  { id: 'aura', name: 'Power Glow', trigger: null, line: 'p_aura' },
];
export const GEAR = [
  { id: 'cape', name: 'Cape', line: 'g_cape', behind: true },
  { id: 'wings', name: 'Wings', line: 'g_wings', behind: true },
  { id: 'badge', name: 'Badge', line: 'g_badge' },
  { id: 'city', name: 'Hero City', line: 'g_city', group: 'bg' },
  { id: 'space', name: 'Space', line: 'g_space', group: 'bg' },
  { id: 'dinoland', name: 'Dino Land', line: 'g_dino', group: 'bg' },
  { id: 'sky', name: 'Sky', line: 'g_sky', group: 'bg' },
];
export const DRAWERS = { masks: MASKS, powers: POWERS, gear: GEAR };
export const ALL = [...MASKS, ...POWERS, ...GEAR];

// The front camera is drawn mirrored; text has to be un-mirrored so "TJ" and "POW!" read the right way.
let MIRROR = false;
export function setMirror(m) { MIRROR = m; }

// ───────────────────────────────────────────── helpers
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const mid = (a, b) => lerp(a, b, 0.5);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const pxs = (ctx) => { const m = ctx.getTransform(); return Math.hypot(m.a, m.b); };   // device px per current unit

function local(ctx, f, anchor, fn, roll = 1) {
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(f.ang * roll);
  ctx.scale(f.fw, f.fw);
  fn();
  ctx.restore();
}
export function popIn(at, t) {
  const d = (t - at) / 0.5;
  if (d >= 1) return 1;
  if (d <= 0) return 0;
  return 1 - Math.pow(2, -10 * d) * Math.cos(d * Math.PI * 2.5);
}
// Sticker look on the current path: soft drop shadow onto the face, fat white outline, fill,
// a gloss/shade pass between y0..y1 (top catches light, bottom falls into shadow), then the keyline.
function sticker(ctx, fill, key, w, { rule = 'nonzero', y0 = null, y1 = null, shadow = true } = {}) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save();
  if (shadow) { const s = pxs(ctx); ctx.shadowColor = 'rgba(12,8,24,.45)'; ctx.shadowBlur = s * 0.045; ctx.shadowOffsetY = s * 0.022; }
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = w * 3; ctx.stroke();
  ctx.restore();
  ctx.fillStyle = fill; ctx.fill(rule);
  if (y0 !== null) {
    ctx.save(); ctx.clip(rule);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(0.35, 'rgba(255,255,255,0)');
    g.addColorStop(0.65, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)');
    ctx.fillStyle = g; ctx.fillRect(-5, y0, 10, y1 - y0);
    ctx.restore();
  }
  ctx.strokeStyle = key; ctx.lineWidth = w; ctx.stroke();
}
function metal(ctx, x0, y0, x1, y1, [a, b, c, d]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a); g.addColorStop(0.42, b); g.addColorStop(0.5, c); g.addColorStop(1, d);
  return g;
}
const STEEL = ['#FAFCFE', '#B7C2CF', '#E2E8EF', '#5E6B7B'];
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
function star4(ctx, x, y, r) {
  const k = r * 0.22;
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
}
function starPath(ctx, cx, cy, R, r, pts = 5) {
  for (let i = 0; i < pts * 2; i++) {
    const rad = i % 2 ? r : R, a = -Math.PI / 2 + (i * Math.PI) / pts;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
function shine(ctx, x, y, rx, ry, a = 0.5, rot = -0.4) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fill();
}
function rivet(ctx, x, y, r, col = '#DDE6F0') {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.5, col); g.addColorStop(1, '#5C6B80');
  ctx.fillStyle = g; ctx.fill();
}
function eyeGeom(f) {
  const P = f.P;
  const r = mid(P[33], P[133]), l = mid(P[263], P[362]);
  return { half: Math.hypot(l.x - r.x, l.y - r.y) / 2 / f.fw, ew: Math.hypot(P[133].x - P[33].x, P[133].y - P[33].y) / f.fw };
}
// Arch-shaped shell over the head with the face showing through (open at the bottom).
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
// Text that stays readable on the mirrored front camera. Draws centered at (x, y) in the current units.
function words(ctx, text, x, y, size, fill, stroke) {
  ctx.save();
  ctx.translate(x, y);
  if (MIRROR) ctx.scale(-1, 1);
  const s = size / 40; ctx.scale(s, s);           // draw at 40px; sub-pixel font sizes render unreliably
  ctx.font = '40px Bangers, Fredoka, Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 9; ctx.strokeStyle = stroke; ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0);
  ctx.restore();
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
    ctx.bezierCurveTo(h + 0.14, -0.14, h + 0.22, -0.16, h + 0.3, -0.2);
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
    g.addColorStop(0, '#FF4A4A'); g.addColorStop(1, '#B3001F');
    sticker(ctx, g, '#4A000D', 0.016, { rule: 'evenodd', y0: -0.2, y1: 0.15 });
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * h, 0, rx + 0.012, ry + 0.012, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(70,0,12,.55)'; ctx.lineWidth = 0.014; ctx.stroke();
    }
    // stitched seam just inside the top edge
    ctx.save(); ctx.setLineDash([0.018, 0.016]);
    ctx.beginPath(); ctx.moveTo(-h - 0.22, -0.15); ctx.bezierCurveTo(-h, -0.14, -0.1, -0.13, 0, -0.05);
    ctx.bezierCurveTo(0.1, -0.13, h, -0.14, h + 0.22, -0.15);
    ctx.strokeStyle = 'rgba(255,200,200,.6)'; ctx.lineWidth = 0.007; ctx.stroke(); ctx.restore();
    shine(ctx, -h - 0.13, -0.1, 0.06, 0.018, 0.6);
    shine(ctx, h + 0.04, -0.12, 0.04, 0.012, 0.45);
  });
}

function robotHelmet(ctx, f, k, t) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const top = -f.d10 - 0.34, brow = -f.d10 * 0.72;
    helmetShell(ctx, f, { top, low: 0.55 });
    sticker(ctx, metal(ctx, -0.6, top, 0.6, 0.5, ['#F7FAFD', '#C9D4E0', '#E8EEF5', '#6E7D8F']), '#1E2836', 0.02, { y0: top, y1: 0.55 });
    ctx.strokeStyle = 'rgba(30,40,54,.45)'; ctx.lineWidth = 0.01;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.5, -f.d10 * 0.3); ctx.quadraticCurveTo(s * 0.5, top + 0.1, s * 0.14, top + 0.03); ctx.stroke(); }
    ctx.beginPath(); ctx.roundRect(-0.075, top + 0.02, 0.15, brow - top - 0.02, 0.03);
    ctx.fillStyle = '#2E7BFF'; ctx.fill(); ctx.strokeStyle = '#123D8A'; ctx.lineWidth = 0.012; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-0.02, top + 0.06, 0.04, brow - top - 0.1, 0.02);
    ctx.fillStyle = 'rgba(160,220,255,.9)'; ctx.fill();
    for (let i = -3; i <= 3; i++) rivet(ctx, i * 0.12, brow - 0.045, 0.016);
    // visor: tinted glass with a scanning shimmer
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-0.56, -0.13, 1.12, 0.24, 0.1);
    const vg = ctx.createLinearGradient(0, -0.13, 0, 0.11);
    vg.addColorStop(0, 'rgba(120,240,255,.45)'); vg.addColorStop(1, 'rgba(20,140,220,.3)');
    ctx.fillStyle = vg; ctx.fill();
    ctx.clip();
    const sx = ((t * 0.6) % 1.6) - 0.8;
    const sg = ctx.createLinearGradient(sx - 0.15, 0, sx + 0.15, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.45)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg; ctx.fillRect(-0.6, -0.15, 1.2, 0.3);
    ctx.restore();
    ctx.beginPath(); ctx.roundRect(-0.56, -0.13, 1.12, 0.24, 0.1);
    ctx.strokeStyle = '#1E2836'; ctx.lineWidth = 0.022; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.46, -0.08); ctx.lineTo(-0.22, -0.08);
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.018; ctx.stroke();
    // ear pods with chasing lights
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * 0.62, 0.22, 0.095, 0, Math.PI * 2);
      sticker(ctx, metal(ctx, s * 0.55, 0.12, s * 0.7, 0.32, ['#5AA0FF', '#2E7BFF', '#7FB8FF', '#123D8A']), '#1E2836', 0.014, { shadow: false });
      for (let i = 0; i < 3; i++) {
        const on = Math.floor(t * 6) % 3 === i;
        ctx.beginPath(); ctx.arc(s * 0.62, 0.16 + i * 0.06, 0.016, 0, Math.PI * 2);
        ctx.fillStyle = on ? '#BFFFF0' : 'rgba(191,255,240,.25)'; ctx.fill();
      }
    }
    // antenna with a glowing light
    ctx.beginPath(); ctx.moveTo(0, top + 0.02); ctx.lineTo(0, top - 0.16);
    ctx.strokeStyle = '#1E2836'; ctx.lineWidth = 0.025; ctx.stroke();
    const blink = Math.floor(t * 2) % 2;
    ctx.save();
    ctx.shadowColor = blink ? '#FF3B3B' : '#3BFF7A'; ctx.shadowBlur = pxs(ctx) * 0.06;
    ctx.beginPath(); ctx.arc(0, top - 0.19, 0.05, 0, Math.PI * 2);
    ctx.fillStyle = blink ? '#FF3B3B' : '#3BFF7A'; ctx.fill();
    ctx.restore();
    shine(ctx, -0.015, top - 0.205, 0.015, 0.01, 0.9);
  });
}

function wing(ctx, s, flap = 0) {
  ctx.save();
  ctx.scale(s, 1);
  ctx.rotate(-flap);
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate(-0.35 - i * 0.28);
    ctx.beginPath();
    ctx.ellipse(0.17, 0, 0.19 - i * 0.025, 0.052, 0, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(0, -0.05, 0, 0.05);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#C9DCF2');
    sticker(ctx, g, '#4D5D75', 0.011, { shadow: i === 0 });
    ctx.beginPath(); ctx.moveTo(0.04, 0); ctx.lineTo(0.3 - i * 0.03, 0);
    ctx.strokeStyle = 'rgba(77,93,117,.4)'; ctx.lineWidth = 0.008; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function thunderHelmet(ctx, f, k, t) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const top = -f.d10 - 0.3;
    const flap = Math.sin(t * 5) * 0.06;
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 0.55, -f.d10 * 0.5); wing(ctx, s, flap); ctx.restore(); }
    helmetShell(ctx, f, { top, low: -0.02, side: 0.58, open: 0.46 });
    const g = ctx.createRadialGradient(-0.2, top + 0.12, 0.02, 0, top + 0.3, 0.9);
    g.addColorStop(0, '#FFF8C8'); g.addColorStop(0.35, '#FFD23F'); g.addColorStop(1, '#C27C00');
    sticker(ctx, g, '#6B3F00', 0.02, { y0: top, y1: 0 });
    ctx.beginPath(); ctx.moveTo(-0.58, -f.d10 * 0.42); ctx.quadraticCurveTo(0, -f.d10 * 0.62, 0.58, -f.d10 * 0.42);
    ctx.strokeStyle = '#B06A00'; ctx.lineWidth = 0.03; ctx.stroke();
    const by = (top - f.d10 * 0.72) / 2;
    ctx.save();
    ctx.shadowColor = '#7FD8FF'; ctx.shadowBlur = pxs(ctx) * (0.05 + 0.03 * Math.sin(t * 6));
    bolt(ctx, 0, by, 0.32); ctx.fillStyle = '#2E9BFF'; ctx.fill();
    ctx.restore();
    bolt(ctx, 0, by, 0.32); ctx.strokeStyle = '#0B2A66'; ctx.lineWidth = 0.014; ctx.stroke();
    shine(ctx, -0.28, top + 0.16, 0.09, 0.03, 0.55, -0.6);
    const { half } = eyeGeom(f);
    for (const s of [-1, 1]) {
      bolt(ctx, s * (half + 0.02), 0.2, 0.17);
      ctx.fillStyle = '#FFD400'; ctx.fill(); ctx.strokeStyle = '#7A4B00'; ctx.lineWidth = 0.01; ctx.stroke();
    }
  });
}

function dinoHood(ctx, f, k, t) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const top = -f.d10 - 0.42, brow = -f.d10 * 0.72;
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.32, x = Math.sin(a) * 0.5, y = top + 0.05 + (1 - Math.cos(a)) * 0.35;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a * 0.9);
      ctx.beginPath(); ctx.moveTo(-0.075, 0.02); ctx.quadraticCurveTo(-0.02, -0.08, 0, -0.16); ctx.quadraticCurveTo(0.02, -0.08, 0.075, 0.02); ctx.closePath();
      const sg = ctx.createLinearGradient(0, -0.16, 0, 0.02); sg.addColorStop(0, '#FFE04A'); sg.addColorStop(1, '#FF7A1A');
      sticker(ctx, sg, '#7A3500', 0.012, { shadow: false });
      ctx.restore();
    }
    helmetShell(ctx, f, { top, low: 0.6, side: 0.66, open: 0.45 });
    const g = ctx.createLinearGradient(0, top, 0, 0.6);
    g.addColorStop(0, '#8BEA6E'); g.addColorStop(1, '#259447');
    sticker(ctx, g, '#0B3F1C', 0.02, { y0: top, y1: 0.6 });
    // scales
    ctx.save(); helmetShell(ctx, f, { top, low: 0.6, side: 0.66, open: 0.45 }); ctx.clip();
    ctx.strokeStyle = 'rgba(11,63,28,.28)'; ctx.lineWidth = 0.012;
    for (let row = 0; row < 9; row++) for (let col = -6; col <= 6; col++) {
      const x = col * 0.11 + (row % 2) * 0.055, y = top + 0.12 + row * 0.09;
      ctx.beginPath(); ctx.arc(x, y, 0.045, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
    ctx.restore();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 0.07, brow - 0.07, 0.022, 0.014, s * 0.4, 0, Math.PI * 2); ctx.fillStyle = '#0B3F1C'; ctx.fill(); }
    for (let i = 0; i < 7; i++) {
      const x0 = -0.4 + i * (0.8 / 7), x1 = x0 + 0.8 / 7;
      ctx.beginPath(); ctx.moveTo(x0, brow); ctx.lineTo((x0 + x1) / 2, brow + 0.095); ctx.lineTo(x1, brow); ctx.closePath();
      const tg = ctx.createLinearGradient(0, brow, 0, brow + 0.095); tg.addColorStop(0, '#FFFFFF'); tg.addColorStop(1, '#E6E0CC');
      ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = '#0B3F1C'; ctx.lineWidth = 0.009; ctx.stroke();
    }
    // big cartoon eyes (blink, and look around)
    const blink = (t % 4) < 0.15 ? 0.15 : 1, look = Math.sin(t * 0.8) * 0.02;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 0.2, top + 0.2, 0.095, 0.095 * blink, 0, 0, Math.PI * 2);
      sticker(ctx, '#FFFFFF', '#0B3F1C', 0.014, { shadow: false });
      if (blink === 1) {
        ctx.beginPath(); ctx.arc(s * 0.2 + look, top + 0.21, 0.048, 0, Math.PI * 2); ctx.fillStyle = '#14161C'; ctx.fill();
        shine(ctx, s * 0.2 + look - 0.015, top + 0.19, 0.016, 0.013, 0.95);
      }
    }
    for (const [x, y, r] of [[-0.55, -0.05, 0.05], [0.55, 0.08, 0.06], [-0.56, 0.32, 0.04], [0.55, 0.36, 0.035]]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,224,74,.55)'; ctx.fill();
    }
  });
}

function ninjaHood(ctx, f, k, t) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const top = -f.d10 - 0.3;
    helmetShell(ctx, f, { top, low: f.dChin * 0.95, side: 0.6, open: 0.43 });
    const g = ctx.createLinearGradient(-0.6, top, 0.6, f.dChin);
    g.addColorStop(0, '#34477A'); g.addColorStop(1, '#141C33');
    sticker(ctx, g, '#070B17', 0.02, { y0: top, y1: f.dChin });
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 0.014;
    for (const s of [-1, 1]) for (const d of [0.08, 0.16]) {
      ctx.beginPath(); ctx.moveTo(s * (0.6 - d), f.dChin * 0.9); ctx.quadraticCurveTo(s * (0.62 - d), 0, s * (0.4 - d), top + 0.12); ctx.stroke();
    }
    // headband tails flutter off one side
    const kx = 0.56, ky = -f.d10 * 0.42;
    for (let i = 0; i < 2; i++) {
      const w = Math.sin(t * 7 + i) * 0.06, w2 = Math.sin(t * 7 + i + 1.4) * 0.08;
      ctx.beginPath();
      ctx.moveTo(kx, ky - 0.03);
      ctx.bezierCurveTo(kx + 0.15, ky - 0.05 + w + i * 0.06, kx + 0.28, ky + w2 + i * 0.1, kx + 0.42, ky + 0.02 + w2 + i * 0.14);
      ctx.lineTo(kx + 0.4, ky + 0.09 + w2 + i * 0.14);
      ctx.bezierCurveTo(kx + 0.26, ky + 0.07 + w2 + i * 0.1, kx + 0.14, ky + 0.06 + w + i * 0.06, kx, ky + 0.04);
      ctx.closePath();
      sticker(ctx, '#E3122C', '#5A0010', 0.012, { shadow: false });
    }
    ctx.beginPath();
    ctx.moveTo(-0.6, ky - 0.06); ctx.quadraticCurveTo(0, ky - 0.14, 0.6, ky - 0.06);
    ctx.lineTo(0.6, ky + 0.06); ctx.quadraticCurveTo(0, ky - 0.02, -0.6, ky + 0.06); ctx.closePath();
    sticker(ctx, '#E3122C', '#5A0010', 0.014, { y0: ky - 0.14, y1: ky + 0.06, shadow: false });
    ctx.beginPath(); ctx.arc(kx, ky, 0.05, 0, Math.PI * 2); ctx.fillStyle = '#B0001F'; ctx.fill();
    ctx.beginPath(); ctx.roundRect(-0.13, ky - 0.13, 0.26, 0.15, 0.03);
    sticker(ctx, metal(ctx, -0.13, ky - 0.13, 0.13, ky + 0.02, ['#F2F5F8', '#B8C2CE', '#DFE6EE', '#7A8796']), '#2B3440', 0.01, { shadow: false });
    ctx.beginPath(); starPath(ctx, 0, ky - 0.055, 0.05, 0.022);
    ctx.fillStyle = '#2B3440'; ctx.fill();
  });
}

function astroHelmet(ctx, f, k, t) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const cy = (f.dChin - f.d10) / 2 - 0.02, r = Math.max(0.8, (f.dChin + f.d10) / 2 + 0.3);
    const cyc = cy + r * 0.86;
    ctx.beginPath(); ctx.ellipse(0, cyc, r * 0.82, 0.13, 0, 0, Math.PI * 2);
    sticker(ctx, metal(ctx, 0, cyc - 0.13, 0, cyc + 0.13, ['#FFFFFF', '#E3E9F0', '#F4F7FA', '#9AA8B8']), '#3A4656', 0.018);
    for (const [x, c, i] of [[-0.3, '#FF3B3B', 0], [-0.18, '#3BFF7A', 1], [0.28, '#2E9BFF', 2]]) {
      const on = Math.floor(t * 2 + i) % 2 === 0;
      ctx.beginPath(); ctx.arc(x, cyc + 0.02, 0.028, 0, Math.PI * 2); ctx.fillStyle = on ? c : '#4A5566'; ctx.fill();
    }
    // glass bubble
    ctx.beginPath(); ctx.arc(0, cy, r, 0, Math.PI * 2);
    const gg = ctx.createRadialGradient(-r * 0.3, cy - r * 0.35, r * 0.1, 0, cy, r);
    gg.addColorStop(0, 'rgba(255,255,255,.12)'); gg.addColorStop(0.75, 'rgba(170,215,255,.10)'); gg.addColorStop(1, 'rgba(120,180,255,.35)');
    ctx.fillStyle = gg; ctx.fill();
    ctx.save(); ctx.shadowColor = 'rgba(12,8,24,.4)'; ctx.shadowBlur = pxs(ctx) * 0.05;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 0.05; ctx.stroke(); ctx.restore();
    ctx.strokeStyle = '#8796A8'; ctx.lineWidth = 0.014; ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, cy, r * 0.86, Math.PI * 1.08, Math.PI * 1.42);
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.045; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, cy, r * 0.86, Math.PI * 1.48, Math.PI * 1.55);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.045; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, cy, r * 0.88, Math.PI * 0.1, Math.PI * 0.28);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.beginPath(); star4(ctx, r * 0.45, cy - r * 0.62, 0.05 + 0.02 * Math.sin(t * 3)); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  });
}

function lionMane(ctx, f, k, t) {
  const P = f.P;
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const cy = (f.dChin - f.d10) / 2, rx = 0.6, ry = (f.dChin + f.d10) / 2 + 0.1;
    const sway = Math.sin(t * 2) * 0.01;
    for (const [outR, inR, n, rot, c0, c1] of [[0.42, 0.06, 16, 0, '#F09A2E', '#8E3F0A'], [0.27, 0.02, 14, 0.2, '#FFD36B', '#E07A1C']]) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a0 = ((i - 0.5) / n) * Math.PI * 2 + rot + sway * 3, a1 = (i / n) * Math.PI * 2 + rot + sway * 3;
        const ix = Math.cos(a0) * (rx + inR), iy = cy + Math.sin(a0) * (ry + inR);
        const ox = Math.cos(a1) * (rx + outR), oy = cy + Math.sin(a1) * (ry + outR);
        const cx1 = Math.cos(a1 - 0.18) * (rx + outR * 0.85), cy1 = cy + Math.sin(a1 - 0.18) * (ry + outR * 0.85);
        if (i === 0) ctx.moveTo(ix, iy); else ctx.quadraticCurveTo(cx1, cy1, ox, oy);
        const a2 = ((i + 0.5) / n) * Math.PI * 2 + rot + sway * 3;
        const cx2 = Math.cos(a1 + 0.12) * (rx + outR * 0.6), cy2 = cy + Math.sin(a1 + 0.12) * (ry + outR * 0.6);
        if (i < n) ctx.quadraticCurveTo(cx2, cy2, Math.cos(a2) * (rx + inR), cy + Math.sin(a2) * (ry + inR));
      }
      ctx.closePath();
      ctx.moveTo(rx - 0.02, cy); ctx.ellipse(0, cy, rx - 0.02, ry - 0.02, 0, 0, Math.PI * 2, true);   // keep the face clear
      const g = ctx.createRadialGradient(0, cy, rx * 0.8, 0, cy, rx + outR);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      sticker(ctx, g, '#5A2600', 0.012, { rule: 'evenodd', shadow: outR > 0.3 });
    }
    // round ears sit on top of the mane
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.arc(sd * 0.42, cy - ry - 0.06, 0.14, 0, Math.PI * 2);
      sticker(ctx, '#F0A040', '#5A2600', 0.014);
      ctx.beginPath(); ctx.arc(sd * 0.42, cy - ry - 0.05, 0.075, 0, Math.PI * 2); ctx.fillStyle = '#FFB3A0'; ctx.fill();
    }
    // hair strands
    ctx.strokeStyle = 'rgba(255,230,160,.4)'; ctx.lineWidth = 0.01; ctx.lineCap = 'round';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (rx + 0.04), cy + Math.sin(a) * (ry + 0.04));
      ctx.lineTo(Math.cos(a + 0.05) * (rx + 0.24), cy + Math.sin(a + 0.05) * (ry + 0.24)); ctx.stroke();
    }
  });
  local(ctx, f, P[4], () => {
    ctx.scale(k, k);
    ctx.beginPath(); ctx.moveTo(-0.07, -0.03); ctx.quadraticCurveTo(0, -0.06, 0.07, -0.03); ctx.quadraticCurveTo(0.03, 0.04, 0, 0.045); ctx.quadraticCurveTo(-0.03, 0.04, -0.07, -0.03); ctx.closePath();
    sticker(ctx, '#3A1E10', '#000000', 0.01, { shadow: false });
    shine(ctx, -0.02, -0.03, 0.02, 0.01, 0.7);
    ctx.fillStyle = '#3A1E10';
    for (const s of [-1, 1]) for (const [x, y] of [[0.12, 0.08], [0.17, 0.06], [0.15, 0.12]]) { ctx.beginPath(); ctx.arc(s * x, y, 0.011, 0, Math.PI * 2); ctx.fill(); }
  });
}

function knightHelmet(ctx, f, k, t) {
  local(ctx, f, f.eyes, () => {
    ctx.scale(k, k);
    const top = -f.d10 - 0.32, brow = -f.d10 * 0.72;
    const sway = Math.sin(t * 2.5) * 0.05;
    for (let i = 0; i < 6; i++) {
      const a = -1.9 + i * 0.26 + sway;
      ctx.save(); ctx.translate(0.02, top + 0.02); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(0, -0.3, 0.085, 0.32, 0, 0, Math.PI * 2);
      const pg = ctx.createLinearGradient(0, -0.62, 0, 0); pg.addColorStop(0, '#FF6B6B'); pg.addColorStop(1, '#B3001F');
      sticker(ctx, pg, '#5A0010', 0.01, { shadow: i === 0 });
      ctx.restore();
    }
    helmetShell(ctx, f, { top, low: f.dChin * 0.5, side: 0.6, open: 0.44 });
    sticker(ctx, metal(ctx, -0.6, top, 0.6, 0.5, STEEL), '#1E2836', 0.02, { y0: top, y1: f.dChin * 0.5 });
    ctx.beginPath(); ctx.moveTo(0, top + 0.02); ctx.lineTo(0, brow);
    ctx.strokeStyle = 'rgba(30,40,54,.5)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.6, brow + 0.02); ctx.quadraticCurveTo(0, brow - 0.07, 0.6, brow + 0.02);
    ctx.strokeStyle = '#8A97A8'; ctx.lineWidth = 0.05; ctx.stroke();
    for (let i = -4; i <= 4; i++) if (i) rivet(ctx, i * 0.13, brow - 0.01 - (1 - (i / 4) ** 2) * 0.03, 0.017);
    const nose = Math.hypot(f.P[4].x - f.eyes.x, f.P[4].y - f.eyes.y) / f.fw;
    ctx.beginPath(); ctx.moveTo(-0.045, brow); ctx.lineTo(0.045, brow); ctx.lineTo(0.035, nose - 0.02); ctx.quadraticCurveTo(0, nose + 0.03, -0.035, nose - 0.02); ctx.closePath();
    sticker(ctx, metal(ctx, -0.05, 0, 0.05, 0, STEEL), '#1E2836', 0.012);
    shine(ctx, -0.32, top + 0.18, 0.1, 0.03, 0.6, -0.7);
  });
}

// ───────────────────────────────────────────── powers
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
    fireHot: sprite([[0, 'rgba(255,255,225,1)'], [0.35, 'rgba(255,215,70,.9)'], [1, 'rgba(255,120,0,0)']]),
    fireWarm: sprite([[0, 'rgba(255,170,40,.95)'], [0.5, 'rgba(255,70,0,.6)'], [1, 'rgba(200,0,0,0)']]),
    smoke: sprite([[0, 'rgba(70,60,60,.45)'], [1, 'rgba(70,60,60,0)']]),
    ice: sprite([[0, 'rgba(225,248,255,.95)'], [0.3, 'rgba(120,210,255,.8)'], [1, 'rgba(30,120,255,0)']]),
    glow: sprite([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,80,80,.9)'], [1, 'rgba(255,0,0,0)']]),
    gold: sprite([[0, 'rgba(255,255,230,1)'], [0.3, 'rgba(255,220,80,.9)'], [1, 'rgba(255,180,0,0)']]),
  });
}

export function breathLevel(f) { return clamp01(((f.bs.jawOpen ?? 0) - 0.22) / 0.3); }
export function surpriseLevel(f) {
  const wide = ((f.bs.eyeWideLeft ?? 0) + (f.bs.eyeWideRight ?? 0)) / 2;
  return clamp01((Math.max(f.bs.browInnerUp ?? 0, wide * 1.3) - 0.28) / 0.25);
}

const SHOUT_WORDS = ['POW!', 'BOOM!', 'WHAM!', 'ZAP!', 'KAPOW!'];
// Breath powers pour out of the mouth. State lives on the face object.
export function updateBreath(f, kind, level, dt) {
  const fx = (f.fx ??= { parts: [], rings: [], words: [], ringT: 0, wordT: 0 });
  const P = f.P, m = mid(P[13], P[14]);
  const down = { x: -Math.sin(f.ang), y: Math.cos(f.ang) };
  const spray = (n, spreadW, spMin, spMax, extra) => {
    for (let i = 0; i < n; i++) {
      const spread = (Math.random() - 0.5) * spreadW, c = Math.cos(spread), s = Math.sin(spread);
      const dir = { x: down.x * c - down.y * s, y: down.x * s + down.y * c };
      const sp = f.fw * (spMin + Math.random() * (spMax - spMin)) * (0.6 + 0.4 * level);
      fx.parts.push({ x: m.x, y: m.y, vx: dir.x * sp, vy: dir.y * sp, age: 0, spin: Math.random() * 6, ...extra() });
    }
  };
  if (level > 0.05) {
    if (kind === 'fire') {
      spray(Math.round(4 * level), 0.9, 1.1, 1.9, () => ({ kind: 'fire', life: 0.7 + Math.random() * 0.4, r: f.fw * (0.05 + Math.random() * 0.04) }));
      if (Math.random() < 0.6 * level) spray(1, 1.6, 0.8, 2.2, () => ({ kind: 'ember', life: 0.9 + Math.random() * 0.6, r: f.fw * 0.012 }));
    } else if (kind === 'ice') {
      spray(Math.round(4 * level), 0.9, 1.1, 1.9, () => ({ kind: 'ice', life: 0.7 + Math.random() * 0.4, r: f.fw * (0.05 + Math.random() * 0.04) }));
    } else if (kind === 'bubble') {
      if (Math.random() < 0.45 * level + 0.1) spray(1, 1.4, 0.5, 0.9, () => ({ kind: 'bubble', life: 1.8 + Math.random() * 0.8, r: f.fw * (0.04 + Math.random() * 0.07), hue: Math.random() * 360 }));
    } else if (kind === 'shout') {
      fx.ringT -= dt;
      if (fx.ringT <= 0) { fx.rings.push({ x: m.x, y: m.y, age: 0, fw: f.fw }); fx.ringT = 0.13; }
      fx.wordT -= dt;
      if (fx.wordT <= 0) {
        const side = Math.random() < 0.5 ? -1 : 1;
        fx.words.push({ x: m.x + side * f.fw * (0.55 + Math.random() * 0.25), y: m.y + f.fw * (Math.random() * 0.3 - 0.1), age: 0, fw: f.fw, w: SHOUT_WORDS[Math.floor(Math.random() * SHOUT_WORDS.length)], rot: (Math.random() - 0.5) * 0.5 });
        fx.wordT = 0.75;
      }
    }
  }
  for (const p of fx.parts) {
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'bubble') { p.vx *= 0.96; p.vy = p.vy * 0.95 - f.fw * 0.5 * dt; p.x += Math.sin(p.age * 4 + p.spin) * f.fw * 0.15 * dt; }
    else { p.vx *= 0.97; p.vy *= 0.97; }
    if (p.kind === 'fire') p.vy -= f.fw * 0.6 * dt;
    if (p.kind === 'ember') p.vy -= f.fw * 1.4 * dt;
  }
  fx.parts = fx.parts.filter((p) => p.age < p.life).slice(-300);
  for (const r of fx.rings) r.age += dt;
  fx.rings = fx.rings.filter((r) => r.age < 0.7);
  for (const w of fx.words) w.age += dt;
  fx.words = fx.words.filter((w) => w.age < 0.9);
}
function burstPath(ctx, x, y, R, n = 12) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? R * 0.62 : R, a = (i * Math.PI) / n;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.8;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
export function drawBreath(ctx, f) {
  const fx = f.fx;
  if (!fx) return;
  const S = sprites();
  ctx.save();
  for (const p of fx.parts) {
    const u = p.age / p.life;
    if (p.kind === 'fire') {
      const size = p.r * (1 + u * 3.2);
      if (u > 0.6) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (1 - u) * 0.5; ctx.drawImage(S.smoke, p.x - size * 1.2, p.y - size * 1.2, size * 2.4, size * 2.4); }
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - u) * 0.9;
      ctx.drawImage(u < 0.35 ? S.fireHot : S.fireWarm, p.x - size, p.y - size, size * 2, size * 2);
    } else if (p.kind === 'ember') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - u;
      const s = p.r * 3; ctx.drawImage(S.fireHot, p.x - s, p.y - s, s * 2, s * 2);
    } else if (p.kind === 'ice') {
      const size = p.r * (1 + u * 3.2);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (1 - u) * 0.55;
      ctx.drawImage(S.ice, p.x - size, p.y - size, size * 2, size * 2);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  // snowflakes riding the ice breath
  for (const p of fx.parts) {
    if (p.kind !== 'ice' || p.spin < 4.2) continue;
    const u = p.age / p.life, s = p.r * (0.6 + u);
    ctx.globalAlpha = 1 - u;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin + u * 3);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, s * 0.18); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3, cx = Math.cos(a) * s, cy = Math.sin(a) * s;
      ctx.moveTo(-cx, -cy); ctx.lineTo(cx, cy);
      ctx.moveTo(cx * 0.6 - cy * 0.25, cy * 0.6 + cx * 0.25); ctx.lineTo(cx * 0.6, cy * 0.6); ctx.lineTo(cx * 0.6 + cy * 0.25, cy * 0.6 - cx * 0.25);
    }
    ctx.stroke(); ctx.restore();
  }
  // bubbles: soap-film sheen + highlight, a little pop ring at the end
  for (const p of fx.parts) {
    if (p.kind !== 'bubble') continue;
    const u = p.age / p.life, r = p.r * (0.7 + Math.min(1, u * 4) * 0.3);
    if (u > 0.93) { ctx.globalAlpha = (1 - u) * 10; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.4, 0, Math.PI * 2); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke(); continue; }
    ctx.globalAlpha = 0.9;
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.55, p.x, p.y, r);
    g.addColorStop(0, `hsla(${p.hue},90%,85%,.05)`); g.addColorStop(0.85, `hsla(${p.hue + 60},90%,75%,.35)`); g.addColorStop(1, `hsla(${p.hue + 120},90%,70%,.7)`);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(p.x - r * 0.35, p.y - r * 0.4, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
  }
  // shout: sound rings + comic words
  for (const r of fx.rings) {
    const u = r.age / 0.7, R = r.fw * (0.12 + u * 1.3);
    ctx.globalAlpha = (1 - u) * 0.9;
    ctx.beginPath(); ctx.ellipse(r.x, r.y + R * 0.25, R, R * 0.6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = u < 0.3 ? '#FFFFFF' : '#7FE0FF'; ctx.lineWidth = r.fw * 0.035 * (1 - u * 0.6); ctx.stroke();
  }
  for (const w of fx.words) {
    const u = w.age / 0.9, pop = u < 0.15 ? (u / 0.15) * 1.15 : u < 0.25 ? 1.15 - (u - 0.15) * 1.5 : 1;
    ctx.globalAlpha = u > 0.75 ? (1 - u) * 4 : 1;
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.rot); ctx.scale(pop, pop);
    burstPath(ctx, 0, 0, w.fw * 0.34);
    ctx.fillStyle = '#FFD400'; ctx.fill(); ctx.lineJoin = 'round'; ctx.strokeStyle = '#E3122C'; ctx.lineWidth = w.fw * 0.025; ctx.stroke();
    words(ctx, w.w, 0, w.fw * 0.01, w.fw * 0.2, '#E3122C', '#FFFFFF');
    ctx.restore();
  }
  ctx.restore();
}
// Hot (or icy) glow at the mouth while breath is coming out.
export function drawMouthGlow(ctx, f, kind, level) {
  if (level < 0.05 || (kind !== 'fire' && kind !== 'ice')) return;
  const P = f.P, m = mid(P[13], P[14]), S = sprites(), r = f.fw * 0.28 * level;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
  ctx.drawImage(kind === 'fire' ? S.fireHot : S.ice, m.x - r, m.y - r, r * 2, r * 2);
  ctx.restore();
}

export function drawLasers(ctx, f, level, t) {
  if (level < 0.05) return;
  const P = f.P, S = sprites(), lv = Math.min(1, level);
  const eyesMid = mid(P[33], P[263]);
  const fwd = { x: (P[4].x - eyesMid.x) / f.fw, y: (P[4].y - eyesMid.y) / f.fw };
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [iris, s] of [[468, -1], [473, 1]]) {
    const e = P[iris] || (s < 0 ? mid(P[33], P[133]) : mid(P[263], P[362]));
    const side = { x: Math.cos(f.ang) * s, y: Math.sin(f.ang) * s };
    let dx = fwd.x * 2.2 + side.x * 0.55, dy = Math.max(0.35, fwd.y * 1.6) + side.y * 0.55;
    const len = Math.hypot(dx, dy); dx /= len; dy /= len;
    const L = f.fw * 4 * lv, x2 = e.x + dx * L, y2 = e.y + dy * L;
    const flick = 0.8 + 0.2 * Math.sin(t * 40 + s), thick = Math.max(lv, level * 0.8);
    for (const [w, col] of [[0.11, 'rgba(255,30,30,.25)'], [0.06, 'rgba(255,60,60,.8)'], [0.02, 'rgba(255,255,255,.95)']]) {
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x2, y2);
      ctx.strokeStyle = col; ctx.lineWidth = f.fw * w * flick * thick; ctx.lineCap = 'round'; ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const u = (t * 2.5 + i / 3) % 1, px = e.x + dx * L * u, py = e.y + dy * L * u, g = f.fw * 0.08 * (1 - u * 0.5);
      ctx.drawImage(S.glow, px - g, py - g, g * 2, g * 2);
    }
    const g = f.fw * 0.24 * lv * flick;
    ctx.drawImage(S.glow, e.x - g, e.y - g, g * 2, g * 2);
    const ru = (t * 3) % 1;
    ctx.beginPath(); ctx.arc(e.x, e.y, f.fw * (0.05 + ru * 0.15), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,120,120,${0.7 * (1 - ru)})`; ctx.lineWidth = f.fw * 0.012; ctx.stroke();
  }
  ctx.restore();
}

// Rising sparkles around the head and shoulders (the glow itself comes from the body cut-out, in the app).
export function updateAuraSparks(f, on, dt) {
  const a = (f.aura ??= []);
  if (on && Math.random() < 0.7) {
    const ang = Math.PI * (0.9 + Math.random() * 1.2), R = f.fw * (0.75 + Math.random() * 0.35);
    a.push({ x: f.eyes.x + Math.cos(ang) * R * 1.3, y: f.eyes.y + Math.sin(ang) * R + f.fw * 0.5, age: 0, life: 1 + Math.random() * 0.6, s: f.fw * (0.02 + Math.random() * 0.025) });
  }
  for (const p of a) { p.age += dt; p.y -= f.fw * 0.5 * dt; }
  f.aura = a.filter((p) => p.age < p.life);
}
export function drawAuraSparks(ctx, f) {
  if (!f.aura?.length) return;
  const S = sprites();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of f.aura) {
    const u = p.age / p.life;
    ctx.globalAlpha = Math.sin(u * Math.PI);
    ctx.drawImage(S.gold, p.x - p.s * 2, p.y - p.s * 2, p.s * 4, p.s * 4);
    ctx.beginPath(); star4(ctx, p.x, p.y, p.s * 1.6); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  }
  ctx.restore();
}

// ───────────────────────────────────────────── gear
function neckOf(f) {
  const P = f.P, down = { x: -Math.sin(f.ang), y: Math.cos(f.ang) };
  return { x: P[152].x + down.x * f.fw * 0.22, y: P[152].y + down.y * f.fw * 0.22 };
}
// Cape and wings are drawn BEHIND the person (the app layers the cut-out person on top), so only the edges show.
export function drawCape(ctx, f, k, t, H) {
  const n = neckOf(f);
  local(ctx, f, n, () => {
    const L = Math.max(1.5, (H - n.y) / f.fw + 0.3);
    ctx.scale(k, 1);
    const wave = (x) => Math.sin(t * 2.2 + x * 3) * 0.07;
    const R = 2.3;
    ctx.beginPath();
    ctx.moveTo(-0.45, -0.1);
    ctx.bezierCurveTo(-1.5, 0.05, -2.0, 0.5, -R, L + wave(-R));
    for (let x = -R; x <= R; x += 0.46) ctx.lineTo(x, L + wave(x));
    ctx.bezierCurveTo(2.0, 0.5, 1.5, 0.05, 0.45, -0.1);
    ctx.closePath();
    const g = ctx.createLinearGradient(-R, 0, R, 0);
    g.addColorStop(0, '#7A0818'); g.addColorStop(0.25, '#E3122C'); g.addColorStop(0.5, '#B80D24'); g.addColorStop(0.75, '#E3122C'); g.addColorStop(1, '#7A0818');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#4A000D'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R, L + wave(-R) - 0.05);
    for (let x = -R; x <= R; x += 0.46) ctx.lineTo(x, L + wave(x) - 0.05);
    ctx.strokeStyle = '#FFC933'; ctx.lineWidth = 0.05; ctx.stroke();
    ctx.lineWidth = 0.06;
    for (const x of [-1.4, -0.7, 0.7, 1.4]) {
      ctx.beginPath(); ctx.moveTo(x * 0.5, 0.15); ctx.quadraticCurveTo(x * 1.1, L * 0.5, x * 1.4 + wave(x) * 2, L);
      ctx.strokeStyle = 'rgba(60,0,10,.35)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x * 0.5 + 0.08, 0.15); ctx.quadraticCurveTo(x * 1.1 + 0.08, L * 0.5, x * 1.4 + wave(x) * 2 + 0.1, L);
      ctx.strokeStyle = 'rgba(255,140,140,.18)'; ctx.stroke();
    }
  }, 0.5);
}
export function drawCapeClasps(ctx, f, k) {
  local(ctx, f, neckOf(f), () => {
    ctx.scale(k, k);
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * 0.36, -0.02, 0.075, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(s * 0.36 - 0.025, -0.045, 0, s * 0.36, -0.02, 0.075);
      g.addColorStop(0, '#FFF4C0'); g.addColorStop(0.5, '#FFC933'); g.addColorStop(1, '#B07800');
      sticker(ctx, g, '#6B4300', 0.014);
      bolt(ctx, s * 0.36, -0.02, 0.09); ctx.fillStyle = '#E3122C'; ctx.fill();
    }
  }, 0.5);
}
function wingShape(ctx, sc, scallops = 7) {
  // right wing from the shoulder root at (0,0): curved leading edge up to the tip, scalloped feather edge back
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(0.35 * sc, -0.75 * sc, 1.15 * sc, -1.0 * sc, 1.75 * sc, -0.72 * sc);
  const pts = [];
  for (let i = 0; i <= scallops; i++) {
    const u = i / scallops;
    pts.push({ x: (1.75 - 1.75 * u) * sc, y: (-0.72 + 0.95 * Math.sin(u * Math.PI * 0.62)) * sc + (u > 0.8 ? -(u - 0.8) * 0.9 * sc : 0) });
  }
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i], mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
    ctx.quadraticCurveTo(mx + 0.09 * sc, my + 0.16 * sc, p1.x, p1.y);
  }
  ctx.closePath();
}
function wingSet(ctx, s, t) {
  ctx.save(); ctx.scale(s, 1);
  ctx.rotate(-0.12 + Math.sin(t * 3) * 0.1);
  for (const [sc, c0, c1, n] of [[1, '#CFEAFF', '#3D8BFF', 7], [0.72, '#F2FAFF', '#7DB8FF', 6], [0.45, '#FFFFFF', '#BFE0FF', 5]]) {
    wingShape(ctx, sc, n);
    const g = ctx.createLinearGradient(0, -0.8 * sc, 1.6 * sc, 0.2 * sc); g.addColorStop(0, c0); g.addColorStop(1, c1);
    sticker(ctx, g, '#16336F', 0.016, { shadow: sc === 1 });
  }
  // feather quills
  ctx.strokeStyle = 'rgba(22,51,111,.35)'; ctx.lineWidth = 0.012; ctx.lineCap = 'round';
  for (let i = 1; i < 7; i++) {
    const u = i / 7, x = (1.75 - 1.75 * u), y = -0.72 + 0.95 * Math.sin(u * Math.PI * 0.62);
    ctx.beginPath(); ctx.moveTo(x * 0.6, y * 0.6 - 0.05); ctx.lineTo(x * 0.97, y * 0.97 + 0.08); ctx.stroke();
  }
  // gold leading edge
  ctx.beginPath(); ctx.moveTo(0.05, -0.05); ctx.bezierCurveTo(0.35, -0.75, 1.15, -1.0, 1.72, -0.72);
  ctx.strokeStyle = '#FFC933'; ctx.lineWidth = 0.035; ctx.stroke();
  ctx.restore();
}
export function drawWings(ctx, f, k, t) {
  local(ctx, f, neckOf(f), () => {
    ctx.scale(k, k);
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 0.35, 0.12); ctx.scale(1.35, 1.35); wingSet(ctx, s, t); ctx.restore(); }
  }, 0.5);
}
export function drawBadge(ctx, f, k, t) {
  const P = f.P, down = { x: -Math.sin(f.ang), y: Math.cos(f.ang) };
  const c = { x: P[152].x + down.x * f.fw * 0.85, y: P[152].y + down.y * f.fw * 0.85 };
  local(ctx, f, c, () => {
    const b = 1 + Math.sin(t * 3) * 0.02;
    ctx.scale(k * b, k * b);
    const shield = () => {
      ctx.beginPath();
      ctx.moveTo(0, -0.27);
      ctx.quadraticCurveTo(0.2, -0.2, 0.3, -0.22);
      ctx.quadraticCurveTo(0.3, 0.08, 0, 0.3);
      ctx.quadraticCurveTo(-0.3, 0.08, -0.3, -0.22);
      ctx.quadraticCurveTo(-0.2, -0.2, 0, -0.27);
      ctx.closePath();
    };
    shield();
    ctx.save(); ctx.shadowColor = 'rgba(12,8,24,.45)'; ctx.shadowBlur = pxs(ctx) * 0.05; ctx.shadowOffsetY = pxs(ctx) * 0.02;
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 0.09; ctx.stroke(); ctx.restore();
    ctx.strokeStyle = metal(ctx, -0.3, -0.27, 0.3, 0.3, ['#FFF4C0', '#FFC933', '#FFE680', '#A86F00']); ctx.lineWidth = 0.05; ctx.stroke();
    const g = ctx.createLinearGradient(0, -0.27, 0, 0.3);
    g.addColorStop(0, '#FF4A4A'); g.addColorStop(1, '#A3001C');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); shield(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-0.35, -0.3); ctx.lineTo(0.35, -0.3); ctx.lineTo(0.35, -0.12); ctx.quadraticCurveTo(0, -0.02, -0.35, -0.12); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.shadowColor = '#FFE45C'; ctx.shadowBlur = pxs(ctx) * (0.04 + 0.03 * Math.sin(t * 5));
    bolt(ctx, 0, 0.02, 0.42); ctx.fillStyle = '#FFD400'; ctx.fill(); ctx.restore();
    bolt(ctx, 0, 0.02, 0.42); ctx.strokeStyle = '#7A4B00'; ctx.lineWidth = 0.012; ctx.stroke();
    words(ctx, 'TJ', 0.15, -0.135, 0.13, '#FFFFFF', '#5A0010');
  }, 0.5);
}

// ───────────────────────────────────────────── backgrounds (static part cached per size)
const bgCache = new Map();
function seeded(n) { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function cloud(x, cx, cy, s, col = '#FFFFFF') {
  x.fillStyle = col;
  for (const [dx, dy, r] of [[0, 0, 0.5], [0.45, 0.1, 0.38], [-0.45, 0.12, 0.36], [0.2, -0.25, 0.4], [-0.2, -0.18, 0.34]]) {
    x.beginPath(); x.arc(cx + dx * s, cy + dy * s, r * s, 0, Math.PI * 2); x.fill();
  }
}
function palm(x, px, py, h, col) {
  x.strokeStyle = col; x.lineCap = 'round';
  x.lineWidth = h * 0.06;
  x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + h * 0.15, py - h * 0.5, px + h * 0.05, py - h); x.stroke();
  x.lineWidth = h * 0.05;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55, tx = px + h * 0.05, ty = py - h;
    x.beginPath(); x.moveTo(tx, ty);
    x.quadraticCurveTo(tx + Math.cos(a) * h * 0.4, ty + Math.sin(a) * h * 0.25 - h * 0.1, tx + Math.cos(a) * h * 0.55, ty + Math.sin(a) * h * 0.2 + h * 0.15);
    x.stroke();
  }
}
function buildBg(id, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), rnd = seeded({ city: 7, space: 11, dinoland: 23, sky: 31 }[id] || 5), U = Math.max(W, H);
  if (id === 'city') {
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0B1033'); sky.addColorStop(0.55, '#3A1C6B'); sky.addColorStop(0.85, '#FF6A3D'); sky.addColorStop(1, '#FFB347');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`; x.fillRect(rnd() * W, rnd() * H * 0.5, U * 0.002, U * 0.002); }
    const mg = x.createRadialGradient(W * 0.8, H * 0.14, 0, W * 0.8, H * 0.14, U * 0.12);
    mg.addColorStop(0, 'rgba(255,244,214,.5)'); mg.addColorStop(1, 'rgba(255,244,214,0)');
    x.fillStyle = mg; x.fillRect(0, 0, W, H);
    x.beginPath(); x.arc(W * 0.8, H * 0.14, U * 0.05, 0, Math.PI * 2); x.fillStyle = '#FFF4D6'; x.fill();
    x.beginPath(); x.arc(W * 0.79, H * 0.13, U * 0.01, 0, Math.PI * 2); x.arc(W * 0.815, H * 0.155, U * 0.007, 0, Math.PI * 2); x.fillStyle = 'rgba(220,200,160,.5)'; x.fill();
    for (const [col, hMin, hMax, win, fog] of [['#2A1F4D', 0.25, 0.55, 0.25, true], ['#17122E', 0.15, 0.4, 0.5, false]]) {
      let px = -U * 0.02;
      while (px < W) {
        const bw = U * (0.06 + rnd() * 0.08), bh = H * (hMin + rnd() * (hMax - hMin));
        x.fillStyle = col; x.fillRect(px, H - bh, bw, bh);
        if (rnd() < 0.3) x.fillRect(px + bw * 0.45, H - bh - U * 0.04, U * 0.004, U * 0.04);
        if (rnd() < 0.2) x.fillRect(px + bw * 0.2, H - bh - U * 0.025, bw * 0.3, U * 0.025);
        const ws = U * 0.012;
        for (let wy = H - bh + ws; wy < H - ws; wy += ws * 2) for (let wx = px + ws * 0.8; wx < px + bw - ws; wx += ws * 1.8) {
          if (rnd() < win) { x.fillStyle = rnd() < 0.8 ? '#FFD66B' : '#7FE0FF'; x.fillRect(wx, wy, ws * 0.8, ws); }
        }
        px += bw + U * 0.004;
      }
      if (fog) { const fg = x.createLinearGradient(0, H * 0.5, 0, H); fg.addColorStop(0, 'rgba(255,120,80,0)'); fg.addColorStop(1, 'rgba(255,120,80,.25)'); x.fillStyle = fg; x.fillRect(0, H * 0.5, W, H * 0.5); }
    }
  } else if (id === 'space') {
    const sky = x.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, U * 0.8);
    sky.addColorStop(0, '#2A1559'); sky.addColorStop(1, '#050816');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    for (const [cx, cy, r, col] of [[0.2, 0.3, 0.38, 'rgba(255,79,163,.2)'], [0.85, 0.65, 0.32, 'rgba(37,181,255,.18)'], [0.6, 0.15, 0.25, 'rgba(160,90,255,.18)']]) {
      const g = x.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, U * r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 260; i++) { const s = U * (0.001 + rnd() * 0.003); x.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`; x.beginPath(); x.arc(rnd() * W, rnd() * H, s, 0, Math.PI * 2); x.fill(); }
    const px = W * 0.15, py = H * 0.82, pr = U * 0.13;
    x.save(); x.translate(px, py); x.rotate(-0.35);
    x.beginPath(); x.ellipse(0, 0, pr * 1.9, pr * 0.45, 0, Math.PI, Math.PI * 2); x.strokeStyle = '#F6C177'; x.lineWidth = U * 0.012; x.stroke();
    const pg = x.createRadialGradient(-pr * 0.4, -pr * 0.4, pr * 0.1, 0, 0, pr); pg.addColorStop(0, '#FFD08A'); pg.addColorStop(0.6, '#F08A3C'); pg.addColorStop(1, '#8A2A06');
    x.beginPath(); x.arc(0, 0, pr, 0, Math.PI * 2); x.fillStyle = pg; x.fill();
    x.save(); x.clip(); x.strokeStyle = 'rgba(120,40,0,.25)'; x.lineWidth = pr * 0.08;
    for (const yy of [-0.4, -0.1, 0.25, 0.55]) { x.beginPath(); x.moveTo(-pr, yy * pr); x.quadraticCurveTo(0, yy * pr + pr * 0.1, pr, yy * pr); x.stroke(); }
    x.restore();
    x.beginPath(); x.ellipse(0, 0, pr * 1.9, pr * 0.45, 0, 0, Math.PI); x.strokeStyle = '#F6C177'; x.lineWidth = U * 0.012; x.stroke();
    x.restore();
    const eg = x.createRadialGradient(W * 0.85, H * 0.11, 0, W * 0.86, H * 0.12, U * 0.05);
    eg.addColorStop(0, '#9FE0FF'); eg.addColorStop(0.7, '#1F5FD1'); eg.addColorStop(1, '#0B2A66');
    x.beginPath(); x.arc(W * 0.86, H * 0.12, U * 0.05, 0, Math.PI * 2); x.fillStyle = eg; x.fill();
    x.fillStyle = 'rgba(80,200,120,.7)';
    x.beginPath(); x.ellipse(W * 0.85, H * 0.11, U * 0.018, U * 0.012, 0.5, 0, Math.PI * 2); x.fill();
  } else if (id === 'dinoland') {
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#FF9A5A'); sky.addColorStop(0.5, '#FFC98A'); sky.addColorStop(1, '#FFE3B0');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    x.beginPath(); x.arc(W * 0.2, H * 0.2, U * 0.07, 0, Math.PI * 2); x.fillStyle = 'rgba(255,240,200,.9)'; x.fill();
    const vx = W * 0.68, vy = H * 0.62, vw = U * 0.35, vt = H * 0.28;
    x.beginPath(); x.moveTo(vx - vw, vy + H * 0.1); x.lineTo(vx - vw * 0.18, vt); x.lineTo(vx + vw * 0.18, vt); x.lineTo(vx + vw, vy + H * 0.1); x.closePath();
    const vg = x.createLinearGradient(vx - vw, 0, vx + vw, 0); vg.addColorStop(0, '#7A3E5A'); vg.addColorStop(0.5, '#5A2A48'); vg.addColorStop(1, '#3A1A34');
    x.fillStyle = vg; x.fill();
    x.fillStyle = '#FF5A1F';
    for (const [dx, len] of [[-0.06, 0.12], [0.05, 0.2], [0.12, 0.09]]) {
      const lx = vx + dx * vw;
      x.beginPath(); x.moveTo(lx - U * 0.012, vt); x.quadraticCurveTo(lx, vt + H * len * 0.5, vx + dx * vw * 1.6, vt + H * len);
      x.lineTo(vx + dx * vw * 1.6 + U * 0.01, vt + H * len); x.quadraticCurveTo(lx + U * 0.012, vt + H * len * 0.4, lx + U * 0.012, vt); x.fill();
    }
    x.fillStyle = '#5E9C5A';
    x.beginPath(); x.moveTo(0, H * 0.72);
    for (let i = 0; i < 8; i++) x.quadraticCurveTo(W * (i + 0.5) / 8, H * (0.66 + rnd() * 0.05), W * (i + 1) / 8, H * 0.72);
    x.lineTo(W, H); x.lineTo(0, H); x.fill();
    const dx = W * 0.18, dy = H * 0.7, ds = U * 0.09;
    x.fillStyle = '#3E6E46'; x.strokeStyle = '#3E6E46'; x.lineCap = 'round';
    x.beginPath(); x.ellipse(dx, dy, ds * 0.9, ds * 0.4, 0, 0, Math.PI * 2); x.fill();
    x.lineWidth = ds * 0.22;
    x.beginPath(); x.moveTo(dx + ds * 0.6, dy - ds * 0.1); x.quadraticCurveTo(dx + ds * 1.1, dy - ds * 0.8, dx + ds * 1.0, dy - ds * 1.5); x.stroke();
    x.lineWidth = ds * 0.14;
    x.beginPath(); x.moveTo(dx - ds * 0.7, dy); x.quadraticCurveTo(dx - ds * 1.4, dy + ds * 0.1, dx - ds * 1.7, dy - ds * 0.2); x.stroke();
    x.beginPath(); x.ellipse(dx + ds * 1.05, dy - ds * 1.55, ds * 0.22, ds * 0.12, -0.3, 0, Math.PI * 2); x.fill();
    for (const lx of [-0.4, -0.1, 0.25, 0.5]) x.fillRect(dx + lx * ds, dy + ds * 0.2, ds * 0.14, ds * 0.45);
    const gg = x.createLinearGradient(0, H * 0.78, 0, H); gg.addColorStop(0, '#3F8A3C'); gg.addColorStop(1, '#1F5A2A');
    x.fillStyle = gg; x.beginPath(); x.moveTo(0, H * 0.82);
    for (let i = 0; i < 10; i++) x.quadraticCurveTo(W * (i + 0.5) / 10, H * (0.77 + rnd() * 0.04), W * (i + 1) / 10, H * 0.82);
    x.lineTo(W, H); x.lineTo(0, H); x.fill();
    palm(x, W * 0.06, H * 0.9, H * 0.38, '#1F4A26');
    palm(x, W * 0.94, H * 0.92, H * 0.42, '#1F4A26');
    palm(x, W * 0.85, H * 0.86, H * 0.26, '#2E6A34');
  } else if (id === 'sky') {
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1E6FE8'); sky.addColorStop(0.6, '#5AB4FF'); sky.addColorStop(1, '#BFE6FF');
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    const sg = x.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, U * 0.25);
    sg.addColorStop(0, 'rgba(255,250,210,1)'); sg.addColorStop(0.15, 'rgba(255,240,170,.9)'); sg.addColorStop(1, 'rgba(255,240,170,0)');
    x.fillStyle = sg; x.fillRect(0, 0, W, H);
  }
  return c;
}
export function drawBackground(ctx, id, W, H, t) {
  const key = `${id}:${W}x${H}`;
  if (!bgCache.has(key)) { if (bgCache.size > 8) bgCache.clear(); bgCache.set(key, buildBg(id, W, H)); }
  ctx.drawImage(bgCache.get(key), 0, 0);
  const U = Math.max(W, H);
  ctx.save();
  if (id === 'city') {
    ctx.globalCompositeOperation = 'lighter';
    for (const [bx, sp, ph] of [[0.25, 0.5, 0], [0.7, 0.4, 2]]) {
      const a = -Math.PI / 2 + Math.sin(t * sp + ph) * 0.45;
      ctx.save(); ctx.translate(W * bx, H); ctx.rotate(a + Math.PI / 2);
      const g = ctx.createLinearGradient(0, 0, 0, -U); g.addColorStop(0, 'rgba(255,250,200,.35)'); g.addColorStop(1, 'rgba(255,250,200,0)');
      ctx.beginPath(); ctx.moveTo(-U * 0.01, 0); ctx.lineTo(-U * 0.09, -U); ctx.lineTo(U * 0.09, -U); ctx.lineTo(U * 0.01, 0); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.restore();
    }
    // the TJ signal shining on the clouds
    ctx.globalCompositeOperation = 'source-over';
    const sx = W * 0.3, sy = H * 0.16, sr = U * 0.07 * (0.97 + 0.03 * Math.sin(t * 2));
    ctx.beginPath(); ctx.ellipse(sx, sy, sr * 1.3, sr, 0, 0, Math.PI * 2);
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 1.3); sg.addColorStop(0, 'rgba(255,250,200,.85)'); sg.addColorStop(1, 'rgba(255,250,200,.15)');
    ctx.fillStyle = sg; ctx.fill();
    bolt(ctx, sx, sy, sr * 1.4); ctx.fillStyle = 'rgba(20,16,50,.85)'; ctx.fill();
    if (Math.floor(t * 1.5) % 2) for (const bx of [0.12, 0.47, 0.9]) { ctx.beginPath(); ctx.arc(W * bx, H * 0.48, U * 0.004, 0, Math.PI * 2); ctx.fillStyle = '#FF3B3B'; ctx.fill(); }
  } else if (id === 'space') {
    const cyc = (t % 5) / 1.2;
    if (cyc < 1) {
      const sx = W * (0.3 + cyc * 0.5), sy = H * (0.1 + cyc * 0.2);
      const g = ctx.createLinearGradient(sx, sy, sx - U * 0.12, sy - U * 0.05); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = U * 0.004; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - U * 0.12, sy - U * 0.05); ctx.stroke();
    }
    const rnd = seeded(99);
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = rnd() * H, tw = Math.max(0, Math.sin(t * 2 + i * 1.7));
      ctx.globalAlpha = tw; ctx.beginPath(); star4(ctx, x, y, U * 0.008 * tw + 0.01); ctx.fill();
    }
  } else if (id === 'dinoland') {
    const vx = W * 0.68, vt = H * 0.28;
    ctx.fillStyle = '#6E6470';
    for (let i = 0; i < 5; i++) {
      const u = (t * 0.25 + i / 5) % 1;
      ctx.globalAlpha = (1 - u) * 0.75;
      ctx.beginPath(); ctx.arc(vx + Math.sin(u * 3 + i) * U * 0.03, vt - u * H * 0.3, U * (0.03 + u * 0.06), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const lg = ctx.createRadialGradient(vx, vt, 0, vx, vt, U * 0.06);
    lg.addColorStop(0, `rgba(255,140,40,${0.8 + 0.2 * Math.sin(t * 4)})`); lg.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(vx - U * 0.06, vt - U * 0.06, U * 0.12, U * 0.12);
    // a pterodactyl gliding across
    const px = ((t * 0.08) % 1.3 - 0.15) * W, py = H * 0.15 + Math.sin(t * 1.2) * H * 0.02, ps = U * 0.035, flap = Math.sin(t * 5) * 0.4;
    ctx.fillStyle = '#3A2A3E';
    ctx.beginPath(); ctx.moveTo(px - ps * 1.4, py - ps * flap); ctx.quadraticCurveTo(px - ps * 0.5, py - ps * 0.3, px, py); ctx.quadraticCurveTo(px + ps * 0.5, py - ps * 0.3, px + ps * 1.4, py - ps * flap);
    ctx.quadraticCurveTo(px + ps * 0.4, py + ps * 0.1, px, py + ps * 0.15); ctx.quadraticCurveTo(px - ps * 0.4, py + ps * 0.1, px - ps * 1.4, py - ps * flap); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px + ps * 0.1, py); ctx.lineTo(px + ps * 0.6, py - ps * 0.15); ctx.lineTo(px + ps * 0.15, py + ps * 0.08); ctx.fill();
  } else if (id === 'sky') {
    // flying: clouds rush past in three layers, plus speed streaks
    const rnd = seeded(77);
    for (const [speed, size, col] of [[0.25, 0.06, 'rgba(255,255,255,.7)'], [0.55, 0.1, 'rgba(255,255,255,.9)'], [1.0, 0.16, '#FFFFFF']]) {
      for (let i = 0; i < 4; i++) {
        const base = rnd(), y = H * (0.1 + rnd() * 0.85);
        const xx = (((base - t * speed * 0.25) % 1) + 1) % 1;
        cloud(ctx, xx * (W + U * size * 2) - U * size, y, U * size, col);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineCap = 'round'; ctx.lineWidth = U * 0.003;
    for (let i = 0; i < 10; i++) {
      const y = H * ((i * 0.137 + 0.05) % 1), xx = ((((rnd() - t * 1.6) % 1) + 1) % 1) * W;
      ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx + U * 0.12, y); ctx.stroke();
    }
  }
  ctx.restore();
}

// ───────────────────────────────────────────── compose
export function drawMask(ctx, f, id, k, t) {
  if (id === 'eye') heroMask(ctx, f, k);
  else if (id === 'robot') robotHelmet(ctx, f, k, t);
  else if (id === 'thunder') thunderHelmet(ctx, f, k, t);
  else if (id === 'dino') dinoHood(ctx, f, k, t);
  else if (id === 'ninja') ninjaHood(ctx, f, k, t);
  else if (id === 'astro') astroHelmet(ctx, f, k, t);
  else if (id === 'lion') lionMane(ctx, f, k, t);
  else if (id === 'knight') knightHelmet(ctx, f, k, t);
}
