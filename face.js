// face.js — turns MediaPipe results into smoothed, identity-stable faces.
// Landmarks are converted to source-pixel space once; everything downstream draws there.

// Face-mesh indices (canonical 468/478-point model).
export const LIPS_OUT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const LIPS_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
// Upper eyelids, outer corner → inner corner. Brow lower edges, outer → inner.
export const R_LID = [33, 246, 161, 160, 159, 158, 157, 173, 133];
export const L_LID = [263, 466, 388, 387, 386, 385, 384, 398, 362];
export const R_BROW = [46, 53, 52, 65, 55];
export const L_BROW = [276, 283, 282, 295, 285];

export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const BS_KEYS = ['jawOpen', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'eyeWideLeft', 'eyeWideRight', 'mouthSmileLeft', 'mouthSmileRight'];
const HOLD_MS = 250;   // keep a face drawn briefly after tracking blips, so costumes don't flicker

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export function computeFrame(f) {
  const P = f.P;
  f.ang = Math.atan2(P[263].y - P[33].y, P[263].x - P[33].x);   // head roll
  f.fw = dist(P[234], P[454]);                                   // face width = the unit everything scales by
  f.eyes = { x: (P[33].x + P[133].x + P[263].x + P[362].x) / 4, y: (P[33].y + P[133].y + P[263].y + P[362].y) / 4 };
  f.d10 = dist(f.eyes, P[10]) / f.fw;                            // eyes → top of forehead, in face widths
  f.dChin = dist(f.eyes, P[152]) / f.fw;                         // eyes → chin
}

function blendshapes(cats, jawOverride) {
  const bs = {};
  for (const c of cats || []) bs[c.categoryName] = c.score;
  if (jawOverride) bs.jawOpen = jawOverride;
  return bs;
}

export class Tracker {
  constructor() { this.faces = []; this.nextId = 1; }
  reset() { this.faces = []; }

  update(res, W, H, jawOverride = 0) {
    const now = performance.now();
    const lms = res.faceLandmarks || [], bss = res.faceBlendshapes || [];
    const next = [], used = new Set();

    lms.forEach((raw, i) => {
      const pts = raw.map((p) => ({ x: p.x * W, y: p.y * H }));
      const fw = dist(pts[234], pts[454]);
      const bs = blendshapes(bss[i]?.categories, jawOverride);

      // Match to the nearest face from last frame so each face keeps its own smoothing.
      let best = null, bd = Infinity;
      for (const f of this.faces) {
        if (used.has(f)) continue;
        const d = dist(f.P[1], pts[1]);
        if (d < bd) { bd = d; best = f; }
      }

      if (best && bd < fw * 0.6) {
        used.add(best);
        // Adaptive smoothing: heavy when still (kills jitter), light when moving (kills lag).
        const a = Math.min(0.9, 0.35 + (bd / fw) * 6);
        for (let k = 0; k < pts.length; k++) {
          const s = best.P[k];
          s.x += (pts[k].x - s.x) * a;
          s.y += (pts[k].y - s.y) * a;
        }
        for (const key of BS_KEYS) {
          const cur = best.bs[key] ?? 0;
          best.bs[key] = cur + ((bs[key] ?? 0) - cur) * 0.5;
        }
        best.seen = now;
        computeFrame(best);
        next.push(best);
      } else {
        const f = { id: this.nextId++, P: pts, bs: {}, born: now, seen: now };
        for (const key of BS_KEYS) f.bs[key] = bs[key] ?? 0;
        computeFrame(f);
        next.push(f);
      }
    });

    for (const f of this.faces) if (!next.includes(f) && now - f.seen < HOLD_MS) next.push(f);
    this.faces = next;
  }
}
