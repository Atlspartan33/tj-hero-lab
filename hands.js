// hands.js — MediaPipe hand landmarks + gestures → smoothed, identity-stable hands with simple, kid-proof states.
// A 4-year-old can do three things reliably: show an open hand, make a fist, and wave. Everything keys off those.
//   open  0..1  (fingers spread)        fist  = open < 0.3
//   charge 0..1 (how long the fist has been held, up to ~0.8 s)
//   blast event: a charged fist that springs open → fired once (hand.blastAt)
//   vel  palm speed in px/s (smoothed)  throw event: a fast flick of an open hand (hand.throwAt, hand.throwVel)
export const TIPS = [4, 8, 12, 16, 20];
const MCP = [2, 5, 9, 13, 17];
const HOLD_MS = 220;
const d = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export class HandTracker {
  constructor() { this.hands = []; this.nextId = 1; }
  reset() { this.hands = []; }

  update(res, W, H, now) {
    const lms = res?.landmarks || [], gest = res?.gestures || [], side = res?.handedness || res?.handednesses || [];
    const next = [], used = new Set();
    lms.forEach((raw, i) => {
      const pts = raw.map((p) => ({ x: p.x * W, y: p.y * H, z: p.z * W }));
      const palm = avg([pts[0], pts[5], pts[9], pts[13], pts[17]]);
      const size = Math.max(8, d(pts[0], pts[9]));            // wrist → middle knuckle: the hand's own scale
      let best = null, bd = Infinity;
      for (const h of this.hands) { if (used.has(h)) continue; const dd = d(h.palm, palm); if (dd < bd) { bd = dd; best = h; } }
      let h;
      if (best && bd < size * 2.5) {
        h = best; used.add(h);
        const a = Math.min(0.9, 0.45 + (bd / size) * 2);         // light smoothing when moving fast
        for (let k = 0; k < 21; k++) { const s = h.P[k]; s.x += (pts[k].x - s.x) * a; s.y += (pts[k].y - s.y) * a; s.z += (pts[k].z - s.z) * a; }
      } else {
        h = { id: this.nextId++, P: pts, born: now, vel: { x: 0, y: 0 }, open: 1, charge: 0, fistAt: 0, blastAt: 0, throwAt: 0, throwVel: { x: 0, y: 0 }, lastT: now };
      }
      const prev = h.palm || palm;
      h.palm = avg([h.P[0], h.P[5], h.P[9], h.P[13], h.P[17]]);
      h.size = Math.max(8, d(h.P[0], h.P[9]));
      const dt = Math.max(0.008, (now - h.lastT) / 1000); h.lastT = now;
      h.vel.x += ((h.palm.x - prev.x) / dt - h.vel.x) * 0.5;
      h.vel.y += ((h.palm.y - prev.y) / dt - h.vel.y) * 0.5;
      // openness: how far the fingertips reach past their knuckles, relative to hand size
      let reach = 0;
      for (let k = 1; k < 5; k++) reach += d(h.P[0], h.P[TIPS[k]]) / Math.max(1, d(h.P[0], h.P[MCP[k]]));
      const openRaw = Math.max(0, Math.min(1, (reach / 4 - 1.05) / 0.6));
      const g = gest[i]?.[0];
      h.gesture = g && g.score > 0.55 ? g.categoryName : 'None';
      const target = h.gesture === 'Closed_Fist' ? Math.min(openRaw, 0.15) : h.gesture === 'Open_Palm' ? Math.max(openRaw, 0.85) : openRaw;
      h.open += (target - h.open) * 0.45;
      h.side = side[i]?.[0]?.categoryName || '';
      // fist → charge; charged fist springing open → blast
      const fist = h.open < 0.3;
      if (fist) { if (!h.fistAt) h.fistAt = now; h.charge = Math.min(1, (now - h.fistAt) / 800); }
      else {
        if (h.fistAt && h.charge > 0.3 && h.open > 0.6) { h.blastAt = now; h.blastPower = h.charge; }
        if (h.open > 0.6) { h.fistAt = 0; h.charge = Math.max(0, h.charge - dt * 3); }
      }
      // a fast flick of an open hand throws
      const sp = Math.hypot(h.vel.x, h.vel.y);
      if (!fist && sp > h.size * 9 && now - h.throwAt > 450) { h.throwAt = now; h.throwVel = { x: h.vel.x, y: h.vel.y }; }
      h.fist = fist;
      h.seen = now;
      next.push(h);
    });
    for (const h of this.hands) if (!next.includes(h) && now - h.seen < HOLD_MS) next.push(h);
    this.hands = next;
  }
}
function avg(ps) { let x = 0, y = 0, z = 0; for (const p of ps) { x += p.x; y += p.y; z += p.z; } return { x: x / ps.length, y: y / ps.length, z: z / ps.length }; }
