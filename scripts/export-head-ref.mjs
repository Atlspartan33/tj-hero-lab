// Writes models/ref/head_ref.obj: the preview face's 468 landmarks in HEAD SPACE (the helmets' coordinate frame:
// origin between the ears, x = face width toward the face's left landmark 454, y up, z out of the face, 1 unit = face width),
// triangulated with MediaPipe's canonical face mesh. Blender imports it Y-up → set "Forward -Z, Up Y" (the default for OBJ).
import fs from 'node:fs';
const P = JSON.parse(fs.readFileSync('preview-face.json', 'utf8')).map(([x, y, z]) => ({ x, y, z }));
const H = 0;   // y-down → y-up: just negate y
const v = (p) => [p.x, H - p.y, -p.z];
const sub = (a, b) => a.map((c, i) => c - b[i]), len = (a) => Math.hypot(...a), nrm = (a) => a.map((c) => c / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const a = v(P[234]), b = v(P[454]), top = v(P[10]), chin = v(P[152]);
const X = sub(b, a), s = len(X), x = nrm(X);
const z = nrm(cross(x, sub(top, chin))), y = cross(z, x);
const o = a.map((c, i) => (c + b[i]) / 2);
const toHead = (p) => { const d = sub(v(p), o); const dot = (u) => (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / s; return [dot(x), dot(y), dot(z)]; };
const obj = fs.readFileSync('vendor/facegeo/canonical_face_model.obj', 'utf8');
const faces = obj.split('\n').filter((l) => l.startsWith('f ')).map((l) => l.slice(2).trim().split(/\s+/).map((t) => +t.split('/')[0]));
let out = '# head_ref: preview face landmarks in head space (1 unit = face width)\n';
for (let i = 0; i < 468; i++) out += 'v ' + toHead(P[i]).map((c) => c.toFixed(5)).join(' ') + '\n';
for (const f of faces) out += 'f ' + f.join(' ') + '\n';
fs.writeFileSync('models/ref/head_ref.obj', out);
const pts = { forehead10: toHead(P[10]), chin152: toHead(P[152]), noseTip1: toHead(P[1]), eyeR33: toHead(P[33]), eyeL263: toHead(P[263]), earR234: toHead(P[234]), earL454: toHead(P[454]), mouth13: toHead(P[13]) };
fs.writeFileSync('models/ref/landmarks.json', JSON.stringify(pts, null, 1));
console.log(pts);
