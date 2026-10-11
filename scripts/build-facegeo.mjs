// Writes facegeo.json from MediaPipe's canonical face model: per-landmark UVs (468) + triangle indices (0-based).
// The face-paint mesh reuses the live landmarks as vertices, so only uv + tri are needed at runtime.
import fs from 'node:fs';
const lines = fs.readFileSync('vendor/facegeo/canonical_face_model.obj', 'utf8').split('\n');
const VT = [], tri = [], uv = new Array(468);
for (const l of lines) {
  const p = l.trim().split(/\s+/);
  if (p[0] === 'vt') VT.push([+p[1], +p[2]]);
  if (p[0] === 'f') for (const c of p.slice(1)) { const [v, t] = c.split('/').map(Number); uv[v - 1] = VT[t - 1]; tri.push(v - 1); }
}
const r = (x) => Math.round(x * 10000) / 10000;
fs.writeFileSync('facegeo.json', JSON.stringify({ uv: uv.map(([u, v]) => [r(u), r(v)]), tri }));
console.log('uv', uv.length, 'tris', tri.length / 3);
