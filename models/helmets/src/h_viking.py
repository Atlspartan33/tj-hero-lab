import bpy, bmesh, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("viking")

steel = mat("metal_viking_steel", (0.48, 0.5, 0.53), 1.0, 0.4)
dark = mat("metal_viking_dark", (0.2, 0.21, 0.24), 1.0, 0.4)
leather = mat("leather_viking_band", (0.3, 0.14, 0.06), 0.0, 0.62)
leather_d = mat("leather_viking_lace", (0.14, 0.06, 0.025), 0.0, 0.7)
gold = mat("gold_viking", (1.0, 0.72, 0.25), 1.0, 0.22)
liner = mat("leather_viking_liner", (0.08, 0.04, 0.02), 0.0, 0.8)
ivory = mat("ivory_viking_horn", (0.95, 0.89, 0.74), 0.0, 0.42, coat=0.3)
ivory_b = mat("ivory_viking_horn_base", (0.72, 0.6, 0.42), 0.0, 0.5, coat=0.2)
ivory_t = mat("ivory_viking_horn_tip", (0.3, 0.24, 0.17), 0.0, 0.35, coat=0.4)

TH = 0.03
ybot = lambda a: 0.42 - 0.3 * math.sin(a / 2) ** 2
def shape(u):
    peak = 0.07 * smoothstep(0.35, 1.0, u.y) ** 1.5
    return peak
offy = lambda a, t: shape(udir('y', a, t))
offx = lambda l, f: shape(udir('x', l, f))
offz = lambda s_, t: shape(udir('z', s_, t))
cap = surf("viking_cap", lambda a, t: t - theta_at(ybot(a) - 0.04), -PI, PI, 0.0, 1.85, 72, 28, frame='y', wrap=True,
           off=offy, mats=[steel, liner])
finish(cap, t=TH, bevel=0.006, inner_offset=1, seg=2)

# leather band around the rim (stands proud, covers the cap edge)
def ytop(a):
    return ybot(a) + 0.11
def ybb(a):
    return ybot(a) - 0.06
def sd_band(a, t):
    return smax(theta_at(ytop(a)) - t, t - theta_at(ybb(a)), 0.01)
band = surf("viking_band", sd_band, -PI, PI, theta_at(0.6), theta_at(-0.05), 96, 12, frame='y', wrap=True, grow=1.0,
            off=lambda a, t: offy(a, t) + 0.03, mats=[leather, liner])
finish(band, t=0.036, bevel=0.008, inner_offset=1, seg=2)
# stitched lacing lines top & bottom of the band + gold rivets
for nm, dy in (("top", 0.09), ("bot", -0.04)):
    pts = []
    for k in range(97):
        a = -PI + 2 * PI * k / 96
        t = theta_at(ybot(a) + dy)
        pts.append(ell('y', a, t, off=offy(a, t) + 0.032)[0])
    tube(f"viking_lace_{nm}", pts, 0.006, [leather_d], res=1)
for k in range(20):
    a = -PI + 2 * PI * (k + 0.5) / 20
    if abs(a) < 0.12:
        continue
    t = theta_at(ybot(a) + 0.025)
    p, n = ell('y', a, t, off=offy(a, t) + 0.034)
    lathe(f"viking_rivet{k}", [(0.0, -0.004), (0.026, 0.0), (0.022, 0.012), (0.011, 0.02), (0.0, 0.022)], 12, [gold], p, n)

# ---------------------------------------------------------------- crossing straps + top knob
lb = math.asin((ytop(0.0) - 0.02 - C.y) / R.y)
lb2 = PI - math.asin((ytop(PI) - 0.02 - C.y) / R.y)
def sd_fb(l, f):
    return smax(abs(f) - 0.055, smax(lb - l, l - lb2, 0.03), 0.02)
st1 = surf("viking_strap_fb", sd_fb, lb - 0.1, lb2 + 0.1, -0.12, 0.12, 50, 6, frame='x',
           off=lambda l, f: offx(l, f) + 0.012, mats=[dark])
finish(st1, t=0.016, bevel=0.004, seg=2)
sb = math.acos((ytop(PI / 2) - 0.02 - C.y) / R.y)
def sd_lr(s_, t):
    return smax(abs(t - PI / 2) - 0.055, abs(s_) - sb, 0.03)
st2 = surf("viking_strap_lr", sd_lr, -sb - 0.1, sb + 0.1, PI / 2 - 0.12, PI / 2 + 0.12, 40, 6, frame='z',
           off=lambda s_, t: offz(s_, t) + 0.01, mats=[dark])
finish(st2, t=0.016, bevel=0.004, seg=2)
for k, l in enumerate([0.85, 1.2, 1.95, 2.35, 2.75]):
    p, n = ell('x', l, 0.0, off=offx(l, 0.0) + 0.028)
    lathe(f"viking_srivet_fb{k}", [(0.0, -0.004), (0.02, 0.0), (0.016, 0.01), (0.008, 0.016), (0.0, 0.017)], 10, [gold], p, n)
for k, s_ in enumerate([-0.9, -0.45, 0.45, 0.9]):
    p, n = ell('z', s_, PI / 2, off=offz(s_, PI / 2) + 0.026)
    lathe(f"viking_srivet_lr{k}", [(0.0, -0.004), (0.02, 0.0), (0.016, 0.01), (0.008, 0.016), (0.0, 0.017)], 10, [gold], p, n)
ptop, ntop = ell('y', 0.0, 0.0, off=shape(Vector((0, 1, 0))))
lathe("viking_knob", [(0.0, -0.01), (0.085, -0.01), (0.08, 0.02), (0.05, 0.035), (0.035, 0.06), (0.045, 0.08),
                      (0.03, 0.1), (0.0, 0.11)], 28, [gold], ptop, (0, 1, 0))
add_bevel(bpy.data.objects["viking_knob"], 0.004, 2, 30)

# ---------------------------------------------------------------- nasal guard
pA, nA = ell('y', 0.0, theta_at(0.5), off=offy(0.0, theta_at(0.5)) + 0.05)
pB = Vector((0.0, 0.06, 0.765))
path = bez(pA, pA + Vector((0, -0.12, 0.03)), pB + Vector((0, 0.1, 0.005)), pB, 20)[::-1]
outline = []
for k in range(21):
    y = k / 20
    w = 0.036 + 0.02 * smoothstep(0.7, 1.0, y) + 0.01 * (1 - smoothstep(0.0, 0.2, y))
    outline.append((w, y))
outline = outline + [(-w, y) for (w, y) in outline[::-1]]
nas = outline_mesh("viking_nasal", outline, 0.011, 0.005, [steel])
bend_along(nas, path, (1, 0, 0), y0=0.0, y1=1.0)
add_wn(nas)
p, n = ell('y', 0.0, theta_at(0.415), off=offy(0.0, theta_at(0.415)) + 0.06)
lathe("viking_nasal_rivet", [(0.0, -0.004), (0.024, 0.0), (0.02, 0.012), (0.01, 0.019), (0.0, 0.02)], 12, [gold], p, n)

# ---------------------------------------------------------------- horns (ridged, two-tone ivory) with gold cuffs
for sx in (-1, 1):
    side = 'LR'[sx > 0]
    a0, t0 = sx * 1.45, theta_at(ybot(1.45) + 0.04)
    pb_, nb_ = ell('y', a0, t0, off=offy(a0, t0) + 0.02)
    ctrl = [pb_ - nb_ * 0.05, pb_ + Vector((sx * 0.17, 0.02, 0.06)), pb_ + Vector((sx * 0.32, 0.17, 0.14)),
            pb_ + Vector((sx * 0.36, 0.42, 0.2)), pb_ + Vector((sx * 0.27, 0.62, 0.22))]
    # smooth path through ctrl points (Catmull-Rom)
    path = []
    P = [ctrl[0]] + ctrl + [ctrl[-1]]
    for i in range(1, len(P) - 2):
        for k in range(10):
            t = k / 10
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    path.append(ctrl[-1])
    n = len(path)
    radii = []
    for i in range(n):
        u = i / (n - 1)
        r = (1 - u) ** 0.85 * 0.98 + 0.02
        r *= 1 + 0.07 * math.sin(u * 46) * (1 - u)
        radii.append(r)
    horn = tube(f"viking_horn_{side}", path, 0.125, [ivory, ivory_b, ivory_t], radii=radii, res=3)
    # material bands by distance along the horn
    me = horn.data
    mw = horn.matrix_world
    bp = [hb(q) for q in path]
    for poly in me.polygons:
        c = poly.center
        j = min(range(n), key=lambda i: (bp[i] - c).length_squared)
        u = j / (n - 1)
        poly.material_index = 1 if u < 0.16 else (2 if u > 0.8 else 0)
    add_wn(horn)
    # gold cuffs
    for k, u in enumerate((0.06, 0.15)):
        j = int(u * (n - 1))
        tdir = (path[j + 1] - path[j - 1]).normalized()
        rr = 0.125 * radii[j]
        lathe(f"viking_cuff_{side}{k}", [(rr - 0.005, -0.022), (rr + 0.016, -0.02), (rr + 0.022, 0.0), (rr + 0.016, 0.02), (rr - 0.005, 0.022)],
              28, [gold], path[j], tdir)

finalize_coll()
print("tris", tri_count("viking")[0])
