import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("mech")

white = mat("paint_mech_white", (0.9, 0.91, 0.93), 0.0, 0.3, coat=0.8)
orange = mat("paint_mech_orange", (1.0, 0.3, 0.02), 0.0, 0.28, coat=1.0)
under = mat("metal_mech_under", (0.1, 0.11, 0.13), 0.9, 0.38)
block = mat("paint_mech_graphite", (0.13, 0.14, 0.17), 0.0, 0.35, coat=0.6)
liner = mat("rubber_mech_liner", (0.03, 0.03, 0.035), 0.0, 0.8)
visor_m = mat("glass_mech_visor", (1.0, 0.45, 0.05), 0.0, 0.03, alpha=0.42, spec=1.0)
g_or = glow("glow_mech_orange", (1.0, 0.5, 0.1), 5.0)

TB = theta_at(0.42)
ybot = lambda a: -0.46 + 0.2 * math.cos(a / 2) ** 2
def a_edge(t):
    y = C.y + R.y * math.cos(t)
    return 0.8 + 0.42 * smoothstep(0.08, -0.34, y)
def sd_open(a, t, g=0.0):
    return smax(abs(a) - a_edge(t) - g, TB - g - t, 0.05)
def keep_base(a, t, g=0.0):
    return smax(t - theta_at(ybot(a)) + g, -sd_open(a, t, g), 0.04)
def facet(u):
    # crisp angular sculpt: a raised brow shelf and flattened temple planes
    brow = 0.03 * smoothstep(0.82, 0.95, u.z) * smoothstep(0.15, 0.3, u.y) * (1 - smoothstep(0.55, 0.75, u.y))
    cheek = 0.02 * smoothstep(0.55, 0.8, abs(u.x)) * (1 - smoothstep(0.1, 0.4, u.y))
    return brow + cheek

# under-shell (dark), visible through the panel gaps
base = surf("mech_under", lambda a, t: keep_base(a, t, 0.0), -PI, PI, 0.0, 2.65, 72, 40, frame='y', wrap=True,
            grow=0.985, mats=[under, liner])
finish(base, t=0.03, bevel=0.004, inner_offset=1, seg=1)

# armour plates (white), separated by gaps
G = 0.035
def U(a, t):
    return udir('y', a, t)
def sd_crown(l, f):
    u = udir('x', l, f)
    t = math.acos(clamp(u.y, -1, 1))
    a = math.atan2(u.x, u.z)
    return smax(smax(abs(u.x) - 0.33, -0.7 - u.z, 0.05), G - sd_open(a, t), 0.05)
def sd_side(a, t, sx):
    u = U(a, t)
    return smax(smax(0.33 + G - sx * u.x, keep_base(a, t, G), 0.04), -0.62 - u.z, 0.05)
def sd_back(a, t):
    u = U(a, t)
    return smax(u.z + 0.7 + G, keep_base(a, t, G), 0.04)
offf = lambda a, t: facet(U(a, t))
cr = surf("mech_plate_crown", sd_crown, 0.1, 3.0, -0.45, 0.45, 64, 16, frame='x', off=lambda l, f: facet(udir('x', l, f)), mats=[white, liner])
finish(cr, t=0.035, bevel=0.007, inner_offset=1, seg=2)
for sx in (-1, 1):
    sd = surf(f"mech_plate_side_{'LR'[sx > 0]}", lambda a, t, sx=sx: sd_side(a, t, sx), -PI, PI, 0.0, 2.65, 72, 40, frame='y',
              wrap=True, off=offf, mats=[white, liner])
    finish(sd, t=0.035, bevel=0.007, inner_offset=1, seg=2)
bk = surf("mech_plate_back", sd_back, -PI, PI, 0.0, 2.65, 72, 40, frame='y', wrap=True, off=offf, mats=[white, liner])
finish(bk, t=0.035, bevel=0.007, inner_offset=1, seg=2)

# ---------------------------------------------------------------- orange crown stripe + fin
offx = lambda l, f: facet(udir('x', l, f))
def sd_st(l, f):
    return smax(abs(f) - (0.07 + 0.03 * smoothstep(1.0, 2.2, l)), smax(0.52 - l, l - 2.3, 0.05), 0.03)
st = surf("mech_stripe", sd_st, 0.4, 2.4, -0.15, 0.15, 48, 8, frame='x', grow=1.0, off=lambda l, f: offx(l, f) + 0.012, mats=[orange])
finish(st, t=0.014, bevel=0.004, seg=1)
# fin: angular blade rising from the stripe toward the back
fin_ol = [(-0.26, 0.0), (0.2, 0.0), (0.14, 0.05), (-0.02, 0.2), (-0.1, 0.2), (-0.06, 0.1), (-0.2, 0.05)]
fin = outline_mesh("mech_fin", [(x * 1.45, y * 1.45) for (x, y) in fin_ol], 0.018, 0.007, [orange], bres=1)
lf = 1.55
pf, nf = ell('x', lf, 0.0, off=offx(lf, 0.0) + 0.02)
tang = (ell('x', lf + 0.01, 0.0)[0] - ell('x', lf - 0.01, 0.0)[0]).normalized()     # toward the back
me = fin.data
for v in me.vertices:
    x, y, z = v.co
    q = pf + tang * x + nf * (y - 0.01) + Vector((1, 0, 0)) * z
    if y < 0.02:
        q = ell_project(q)[0] + nf * (y + 0.012)
    v.co = hb(q)
me.update()
add_wn(fin)
fin_glow = outline_mesh("glow_mech_fin", [(x * 1.45, y * 1.45) for (x, y) in [(-0.04, 0.06), (0.1, 0.06), (0.06, 0.09), (-0.03, 0.15)]], 0.019, 0.002, [g_or], bres=1)
me = fin_glow.data
for v in me.vertices:
    x, y, z = v.co
    v.co = hb(pf + tang * x + nf * y + Vector((1, 0, 0)) * z * 1.15)
me.update()

# ---------------------------------------------------------------- side blocks with glowing strips + vents
for sx in (-1, 1):
    side = 'LR'[sx > 0]
    a, t = sx * (PI / 2 + 0.05), theta_at(0.1)
    p, n = ell('y', a, t, off=facet(U(a, t)) + 0.02)
    ol = []
    for (cx, cy, a0) in [(0.09, 0.15, 0), (-0.11, 0.15, PI / 2), (-0.11, -0.15, PI), (0.09, -0.15, 1.5 * PI)]:
        for k in range(4):
            aa = a0 + (PI / 2) * k / 3
            ol.append((cx + 0.04 * math.cos(aa), cy + 0.04 * math.sin(aa)))
    blk = outline_mesh(f"mech_block_{side}", ol, 0.06, 0.012, [block], bres=2)
    fwd = Vector((0, 0, 1))
    place_local(blk, p, n, (0, 1, 0), lift=-0.04)
    add_wn(blk)
    T, B, N = frame_from(n, (0, 1, 0))
    # bevelled face plate
    fp = outline_mesh(f"mech_blockface_{side}", [(x * 0.82, y * 0.86) for (x, y) in ol], 0.008, 0.008, [white], bres=2)
    place_local(fp, p + N * 0.1, n, (0, 1, 0), lift=0.0)
    add_wn(fp)
    # glowing strip (forward edge) + three vents
    xs = 0.075 * (1 if (T.z > 0) else -1)
    stp = outline_mesh(f"pulse_mech_strip_{side}", [(-0.014, -0.15), (0.014, -0.15), (0.014, 0.15), (-0.014, 0.15)], 0.006, 0.004, [g_or], bres=1)
    place_local(stp, p + N * 0.12 + T * xs, n, (0, 1, 0), lift=0.0)
    for k in range(3):
        y0 = -0.08 + k * 0.08
        q = [p + N * 0.125 + T * (-xs * 0.2 + dx) + B * y0 for dx in (-0.07 * (1 if T.z > 0 else -1), 0.0)]
        tube(f"mech_vent_{side}{k}", [q[0], q[1]], 0.011, [liner], res=1)
    # small hex bolts
    for k, (bx, by) in enumerate([(-0.1, 0.16), (-0.1, -0.16)]):
        bp = p + N * 0.115 + T * (bx * (1 if T.z > 0 else -1)) + B * by
        lathe(f"mech_bolt_{side}{k}", [(0.0, 0.0), (0.018, 0.0), (0.018, 0.012), (0.0, 0.014)], 6, [under], bp, N)

# ---------------------------------------------------------------- faceted orange visor
NF = 8
cvz, rvx, rvz = -0.08, 0.76, 0.88
angs = [-1.22 + 2.44 * k / NF for k in range(NF + 1)]
yb, yt = 0.02, 0.31
verts, faces = [], []
for k, a in enumerate(angs):
    x, z = rvx * math.sin(a), cvz + rvz * math.cos(a)
    verts.append((x, yb, z))
    verts.append((x * 0.97, yt, cvz + (z - cvz) * 0.95))
for k in range(NF):
    faces.append([2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1])
vis = mesh_obj("glass_mech_visor", verts, faces, [visor_m], smooth=False)
add_solid(vis, 0.012, offset=0.0)
add_bevel(vis, 0.003, 1, 20)
# frame around the visor (dark) + glow edge along the bottom
fr = []
for k, a in enumerate(angs):
    x, z = rvx * math.sin(a), cvz + rvz * math.cos(a)
    fr.append(Vector((x, yb - 0.004, z)))
top = []
for k, a in enumerate(angs):
    x, z = rvx * math.sin(a), cvz + rvz * math.cos(a)
    top.append(Vector((x * 0.97, yt + 0.004, cvz + (z - cvz) * 0.95)))
tube("mech_visor_frame_bot", fr, 0.014, [block], res=1)
tube("mech_visor_frame_top", top, 0.016, [white], res=1)
tube("glow_mech_visor_edge", [q + Vector((0, 0.022, 0.012)) for q in fr[1:-1]], 0.005, [g_or], res=1)
for sx in (-1, 1):
    end = fr[-1] if sx > 0 else fr[0]
    endt = top[-1] if sx > 0 else top[0]
    tube(f"mech_visor_side_{'LR'[sx > 0]}", [end, endt], 0.016, [block], res=1)
    mid = (end + endt) / 2
    a_b, t_b = sx * (PI / 2 + 0.05), theta_at(0.12)
    pbk, nbk = ell('y', a_b, t_b, off=0.08)
    T_, B_, N_ = frame_from(nbk, (0, 1, 0))
    tgt = pbk + T_ * (0.1 * (1 if T_.z > 0 else -1))
    tube(f"mech_visor_arm_{'LR'[sx > 0]}", [mid, mid.lerp(tgt, 0.5) + nbk * 0.02, tgt], 0.022, [block], res=1)

# orange chevrons on the back plate
for k in range(2):
    l = 3.2 + k * 0.12
    pts = [ell('x', l + 0.06 * abs(f) / 0.2, f, off=facet(udir('x', l, f)) + 0.006)[0] for f in [-0.2 + 0.4 * i / 12 for i in range(13)]]
    tube(f"mech_chevron{k}", pts, 0.016, [orange], res=1)

finalize_coll()
print("tris", tri_count("mech")[0])
