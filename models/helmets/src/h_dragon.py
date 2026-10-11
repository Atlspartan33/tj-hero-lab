import bpy, math, importlib, sys, random
import numpy as np
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("dragon")
random.seed(7)

# ---------------------------------------------------------------- baked scale textures (colour + normal), param-space UVs
T1 = 2.65
W, H = 1024, 512
NCOL, NROW = 48, 28
def make_scale_maps():
    xs = (np.arange(W) + 0.5) / W
    ys = (np.arange(H) + 0.5) / H
    U, Vv = np.meshgrid(xs * NCOL, ys * NROW)
    row = np.floor(Vv)
    off = (row % 2) * 0.5
    uu = np.mod(U + off, 1.0)
    v = Vv - row
    edge = np.sqrt(np.clip(1 - (2 * uu - 1) ** 2, 0, 1)) * 0.85 + 0.15
    inside = v < edge
    h_in = 0.35 + 0.65 * np.power(np.clip(v / edge, 0, 1), 0.8) * (1 - 0.35 * (2 * uu - 1) ** 2)
    h_out = 0.1 + 0.25 * np.clip((v - edge) / np.maximum(1 - edge, 1e-3), 0, 1)
    h = np.where(inside, h_in, h_out)
    # per-scale tint variation
    col_id = np.floor(U + off) + 1000 * row
    rnd = np.mod(np.sin(col_id * 12.9898) * 43758.5453, 1.0)
    # colour: deep purple grooves -> violet ridges with a cooler edge highlight
    c_lo = np.array([0.06, 0.012, 0.12])
    c_hi = np.array([0.24, 0.05, 0.46])
    c_edge = np.array([0.42, 0.22, 0.78])
    t = np.clip(h, 0, 1)[..., None]
    col = c_lo * (1 - t) + c_hi * t
    rim = (inside & (v > edge - 0.12))[..., None] * 0.6
    col = col * (1 - rim) + c_edge * rim
    col = col * (0.85 + 0.3 * rnd[..., None])
    # normal from height
    k = 6.0
    dhdx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * (W / NCOL) / 2 / 12.0
    dhdy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * (H / NROW) / 2 / 12.0
    nx, ny, nz = -dhdx * k, -dhdy * k, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, nz / ln * 0.5 + 0.5], axis=-1)
    def to_img(name, arr, srgb):
        img = bpy.data.images.get(name)
        if img:
            bpy.data.images.remove(img)
        img = bpy.data.images.new(name, W, H, alpha=False)
        if not srgb:
            img.colorspace_settings.name = 'Non-Color'
        rgba = np.concatenate([arr, np.ones((H, W, 1))], axis=-1).astype(np.float32)
        if srgb:
            rgba[..., :3] = np.where(rgba[..., :3] <= 0.0031308, rgba[..., :3] * 12.92, 1.055 * np.power(rgba[..., :3], 1 / 2.4) - 0.055)
        img.pixels.foreach_set(rgba.ravel())
        img.file_format = 'PNG'
        img.filepath_raw = r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src\%s.png" % name
        img.save()
        img.pack()
        return img
    return to_img("dragon_scales_col", col, True), to_img("dragon_scales_nrm", nrm, False)
tex_c, tex_n = make_scale_maps()

purple = mat("paint_dragon_scales", (1, 1, 1), 0.0, 0.32, coat=0.6, tex=tex_c, normal_tex=tex_n, normal_strength=1.0)
lav = mat("paint_dragon_lavender", (0.55, 0.3, 0.9), 0.0, 0.3, coat=0.8)
lav_d = mat("paint_dragon_violet", (0.26, 0.06, 0.5), 0.0, 0.3, coat=0.8)
green = mat("paint_dragon_green", (0.02, 0.6, 0.25), 0.0, 0.3, coat=0.8)
lime = mat("paint_dragon_lime", (0.55, 0.95, 0.15), 0.0, 0.3, coat=0.8)
membrane = mat("paint_dragon_membrane", (0.1, 0.55, 0.5), 0.0, 0.4, coat=0.4)
horn_b = mat("ivory_dragon_horn_base", (0.12, 0.08, 0.16), 0.0, 0.4, coat=0.4)
horn_m = mat("ivory_dragon_horn", (0.62, 0.55, 0.5), 0.0, 0.4, coat=0.4)
horn_t = mat("ivory_dragon_horn_tip", (0.96, 0.93, 0.85), 0.0, 0.35, coat=0.4)
gold = mat("gold_dragon", (1.0, 0.74, 0.25), 1.0, 0.2)
liner = mat("leather_dragon_liner", (0.05, 0.02, 0.06), 0.0, 0.8)
g_gem = glow("glow_dragon_gem", (0.2, 1.0, 0.45), 5.0)

# ---------------------------------------------------------------- scaled hood shell with a dragon brow
TH = 0.034
ybot = lambda a: -0.42 + 0.2 * math.cos(a / 2) ** 2
def tb(a):
    # brow line: V-dip at the centre, raised peaks over each eye
    y = 0.45 - 0.07 * math.exp(-(a / 0.13) ** 2) + 0.025 * math.exp(-((abs(a) - 0.42) / 0.14) ** 2)
    return theta_at(y)
def a_edge(t):
    y = C.y + R.y * math.cos(t)
    return 0.8 + 0.42 * smoothstep(0.08, -0.34, y)
def sd_open(a, t):
    return smax(abs(a) - a_edge(t), tb(a) - t, 0.05)
def sd_shell(a, t):
    return smax(t - theta_at(ybot(a)), -sd_open(a, t), 0.05)
def shape(u):
    ridge = 0.03 * math.exp(-(u.x / 0.1) ** 2) * smoothstep(0.96, 0.75, u.z) * smoothstep(-0.6, -0.1, u.y)
    brows = 0.035 * math.exp(-(((abs(u.x) - 0.3) / 0.12) ** 2 + ((u.y - 0.36) / 0.08) ** 2))
    return ridge + brows
offy = lambda a, t: shape(udir('y', a, t))
shell = surf("dragon_shell", sd_shell, -PI, PI, 0.0, T1, 80, 46, frame='y', wrap=True, off=offy, mats=[purple, liner])
finish(shell, t=TH, bevel=0.006, inner_offset=1, seg=2)
lp = loop_of(shell)
pts = smooth_pts(resample([p - n * TH * 0.5 for (p, n, _) in lp], 0.03, cyclic=True), 2, cyclic=True)
tube("dragon_lip", pts, TH * 0.62, [lav_d], cyclic=True, res=2)

# overlapping edge scales around the face opening (two staggered rows)
def on_open(p, n, prm):
    a, t = prm
    return abs(sd_open(a, t)) < abs(t - theta_at(ybot(a))) + 0.01
runs = sub_loop(lp, on_open)
run = max(runs, key=len)
rp = resample([p for (p, n, _) in run], 0.055)
scale_ol = []
for k in range(13):
    u = k / 12
    ang = PI * (1 - u)
    scale_ol.append((0.04 * math.cos(ang), -0.012 - 0.05 * math.sin(ang) ** 1.3))
scale_ol = scale_ol + [(0.0, 0.05)]
for row in (0, 1):
    for k in range(len(rp) - 1):
        if row == 1 and k % 1 == 0 and k == len(rp) - 2:
            continue
        q = rp[k].lerp(rp[k + 1], 0.5 if row == 1 else 0.0)
        pq, nq = ell_project(q)
        a_ = math.atan2(pq.x, pq.z)
        t_ = math.acos(clamp((pq.y - C.y) / R.y, -1, 1))
        nq = ell('y', a_, t_, off=offy(a_, t_))[1]
        tang = (rp[min(k + 1, len(rp) - 1)] - rp[max(k - 1, 0)]).normalized()
        inward = nq.cross(tang)
        # make "inward" point away from the opening (into the shell)
        test = ell_project(q + inward * 0.05)[0]
        ta = math.atan2(test.x, test.z)
        tt = math.acos(clamp((test.y - C.y) / R.y, -1, 1))
        if sd_open(ta, tt) < 0:
            inward = -inward
        anchor = pq + nq * offy(a_, t_) + inward * (0.045 + 0.05 * row)
        sc = outline_mesh(f"dragon_escale{row}_{k}", scale_ol, 0.004, 0.005, [lav if (k + row) % 2 else lav_d], bres=1)
        place_local(sc, anchor, nq, inward, scale=1.0 - 0.15 * row, conform=(C, R, 1.0, shape), lift=0.004 + 0.012 * (1 - row))

# ---------------------------------------------------------------- forehead gem
tg = tb(0.0) - 0.07
pg, ng = ell('y', 0.0, tg, off=offy(0.0, tg))
lathe("dragon_gem_setting", [(0.0, -0.01), (0.07, -0.01), (0.075, 0.01), (0.06, 0.03), (0.045, 0.03), (0.04, 0.012), (0.0, 0.012)],
      24, [gold], pg, ng)
lathe("pulse_dragon_gem", [(0.0, 0.0), (0.042, 0.005), (0.044, 0.018), (0.028, 0.045), (0.0, 0.055)], 8, [g_gem], pg + ng * 0.01, ng,
      smooth=False)

# ---------------------------------------------------------------- crest spikes along the midline (green -> lime tips)
def blade(hgt, base):
    ol = []
    N = 12
    for k in range(N + 1):         # front edge: base-front -> tip (convex, sweeping back)
        u = k / N
        ol.append((-base / 2 + base * 0.95 * u ** 1.6, hgt * math.sin(u * PI / 2)))
    tip = ol[-1]
    for k in range(1, N):          # back edge: tip -> base-back (concave)
        u = 1 - k / N
        x = base / 2 * (1 - u) + tip[0] * u - 0.18 * base * math.sin(u * PI)
        y = tip[1] * u
        ol.append((x, y))
    ol.append((base / 2, 0.0))
    return ol
spikes = [(0.62, 0.17, 0.15), (0.95, 0.22, 0.17), (1.28, 0.24, 0.18), (1.62, 0.23, 0.17), (1.95, 0.2, 0.16), (2.28, 0.16, 0.14),
          (2.58, 0.12, 0.12)]
for k, (l, hgt, base) in enumerate(spikes):
    ol = blade(hgt, base)
    sp = outline_mesh(f"dragon_spike{k}", ol, 0.012, 0.006, [green, lime], bres=1)
    for poly in sp.data.polygons:
        poly.material_index = 1 if poly.center.y > hgt * 0.62 else 0
    p, n = ell('x', l, 0.0, off=shape(udir('x', l, 0.0)) - 0.01)
    place_local(sp, p, Vector((1, 0, 0)), n, back=False)
    add_wn(sp)

# ---------------------------------------------------------------- horns: dark base -> ivory tips, ridged, sweeping back
def horn(name, base_a, base_y, ctrl_off, r0):
    t0 = theta_at(base_y)
    pb_, nb_ = ell('y', base_a, t0, off=offy(base_a, t0))
    ctrl = [pb_ - nb_ * 0.03] + [pb_ + Vector(c) for c in ctrl_off]
    P = [ctrl[0]] + ctrl + [ctrl[-1]]
    path = []
    for i in range(1, len(P) - 2):
        for k in range(8):
            t = k / 8
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    path.append(ctrl[-1])
    n = len(path)
    radii = [((1 - i / (n - 1)) ** 0.9 * 0.97 + 0.03) * (1 + 0.06 * math.sin(i / (n - 1) * 40) * (1 - i / (n - 1))) for i in range(n)]
    h = tube(name, path, r0, [horn_b, horn_m, horn_t], radii=radii, res=3)
    bp = [hb(q) for q in path]
    for poly in h.data.polygons:
        j = min(range(n), key=lambda i: (bp[i] - poly.center).length_squared)
        u = j / (n - 1)
        poly.material_index = 0 if u < 0.3 else (1 if u < 0.7 else 2)
    add_wn(h)
    return h, path, radii
for sx in (-1, 1):
    side = 'LR'[sx > 0]
    horn(f"dragon_horn_{side}", sx * 0.62, 0.6, [(sx * 0.1, 0.13, -0.02), (sx * 0.2, 0.28, -0.2), (sx * 0.24, 0.33, -0.45),
                                               (sx * 0.2, 0.26, -0.7)], 0.085)
    horn(f"dragon_hornlet_{side}", sx * 1.25, 0.32, [(sx * 0.1, 0.04, -0.06), (sx * 0.16, 0.08, -0.2), (sx * 0.14, 0.06, -0.34)], 0.05)

# ---------------------------------------------------------------- fin ears (sway): ribbed membranes
for sx in (-1, 1):
    side = 'LR'[sx > 0]
    a, t = sx * (PI / 2 + 0.12), theta_at(0.08)
    pr, nr = ell('y', a, t, off=offy(a, t))
    piv = pr + nr * 0.02
    sw = pivot_empty(f"sway_dragon_fin_{side}", piv)
    tips = [(0.3, 0.3), (0.42, 0.12), (0.4, -0.05), (0.3, -0.18)]
    ol = [(0.0, 0.05)]
    for k, (tx, ty) in enumerate(tips):
        ol.append((tx, ty))
        if k < len(tips) - 1:
            nx, ny = tips[k + 1]
            mx, my = (tx + nx) / 2, (ty + ny) / 2
            ol.append((mx * 0.78, my * 0.78))
    ol.append((0.0, -0.06))
    mem = outline_mesh(f"dragon_membrane_{side}", ol, 0.004, 0.003, [membrane], bres=1)
    nW = Vector((sx * 0.85, 0.0, 0.5)).normalized()
    back = Vector((0, 0, -1))
    T, B, N = frame_from(nW, (0, 1, 0))
    # place so local +x points backward
    flip = 1 if T.z < 0 else -1
    me = mem.data
    for v in me.vertices:
        x, y, z = v.co
        v.co = hb(piv + T * (x * flip) + B * y + N * z)
    me.update()
    reparent(mem, sw)
    for k, (tx, ty) in enumerate(tips):
        rib = [piv + T * (tx * flip * u) + B * (ty * u) + N * (0.006 + 0.02 * math.sin(u * PI) * 0.3) for u in (0.0, 0.33, 0.66, 1.0)]
        rb = tube(f"dragon_rib_{side}{k}", rib, 0.011, [lav_d], radii=[1.0, 0.8, 0.55, 0.25], res=1)
        reparent(rb, sw)
    lb = lathe(f"dragon_finroot_{side}", [(0.0, -0.01), (0.06, -0.01), (0.065, 0.015), (0.045, 0.035), (0.0, 0.04)], 20, [lav_d], pr, nr)

finalize_coll()
print("tris", tri_count("dragon")[0])
