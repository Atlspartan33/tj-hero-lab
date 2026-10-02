// gear3.js — v3 2D pieces: jetpack, dino buddy, four new backdrops, and tile pictures for the GPU powers.
import { local, sticker, metal, bolt, star4, words, neckOf, mid, clamp01, seeded, bgCache, drawBackground } from './gear.js';

// Jetpack tanks behind the shoulders. Returns the nozzle points (camera px) so the engine can fire GPU flames.
export function drawJetpack(ctx, f, k, t) {
  const n = neckOf(f);
  local(ctx, f, n, () => {
    ctx.scale(k, k);
    for (const s of [-1, 1]) {
      const x = s * 0.92;
      ctx.beginPath(); ctx.roundRect(x - 0.17, -0.42, 0.34, 1.3, 0.17);
      sticker(ctx, metal(ctx, x - 0.17, 0, x + 0.17, 0, ['#F4F7FA', '#AEB9C6', '#E6ECF2', '#5E6B7B']), '#1E2836', 0.02, { y0: -0.42, y1: 0.88 });
      ctx.beginPath(); ctx.roundRect(x - 0.17, -0.1, 0.34, 0.12, 0.02); ctx.fillStyle = '#E3122C'; ctx.fill();
      ctx.beginPath(); ctx.roundRect(x - 0.17, 0.45, 0.34, 0.1, 0.02); ctx.fillStyle = '#E3122C'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 0.12, 0.88); ctx.lineTo(x + 0.12, 0.88); ctx.lineTo(x + 0.08, 1.0); ctx.lineTo(x - 0.08, 1.0); ctx.closePath();
      sticker(ctx, '#3A4656', '#14161C', 0.014, { shadow: false });
      const blink = 0.5 + 0.5 * Math.sin(t * 6 + s);
      ctx.beginPath(); ctx.arc(x, 0.2, 0.04, 0, Math.PI * 2); ctx.fillStyle = `rgba(63,255,122,${0.4 + 0.6 * blink})`; ctx.fill();
    }
  }, 0.5);
  const a = f.ang * 0.5, c = Math.cos(a), sn = Math.sin(a), nozzles = [];
  for (const s of [-1, 1]) {
    const lx = s * 0.92 * k * f.fw, ly = 1.02 * k * f.fw;
    nozzles.push({ x: n.x + lx * c - ly * sn, y: n.y + lx * sn + ly * c, w: f.fw * 0.12 * k });
  }
  return nozzles;
}

// A little dino who rides on his shoulder and roars when he opens his mouth.
export function drawDinoBuddy(ctx, f, k, t) {
  const n = neckOf(f), roar = clamp01(((f.bs.jawOpen ?? 0) - 0.25) / 0.3);
  local(ctx, f, n, () => {
    ctx.translate(0.78, 0.18 - Math.abs(Math.sin(t * 3)) * 0.05);
    ctx.scale(k * 0.9, k * 0.9);
    const g = ctx.createLinearGradient(0, -0.5, 0, 0.2); g.addColorStop(0, '#8BEA6E'); g.addColorStop(1, '#2FA84F');
    const wag = Math.sin(t * 4);
    ctx.beginPath(); ctx.moveTo(0.12, 0.02); ctx.quadraticCurveTo(0.42, wag * 0.04, 0.5, -0.16 + wag * 0.05); ctx.quadraticCurveTo(0.36, 0.06, 0.1, 0.12); ctx.closePath();
    sticker(ctx, g, '#0B3F1C', 0.014);
    ctx.beginPath(); ctx.ellipse(0, 0.0, 0.2, 0.16, 0, 0, Math.PI * 2); sticker(ctx, g, '#0B3F1C', 0.014, { y0: -0.16, y1: 0.16 });
    ctx.beginPath(); ctx.ellipse(-0.02, 0.04, 0.12, 0.09, 0, 0, Math.PI * 2); ctx.fillStyle = '#E8F7B0'; ctx.fill();
    for (let i = 0; i < 4; i++) { const x = -0.12 + i * 0.09; ctx.beginPath(); ctx.moveTo(x - 0.035, -0.13); ctx.lineTo(x, -0.22 + (i % 2) * 0.02); ctx.lineTo(x + 0.035, -0.13); ctx.closePath(); ctx.fillStyle = '#FF8A1F'; ctx.fill(); }
    ctx.save(); ctx.translate(-0.2, -0.2);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.17, 0.13, -0.2, 0, Math.PI * 2); sticker(ctx, g, '#0B3F1C', 0.014, { y0: -0.13, y1: 0.13 });
    ctx.beginPath(); ctx.moveTo(-0.15, 0.04); ctx.quadraticCurveTo(-0.05, 0.08 + roar * 0.12, 0.08, 0.06); ctx.lineTo(0.08, 0.08 + roar * 0.1);
    ctx.quadraticCurveTo(-0.05, 0.12 + roar * 0.16, -0.15, 0.06); ctx.closePath();
    ctx.fillStyle = roar > 0.1 ? '#7A1F2E' : '#0B3F1C'; ctx.fill();
    const blink = (t % 3.2) < 0.12 ? 0.2 : 1;
    ctx.beginPath(); ctx.ellipse(-0.02, -0.05, 0.04, 0.04 * blink, 0, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    if (blink === 1) { ctx.beginPath(); ctx.arc(-0.03, -0.045, 0.02, 0, Math.PI * 2); ctx.fillStyle = '#14161C'; ctx.fill(); }
    ctx.restore();
    if (roar > 0.2) words(ctx, 'ROAR!', -0.55, -0.42, 0.16 * roar, '#FFD400', '#7A1F2E');
  }, 0.5);
}

// Simple 2D stand-ins for the GPU powers, used only for the tile pictures.
export function drawPowerPreview(ctx, f, id) {
  const P = f.P, m = mid(P[13], P[14]), fw = f.fw;
  ctx.save();
  if (id === 'rainbow') {
    ctx.lineCap = 'round'; ctx.lineWidth = fw * 0.07;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath(); ctx.moveTo(m.x, m.y);
      ctx.quadraticCurveTo(m.x + fw * 0.2, m.y + fw * 0.45, m.x + (i - 3) * fw * 0.09, m.y + fw * 1.1);
      ctx.strokeStyle = `hsl(${i * 50},95%,60%)`; ctx.stroke();
    }
  } else if (id === 'hypno') {
    for (const e of [P[468], P[473]]) for (let i = 4; i >= 1; i--) {
      ctx.beginPath(); ctx.arc(e.x, e.y, fw * 0.07 * i, 0, Math.PI * 2); ctx.strokeStyle = `hsl(${i * 70 + 180},95%,60%)`; ctx.lineWidth = fw * 0.035; ctx.stroke();
    }
  } else if (id === 'lightning') {
    ctx.strokeStyle = '#DDF2FF'; ctx.lineWidth = fw * 0.045; ctx.lineJoin = 'round'; ctx.shadowColor = '#5AB4FF'; ctx.shadowBlur = fw * 0.25;
    for (const [sx, sy, dx] of [[P[234].x, P[234].y, -1], [P[454].x, P[454].y, 1], [P[10].x, P[10].y, 0]]) {
      ctx.beginPath(); ctx.moveTo(sx, sy);
      for (let i = 1; i <= 4; i++) ctx.lineTo(sx + dx * fw * 0.14 * i + (i % 2 ? 1 : -1) * fw * 0.08, sy - fw * 0.12 * i * (dx ? 0.4 : 1));
      ctx.stroke();
    }
  } else if (id === 'shield') {
    const c = mid(P[10], P[152]);
    ctx.beginPath(); ctx.ellipse(c.x, c.y, fw * 0.85, fw * 1.05, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(c.x, c.y, fw * 0.5, c.x, c.y, fw * 1.05); g.addColorStop(0, 'rgba(90,200,255,0.05)'); g.addColorStop(1, 'rgba(90,200,255,0.75)');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#9FE6FF'; ctx.lineWidth = fw * 0.04; ctx.stroke();
  } else if (id === 'speed') {
    const c = mid(P[10], P[152]);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = fw * 0.035; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(c.x - fw * 1.25, c.y - fw * 0.45 + i * fw * 0.3); ctx.lineTo(c.x - fw * 0.7, c.y - fw * 0.45 + i * fw * 0.3); ctx.stroke(); }
  } else if (id === 'invisible') {
    for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.beginPath(); star4(ctx, P[1].x + Math.cos(a) * fw * 0.55, P[1].y + Math.sin(a) * fw * 0.7, fw * 0.08); ctx.fillStyle = '#E0F6FF'; ctx.fill(); }
  }
  ctx.restore();
}
// Ghost copies behind the head for the Super Speed tile (drawn before the head).
export function drawSpeedGhosts(ctx, f, drawHead) {
  for (const [dx, a, col] of [[-0.55, 0.35, 'rgba(46,123,255,1)'], [-0.3, 0.5, 'rgba(255,200,40,1)']]) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(f.fw * dx, 0); drawHead(col); ctx.restore();
  }
}

// ───────────────────────────────────────────── v3 backdrops
function seaBg(x, W, H, rnd, U) {
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1FA6C9'); g.addColorStop(0.55, '#0B5E8E'); g.addColorStop(1, '#06304F');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const cx = W * (0.1 + i * 0.17), w = U * 0.05;
    const rg = x.createLinearGradient(0, 0, 0, H * 0.8); rg.addColorStop(0, 'rgba(180,240,255,.22)'); rg.addColorStop(1, 'rgba(180,240,255,0)');
    x.beginPath(); x.moveTo(cx - w, 0); x.lineTo(cx + w, 0); x.lineTo(cx + w * 3 + W * 0.1, H * 0.8); x.lineTo(cx + W * 0.1, H * 0.8); x.closePath(); x.fillStyle = rg; x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  const sand = x.createLinearGradient(0, H * 0.85, 0, H); sand.addColorStop(0, '#D9B97A'); sand.addColorStop(1, '#9C7A45');
  x.fillStyle = sand; x.beginPath(); x.moveTo(0, H * 0.88);
  for (let i = 0; i < 8; i++) x.quadraticCurveTo(W * (i + 0.5) / 8, H * (0.84 + rnd() * 0.04), W * (i + 1) / 8, H * 0.88);
  x.lineTo(W, H); x.lineTo(0, H); x.fill();
  for (const [cx, col] of [[0.18, '#FF7A8A'], [0.82, '#FFB347'], [0.66, '#B04BFF']]) {
    x.fillStyle = col;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(W * cx + (i - 2) * U * 0.015, H * 0.87 - Math.abs(i - 2) * U * 0.004 - U * 0.02, U * 0.018, 0, Math.PI * 2); x.fill(); }
  }
}
function snowBg(x, W, H, rnd, U) {
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7FB6F2'); g.addColorStop(1, '#E8F4FF');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (const [base, peaks, col, shade] of [[0.62, 4, '#C9DDF2', '#A9C3E0'], [0.75, 5, '#F4FAFF', '#C6D9EE']]) {
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i <= peaks; i++) { const px = (i / peaks) * W, ph = H * (base - 0.18 - rnd() * 0.16); x.lineTo(px - W / peaks / 2, H * base); x.lineTo(px, ph); }
    x.lineTo(W, H * base); x.lineTo(W, H); x.closePath(); x.fillStyle = col; x.fill();
    x.globalAlpha = 0.5; x.fillStyle = shade; x.fillRect(0, H * base, W, H); x.globalAlpha = 1;
  }
  x.fillStyle = '#F7FBFF'; x.fillRect(0, H * 0.86, W, H * 0.14);
  for (let i = 0; i < 9; i++) {
    const px = rnd() * W, py = H * (0.8 + rnd() * 0.12), h = U * (0.06 + rnd() * 0.06);
    x.fillStyle = '#2E6A4E';
    for (let j = 0; j < 3; j++) { x.beginPath(); x.moveTo(px, py - h + j * h * 0.28); x.lineTo(px - h * 0.32, py - h * 0.45 + j * h * 0.3); x.lineTo(px + h * 0.32, py - h * 0.45 + j * h * 0.3); x.closePath(); x.fill(); }
    x.fillStyle = '#FFFFFF'; x.beginPath(); x.moveTo(px, py - h); x.lineTo(px - h * 0.12, py - h * 0.78); x.lineTo(px + h * 0.12, py - h * 0.78); x.closePath(); x.fill();
  }
}
function trackBg(x, W, H, rnd, U) {
  const g = x.createLinearGradient(0, 0, 0, H * 0.4); g.addColorStop(0, '#2B7BEA'); g.addColorStop(1, '#9ED1FF');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#3A4252'; x.fillRect(0, H * 0.28, W, H * 0.24);
  const fans = ['#FF3B3B', '#FFD400', '#FFFFFF', '#2E7BFF', '#3BFF7A', '#FF8AC4'];
  for (let r = 0; r < 6; r++) for (let i = 0; i < 60; i++) { x.fillStyle = fans[Math.floor(rnd() * 6)]; x.beginPath(); x.arc((i + rnd() * 0.5) * W / 60, H * (0.31 + r * 0.035), U * 0.005, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#E3122C'; x.fillRect(0, H * 0.5, W, H * 0.02);
  const a = x.createLinearGradient(0, H * 0.52, 0, H); a.addColorStop(0, '#4A4E57'); a.addColorStop(1, '#2A2D33');
  x.fillStyle = a; x.fillRect(0, H * 0.52, W, H * 0.48);
  x.strokeStyle = '#FFFFFF'; x.lineWidth = U * 0.006; x.setLineDash([U * 0.05, U * 0.04]);
  x.beginPath(); x.moveTo(0, H * 0.74); x.lineTo(W, H * 0.74); x.stroke(); x.setLineDash([]);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#14161C' : '#FFFFFF'; x.fillRect(W * 0.5 + (i - 8) * U * 0.02, H * 0.53 + j * U * 0.02, U * 0.02, U * 0.02); }
}
function hqBg(x, W, H, rnd, U) {
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#060B1F'); g.addColorStop(1, '#0D1638');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(40,200,255,.45)'; x.lineWidth = U * 0.002;
  const hy = H * 0.62;
  for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(W / 2 + i * U * 0.02, hy); x.lineTo(W / 2 + i * U * 0.18, H); x.stroke(); }
  for (let j = 1; j < 10; j++) { const yy = hy + (H - hy) * Math.pow(j / 10, 1.8); x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
  for (const [cx, cy, w, h] of [[0.15, 0.25, 0.22, 0.18], [0.85, 0.25, 0.22, 0.18], [0.5, 0.12, 0.3, 0.14]]) {
    x.fillStyle = '#0A2A44'; x.strokeStyle = '#2EC4FF'; x.lineWidth = U * 0.004;
    x.beginPath(); x.roundRect(W * cx - U * w / 2, H * cy - U * h / 2, U * w, U * h, U * 0.01); x.fill(); x.stroke();
  }
  x.fillStyle = 'rgba(46,196,255,.7)';
  for (let i = 0; i < 12; i++) x.fillRect(W * 0.85 - U * 0.09, H * 0.25 - U * 0.07 + i * U * 0.011, U * (0.04 + rnd() * 0.13), U * 0.004);
}
const V3_BG = { underwater: [seaBg, 41], snow: [snowBg, 43], track: [trackBg, 47], hq: [hqBg, 53] };

// Draws any backdrop (old ones delegate to gear.js).
export function drawAnyBackground(ctx, id, W, H, t) {
  if (!V3_BG[id]) return drawBackground(ctx, id, W, H, t);
  const key = `${id}:${W}x${H}`;
  if (!bgCache.has(key)) {
    if (bgCache.size > 8) bgCache.clear();
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    V3_BG[id][0](c.getContext('2d'), W, H, seeded(V3_BG[id][1]), Math.max(W, H));
    bgCache.set(key, c);
  }
  ctx.drawImage(bgCache.get(key), 0, 0);
  const U = Math.max(W, H), rnd = seeded(5);
  ctx.save();
  if (id === 'underwater') {
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? 1 : -1, sp = 0.05 + i * 0.015, y0 = H * (0.25 + i * 0.15);
      const u = (t * sp + i * 0.3) % 1.2, px = dir > 0 ? (u - 0.1) * W : (1.1 - u) * W, s = U * (0.025 + (i % 3) * 0.01), y = y0 + Math.sin(t * 2 + i) * U * 0.01;
      ctx.fillStyle = ['#FFB347', '#FF5A8A', '#FFE04A', '#7FE0FF'][i];
      ctx.beginPath(); ctx.ellipse(px, y, s * 1.4, s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - dir * s * 1.2, y); ctx.lineTo(px - dir * s * 2.1, y - s * 0.7); ctx.lineTo(px - dir * s * 2.1, y + s * 0.7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#14161C'; ctx.beginPath(); ctx.arc(px + dir * s * 0.7, y - s * 0.15, s * 0.16, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#1F8A4E'; ctx.lineCap = 'round'; ctx.lineWidth = U * 0.012;
    for (let i = 0; i < 7; i++) {
      const bx = W * (0.05 + i * 0.15), h = H * (0.18 + (i % 3) * 0.06);
      ctx.beginPath(); ctx.moveTo(bx, H); ctx.quadraticCurveTo(bx + Math.sin(t * 1.5 + i) * U * 0.04, H - h * 0.6, bx + Math.sin(t * 1.5 + i + 1) * U * 0.03, H - h); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(220,250,255,.7)'; ctx.lineWidth = U * 0.002;
    for (let i = 0; i < 18; i++) {
      const bx = rnd() * W, sp = 0.08 + rnd() * 0.08, u = (t * sp + rnd()) % 1, r = U * (0.004 + rnd() * 0.006);
      ctx.beginPath(); ctx.arc(bx + Math.sin(u * 12) * U * 0.006, H * (1 - u), r, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (id === 'snow') {
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 90; i++) {
      const sp = 0.05 + rnd() * 0.08, x0 = rnd(), off = rnd(), u = (t * sp + off) % 1, a = 0.6 + rnd() * 0.4, r = U * (0.002 + rnd() * 0.004);
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc((((x0 + Math.sin(t * 0.8 + i) * 0.02) % 1) + 1) % 1 * W, u * H, r, 0, Math.PI * 2); ctx.fill();
    }
  } else if (id === 'track') {
    const u = (t * 0.35) % 1.6, cx = (u - 0.3) * W, cy = H * 0.8, s = U * 0.05;
    ctx.fillStyle = '#2E7BFF';
    ctx.beginPath(); ctx.roundRect(cx - s * 1.6, cy - s * 0.35, s * 3.2, s * 0.6, s * 0.2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx - s * 0.6, cy - s * 0.75, s * 1.3, s * 0.5, s * 0.2); ctx.fill();
    ctx.fillStyle = '#9FD8FF'; ctx.beginPath(); ctx.roundRect(cx - s * 0.2, cy - s * 0.68, s * 0.7, s * 0.35, s * 0.1); ctx.fill();
    ctx.fillStyle = '#14161C'; for (const wx of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + wx * s * 1.0, cy + s * 0.28, s * 0.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = U * 0.003;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - s * (1.9 + i * 0.4), cy - s * 0.3 + i * s * 0.25); ctx.lineTo(cx - s * (3.2 + i * 0.6), cy - s * 0.3 + i * s * 0.25); ctx.stroke(); }
    for (const fx of [0.08, 0.92]) {
      const px = W * fx, py = H * 0.22;
      ctx.fillStyle = '#14161C'; ctx.fillRect(px - U * 0.002, py, U * 0.004, H * 0.3);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#14161C' : '#FFFFFF';
        ctx.fillRect(px + i * U * 0.015, py + j * U * 0.015 + Math.sin(t * 6 + i) * U * 0.004, U * 0.015, U * 0.015);
      }
    }
  } else if (id === 'hq') {
    const r = U * 0.07;
    ctx.save(); ctx.translate(W * 0.15, H * 0.25);
    ctx.strokeStyle = 'rgba(46,196,255,.5)'; ctx.lineWidth = U * 0.002;
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(0, 0, (r * i) / 3, 0, Math.PI * 2); ctx.stroke(); }
    if (ctx.createConicGradient) {
      const sg = ctx.createConicGradient(t * 2, 0, 0);
      sg.addColorStop(0, 'rgba(46,255,160,.55)'); sg.addColorStop(0.15, 'rgba(46,255,160,0)'); sg.addColorStop(1, 'rgba(46,255,160,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.translate(W * 0.5, H * 0.12); ctx.scale(Math.cos(t * 1.5), 1);
    bolt(ctx, 0, 0, U * 0.11); ctx.fillStyle = '#FFD400'; ctx.shadowColor = '#FFD400'; ctx.shadowBlur = U * 0.02; ctx.fill();
    ctx.restore();
    const blink = Math.floor(t * 2) % 2;
    for (let i = 0; i < 6; i++) { ctx.fillStyle = (i + blink) % 2 ? '#3BFF7A' : '#FF3B3B'; ctx.beginPath(); ctx.arc(W * 0.05 + i * U * 0.02, H * 0.55, U * 0.005, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}
