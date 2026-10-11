import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("thunder")

gold = mat("gold_thunder", (1.0, 0.74, 0.26), 1.0, 0.2)
gold_d = mat("gold_thunder_deep", (0.85, 0.52, 0.14), 1.0, 0.28)
navy = mat("metal_thunder_navy", (0.04, 0.07, 0.2), 0.85, 0.3)
liner = mat("leather_thunder_liner", (0.1, 0.05, 0.03), 0.0, 0.7)
blue = mat("paint_thunder_blue", (0.0, 0.25, 1.0), 0.0, 0.2, coat=1.0)
g_bolt = glow("glow_thunder_bolt", (0.45, 0.85, 1.0), 5.0)
pearl = mat("pearl_thunder_feather", (0.72, 0.74, 0.82), 0.1, 0.42, coat=0.3, sheen=0.15)
pearl2 = mat("pearl_thunder_feather_tip", (0.5, 0.62, 0.9), 0.1, 0.42, coat=0.3, sheen=0.15)

TH = 0.032
TB = theta_at(0.43)
def ybot(a):
    aa = abs(a)
    return 0.03 - 0.17 * math.exp(-((aa - 1.15) / 0.2) ** 2) - 0.12 * smoothstep(1.7, 3.0, aa)
A_E = 0.86
def sd_open(a, t):
    return smax(abs(a) - A_E, TB - t, 0.06)
def sd_shell(a, t):
    return smax(t - theta_at(ybot(a)), -sd_open(a, t), 0.05)
def shape(u):
    crest = 0.05 * math.exp(-(u.x / 0.075) ** 2) * smoothstep(0.98, 0.72, u.z) * smoothstep(-0.5, 0.1, u.y)
    peak = 0.03 * smoothstep(0.5, 1.0, u.y)
    return crest + peak
offy = lambda a, t: shape(udir('y', a, t))

shell = surf("thunder_shell", sd_shell, -PI, PI, 0.0, 2.2, 80, 36, frame='y', wrap=True, off=offy,
             mats=[gold, liner])
finish(shell, t=TH, bevel=0.006, inner_offset=1, seg=2)
lp = loop_of(shell)
pts = smooth_pts(resample([p - n * TH * 0.5 for (p, n, _) in lp], 0.026, cyclic=True), 2, cyclic=True)
tube("thunder_lip", pts, TH * 0.66, [navy], cyclic=True, res=2)

# brow band (navy) across the forehead, tapering into the wing roots
t0b, t1b = theta_at(0.535), theta_at(0.43)
def sd_band(a, t):
    w = (t1b - t0b) / 2 * (1 - 0.45 * smoothstep(0.6, 1.45, abs(a)))
    return smax(abs(t - (t0b + t1b) / 2 - 0.25 * (t1b - t0b) * smoothstep(0.6, 1.45, abs(a))) - w, abs(a) - 1.5, 0.05)
band = surf("thunder_band", sd_band, -1.7, 1.7, t0b - 0.1, t1b + 0.1, 60, 8, frame='y', off=lambda a, t: shape(udir('y', a, t)) + 0.014,
            mats=[navy])
finish(band, t=0.018, bevel=0.005, seg=2)
# gold studs on the band
for k in range(-4, 5):
    if k == 0:
        continue
    a = k * 0.27
    tm = (t0b + t1b) / 2 + 0.25 * (t1b - t0b) * smoothstep(0.6, 1.45, abs(a))
    p, n = ell('y', a, tm, off=shape(udir('y', a, tm)) + 0.03)
    lathe(f"thunder_stud{k}", [(0.0, -0.004), (0.02, 0.0), (0.016, 0.01), (0.008, 0.016), (0.0, 0.017)], 12, [gold], p, n)

# ---------------------------------------------------------------- lightning bolt emblem on the forehead
bolt = [(0.05, 0.25), (-0.125, -0.025), (-0.01, -0.025), (-0.06, -0.25), (0.125, 0.04), (0.01, 0.04)]
ty = theta_at(0.7)
pc, nc = ell('y', 0.0, ty, off=shape(udir('y', 0.0, ty)))
b1 = outline_mesh("thunder_bolt", [(x * 0.9, y * 0.9) for (x, y) in bolt], 0.012, 0.008, [blue])
place_local(b1, pc, nc, (0, 1, 0), conform=(C, R, 1.0, shape), lift=0.02)
add_wn(b1)
# inner glowing bolt, a touch smaller and proud of the blue
cx = sum(x for x, y in bolt) / len(bolt)
cy = sum(y for x, y in bolt) / len(bolt)
b2 = outline_mesh("pulse_thunder_bolt", [((x - cx) * 0.62 + cx, (y - cy) * 0.62 + cy) for (x, y) in bolt], 0.004, 0.003, [g_bolt])
place_local(b2, pc, nc, (0, 1, 0), scale=0.9, conform=(C, R, 1.0, shape), lift=0.052)
# gold rim plate under the bolt (diamond shield)
dia = [(0.0, 0.33), (0.2, 0.0), (0.0, -0.33), (-0.2, 0.0)]
dia = [(x * (1 + 0.0), y) for (x, y) in dia]
d1 = outline_mesh("thunder_bolt_plate", dia, 0.008, 0.012, [gold_d], bres=3)
place_local(d1, pc, nc, (0, 1, 0), conform=(C, R, 1.0, shape), lift=-0.004)
add_wn(d1)

# ---------------------------------------------------------------- pearl feather wings (sway)
for sx in (-1, 1):
    side = 'LR'[sx > 0]
    ar, tr = sx * 1.42, theta_at(0.47)
    pr, nr = ell('y', ar, tr, off=shape(udir('y', ar, tr)))
    lathe(f"thunder_wingroot_{side}", [(0.0, -0.01), (0.1, -0.01), (0.105, 0.012), (0.085, 0.03), (0.05, 0.042), (0.0, 0.046)],
          28, [gold], pr, nr)
    lathe(f"thunder_wingstud_{side}", [(0.0, 0.03), (0.035, 0.03), (0.03, 0.05), (0.0, 0.058)], 16, [blue], pr, nr)
    pivot = pr + nr * 0.03
    sw = pivot_empty(f"sway_thunder_wing_{side}", pivot)
    nW = Vector((sx * 0.62, 0.0, 0.78)).normalized()
    e2 = Vector((0, 1, 0))
    e1 = Vector((sx * 0.78, 0.0, -0.62)).normalized()    # outward + back, in the wing plane
    layers = [  # (angle deg, length, width, z-layer, material)
        (-4, 0.56, 0.11, 0.0, pearl2), (12, 0.70, 0.12, 0.0, pearl2), (28, 0.78, 0.125, 0.0, pearl2),
        (44, 0.76, 0.125, 0.0, pearl2), (60, 0.64, 0.12, 0.0, pearl2), (74, 0.5, 0.11, 0.0, pearl2),
        (4, 0.40, 0.1, 0.014, pearl), (22, 0.48, 0.11, 0.014, pearl), (40, 0.48, 0.11, 0.014, pearl), (58, 0.4, 0.1, 0.014, pearl),
        (14, 0.24, 0.09, 0.026, pearl), (36, 0.26, 0.09, 0.026, pearl), (56, 0.22, 0.085, 0.026, pearl),
    ]
    for k, (ang, ln, wd, zl, m) in enumerate(layers):
        ln *= 0.84
        r = math.radians(ang)
        d = (e1 * math.cos(r) + e2 * math.sin(r)).normalized()
        outline = []
        N = 16
        for j in range(N + 1):
            y = j / N
            w = wd * (0.35 + 0.65 * math.sin(PI * min(1, 0.15 + y * 0.9)) ** 0.6) * (1 - 0.6 * smoothstep(0.75, 1.0, y))
            outline.append((w * 0.55, y))
        tipp = [(0.0, 1.04)]
        outline = [(x, y) for (x, y) in outline] + tipp + [(-x * 1.25, y) for (x, y) in outline[::-1]]
        f = outline_mesh(f"thunder_feather_{side}{k}", outline, 0.004, 0.003, [m], bres=1)
        p0 = pivot + nW * zl
        p3 = p0 + d * ln - nW * (0.08 * ln) + e2 * 0.06 * ln
        p1 = p0 + d * ln * 0.35
        p2 = p0 + d * ln * 0.7 - nW * 0.03 + e2 * 0.06 * ln
        path = bez(p0, p1, p2, p3, 14)
        bend_along(f, path, lambda u, d=d: nW.cross(d) * sx, y0=0.0, y1=1.04, cup=2.5)
        reparent(f, sw)
        tq = tube(f"thunder_shaft_{side}{k}", [Vector(q) + nW * 0.004 for q in path[:12:2]], 0.0045, [gold], res=1)
        reparent(tq, sw)

for sx in (-1, 1):
    pts = []
    for k in range(40):
        l = 0.62 + (2.75 - 0.62) * k / 39
        f = sx * 0.13
        pts.append(ell('x', l, f, off=shape(udir('x', l, f)) + 0.001)[0])
    tube(f"thunder_inlay_{'LR'[sx > 0]}", pts, 0.008, [navy], res=1)

finalize_coll()
print("tris", tri_count("thunder")[0])
