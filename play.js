// play.js — the hand powers, the Star Storm, the two-hero combos and the big comic words.
// Called once per frame from app.js with everything it needs (no state of its own except the fireballs,
// magic trails and words, which live on `G`).
import { K } from './gpufx.js';
import { TIPS } from './hands.js';
import * as sfx from './sfx.js';

export const G = { balls: [], trails: new Map(), words: [], handled: new Map(), shakeUntil: 0, shakeAmp: 0, frostKick: 0 };
const TWO_PI = Math.PI * 2;
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
// player colours: 1 = sky blue, 2 = hot pink (matches the player buttons)
export const PLAYER_HUE = [0.56, 0.9];
export const PLAYER_CSS = ['#25B5FF', '#FF5FA8'];

export function shake(now, ms, amp) { G.shakeUntil = Math.max(G.shakeUntil, now + ms); G.shakeAmp = Math.max(G.shakeAmp * (G.shakeUntil > now ? 1 : 0), amp); }
export function shakeOffset(now) {
  if (now > G.shakeUntil) { G.shakeAmp = 0; return null; }
  const a = G.shakeAmp * Math.min(1, (G.shakeUntil - now) / 250);
  return { x: (Math.random() - 0.5) * a, y: (Math.random() - 0.5) * a };
}
export function bigWord(text, x, y, size, color = '#FFD400', edge = '#E3122C') { G.words.push({ text, x, y, size, age: 0, color, edge, rot: (Math.random() - 0.5) * 0.2 }); if (G.words.length > 6) G.words.shift(); }

// ───────────────────────────────────────────── per hand
// c = { engine, gfx, W, H, t, dt, now, ripple(x, y, str), fire(player) }
export function handPower(c, h, power) {
  const { engine, gfx, H, t, dt, now } = c;
  const palm = h.palm, sz = h.size, up = { x: palm.x, y: H - palm.y };
  const tip = (i) => h.P[TIPS[i]];
  // which way the fingers point (wrist → middle fingertip), y-up
  const fd = { x: h.P[12].x - h.P[0].x, y: -(h.P[12].y - h.P[0].y) }, fl = Math.hypot(fd.x, fd.y) || 1;
  fd.x /= fl; fd.y /= fl;
  const fresh = (key) => { const at = h[key]; const seen = G.handled.get(h.id + key) || 0; if (at && at > seen) { G.handled.set(h.id + key, at); return true; } return false; };
  const level = { lv: 0, loop: null };

  if (power === 'blast') {
    const color = [0.35, 0.8, 2.2];
    engine.palmOrb(h, h.fist ? 0.8 : h.open, h.fist ? h.charge : 0, t, color);
    if (gfx) {
      gfx.field({ x: up.x, y: up.y, radius: sz * 2.5, strength: 1, swirl: 2.2, kind: 1 });
      gfx.emit({ x: up.x, y: up.y, dx: 1, dy: 0, spread: TWO_PI, speed: sz * 0.6, life: 0.7, size: sz * 0.07, kind: K.ENERGY, jitter: sz * (h.fist ? 2.2 : 1.3), hue: 0.55 }, (h.fist ? 1600 : 350) * dt);
    }
    if (h.fist && h.charge > 0.2) level.lv = 0.4 + h.charge * 0.6, level.loop = 'crackle';
    if (fresh('blastAt')) {
      const pow = 0.5 + 0.5 * (h.blastPower ?? 1);
      c.ripple(palm.x, palm.y, pow);
      shake(now, 380, 0.012 * pow);
      engine.boom(palm, sz * 0.9, [1.0, 1.8, 2.6], 60);
      gfx?.emit({ x: up.x, y: up.y, dx: 1, dy: 0, spread: TWO_PI, speed: sz * 13 * pow, life: 1.0, size: sz * 0.08, kind: K.BURST, hue: 0.55 }, 6000 * pow);
      gfx?.emit({ x: up.x, y: up.y, dx: fd.x, dy: fd.y, spread: 0.5, speed: sz * 22, life: 0.7, size: sz * 0.1, kind: K.BURST, hue: 0.5 }, 2500 * pow);
      bigWord(['BLAM!', 'KABOOM!', 'ZOOM!', 'POW!'][Math.floor(Math.random() * 4)], palm.x, palm.y - sz * 1.6, sz * 1.2);
      sfx.boom();
      c.fire(h.player);
    }
  } else if (power === 'fireball') {
    if (h.open > 0.3) {
      engine.fireball(palm, sz * 0.22 * h.open);
      for (let i = 1; i < 5; i++) {
        const p = tip(i);
        if (gfx) gfx.emit({ x: p.x, y: H - p.y, dx: 0, dy: 1, spread: 0.6, speed: sz * 1.5, life: 0.6, size: sz * 0.09, kind: K.FIRE, jitter: sz * 0.08 }, 320 * dt * h.open);
        else if (Math.random() < 0.5) engine.fx.fire.spawn({ x: p.x, y: H - p.y, vx: 0, vy: sz * 2.5, age: 0, life: 0.45, size0: sz * 0.25, size1: sz * 0.05, drag: 0.96, color: (u) => (u < 0.3 ? [2.4, 1.5, 0.5] : [1.5, 0.35, 0.06]), alpha: (u) => (1 - u) * 0.5 });
      }
      level.lv = 0.25 * h.open; level.loop = 'fire';
    }
    if (fresh('throwAt') || fresh('blastAt')) {
      const v = h.throwVel && now - h.throwAt < 100 ? h.throwVel : { x: (Math.random() - 0.5) * sz * 4, y: -sz * 14 };
      const sp = Math.hypot(v.x, v.y) || 1, k = Math.min(1.4, Math.max(0.9, (sz * 16) / sp));
      G.balls.push({ x: palm.x, y: palm.y, vx: v.x * k, vy: v.y * k, r: sz * 0.42, age: 0, player: h.player });
      sfx.whoosh();
      c.fire(h.player);
    }
  } else if (power === 'zap') {
    const seed = Math.floor(t * 6) + h.id * 97;
    if (h.open > 0.35) {
      for (let i = 0; i < 4; i++) engine.arc(tip(i), tip(i + 1), sz * 0.07, [0.4, 0.6, 2.2], seed + i);
      for (let i = 1; i < 5; i += 2) engine.arc(tip(i), palm, sz * 0.06, [0.4, 0.6, 2.2], seed + 10 + i);
      if (gfx) for (let i = 0; i < 5; i++) { const p = tip(i); gfx.emit({ x: p.x, y: H - p.y, dx: 0, dy: 1, spread: TWO_PI, speed: sz * 3, life: 0.5, size: sz * 0.05, kind: K.SPARK }, 90 * dt); }
      level.lv = 0.35 + 0.4 * h.open; level.loop = 'crackle';
    } else engine.palmOrb(h, 0.35, Math.max(0.4, h.charge), t, [0.5, 0.65, 2.4]);
    if (h.gesture === 'Pointing_Up') {
      const p = tip(1);
      engine.arc(p, { x: p.x + (Math.random() - 0.5) * sz, y: -10 }, sz * 0.18, [0.4, 0.6, 2.2], seed + 50, 0.18, 6);
      level.lv = 1;
    }
    if (fresh('blastAt')) { c.ripple(palm.x, palm.y, 0.7); engine.boom(palm, sz * 0.7, [1.2, 1.6, 2.6]); gfx?.emit({ x: up.x, y: up.y, spread: TWO_PI, speed: sz * 10, life: 0.7, size: sz * 0.06, kind: K.SPARK }, 2500); sfx.zap(); c.fire(h.player); }
  } else if (power === 'frosthand') {
    if (h.open > 0.35) {
      if (gfx) gfx.emit({ x: up.x + fd.x * sz * 0.8, y: up.y + fd.y * sz * 0.8, dx: fd.x, dy: fd.y, spread: 0.8, speed: sz * 5, life: 0.9, size: sz * 0.16, kind: K.ICE, jitter: sz * 0.3 }, 2200 * dt * h.open);
      else engine.fx.ice.spawn({ x: up.x, y: up.y, vx: fd.x * sz * 4, vy: fd.y * sz * 4, age: 0, life: 0.7, size0: sz * 0.3, size1: sz * 1.2, drag: 0.95, color: (u) => (u < 0.3 ? [0.5, 0.85, 1.0] : [0.15, 0.45, 1.0]), alpha: (u) => (1 - u) * 0.3 });
      if (Math.random() < 0.5) engine.fx.flake.spawn({ x: up.x, y: up.y, vx: fd.x * sz * (2 + Math.random() * 3) + (Math.random() - 0.5) * sz * 2, vy: fd.y * sz * (2 + Math.random() * 3), age: 0, life: 1.1, size0: sz * 0.25, size1: sz * 0.1, grav: -sz * 0.6, drag: 0.97, color: () => [1.6, 1.9, 2.2] });
      level.lv = 0.5 * h.open; level.loop = 'ice';
    }
    if (fresh('blastAt')) {
      G.frostKick = 1;
      c.ripple(palm.x, palm.y, 0.6);
      gfx?.emit({ x: up.x, y: up.y, spread: TWO_PI, speed: sz * 12, life: 1.1, size: sz * 0.09, kind: K.BURST, hue: 0.55 }, 5000);
      engine.boom(palm, sz * 0.7, [1.4, 1.9, 2.4]);
      bigWord('FREEZE!', palm.x, palm.y - sz * 1.6, sz * 1.1, '#E0F6FF', '#1D6FD8');
      sfx.boom(); c.fire(h.player);
    }
  } else if (power === 'magic') {
    const p = tip(1);
    let tr = G.trails.get(h.id);
    if (!tr) G.trails.set(h.id, (tr = { pts: [], hue: Math.random() }));
    tr.seen = now;
    tr.pts.push({ x: p.x, y: p.y, age: 0 });
    tr.hue = (tr.hue + dt * 0.25) % 1;
    if (gfx) {
      gfx.emit({ x: p.x, y: H - p.y, dx: 0, dy: 1, spread: TWO_PI, speed: sz * 1.2, life: 1.4, size: sz * 0.08, kind: K.MAGIC, hue: tr.hue }, 900 * dt);
      if (h.open > 0.8) for (const i of [0, 2, 3, 4]) { const q = tip(i); gfx.emit({ x: q.x, y: H - q.y, dx: 0, dy: 1, spread: TWO_PI, speed: sz * 1.5, life: 1.0, size: sz * 0.06, kind: K.MAGIC, hue: tr.hue + i * 0.15 }, 250 * dt); }
    }
    if (fresh('blastAt')) { gfx?.emit({ x: p.x, y: H - p.y, spread: TWO_PI, speed: sz * 8, life: 1.3, size: sz * 0.08, kind: K.MAGIC, hue: tr.hue }, 4000); sfx.sparkle(); c.fire(h.player); }
    level.lv = 0; level.loop = null;
  }
  return level;
}

// Magic trails fade and are drawn even after the hand leaves (so a quick swoosh still leaves a rainbow).
export function drawTrails(engine, dt, now) {
  for (const [id, tr] of G.trails) {
    for (const p of tr.pts) p.age += dt;
    tr.pts = tr.pts.filter((p) => p.age < 1.4).slice(-48);
    if (!tr.pts.length && now - (tr.seen || 0) > 500) { G.trails.delete(id); continue; }
    engine.trail(tr.pts, Math.max(6, engine.H * 0.012), tr.hue, 1.4);
  }
}
// Thrown fireballs fly, trail fire, and burst when they leave the picture.
export function updateBalls(c) {
  const { engine, gfx, W, H, dt, now } = c;
  for (const b of G.balls) {
    b.age += dt;
    b.vy += b.r * 3 * dt;                     // a little arc
    b.x += b.vx * dt; b.y += b.vy * dt;
    engine.fireball(b, b.r);
    const sp = Math.hypot(b.vx, b.vy) || 1;
    gfx?.emit({ x: b.x, y: H - b.y, dx: -b.vx / sp, dy: b.vy / sp, spread: 0.7, speed: b.r * 2, life: 0.6, size: b.r * 0.35, kind: K.FIRE, jitter: b.r * 0.5 }, 2600 * dt);
    const out = b.x < -b.r || b.x > W + b.r || b.y < -b.r || b.y > H + b.r;
    if (out || b.age > 2.2) {
      b.dead = true;
      const p = { x: Math.max(b.r, Math.min(W - b.r, b.x)), y: Math.max(b.r, Math.min(H - b.r, b.y)) };
      engine.boom(p, b.r * 1.4, [2.4, 1.3, 0.4], 50);
      gfx?.emit({ x: p.x, y: H - p.y, spread: TWO_PI, speed: b.r * 14, life: 1.0, size: b.r * 0.2, kind: K.BURST, hue: 0.06 }, 4500);
      c.ripple(p.x, p.y, 0.6);
      shake(now, 250, 0.006);
      sfx.boom();
    }
  }
  G.balls = G.balls.filter((b) => !b.dead).slice(-8);
}

// ───────────────────────────────────────────── Star Storm (WebGPU)
// A tilted ring of glowing particles orbiting the hero; the far half passes behind them (cut-out), hands knock it around.
export function stormField(gfx, f, H, boost, hue) {
  const cx = f.eyes.x, cy = H - f.eyes.y;
  return gfx.field({ x: cx, y: cy, radius: f.fw * 1.5, strength: 1, swirl: boost ? 4.5 : 2.1, kind: 2, tilt: 0.22 });
}
export function stormEmit(gfx, f, dt, idx, hue) {
  gfx.emit({ x: 0, y: 0, kind: K.STORM, life: 3.2, size: f.fw * 0.04, hue, aux: [idx, -2.3, -1.25, 0.95] }, 9000 * dt);
}

// ───────────────────────────────────────────── big comic words (top layer)
export function drawWords(ctx, dt, mirror) {
  for (const w of G.words) {
    w.age += dt;
    const u = w.age / 1.3, pop = u < 0.12 ? (u / 0.12) * 1.25 : u < 0.22 ? 1.25 - (u - 0.12) * 2.5 : 1;
    ctx.save();
    ctx.globalAlpha = u > 0.75 ? Math.max(0, (1 - u) * 4) : 1;
    ctx.translate(w.x, w.y - u * w.size * 0.4); ctx.rotate(w.rot); ctx.scale(pop, pop);
    if (mirror) ctx.scale(-1, 1);
    const s = w.size / 40; ctx.scale(s, s);
    // starburst behind the word
    ctx.beginPath();
    const R = 22 + w.text.length * 9;
    for (let i = 0; i < 28; i++) { const r = i % 2 ? R * 0.62 : R, a = (i * Math.PI) / 14; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.62) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.62); }
    ctx.closePath(); ctx.fillStyle = w.color; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = w.edge; ctx.stroke();
    ctx.font = '40px Bangers, Fredoka, Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 9; ctx.strokeStyle = '#FFFFFF'; ctx.strokeText(w.text, 0, 2);
    ctx.fillStyle = w.edge; ctx.fillText(w.text, 0, 2);
    ctx.restore();
  }
  G.words = G.words.filter((w) => w.age < 1.3);
}
// Small numbered badge over each hero's head when two are playing, in their player colour.
export function drawPlayerBadge(ctx, f, mirror) {
  const P = f.P, fw = f.fw, x = P[10].x, y = P[10].y - fw * 0.62, r = fw * 0.1;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TWO_PI); ctx.fillStyle = PLAYER_CSS[f.player]; ctx.fill();
  ctx.lineWidth = r * 0.22; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
  ctx.translate(x, y); if (mirror) ctx.scale(-1, 1);
  ctx.font = `${Math.round(r * 1.3)}px Bangers, Fredoka, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#10131C'; ctx.fillText(String(f.player + 1), 0, r * 0.08);
  ctx.restore();
}

// ───────────────────────────────────────────── tile pictures for the new powers
function cartoonHand(x, cx, cy, s, open = 1, skin = '#6B3E1F') {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  x.fillStyle = skin; x.strokeStyle = '#2A170B'; x.lineWidth = 0.05;
  const finger = (ax, ay, ang, len) => { x.save(); x.translate(ax, ay); x.rotate(ang); x.beginPath(); x.roundRect(-0.11, -len, 0.22, len, 0.11); x.fill(); x.stroke(); x.restore(); };
  if (open > 0.5) { finger(-0.33, -0.12, -0.35, 0.62); finger(-0.12, -0.32, -0.1, 0.78); finger(0.1, -0.33, 0.06, 0.8); finger(0.3, -0.25, 0.25, 0.68); finger(0.46, 0.15, 0.95, 0.5); }
  x.beginPath(); x.ellipse(0, 0.08, 0.48, 0.5, 0, 0, TWO_PI); x.fill(); x.stroke();
  if (open <= 0.5) { for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(-0.3 + i * 0.2, -0.35, 0.13, 0, TWO_PI); x.fill(); x.stroke(); } }
  x.restore();
}
function glowDot(x, cx, cy, r, inner, outer) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.3, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TWO_PI); x.fill();
}
function zig(x, a, b, n, amp) {
  x.beginPath(); x.moveTo(a.x, a.y);
  for (let i = 1; i < n; i++) { const u = i / n; x.lineTo(a.x + (b.x - a.x) * u + (i % 2 ? amp : -amp), a.y + (b.y - a.y) * u + (i % 2 ? -amp : amp) * 0.4); }
  x.lineTo(b.x, b.y); x.stroke();
}
export function drawHandPreview(x, id) {
  x.save();
  x.fillStyle = '#1B2238'; x.fillRect(0, 0, 100, 100);
  if (id === 'blast') {
    cartoonHand(x, 50, 70, 40, 1);
    glowDot(x, 50, 40, 30, 'rgba(120,220,255,.95)', 'rgba(40,120,255,0)');
    x.strokeStyle = '#BFF0FF'; x.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TWO_PI + 0.3; zig(x, { x: 50 + Math.cos(a) * 12, y: 40 + Math.sin(a) * 12 }, { x: 50 + Math.cos(a) * 30, y: 40 + Math.sin(a) * 30 }, 4, 3); }
  } else if (id === 'fireball') {
    cartoonHand(x, 34, 74, 34, 1);
    glowDot(x, 68, 32, 26, 'rgba(255,200,60,.95)', 'rgba(255,60,0,0)');
    glowDot(x, 52, 46, 12, 'rgba(255,150,40,.8)', 'rgba(255,60,0,0)');
    glowDot(x, 40, 56, 7, 'rgba(255,120,30,.7)', 'rgba(255,60,0,0)');
  } else if (id === 'zap') {
    cartoonHand(x, 50, 68, 42, 1);
    x.strokeStyle = 'rgba(120,180,255,.7)'; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round';
    const tips = [[22, 50], [37, 28], [52, 26], [66, 34], [74, 64]];
    for (const w of [6, 2.2]) { x.lineWidth = w; x.strokeStyle = w > 3 ? 'rgba(120,180,255,.6)' : '#FFFFFF'; for (let i = 0; i < 4; i++) zig(x, { x: tips[i][0], y: tips[i][1] }, { x: tips[i + 1][0], y: tips[i + 1][1] }, 4, 3); }
  } else if (id === 'frosthand') {
    cartoonHand(x, 40, 72, 38, 1);
    for (let i = 0; i < 14; i++) { const a = -1.2 + (i / 14) * 0.9, r = 18 + (i % 4) * 9; glowDot(x, 52 + Math.cos(a) * r, 34 + Math.sin(a) * r * 0.6, 7, 'rgba(200,240,255,.9)', 'rgba(80,170,255,0)'); }
    x.strokeStyle = '#FFFFFF'; x.lineWidth = 2;
    for (const [cx, cy, r] of [[78, 22, 9], [62, 14, 6]]) for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; x.beginPath(); x.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); x.stroke(); }
  } else if (id === 'magic') {
    x.lineCap = 'round';
    for (let i = 0; i < 40; i++) { const u = i / 40; x.strokeStyle = `hsl(${u * 300},95%,62%)`; x.lineWidth = 2 + u * 6; x.beginPath(); const px = 12 + u * 50, py = 60 - Math.sin(u * Math.PI * 1.6) * 34; x.moveTo(px, py); x.lineTo(px + 1.5, py - 1); x.stroke(); }
    cartoonHand(x, 66, 70, 34, 0);
    x.fillStyle = '#6B3E1F'; x.strokeStyle = '#2A170B'; x.lineWidth = 1.6;
    x.save(); x.translate(62, 52); x.rotate(-0.5); x.beginPath(); x.roundRect(-3.8, -22, 7.6, 22, 3.8); x.fill(); x.stroke(); x.restore();
    glowDot(x, 52, 34, 9, 'rgba(255,255,200,.95)', 'rgba(255,120,255,0)');
  }
  x.restore();
}
export function drawStormPreview(x, f, side) {
  const P = f.P, cx = P[1].x, cy = P[1].y + f.fw * 0.5, R = f.fw * 1.35;
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TWO_PI, front = Math.sin(a) > 0;
    if (front !== (side === 'front')) continue;
    const px = cx + Math.cos(a) * R * (0.85 + (i % 5) * 0.06), py = cy + Math.sin(a) * R * 0.28 + ((i * 37) % 11 - 5) * 1.2;
    x.globalAlpha = front ? 1 : 0.45;
    x.fillStyle = `hsl(${200 + (i % 7) * 18},95%,${front ? 75 : 60}%)`;
    x.beginPath(); x.arc(px, py, front ? 1.6 : 1.1, 0, TWO_PI); x.fill();
  }
  x.globalAlpha = 1;
}
