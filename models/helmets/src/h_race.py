import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("race")

red = mat("paint_race_red", (0.78, 0.02, 0.04), 0.0, 0.18, coat=1.0, coat_rough=0.03)
white = mat("paint_race_white", (0.92, 0.92, 0.93), 0.0, 0.2, coat=1.0)
black = mat("paint_race_black", (0.015, 0.016, 0.02), 0.0, 0.25, coat=1.0)
rubber = mat("rubber_race_trim", (0.02, 0.02, 0.025), 0.0, 0.65)
liner = mat("fabric_race_liner", (0.05, 0.05, 0.06), 0.0, 0.9)
gold = mat("gold_race_star", (1.0, 0.78, 0.15), 1.0, 0.18)
chrome = mat("chrome_race", (0.9, 0.92, 0.95), 1.0, 0.12)
smoke = mat("glass_race_visor", (0.08, 0.1, 0.16), 0.0, 0.03, alpha=0.66, spec=1.0)

TH = 0.04
TB = theta_at(0.44)
ybot = lambda a: -0.62 + 0.2 * math.cos(a / 2) ** 2
def a_edge(t):
    y = C.y + R.y * math.cos(t)
    return 0.82 + 0.4 * smoothstep(0.05, -0.3, y)
def sd_open(a, t):
    return smax(abs(a) - a_edge(t), TB - t, 0.09)
def sd_shell(a, t):
    return smax(t - theta_at(ybot(a)), -sd_open(a, t), 0.06)
def shape(u):
    tail = 0.035 * math.exp(-((u.y + 0.35) / 0.25) ** 2) * smoothstep(0.0, -0.8, u.z)
    crown = 0.015 * smoothstep(0.3, 1.0, u.y)
    return tail + crown
offy = lambda a, t: shape(udir('y', a, t))
offx = lambda l, f: shape(udir('x', l, f))

shell = surf("race_shell", sd_shell, -PI, PI, 0.0, 2.85, 80, 46, frame='y', wrap=True, off=offy, mats=[red, liner])
finish(shell, t=TH, bevel=0.007, inner_offset=1, seg=2)
lp = loop_of(shell)
pts = smooth_pts(resample([p - n * TH * 0.5 for (p, n, _) in lp], 0.03, cyclic=True), 2, cyclic=True)
tube("race_lip", pts, TH * 0.66, [rubber], cyclic=True, res=2)

# ---------------------------------------------------------------- racing stripes (white | black | white), layered
L0, L1 = 0.42, 3.5
def stripe_sd(lo, hi):
    def f(l, ff):
        return smax(smax(lo - abs(ff), abs(ff) - hi, 0.0005), smax(L0 - l, l - L1, 0.05), 0.02)
    return f
for nm, lo, hi, m, lift in (("race_stripe_black", -1.0, 0.045, black, 0.007), ("race_stripe_white", 0.068, 0.12, white, 0.007)):
    if lo < 0:
        sd = lambda l, ff: smax(abs(ff) - hi, smax(L0 - l, l - L1, 0.05), 0.02)
        s_ = surf(nm, sd, L0 - 0.1, L1 + 0.1, -0.08, 0.08, 64, 6, frame='x', off=lambda l, ff: offx(l, ff) + lift, mats=[m])
        finish(s_, t=0.008, bevel=0.003, seg=1)
    else:
        for sx in (-1, 1):
            c0 = sx * (lo + hi) / 2
            hw = (hi - lo) / 2
            sd = lambda l, ff, c0=c0, hw=hw: smax(abs(ff - c0) - hw, smax(L0 - l, l - L1, 0.05), 0.02)
            s_ = surf(f"{nm}_{'LR'[sx > 0]}", sd, L0 - 0.1, L1 + 0.1, c0 - 0.08, c0 + 0.08, 64, 6, frame='x',
                      off=lambda l, ff: offx(l, ff) + lift, mats=[m])
            finish(s_, t=0.008, bevel=0.003, seg=1)

# ---------------------------------------------------------------- checkered band around the back
y_hi, y_lo = -0.1, -0.26
t_hi, t_lo = theta_at(y_hi), theta_at(y_lo)
NC = 44
a0c, a1c = 1.32, 2 * PI - 1.32
def sd_chk(a, t):
    aa = a % (2 * PI)
    return smax(abs(t - (t_hi + t_lo) / 2) - (t_lo - t_hi) / 2, smax(a0c - aa, aa - a1c, 0.0005), 0.0005)
def fm_chk(a, t):
    aa = a % (2 * PI)
    i = int((aa - a0c) / (a1c - a0c) * NC)
    j = int((t - t_hi) / (t_lo - t_hi) * 2)
    return (i + j) % 2
chk = surf("race_checker", sd_chk, a0c, a1c, t_hi, t_lo, NC * 2, 4, frame='y', off=lambda a, t: offy(a, t) + 0.006,
           mats=[white, black], face_mat=fm_chk, relax=0)
finish(chk, t=0.007, bevel=0.002, seg=1)
for nm, tt in (("hi", t_hi - 0.012), ("lo", t_lo + 0.012)):
    pts = [ell('y', a, tt, off=offy(a, tt) + 0.008)[0] for a in [a0c + (a1c - a0c) * k / 80 for k in range(81)]]
    tube(f"race_chk_line_{nm}", pts, 0.006, [chrome], res=1)

# ---------------------------------------------------------------- gold stars on the sides
star = star_pts(5, 0.045, 0.11)
for sx in (-1, 1):
    a, t = sx * 1.72, theta_at(0.16)
    p, n = ell('y', a, t, off=offy(a, t))
    s_ = outline_mesh(f"race_star_{'LR'[sx > 0]}", star, 0.008, 0.008, [gold], bres=2)
    place_local(s_, p, n, (0, 1, 0), conform=(C, R, 1.0, shape), lift=0.0)
    add_wn(s_)
    # small white outline star behind
    s2 = outline_mesh(f"race_starbg_{'LR'[sx > 0]}", star_pts(5, 0.06, 0.14), 0.003, 0.004, [white], bres=1)
    place_local(s2, p, n, (0, 1, 0), conform=(C, R, 1.0, shape), lift=-0.002)

# ---------------------------------------------------------------- flipped-up smoked visor + pivots
GV = 1.075
tv0, tv1 = theta_at(0.86, grow=GV), theta_at(0.47, grow=GV)
def sd_vis(a, t):
    return sd_rbox(a, t, 0.0, (tv0 + tv1) / 2, 1.18, (tv1 - tv0) / 2, 0.14)
vis = surf("glass_race_visor", sd_vis, -1.45, 1.45, tv0 - 0.15, tv1 + 0.15, 48, 12, frame='y', grow=GV, mats=[smoke])
finish(vis, t=0.012, bevel=0.003, offset=0.0, seg=1)
vl = loop_of(vis)
vf = smooth_pts(resample([p for (p, n, _) in vl], 0.03, cyclic=True), 1, cyclic=True)
tube("race_visor_frame", vf, 0.013, [black], cyclic=True, res=1)
# lift tab
pt, nt_ = ell('y', 0.0, tv1 + 0.01, grow=GV)
tab = outline_mesh("race_visor_tab", [(-0.06, 0.0), (0.06, 0.0), (0.045, -0.04), (-0.045, -0.04)], 0.006, 0.006, [black])
place_local(tab, pt, nt_, (0, 1, 0), lift=-0.006)
for sx in (-1, 1):
    a = sx * 1.3
    t = theta_at(0.5)
    p, n = ell('y', a, t, off=offy(a, t))
    lathe(f"race_pivot_{'LR'[sx > 0]}", [(0.0, -0.01), (0.075, -0.01), (0.075, 0.025), (0.06, 0.04), (0.035, 0.045), (0.0, 0.045)],
          28, [black], p, n)
    lathe(f"race_pivot_cap_{'LR'[sx > 0]}", [(0.0, 0.03), (0.032, 0.03), (0.03, 0.05), (0.0, 0.054)], 20, [chrome], p, n)
    # arm from pivot into the visor side
    pv, nv = ell('y', sx * 1.18, (tv0 + tv1) / 2 + 0.08, grow=GV)
    arm = [p + n * 0.02, (p + n * 0.02).lerp(pv, 0.5) + n * 0.02, pv]
    tube(f"race_visor_arm_{'LR'[sx > 0]}", arm, 0.016, [black], res=1)

# ---------------------------------------------------------------- spoiler on the back
lsp = 2.42
ps, ns_ = ell('x', lsp, 0.0, off=offx(lsp, 0.0))
foil = [(0.13 * math.cos(a) - 0.0, 0.025 * math.sin(a) * (1.0 if math.sin(a) > 0 else 0.45)) for a in [2 * PI * k / 28 for k in range(28)]]
# airfoil profile (chord along x local, thickness y local), extruded along local z (= head x)
foil = []
for k in range(24):
    u = k / 23
    x = 0.14 - 0.28 * u
    th = 0.03 * math.sqrt(max(0.0, 1 - (2 * u - 1) ** 2)) * (1.2 - 0.6 * u)
    foil.append((x, th))
for k in range(1, 23):
    u = 1 - k / 23
    x = 0.14 - 0.28 * u
    th = 0.012 * math.sqrt(max(0.0, 1 - (2 * u - 1) ** 2))
    foil.append((x, -th))
wing = outline_mesh("race_spoiler", [(x * 1.25, y * 1.25) for (x, y) in foil], 0.3, 0.008, [black], bres=1)
back = Vector((0, 0.2, -1.0)).normalized()
# local x = chord (toward back), local y = up, local z = span (head x)
me = wing.data
up = ns_
chord = (Vector((0, -0.1, -1)) - up * Vector((0, -0.1, -1)).dot(up)).normalized()
span = Vector((1, 0, 0))
base = ps + up * 0.085
for v in me.vertices:
    x, y, z = v.co
    v.co = hb(base + chord * x + up * y + span * z)
me.update()
add_wn(wing)
for sx in (-1, 1):
    q0 = ell_project(ps + span * (sx * 0.16))[0] + up * (shape(up) - 0.01)
    q1 = base + span * (sx * 0.16) - up * 0.01
    strut = [q0, q0.lerp(q1, 0.5) - chord * 0.01, q1]
    tube(f"race_strut_{'LR'[sx > 0]}", strut, 0.017, [black], res=1)
    # end plates
    ep = outline_mesh(f"race_endplate_{'LR'[sx > 0]}", [(0.16, -0.05), (-0.17, -0.02), (-0.15, 0.07), (0.12, 0.05)], 0.004, 0.004, [red])
    me = ep.data
    for v in me.vertices:
        x, y, z = v.co
        v.co = hb(base + chord * x * 1.2 + up * y * 1.2 + span * (sx * 0.31 + z))
    me.update()

# ---------------------------------------------------------------- top air scoops
for sx in (-1, 1):
    l, f = 0.95, sx * 0.24
    p, n = ell('x', l, f, off=offx(l, f))
    sc_ = outline_mesh(f"race_scoop_{'LR'[sx > 0]}", [(-0.05, -0.08), (0.05, -0.08), (0.04, 0.08), (-0.04, 0.08)], 0.012, 0.012, [black], bres=2)
    place_local(sc_, p, n, (0, 1, 0) if False else Vector((0, 0.3, -1.0)), conform=(C, R, 1.0, shape), lift=-0.004)
    add_wn(sc_)
    for k in range(3):
        a = -0.025 + k * 0.025
        q = [p + Vector((a, 0, 0)) + Vector((0, 0.25, -0.97)).normalized() * (s * 0.06) + n * 0.03 for s in (-0.8, 0.0, 0.8)]
        tube(f"race_slot_{'LR'[sx > 0]}{k}", q, 0.006, [rubber], res=1)

finalize_coll()
print("tris", tri_count("race")[0])
