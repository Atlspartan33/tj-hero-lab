import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("diver")

brass = mat("brass_diver", (0.78, 0.52, 0.2), 1.0, 0.3)
bright = mat("brass_diver_bright", (0.98, 0.78, 0.38), 1.0, 0.18)
copper = mat("brass_diver_copper", (0.86, 0.42, 0.24), 1.0, 0.26)
rubber = mat("rubber_diver_gasket", (0.05, 0.04, 0.035), 0.0, 0.6)
liner = mat("rubber_diver_inner", (0.06, 0.05, 0.04), 0.0, 0.8)
gl = mat("glass_diver_window", (0.8, 0.95, 1.0), 0.0, 0.02, alpha=0.1, spec=1.0)
gl_side = mat("glass_diver_side", (0.4, 0.8, 0.95), 0.0, 0.02, alpha=0.3, spec=1.0)
g_lamp = glow("glow_diver_lamp", (1.0, 0.92, 0.6), 5.0)

DC, DR = Vector((0.0, 0.02, 0.0)), Vector((0.97, 1.0, 0.97))
TW = 0.63                       # window half-angle around +z
Y_NECK = -0.8
TH = 0.04
def ang_front(u):
    return math.acos(clamp(u.z, -1, 1))
def sd_dome(a, t):
    u = udir('y', a, t)
    win = TW - ang_front(u)
    bot = t - theta_at(Y_NECK, DC, DR)
    sides = []
    for sx in (-1, 1):
        d = Vector((sx * 0.97, 0.06, 0.22)).normalized()
        sides.append(0.2 - math.acos(clamp(u.dot(d), -1, 1)))
    return smax(smax(bot, win, 0.03), max(sides), 0.02)
dome = surf("diver_dome", sd_dome, -PI, PI, 0.0, theta_at(Y_NECK, DC, DR) + 0.06, 88, 44, frame='y', wrap=True,
            c=DC, r=DR, mats=[brass, liner])
finish(dome, t=TH, bevel=0.006, inner_offset=1, seg=2)

# riveted seam rings around the dome (raised copper bands)
for k, (yy) in enumerate((0.62,)):
    pass

def ring_at(name, axis, ang, radius_tube, mats_, dome_off=0.0, n=96):
    """Tube following the circle where the angle from `axis` equals `ang`, on the dome."""
    ax = Vector(axis).normalized()
    ref = Vector((0, 1, 0)) if abs(ax.y) < 0.9 else Vector((1, 0, 0))
    e1 = ref.cross(ax).normalized()
    e2 = ax.cross(e1)
    pts = []
    for k in range(n):
        phi = 2 * PI * k / n
        u = (ax * math.cos(ang) + (e1 * math.cos(phi) + e2 * math.sin(phi)) * math.sin(ang)).normalized()
        p = Vector((DC.x + DR.x * u.x, DC.y + DR.y * u.y, DC.z + DR.z * u.z))
        nn = Vector((u.x / DR.x, u.y / DR.y, u.z / DR.z)).normalized()
        pts.append((p + nn * dome_off, nn))
    return pts

# ---------------------------------------------------------------- front window: glass, thick frame, bolts
wp = ring_at("w", (0, 0, 1), TW, 0, [])
cpt = sum((p for p, n in wp), Vector()) / len(wp)
wr = sum(((p - cpt).length for p, n in wp)) / len(wp)
glass = surf("glass_diver_window", lambda a, t: math.acos(clamp(udir('y', a, t).z, -1, 1)) - (TW + 0.03), -1.0, 1.0,
             PI / 2 - 0.9, PI / 2 + 0.9, 40, 40, frame='y', c=DC, r=DR, grow=1.03, mats=[gl])
finish(glass, t=0.01, bevel=0.002, offset=0.0, seg=1)
# frame: lathe ring around the window axis
lathe("diver_window_frame", [(wr - 0.035, -0.06), (wr + 0.07, -0.06), (wr + 0.095, -0.03), (wr + 0.1, 0.02), (wr + 0.085, 0.05),
                             (wr + 0.02, 0.06), (wr - 0.03, 0.05), (wr - 0.045, 0.02)], 72, [bright],
      cpt + Vector((0, 0, 0.0)), (0, 0, 1))
lathe("diver_window_inner", [(wr - 0.05, 0.0), (wr - 0.02, 0.0), (wr - 0.02, 0.07), (wr - 0.05, 0.07)], 72, [copper],
      cpt, (0, 0, 1))
fz = cpt.z + 0.05
for k in range(12):
    a = 2 * PI * (k + 0.5) / 12
    p = Vector((cpt.x + math.cos(a) * (wr + 0.06), cpt.y + math.sin(a) * (wr + 0.06), fz))
    lathe(f"diver_bolt{k}", [(0.0, 0.0), (0.03, 0.0), (0.03, 0.022), (0.022, 0.03), (0.0, 0.03)], 6, [brass], p, (0, 0, 1))
    lathe(f"diver_boltpin{k}", [(0.0, 0.0), (0.011, 0.0), (0.011, 0.045), (0.0, 0.05)], 8, [bright], p, (0, 0, 1))

# ---------------------------------------------------------------- side portholes with guard bars
for sx in (-1, 1):
    side = 'LR'[sx > 0]
    d = Vector((sx * 0.97, 0.06, 0.22)).normalized()
    sp = ring_at("s", d, 0.2, 0, [])
    c_ = sum((p for p, n in sp), Vector()) / len(sp)
    r_ = sum(((p - c_).length for p, n in sp)) / len(sp)
    lathe(f"diver_port_frame_{side}", [(r_ - 0.03, -0.04), (r_ + 0.06, -0.04), (r_ + 0.075, -0.01), (r_ + 0.07, 0.03), (r_ + 0.02, 0.045),
                                       (r_ - 0.03, 0.035)], 48, [bright], c_, d)
    lathe(f"glass_diver_port_{side}", [(0.0, 0.0), (r_, 0.0), (r_, 0.012)] + [(r_ * math.cos(j / 6 * PI / 2), 0.012 + 0.03 * math.sin(j / 6 * PI / 2)) for j in range(1, 6)] + [(0.0, 0.042)],
          32, [gl_side], c_, d)
    ref = Vector((0, 1, 0))
    e1 = ref.cross(d).normalized()
    e2 = d.cross(e1)
    for k in (-1, 0, 1):
        q0 = c_ + e2 * (k * r_ * 0.45) + e1 * (r_ + 0.02) + d * 0.06
        q1 = c_ + e2 * (k * r_ * 0.45) - e1 * (r_ + 0.02) + d * 0.06
        mid = (q0 + q1) / 2 + d * 0.035
        tube(f"diver_bar_{side}{k}", [q0, (q0 + mid) / 2 + d * 0.012, mid, (q1 + mid) / 2 + d * 0.012, q1], 0.012, [copper], res=1)
    for k in range(6):
        a = 2 * PI * k / 6
        p = c_ + (e1 * math.cos(a) + e2 * math.sin(a)) * (r_ + 0.035) + d * 0.04
        lathe(f"diver_pbolt_{side}{k}", [(0.0, 0.0), (0.02, 0.0), (0.02, 0.016), (0.0, 0.02)], 6, [brass], p, d)

# ---------------------------------------------------------------- seam bands on the dome (copper, riveted)
for k, (axis, ang) in enumerate([((0, 1, 0), 0.62)]):
    pts = ring_at("b", axis, ang, 0, [])
    tube("diver_seam_top", [p + n * 0.006 for p, n in pts], 0.016, [copper], cyclic=True, res=1)
    for j in range(0, len(pts), 6):
        p, n = pts[j]
        lathe(f"diver_seamrivet{j}", [(0.0, -0.004), (0.014, 0.0), (0.01, 0.012), (0.0, 0.016)], 8, [bright], p + n * 0.012, n)

# ---------------------------------------------------------------- top valve with spinning hand-wheel
ptop = Vector((DC.x, DC.y + DR.y, DC.z)) + Vector((0, -0.01, -0.08))
lathe("diver_valve", [(0.0, -0.02), (0.14, -0.02), (0.14, 0.01), (0.1, 0.03), (0.075, 0.05), (0.075, 0.1), (0.09, 0.11),
                      (0.09, 0.13), (0.05, 0.14), (0.04, 0.2), (0.0, 0.2)], 36, [bright], ptop, (0, 1, 0))
add_bevel(bpy.data.objects["diver_valve"], 0.004, 2, 30)
wheel_c = ptop + Vector((0, 0.21, 0))
sp = pivot_empty("spin_diver_wheel", wheel_c)
w1 = lathe("diver_wheel_rim", [(0.11, -0.012), (0.13, -0.012), (0.135, 0.0), (0.13, 0.012), (0.11, 0.012), (0.105, 0.0)], 40, [copper],
           wheel_c, (0, 1, 0))
reparent(w1, sp)
hub = lathe("diver_wheel_hub", [(0.0, -0.018), (0.03, -0.018), (0.03, 0.018), (0.0, 0.02)], 16, [bright], wheel_c, (0, 1, 0))
reparent(hub, sp)
for k in range(5):
    a = 2 * PI * k / 5
    q0 = wheel_c + Vector((math.cos(a), 0, math.sin(a))) * 0.03
    q1 = wheel_c + Vector((math.cos(a), 0, math.sin(a))) * 0.11
    t_ = tube(f"diver_spoke{k}", [q0, q1], 0.009, [copper], res=1)
    reparent(t_, sp)
    kn = lathe(f"diver_knob{k}", [(0.0, 0.0), (0.016, 0.0), (0.018, 0.02), (0.012, 0.04), (0.0, 0.042)], 10, [bright],
               wheel_c + Vector((math.cos(a), 0, math.sin(a))) * 0.125, (0, 1, 0))
    reparent(kn, sp)

# headlamp above the window
pl = Vector((0.0, cpt.y + wr + 0.25, 0.0))
pl, nl = ell_project(pl + Vector((0, 0, 1.0)), DC, DR)
fwd = Vector((0, 0.1, 1)).normalized()
lathe("diver_lamp", [(0.0, -0.04), (0.06, -0.04), (0.075, 0.0), (0.075, 0.06), (0.068, 0.07), (0.0, 0.07)], 28, [bright],
      pl + nl * 0.01, fwd)
lathe("glow_diver_lamp", [(0.0, 0.066), (0.06, 0.066)] + [(0.06 * math.cos(j / 5 * PI / 2), 0.066 + 0.025 * math.sin(j / 5 * PI / 2)) for j in range(1, 5)] + [(0.0, 0.092)],
      24, [g_lamp], pl + nl * 0.01, fwd)

# ---------------------------------------------------------------- neck ring + breastplate collar
rn = math.sin(theta_at(Y_NECK, DC, DR)) * DR.x
lathe("diver_neckring", [(rn - 0.04, Y_NECK + 0.05), (rn + 0.07, Y_NECK + 0.05), (rn + 0.08, Y_NECK + 0.02), (rn + 0.08, Y_NECK - 0.06),
                         (rn - 0.04, Y_NECK - 0.06)], 72, [bright], (0, 0, DC.z), (0, 1, 0))
YC = -0.98
lathe("diver_collar", [(rn + 0.02, Y_NECK - 0.05), (rn + 0.12, YC + 0.06), (0.86, YC + 0.0), (0.98, YC - 0.05), (1.0, YC - 0.09),
                       (0.97, YC - 0.11), (0.85, YC - 0.07), (rn + 0.08, YC + 0.0), (rn - 0.02, Y_NECK - 0.07)], 72, [brass, liner],
      (0, 0, DC.z), (0, 1, 0))
lathe("diver_gasket", [(0.95, YC - 0.08), (1.02, YC - 0.08), (1.03, YC - 0.12), (0.95, YC - 0.12)], 72, [rubber], (0, 0, DC.z), (0, 1, 0))
for k in range(12):
    a = 2 * PI * (k + 0.5) / 12
    d = Vector((math.sin(a), 0, math.cos(a)))
    p = Vector((0, YC - 0.03, DC.z)) + d * 0.9
    nn = (Vector((0, 1, 0)) * 0.95 + d * 0.3).normalized()
    lathe(f"diver_cbolt{k}", [(0.0, 0.0), (0.03, 0.0), (0.03, 0.02), (0.02, 0.03), (0.0, 0.03)], 6, [bright], p, nn)
    # wing nut
    wn_ = outline_mesh(f"diver_wingnut{k}", [(-0.05, 0.0), (-0.045, 0.02), (-0.015, 0.012), (0.015, 0.012), (0.045, 0.02), (0.05, 0.0),
                                             (0.015, -0.006), (-0.015, -0.006)], 0.006, 0.004, [bright])
    place_local(wn_, p + nn * 0.03, d.cross(Vector((0, 1, 0))), nn, lift=0.0, back=False)
# air hose fitting at the back
pb, nb = ell_project(Vector((0.18, -0.15, -1.0)), DC, DR)
lathe("diver_airfit", [(0.0, -0.02), (0.08, -0.02), (0.08, 0.03), (0.055, 0.05), (0.055, 0.12), (0.07, 0.13), (0.07, 0.16), (0.045, 0.17),
                       (0.0, 0.17)], 28, [bright], pb, nb)

finalize_coll()
print("tris", tri_count("diver")[0])
