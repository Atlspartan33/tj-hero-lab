import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("knight")

steel = mat("metal_knight_steel", (0.62, 0.64, 0.68), 1.0, 0.3)
dark = mat("metal_knight_dark", (0.22, 0.24, 0.28), 1.0, 0.34)
gold = mat("gold_knight", (1.0, 0.72, 0.28), 1.0, 0.2)
liner = mat("leather_knight_liner", (0.12, 0.05, 0.025), 0.0, 0.7)
reds = [mat(f"fabric_knight_plume{k}", c, 0.0, 0.62, sheen=0.15, coat=0.0) for k, c in
        enumerate([(0.42, 0.005, 0.01), (0.28, 0.0, 0.008), (0.6, 0.02, 0.012)])]
ivory = mat("ivory_knight_quill", (0.95, 0.9, 0.78), 0.0, 0.4)

TH = 0.034
TB = theta_at(0.41)
ybot = lambda a: -0.5 + 0.2 * math.cos(a / 2) ** 2
def a_edge(t):
    y = C.y + R.y * math.cos(t)
    return 0.80 + 0.40 * smoothstep(0.05, -0.30, y)
def sd_open(a, t):
    return smax(abs(a) - a_edge(t), TB - t, 0.07)
def sd_shell(a, t):
    return smax(t - theta_at(ybot(a)), -sd_open(a, t), 0.06)
def shape(u):
    comb = 0.045 * math.exp(-(u.x / 0.05) ** 2) * smoothstep(0.97, 0.7, u.z) * smoothstep(-0.65, -0.15, u.y)
    peak = 0.035 * smoothstep(0.55, 1.0, u.y)
    flare = 0.06 * smoothstep(-0.25, -0.85, u.y) * smoothstep(0.3, -0.7, u.z)
    cheek = 0.025 * smoothstep(-0.05, -0.6, u.y)
    return comb + peak + flare + cheek
offy = lambda a, t: shape(udir('y', a, t))

shell = surf("knight_shell", sd_shell, -PI, PI, 0.0, 2.7, 72, 42, frame='y', wrap=True, off=offy,
             mats=[steel, liner])
finish(shell, t=TH, bevel=0.006, inner_offset=1, seg=2)

# edge trims: gold rolled edge around the face, dark steel along the bottom
lp = loop_of(shell)
def on_open(p, n, prm):
    a, t = prm
    return abs(sd_open(a, t)) < abs(t - theta_at(ybot(a))) + 0.01
for k, run in enumerate(sub_loop(lp, on_open)):
    pts = smooth_pts(resample([p - n * TH * 0.5 for (p, n, _) in run], 0.025), 2)
    tube(f"knight_trim_face{k}", pts, TH * 0.7, [gold], res=2)
for k, run in enumerate(sub_loop(lp, lambda p, n, prm: not on_open(p, n, prm))):
    pts = smooth_pts(resample([p - n * TH * 0.5 for (p, n, _) in run], 0.03), 2)
    tube(f"knight_trim_neck{k}", pts, TH * 0.62, [dark], res=2)

# ---------------------------------------------------------------- brow band with rivets
t_top, t_bot = theta_at(0.515), theta_at(0.42)
def sd_band(a, t):
    return abs(t - (t_top + t_bot) / 2) - (t_bot - t_top) / 2
band = surf("knight_band", sd_band, -PI, PI, t_top - 0.1, t_bot + 0.1, 96, 6, frame='y', wrap=True,
            grow=1.0, off=lambda a, t: shape(udir('y', a, t)) + 0.018, mats=[dark])
finish(band, t=0.02, bevel=0.005, seg=2)
tm = (t_top + t_bot) / 2
for k in range(26):
    a = -PI + 2 * PI * (k + 0.5) / 26
    if abs(a) < 0.15:
        continue
    p, n = ell('y', a, tm, off=shape(udir('y', a, tm)) + 0.018)
    lathe(f"knight_rivet{k}", [(0.0, -0.004)] + [(0.021 * math.sin(j / 3 * PI / 2), 0.016 * math.cos(j / 3 * PI / 2)) for j in range(3, 0, -1)] + [(0.0, 0.016)],
          10, [gold], p, n)

# ---------------------------------------------------------------- nasal guard (bent plate hanging from the band)
pA, nA = ell('y', 0.0, theta_at(0.52), off=shape(udir('y', 0.0, theta_at(0.52))) + 0.03)
pB = Vector((0.0, 0.07, 0.765))
path = bez(pA, pA + Vector((0, -0.14, 0.035)), pB + Vector((0, 0.12, 0.005)), pB, 24)
outline = []
for k in range(25):
    y = k / 24
    w = 0.034 + 0.04 * (1 - smoothstep(0.0, 0.3, y)) + 0.01 * smoothstep(0.75, 0.95, y)
    outline.append((w, -y))
tip = [(0.042 * math.cos(a), -1.0 - 0.035 * math.sin(a)) for a in [PI * j / 8 for j in range(1, 8)]]
outline = outline + tip[::-1][::-1] + [(-x, y) for (x, y) in outline[::-1]]
# fix tip ordering: right side down, round tip from right to left, left side up
outline = [(w, y) for (w, y) in outline[:25]] + [(0.042 * math.cos(-a), -1.0 - 0.035 * math.sin(a)) for a in [PI * j / 8 for j in range(1, 8)]] + [(-w, y) for (w, y) in outline[:25][::-1]]
nas = outline_mesh("knight_nasal", outline, 0.011, 0.005, [steel])
bend_along(nas, path, (1, 0, 0), y0=-1.035, y1=0.0)
# flip so local y=0 is the top: bend_along maps y0->path start; our outline runs 0 (top) to -1 (bottom)
add_wn(nas)
# ridge rivet at the top of the nasal
p, n = ell('y', 0.0, tm, off=shape(udir('y', 0.0, tm)) + 0.035)

# cheek breathing holes: small dark recessed dots in two rows
for sx in (-1, 1):
    for r_, (yy, aa) in enumerate([(y, a) for y in (-0.04, -0.13) for a in (1.12, 1.24, 1.36)]):
        a = sx * (aa + 0.15 * smoothstep(0.0, -0.3, yy))
        t = theta_at(yy)
        p, n = ell('y', a, t, off=shape(udir('y', a, t)) + 0.02)
        lathe(f"knight_hole_{'LR'[sx > 0]}{r_}", [(0.0, 0.0), (0.016, 0.0), (0.016, 0.004), (0.011, 0.006), (0.0, 0.006)],
              12, [dark], p - n * 0.002, n)

# ---------------------------------------------------------------- plume holder + feather plume (sways)
lam = 1.72
ph, nh = ell('x', lam, 0.0, off=shape(udir('x', lam, 0.0)))
ax = (nh + Vector((0, 0.1, -0.35))).normalized()
lathe("knight_plume_holder", [(0.0, -0.01), (0.07, -0.01), (0.075, 0.01), (0.06, 0.03), (0.045, 0.05),
                              (0.05, 0.075), (0.062, 0.095), (0.058, 0.11), (0.0, 0.11)], 28, [gold], ph, ax)
add_bevel(bpy.data.objects["knight_plume_holder"], 0.004, 2, 30)
pivot = ph + ax * 0.1
sway = pivot_empty("sway_knight_plume", pivot)
feathers = [
    # (side offset, lift, length, color)
    (0.0, 0.12, 1.4, 0), (-0.05, 0.08, 1.3, 1), (0.05, 0.08, 1.3, 1), (-0.1, 0.02, 1.18, 2),
    (0.1, 0.02, 1.18, 2), (-0.025, 0.18, 1.22, 2), (0.025, 0.18, 1.22, 0), (0.0, -0.04, 1.05, 1),
    (-0.14, -0.04, 1.1, 0), (0.14, -0.04, 1.1, 0),
]
for k, (sx, lift, ln, ci) in enumerate(feathers):
    outline = []
    N = 20
    for j in range(N + 1):
        y = j / N
        w = 0.095 * math.sin(PI * min(1.0, y ** 0.75 * 1.02)) ** 0.7 + 0.006
        if 0.15 < y < 0.95:
            w *= 1.0 - 0.22 * ((y * 18) % 1.0)
        outline.append((w, y))
    outline = outline + [(-w, y) for (w, y) in outline[::-1]][1:-1]
    f = outline_mesh(f"knight_feather{k}", outline, 0.003, 0.0025, [reds[ci]], bres=1)
    p0 = pivot - ax * 0.02
    p1 = pivot + Vector((sx * 0.8, 0.2 + lift * 0.7, 0.04)) * ln
    p2 = pivot + Vector((sx * 2.2, 0.21 + lift * 0.7, -0.36)) * ln
    p3 = pivot + Vector((sx * 3.0, 0.02 + lift * 0.5, -0.62)) * ln
    path = bez(p0, p1, p2, p3, 24)
    bend_along(f, path, lambda u, sx=sx: Vector((1.0, sx * 2.5, 0.0)), y0=0.0, y1=1.0, scale=ln, cup=3.0)
    reparent(f, sway)
    # quill spine
    sp = [Vector(q) for q in path[:20:2]]
    tq = tube(f"knight_quill{k}", sp, 0.006, [ivory], radii=[1.0 - 0.8 * i / 9 for i in range(10)], res=1)
    reparent(tq, sway)

# ---------------------------------------------------------------- reinforcing straps (front-back + side-to-side) with rivets
lb = math.asin((0.515 - C.y) / R.y)
def sd_fb(l, f):
    return smax(abs(f) - 0.05, smax(lb - 0.02 - l, l - (PI - lb + 0.02), 0.03), 0.02)
st1 = surf("knight_strap_fb", sd_fb, lb - 0.1, PI - lb + 0.1, -0.12, 0.12, 60, 6, frame='x',
           off=lambda l, f: shape(udir('x', l, f)) + 0.012, mats=[dark])
finish(st1, t=0.016, bevel=0.004, seg=2)
sb = math.acos((0.515 - C.y) / R.y)
def sd_lr(s_, t):
    return smax(abs(t - PI / 2) - 0.05, abs(s_) - sb - 0.02, 0.03)
st2 = surf("knight_strap_lr", sd_lr, -sb - 0.1, sb + 0.1, PI / 2 - 0.12, PI / 2 + 0.12, 50, 6, frame='z',
           off=lambda s_, t: shape(udir('z', s_, t)) + 0.01, mats=[dark])
finish(st2, t=0.016, bevel=0.004, seg=2)
for k, l in enumerate([0.75, 1.05, 2.15, 2.45]):
    p, n = ell('x', l, 0.0, off=shape(udir('x', l, 0.0)) + 0.028)
    lathe(f"knight_srivet_fb{k}", [(0.0, -0.004), (0.018, 0.0), (0.014, 0.01), (0.007, 0.015), (0.0, 0.016)], 12, [gold], p, n)
for k, s_ in enumerate([-0.85, -0.5, 0.5, 0.85]):
    p, n = ell('z', s_, PI / 2, off=shape(udir('z', s_, PI / 2)) + 0.026)
    lathe(f"knight_srivet_lr{k}", [(0.0, -0.004), (0.018, 0.0), (0.014, 0.01), (0.007, 0.015), (0.0, 0.016)], 12, [gold], p, n)

# ---------------------------------------------------------------- hinged cheek plates (layered, gold-edged)
for sx in (-1, 1):
    side = 'LR'[sx > 0]
    def sd_cheek(a, t, sx=sx):
        aa = sx * a
        y = C.y + R.y * math.cos(t)
        front = a_edge(t) + 0.07 - aa
        back = aa - (a_edge(t) + 0.62)
        top = theta_at(0.36) - t
        bot = t - theta_at(ybot(a)) + 0.05
        return smax(smax(front, back, 0.06), smax(top, bot, 0.06), 0.06)
    a_lo, a_hi = (0.7, 2.3) if sx > 0 else (-2.3, -0.7)
    ck = surf(f"knight_cheek_{side}", sd_cheek, a_lo, a_hi, theta_at(0.45), theta_at(-0.5), 30, 26, frame='y',
              off=lambda a, t: shape(udir('y', a, t)) + 0.02, mats=[steel])
    finish(ck, t=0.018, bevel=0.004, seg=2)
    lp2 = loop_of(ck)
    pts = smooth_pts(resample([p - n * 0.009 for (p, n, _) in lp2], 0.025, cyclic=True), 2, cyclic=True)
    tube(f"knight_cheek_trim_{side}", pts, 0.013, [gold], cyclic=True, res=1)
    # hinge rivet at top
    a = sx * (a_edge(theta_at(0.3)) + 0.35)
    p, n = ell('y', a, theta_at(0.3), off=shape(udir('y', a, theta_at(0.3))) + 0.038)
    lathe(f"knight_hinge_{side}", [(0.0, -0.004), (0.026, 0.0), (0.022, 0.012), (0.01, 0.019), (0.0, 0.02)], 16, [gold], p, n)

finalize_coll()
print("tris", tri_count("knight")[0])
