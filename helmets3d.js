// helmets3d.js — real 3D headgear that turns with the head (Three.js).
// Everything is modeled in HEAD SPACE: origin between the ears, x → the face's left-to-right, y up, z out of the face,
// 1 unit = face width. Measured from real landmarks: forehead top y≈0.58, chin y≈-0.65, nose tip z≈0.75, eyes y≈0.16.
// Shells are ellipsoids around the skull with the face opening cut by an alpha map, so every helmet
// shares one well-fitted shape and only the trim differs.
import * as THREE from 'three';

export const BLOOM = 1;                                   // render layer for things that glow
const C = new THREE.Vector3(0, 0.18, -0.06);            // skull center
const R = new THREE.Vector3(0.66, 0.78, 0.76);          // shell radii (skull + a little clearance)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const thetaAt = (y, c = C, r = R) => Math.acos(clamp((y - c.y) / r.y, -1, 1));
const frontZ = (y, c = C, r = R) => c.z + r.z * Math.sqrt(Math.max(0, 1 - ((y - c.y) / r.y) ** 2));

// ───────────────────────────────────────────── materials (shared)
const M = {};
function mats() {
  if (M.ready) return M;
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xdfe7f0, metalness: 1, roughness: 0.14 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xc3ccd6, metalness: 1, roughness: 0.3 });
  M.darkSteel = new THREE.MeshStandardMaterial({ color: 0x6d7886, metalness: 1, roughness: 0.35 });
  M.guard = new THREE.MeshStandardMaterial({ color: 0x39414c, metalness: 0.35, roughness: 0.55, envMapIntensity: 0.4 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.18 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xc99a3a, metalness: 1, roughness: 0.3 });
  M.pearl = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.25, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color(0xbfe0ff) });
  M.ivory = new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.45, vertexColors: true });
  M.leather = new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 0.7 });
  M.velvet = new THREE.MeshStandardMaterial({ color: 0xb3001f, roughness: 0.9 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  M.inner = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.9, side: THREE.BackSide });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.02, metalness: 0, clearcoat: 1, envMapIntensity: 1.1, depthWrite: false });
  M.ready = true;
  return M;
}
const paint = (color, rough = 0.38) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.05, roughness: rough, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.55 });
const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const tint = (color, opacity = 0.4) => new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity, roughness: 0.04, metalness: 0.2, clearcoat: 1, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false });
function bloomy(mesh) { mesh.layers.enable(BLOOM); return mesh; }

// ───────────────────────────────────────────── geometry helpers
// Alpha map in sphere-UV space (u = around, 0.25 = straight ahead; canvas y = angle down from the top).
function cutMap(draw) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#000000';
  draw(x);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
// The face opening: an arch from the brow down, `w` radians either side of straight ahead.
function faceOpening(x, { brow = 0.4, w = 0.95, round = 26 } = {}) {
  const top = (thetaAt(brow) / Math.PI) * 256, cx = 128, hw = (w / (2 * Math.PI)) * 512;
  x.beginPath(); x.roundRect(cx - hw, top, hw * 2, 300, [round, round, 0, 0]); x.fill();
}
function shell(mat, { cut, bottom = -0.45, r = R, c = C, inner = true } = {}) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 72, 40, 0, Math.PI * 2, 0, thetaAt(bottom, c, r));
  const outerMat = mat.clone();
  if (cut) { outerMat.alphaMap = cut; outerMat.alphaTest = 0.5; }
  const outer = new THREE.Mesh(geo, outerMat);
  outer.scale.copy(r); outer.position.copy(c);
  g.add(outer);
  if (inner) {
    const im = M.inner.clone();
    if (cut) { im.alphaMap = cut; im.alphaTest = 0.5; }
    const innerMesh = new THREE.Mesh(geo, im);
    innerMesh.scale.copy(r).multiplyScalar(0.985); innerMesh.position.copy(c);
    g.add(innerMesh);
  }
  return g;
}
// A band around the shell between two heights (for brow bands, trims).
function band(mat, yTop, yBottom, { cut, grow = 1.012 } = {}) {
  const geo = new THREE.SphereGeometry(1, 72, 4, 0, Math.PI * 2, thetaAt(yTop), thetaAt(yBottom) - thetaAt(yTop));
  const m = mat.clone();
  if (cut) { m.alphaMap = cut; m.alphaTest = 0.5; }
  const mesh = new THREE.Mesh(geo, m);
  mesh.scale.copy(R).multiplyScalar(grow); mesh.position.copy(C);
  return mesh;
}
// A stripe running over the crown from the brow, front to back.
function crownStripe(mat, width = 0.18, toY = 0.4, grow = 1.015) {
  const g = new THREE.Group();
  for (const [phi, end] of [[Math.PI / 2, thetaAt(toY)], [Math.PI * 1.5, thetaAt(-0.2)]]) {
    const geo = new THREE.SphereGeometry(1, 6, 40, phi - width / 2, width, 0, end);
    const m = new THREE.Mesh(geo, mat);
    m.scale.copy(R).multiplyScalar(grow); m.position.copy(C);
    g.add(m);
  }
  return g;
}
// Point on the shell surface at height y, angle `a` from straight ahead (radians, + = toward the face's left/+x).
function onShell(y, a, grow = 1) {
  const th = thetaAt(y), s = Math.sin(th);
  return new THREE.Vector3(C.x + R.x * grow * Math.sin(a) * s, y, C.z + R.z * grow * Math.cos(a) * s);
}
// Tube whose radius tapers along a curve (horns, spikes). Vertex colors fade base → tip.
function taperedTube(points, r0, r1, c0 = 0xd9c7a0, c1 = 0xffffff, seg = 32, rad = 14) {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(seg, false);
  const pos = [], col = [], idx = [];
  const ca = new THREE.Color(c0), cb = new THREE.Color(c1), tmp = new THREE.Color();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, p = curve.getPointAt(u), r = r0 + (r1 - r0) * Math.pow(u, 0.9);
    const N = frames.normals[i], B = frames.binormals[i];
    tmp.copy(ca).lerp(cb, u);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2;
      pos.push(p.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), p.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), p.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
function extrude(shapeFn, depth = 0.04, bevel = 0.012) {
  const s = new THREE.Shape(); shapeFn(s);
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16 });
  geo.center();
  return geo;
}
const boltShape = (s, k = 1) => { s.moveTo(0.05 * k, 0.25 * k); s.lineTo(-0.125 * k, -0.025 * k); s.lineTo(-0.01 * k, -0.025 * k); s.lineTo(-0.06 * k, -0.25 * k); s.lineTo(0.125 * k, 0.04 * k); s.lineTo(0.01 * k, 0.04 * k); s.closePath(); };
function rivets(group, y, n, r = 0.022, mat = M.chrome, skipFront = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < skipFront) continue;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    m.position.copy(onShell(y, a, 1.02)); group.add(m);
  }
}
// Place an object flat against the shell front at height y (normal points out of the shell).
function onFront(obj, y, out = 0.02, a = 0) {
  const p = onShell(y, a, 1);
  const n = new THREE.Vector3((p.x - C.x) / (R.x * R.x), (p.y - C.y) / (R.y * R.y), (p.z - C.z) / (R.z * R.z)).normalize();
  obj.position.copy(p).addScaledVector(n, out);
  obj.lookAt(obj.position.clone().add(n));
  return obj;
}

// ───────────────────────────────────────────── the helmets
// Each builder returns { group, update(t, bs) }. `bs` = smoothed blendshapes, for reactive bits.
const B = {};

B.robot = () => {
  const g = new THREE.Group(), lights = [];
  g.add(shell(M.chrome, { cut: cutMap((x) => faceOpening(x, { brow: 0.4, w: 1.0 })), bottom: -0.45 }));
  g.add(crownStripe(paint(0x2e7bff, 0.25), 0.2));
  const rail = bloomy(new THREE.Mesh(new THREE.SphereGeometry(1, 4, 40, Math.PI / 2 - 0.025, 0.05, 0, thetaAt(0.4)), glow(0x8fe3ff)));
  rail.scale.copy(R).multiplyScalar(1.03); rail.position.copy(C); g.add(rail);
  // wraparound visor across the eyes
  const vis = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.24, 48, 1, true, -1.05, 2.1), tint(0x39d6ff, 0.38));
  vis.position.set(0, 0.16, -0.12); g.add(vis);
  for (const dy of [0.12, -0.12]) {
    const edge = bloomy(new THREE.Mesh(new THREE.CylinderGeometry(0.745, 0.745, 0.016, 48, 1, true, -1.05, 2.1), glow(0x5fe8ff)));
    edge.position.set(0, 0.16 + dy, -0.12); g.add(edge);
  }
  // ear pods with ring lights
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 32), M.chrome);
    pod.rotation.z = Math.PI / 2; pod.position.set(s * 0.7, 0.08, -0.06); g.add(pod);
    const ring = bloomy(new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.018, 12, 40), glow(0x2e9bff)));
    ring.rotation.y = Math.PI / 2; ring.position.set(s * 0.765, 0.08, -0.06); g.add(ring); lights.push(ring);
  }
  // antenna
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.28, 10), M.darkSteel);
  mast.position.set(0, C.y + R.y + 0.12, -0.06); g.add(mast);
  const bulb = bloomy(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), glow(0xff3b3b)));
  bulb.position.set(0, C.y + R.y + 0.28, -0.06); g.add(bulb);
  return {
    group: g,
    update(t) {
      bulb.material.color.setHex(Math.floor(t * 2) % 2 ? 0xff3b3b : 0x3bff7a);
      lights.forEach((l, i) => l.material.color.setHSL(0.56, 1, 0.45 + 0.2 * Math.sin(t * 6 + i * 3)));
    },
  };
};

B.thunder = () => {
  const g = new THREE.Group(), wings = [];
  g.add(shell(M.gold, { cut: cutMap((x) => faceOpening(x, { brow: 0.4, w: 1.05 })), bottom: 0.02 }));
  g.add(band(M.darkSteel, 0.44, 0.36, { cut: cutMap((x) => faceOpening(x, { brow: 0.36, w: 1.05 })) }));
  const feather = extrude((s) => { s.moveTo(0, 0); s.quadraticCurveTo(0.2, 0.06, 0.42, 0.02); s.quadraticCurveTo(0.22, -0.07, 0, -0.04); s.closePath(); }, 0.02, 0.008);
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(feather, M.pearl);
      f.position.set(0.2, 0, 0); const holder = new THREE.Group(); holder.add(f);
      holder.rotation.z = 0.35 + i * 0.28; holder.position.z = -i * 0.015;
      wing.add(holder);
    }
    wing.position.set(s * 0.64, 0.42, -0.12);
    wing.scale.set(s, 1, 1);
    wing.rotation.y = s * -0.5;
    g.add(wing); wings.push(wing);
  }
  const boltGeo = extrude((sh) => boltShape(sh, 1.15), 0.05, 0.015);
  const bolt = onFront(new THREE.Mesh(boltGeo, paint(0x2e9bff, 0.2)), 0.66, 0.03);
  g.add(bolt);
  const boltGlow = bloomy(new THREE.Mesh(boltGeo, glow(0x7fd8ff)));
  boltGlow.scale.setScalar(0.92); bolt.add(boltGlow); boltGlow.position.z = 0.012;
  return { group: g, update(t) { wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * 5) * 0.08; }); boltGlow.material.color.setHSL(0.55, 1, 0.55 + 0.15 * Math.sin(t * 6)); } };
};

B.astro = () => {
  const g = new THREE.Group(), lights = [];
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 48), M.glass);
  bubble.position.set(0, 0.0, 0.06); bubble.renderOrder = 5; g.add(bubble);
  // fresnel rim so the glass reads even where nothing reflects
  const rimMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vec3(0.0,0.0,1.0))), 4.0); gl_FragColor = vec4(vec3(0.75,0.9,1.0)*f*0.6, f); }',
  });
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.085, 64, 48), rimMat);
  rim.position.copy(bubble.position); rim.renderOrder = 6; g.add(rim);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.13, 24, 64), paint(0xf4f7fa, 0.4));
  collar.rotation.x = Math.PI / 2; collar.position.set(0, -0.98, 0.0); g.add(collar);
  for (const [a, c] of [[-0.5, 0xff3b3b], [-0.3, 0x3bff7a], [0.4, 0x2e9bff]]) {
    const l = bloomy(new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), glow(c)));
    l.position.set(Math.sin(a) * 0.85, -0.93, Math.cos(a) * 0.85); g.add(l); lights.push(l);
  }
  return { group: g, update(t) { lights.forEach((l, i) => { l.visible = Math.floor(t * 2 + i) % 2 === 0; }); } };
};

B.knight = () => {
  const g = new THREE.Group(), plume = new THREE.Group();
  const cut = cutMap((x) => faceOpening(x, { brow: 0.38, w: 0.86, round: 18 }));
  g.add(shell(M.steel, { cut, bottom: -0.38 }));
  g.add(band(M.darkSteel, 0.47, 0.39, { cut: cutMap((x) => faceOpening(x, { brow: 0.39, w: 0.86 })) }));
  rivets(g, 0.43, 22, 0.02, M.chrome, 0.35);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.44, 0.03), M.guard);
  guard.position.set(0, 0.17, 0.7); guard.rotation.x = -0.34; g.add(guard);
  g.add(crownStripe(M.darkSteel, 0.06, 0.4, 1.02));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.1, 16), M.gold);
  base.position.set(0, C.y + R.y + 0.02, -0.02); g.add(base);
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), paint(new THREE.Color().setHSL(0.99, 0.85, 0.42 + i * 0.015), 0.6));
    f.scale.set(0.07, 0.32 - i * 0.012, 0.07);
    const h = new THREE.Group(); f.position.y = 0.26; h.add(f);
    h.rotation.x = -0.5 - i * 0.16; h.rotation.z = (i % 2 ? 1 : -1) * 0.08;
    plume.add(h);
  }
  plume.position.copy(base.position).add(new THREE.Vector3(0, 0.04, 0));
  g.add(plume);
  return { group: g, update(t) { plume.rotation.z = Math.sin(t * 2.5) * 0.06; plume.rotation.x = Math.sin(t * 1.7) * 0.04; } };
};

function raceTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#E3122C'; x.fillRect(0, 0, 1024, 512);
  // twin white stripes front-to-back over the crown (u = 0.25 front, 0.75 back)
  x.fillStyle = '#FFFFFF';
  for (const u of [0.25, 0.75]) { x.fillRect(u * 1024 - 46, 0, 26, 512); x.fillRect(u * 1024 + 20, 0, 26, 512); }
  x.fillStyle = '#14161C';
  for (const u of [0.25, 0.75]) x.fillRect(u * 1024 - 18, 0, 36, 512);
  // checkered band low on the sides
  const y0 = 300;
  for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#14161C' : '#FFFFFF'; x.fillRect(i * 16, y0 + j * 16, 16, 16); }
  // stars on the sides (symmetric so the mirrored camera reads the same)
  x.fillStyle = '#FFD400';
  for (const u of [0.5, 0.0, 1.0]) {
    const cx = u * 1024, cy = 200; x.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 52, a = -Math.PI / 2 + (i * Math.PI) / 5; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); }
    x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
B.race = () => {
  const g = new THREE.Group();
  const m = paint(0xffffff, 0.22); m.map = raceTexture();
  g.add(shell(m, { cut: cutMap((x) => faceOpening(x, { brow: 0.42, w: 0.98, round: 30 })), bottom: -0.62 }));
  const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.82, 0.2, 48, 1, true, -1.0, 2.0), tint(0x1b2433, 0.75));
  visor.position.set(0, 0.6, -0.14); visor.rotation.x = -0.35; g.add(visor);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.14), paint(0x14161c, 0.3));
  spoiler.position.set(0, 0.88, -0.62); spoiler.rotation.x = 0.25; g.add(spoiler);
  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.05), paint(0x14161c, 0.3));
    strut.position.set(s * 0.14, 0.82, -0.6); g.add(strut);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.18), M.black);
    vent.position.set(s * 0.68, 0.2, 0.05); g.add(vent);
  }
  return { group: g, update() {} };
};

B.viking = () => {
  const g = new THREE.Group();
  g.add(shell(M.steel, { bottom: 0.42, inner: false }));
  g.add(band(M.leather, 0.5, 0.36, { grow: 1.03 }));
  rivets(g, 0.43, 18, 0.024, M.gold, 0);
  g.add(crownStripe(M.darkSteel, 0.08, 0.5, 1.02));
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.03), M.guard);
  guard.position.set(0, 0.21, 0.68); guard.rotation.x = -0.32; g.add(guard);
  for (const s of [-1, 1]) {
    const pts = [[0.6, 0.62, -0.06], [0.88, 0.72, -0.02], [1.05, 0.98, 0.04], [1.0, 1.26, 0.1]].map(([px, py, pz]) => new THREE.Vector3(s * px, py, pz));
    const horn = new THREE.Mesh(taperedTube(pts, 0.11, 0.008, 0xc8b48a, 0xfffaf0), M.ivory);
    g.add(horn);
  }
  return { group: g, update() {} };
};

B.samurai = () => {
  const g = new THREE.Group();
  const lacquer = paint(0x1b1c22, 0.25);
  g.add(shell(lacquer, { cut: cutMap((x) => faceOpening(x, { brow: 0.4, w: 1.0 })), bottom: 0.12 }));
  // flared neck guard: stacked plates around the back and sides
  for (let i = 0; i < 3; i++) {
    const y0 = 0.14 - i * 0.16, prof = [new THREE.Vector2(0.7 + i * 0.09, y0), new THREE.Vector2(0.8 + i * 0.1, y0 - 0.17)];
    const lathe = new THREE.Mesh(new THREE.LatheGeometry(prof, 64, 0.95, Math.PI * 2 - 1.9), i % 2 ? paint(0xb3001f, 0.35) : lacquer);
    lathe.material.side = THREE.DoubleSide;
    lathe.position.set(0, 0, -0.08); lathe.scale.z = 1.08;
    g.add(lathe);
    const lace = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.705 + i * 0.09, y0 - 0.005), new THREE.Vector2(0.72 + i * 0.09, y0 - 0.025)], 64, 0.95, Math.PI * 2 - 1.9), M.gold);
    lace.material = M.gold; lace.position.copy(lathe.position); lace.scale.z = 1.08; g.add(lace);
  }
  // golden crescent crest
  const crest = extrude((s) => {
    s.moveTo(0, -0.06);
    s.bezierCurveTo(-0.2, -0.02, -0.34, 0.14, -0.3, 0.42);
    s.bezierCurveTo(-0.24, 0.2, -0.12, 0.06, 0, 0.04);
    s.bezierCurveTo(0.12, 0.06, 0.24, 0.2, 0.3, 0.42);
    s.bezierCurveTo(0.34, 0.14, 0.2, -0.02, 0, -0.06);
  }, 0.025, 0.01);
  const cr = onFront(new THREE.Mesh(crest, M.gold), 0.62, 0.05);
  g.add(cr);
  const sun = bloomy(new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), glow(0xff3b3b)));
  sun.position.set(0, -0.02, 0.025); cr.add(sun);
  for (const s of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.02), lacquer);
    flap.position.set(s * 0.68, 0.3, 0.18); flap.rotation.y = s * 0.9; g.add(flap);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.02, 0.025), M.gold);
    edge.position.set(0, 0.1, 0); flap.add(edge);
  }
  return { group: g, update() {} };
};

B.diver = () => {
  const g = new THREE.Group();
  const c = new THREE.Vector3(0, 0.05, 0.0), r = new THREE.Vector3(1.0, 1.02, 0.98);
  const win = 0.85;                                             // window radius as an angle
  const cut = cutMap((x) => { x.beginPath(); x.ellipse(128, 128, (win / (2 * Math.PI)) * 512, (win / Math.PI) * 256, 0, 0, Math.PI * 2); x.fill(); });
  g.add(shell(M.brass, { cut, c, r, bottom: -1.0 }));
  const rr = Math.sin(win) * r.x, fz = c.z + Math.cos(win) * r.z;
  const frame = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.07, 20, 64), M.brass);
  frame.position.set(0, c.y, fz); g.add(frame);
  const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(rr, 48), M.glass);
  glassDisc.position.set(0, c.y, fz + 0.02); glassDisc.renderOrder = 5; g.add(glassDisc);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.chrome);
    b.position.set(Math.cos(a) * (rr + 0.1), c.y + Math.sin(a) * (rr + 0.1), fz + 0.02); g.add(b);
  }
  for (const s of [-1, 1]) {
    const sp = new THREE.Vector3(s * Math.sin(1.4) * r.x, c.y + 0.05, c.z + Math.cos(1.4) * r.z);
    const side = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 14, 40), M.brass);
    side.position.copy(sp); side.lookAt(sp.clone().multiplyScalar(2)); g.add(side);
    const sg = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), tint(0x6fd6ff, 0.35));
    sg.position.copy(sp); sg.lookAt(sp.clone().multiplyScalar(2)); g.add(sg);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.12, 20, 64), M.brass);
  collar.rotation.x = Math.PI / 2; collar.position.set(0, -0.98, 0); g.add(collar);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 20), M.brass);
  valve.position.set(0, c.y + r.y + 0.04, -0.05); g.add(valve);
  return { group: g, update() {} };
};

B.crown = () => {
  const g = new THREE.Group(), gems = [];
  const ring = new THREE.Group();
  const bandMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.58, 0.24, 64, 1, true), M.gold);
  bandMesh.material = M.gold.clone(); bandMesh.material.side = THREE.DoubleSide; ring.add(bandMesh);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.26, 4), M.gold);
    spike.position.set(Math.sin(a) * 0.61, 0.24, Math.cos(a) * 0.61); spike.rotation.y = a; ring.add(spike);
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), M.pearl);
    pearl.position.set(Math.sin(a) * 0.61, 0.39, Math.cos(a) * 0.61); ring.add(pearl);
    const gemCol = [0xff2e63, 0x2e9bff, 0x2ee59d, 0xb04bff][i % 4];
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), new THREE.MeshPhysicalMaterial({ color: gemCol, metalness: 0, roughness: 0.05, clearcoat: 1, emissive: gemCol, emissiveIntensity: 0.25 }));
    gem.position.set(Math.sin(a + Math.PI / n) * 0.635, 0.0, Math.cos(a + Math.PI / n) * 0.635);
    gem.rotation.y = a + Math.PI / n; gem.scale.set(1, 1.3, 0.6); ring.add(gem); gems.push(gem);
  }
  for (const y of [-0.11, 0.11]) {
    const trim = new THREE.Mesh(new THREE.TorusGeometry(y < 0 ? 0.585 : 0.62, 0.018, 10, 64), M.gold);
    trim.rotation.x = Math.PI / 2; trim.position.y = y; ring.add(trim);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.velvet);
  cap.scale.y = 0.55; cap.position.y = 0.08; ring.add(cap);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), M.gold);
  orb.position.y = 0.45; ring.add(orb);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), M.gold); cross.position.y = 0.54; ring.add(cross);
  ring.position.set(0, 0.74, -0.1); ring.rotation.x = -0.2;
  g.add(ring);
  const sparkle = bloomy(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), glow(0xffffff)));
  g.add(sparkle);
  return {
    group: g,
    update(t) {
      const i = Math.floor(t * 1.5) % n, a = (i / n) * Math.PI * 2;
      sparkle.position.set(Math.sin(a) * 0.61, 0.74 + 0.39 - 0.07, Math.cos(a) * 0.61 - 0.1);
      sparkle.scale.setScalar(1 + 2.5 * Math.sin(((t * 1.5) % 1) * Math.PI));
    },
  };
};

B.mech = () => {
  const g = new THREE.Group(), strips = [];
  g.add(shell(paint(0xf2f4f7, 0.28), { cut: cutMap((x) => faceOpening(x, { brow: 0.38, w: 1.0, round: 6 })), bottom: -0.5 }));
  g.add(crownStripe(paint(0xff7a1a, 0.3), 0.14, 0.38));
  const fin = new THREE.Mesh(extrude((s) => { s.moveTo(-0.22, 0); s.lineTo(0.2, 0); s.lineTo(0.08, 0.16); s.lineTo(-0.16, 0.08); s.closePath(); }, 0.03, 0.006), paint(0xff7a1a, 0.3));
  fin.rotation.y = Math.PI / 2; fin.position.set(0, C.y + R.y + 0.03, -0.12); g.add(fin);
  for (const s of [-1, 1]) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.28), paint(0x2b3240, 0.35));
    block.position.set(s * 0.7, 0.12, -0.05); g.add(block);
    const strip = bloomy(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.03), glow(0xff8a2a)));
    strip.position.set(s * 0.78, 0.12, 0.05); g.add(strip); strips.push(strip);
  }
  const vis = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 0.2, 7, 1, true, -0.95, 1.9), tint(0xff8a2a, 0.42));
  vis.position.set(0, 0.17, -0.14); g.add(vis);
  const edge = bloomy(new THREE.Mesh(new THREE.CylinderGeometry(0.765, 0.765, 0.014, 7, 1, true, -0.95, 1.9), glow(0xffb070)));
  edge.position.set(0, 0.07, -0.14); g.add(edge);
  return { group: g, update(t) { strips.forEach((s, i) => { s.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(t * 4 + i)); }); } };
};

B.fireman = () => {
  const g = new THREE.Group();
  const red = paint(0xd8121f, 0.25);
  g.add(shell(red, { bottom: 0.4, inner: false }));
  const brim = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.64, 0.46), new THREE.Vector2(0.76, 0.41), new THREE.Vector2(0.86, 0.34)], 72), red);
  brim.material = red.clone(); brim.material.side = THREE.DoubleSide;
  brim.scale.set(1, 1, 1.25); brim.position.z = -0.14; g.add(brim);
  g.add(band(glow(0xffd400), 0.52, 0.47, { grow: 1.01 }));
  const comb = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 40, Math.PI / 2 - 0.04, 0.08, 0, Math.PI), M.gold);
  comb.scale.copy(R).multiplyScalar(1.04); comb.position.copy(C); comb.scale.y *= 1.0;
  const combBack = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 40, Math.PI * 1.5 - 0.04, 0.08, 0, thetaAt(0.42)), M.gold);
  combBack.scale.copy(R).multiplyScalar(1.04); combBack.position.copy(C);
  const combFront = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 40, Math.PI / 2 - 0.04, 0.08, 0, thetaAt(0.5)), M.gold);
  combFront.scale.copy(R).multiplyScalar(1.04); combFront.position.copy(C);
  g.add(combBack, combFront);
  // front shield badge
  const shieldGeo = extrude((s) => { s.moveTo(0, 0.22); s.quadraticCurveTo(0.16, 0.2, 0.2, 0.12); s.quadraticCurveTo(0.2, -0.08, 0, -0.22); s.quadraticCurveTo(-0.2, -0.08, -0.2, 0.12); s.quadraticCurveTo(-0.16, 0.2, 0, 0.22); }, 0.025, 0.01);
  const badge = new THREE.Mesh(shieldGeo, M.gold);
  badge.position.set(0, 0.72, onShell(0.62, 0).z + 0.08); badge.rotation.x = -0.35; g.add(badge);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), paint(0x14161c, 0.4));
  inner.position.set(0, 0.0, 0.026); badge.add(inner);
  const star = bloomy(new THREE.Mesh(extrude((s) => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.035 : 0.085, a = Math.PI / 2 + (i * Math.PI) / 5; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); }, 0.01, 0.003), glow(0xffd400)));
  star.position.set(0, 0, 0.04); badge.add(star);
  return { group: g, update() {} };
};

B.dragon = () => {
  const g = new THREE.Group(), fins = [];
  for (const s of [-1, 1]) {
    const pts = [[0.36, 0.62, 0.12], [0.48, 0.86, 0.0], [0.6, 1.02, -0.22], [0.66, 1.08, -0.5]].map(([px, py, pz]) => new THREE.Vector3(s * px, py, pz));
    g.add(new THREE.Mesh(taperedTube(pts, 0.1, 0.006, 0x3a2a4e, 0xe6dcff), M.ivory));
    const small = [[0.55, 0.42, 0.1], [0.72, 0.5, 0.0], [0.86, 0.56, -0.16]].map(([px, py, pz]) => new THREE.Vector3(s * px, py, pz));
    g.add(new THREE.Mesh(taperedTube(small, 0.05, 0.004, 0x3a2a4e, 0xe6dcff), M.ivory));
    const fin = new THREE.Mesh(extrude((sh) => { sh.moveTo(0, 0); sh.lineTo(0.3, 0.18); sh.lineTo(0.24, 0.06); sh.lineTo(0.36, 0.02); sh.lineTo(0.22, -0.06); sh.lineTo(0.3, -0.16); sh.closePath(); }, 0.015, 0.006), paint(0x7b3fe4, 0.35));
    fin.position.set(s * 0.66, 0.12, -0.05); fin.scale.x = s; fin.rotation.y = s * -0.6; g.add(fin); fins.push(fin);
  }
  for (let i = 0; i < 6; i++) {
    const y = 0.7 - i * 0.02, a = Math.PI;                       // along the crest, front to back
    const th = -0.2 + i * 0.32;                                // from just in front of the crown, running back
    const p = new THREE.Vector3(0, C.y + R.y * Math.cos(th), C.z - R.z * Math.sin(th));
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06 - i * 0.004, 0.2 - i * 0.012, 8), paint(i % 2 ? 0x2ee59d : 0x18b07a, 0.3));
    sp.position.copy(p); sp.lookAt(p.clone().sub(C).multiplyScalar(2).add(C)); sp.rotateX(Math.PI / 2);
    g.add(sp);
  }
  return { group: g, update(t) { fins.forEach((f, i) => { f.rotation.z = Math.sin(t * 4 + i) * 0.12; }); } };
};

export const HELMETS = Object.keys(B);
export function buildHelmet(id) { mats(); return B[id] ? B[id]() : null; }

// ───────────────────────────────────────────── robot buddy (orbits the head)
export function buildRoboBuddy() {
  mats();
  const g = new THREE.Group(), bot = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 24), paint(0xf4f7fa, 0.25));
  bot.add(body);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.163, 32, 16, Math.PI / 2 - 0.7, 1.4, 1.0, 1.0), paint(0x14161c, 0.15));
  bot.add(face);
  const eye = bloomy(new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), glow(0x5fe8ff)));
  eye.position.set(0, 0.0, 0.155); bot.add(eye);
  const halo = bloomy(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 48), glow(0x2e9bff)));
  halo.rotation.x = Math.PI / 2; halo.position.y = 0.06; bot.add(halo);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), M.darkSteel); ant.position.y = 0.2; bot.add(ant);
  const tip = bloomy(new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), glow(0xff3b3b))); tip.position.y = 0.27; bot.add(tip);
  g.add(bot);
  return {
    group: g,
    update(t) {
      const a = t * 1.1;
      bot.position.set(Math.sin(a) * 1.05, 0.62 + Math.sin(t * 2.3) * 0.08, C.z + Math.cos(a) * 0.95);
      bot.rotation.y = a + Math.PI / 2 * 0;
      bot.lookAt(bot.position.x * 2, bot.position.y, bot.position.z * 2 + 0.5);
      halo.rotation.z = t * 6;
      tip.material.color.setHex(Math.floor(t * 3) % 2 ? 0xff3b3b : 0xffd400);
    },
  };
}

// ───────────────────────────────────────────── head frame from landmarks
// World space = canvas pixels with y up and z toward the camera. Returns the matrix that maps head space → world.
const _v = (p, H) => new THREE.Vector3(p.x, H - p.y, -p.z);
export function headMatrix(f, H, out = new THREE.Matrix4()) {
  const P = f.P;
  const a = _v(P[234], H), b = _v(P[454], H), top = _v(P[10], H), chin = _v(P[152], H);
  const x = b.clone().sub(a); const s = x.length(); x.normalize();
  const yRaw = top.sub(chin);
  const z = new THREE.Vector3().crossVectors(x, yRaw).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  out.makeBasis(x.multiplyScalar(s), y.multiplyScalar(s), z.multiplyScalar(s));
  out.setPosition(a.add(_v(P[454], H)).multiplyScalar(0.5));
  return out;
}
// Invisible head that writes depth only, so the back of a helmet hides behind the real head.
export function buildOccluder() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ colorWrite: false }));
  m.scale.set(0.58, 0.72, 0.68); m.position.set(0, 0.14, -0.08);
  m.renderOrder = -1;
  return m;
}
export { C as HEAD_CENTER };
