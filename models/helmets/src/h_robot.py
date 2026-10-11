import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("robot")

chrome = mat("chrome_robot", (0.92, 0.94, 0.97), 1.0, 0.12)
gun = mat("metal_robot_gunmetal", (0.18, 0.2, 0.24), 1.0, 0.32)
blue = mat("paint_robot_blue", (0.02, 0.18, 0.85), 0.0, 0.25, coat=1.0, coat_rough=0.04)
liner = mat("rubber_robot_liner", (0.035, 0.04, 0.05), 0.0, 0.8)
cyan_glass = mat("glass_robot_visor", (0.1, 0.75, 1.0), 0.0, 0.03, alpha=0.45, spec=1.0)
g_cyan = glow("glow_robot_cyan", (0.35, 0.92, 1.0), 5.0)
g_blue = glow("glow_robot_ring", (0.15, 0.6, 1.0), 6.0)
g_red = glow("glow_robot_bulb", (1.0, 0.12, 0.1), 6.0)

# ---------------------------------------------------------------- main shell
TH = 0.036
ybot = lambda a: -0.44 + 0.2 * math.cos(a / 2) ** 2
def a_edge(t):
    y = C.y + R.y * math.cos(t)
    return 0.80 + 0.42 * smoothstep(0.08, -0.34, y)
TB = theta_at(0.43)
def sd_open(a, t):
    return smax(abs(a) - a_edge(t), TB - t, 0.07)
def sd_shell(a, t):
    return smax(t - theta_at(ybot(a)), -sd_open(a, t), 0.06)
def ridge(u):
    # raised crown ridge (under the stripe), fades out toward the brow and down the back
    return 0.034 * math.exp(-(u.x / 0.17) ** 2) * smoothstep(0.97, 0.78, u.z) * smoothstep(-0.55, -0.1, u.y)
def brow_bulge(a, t):
    # subtle forward brow ridge + crown ridge
    return 0.022 * math.exp(-((t - TB + 0.06) / 0.09) ** 2) * math.exp(-(a / 0.9) ** 2) + ridge(udir('y', a, t))

shell = surf("robot_shell", sd_shell, -PI, PI, 0.0, 2.65, 80, 44, frame='y', wrap=True,
             off=brow_bulge, mats=[chrome, liner])
finish(shell, t=TH, bevel=0.006, inner_offset=1, seg=2)

# rolled lip around the whole edge (real thickness, toy-like bumper)
lp = loop_of(shell)
pts = [p - n * (TH * 0.5) for (p, n, _) in lp]
pts = smooth_pts(resample(pts, 0.03, cyclic=True), 2, cyclic=True)
tube("robot_lip", pts, TH * 0.62, [gun], cyclic=True, res=2)

# ---------------------------------------------------------------- crown stripe (blue, tapered) + glow rail
def w_str(l):
    return 0.10 + 0.06 * smoothstep(0.9, 2.6, l)
def sd_stripe(l, f):
    return smax(abs(f) - w_str(l), smax(0.50 - l, l - 2.95, 0.08), 0.06)
roff = lambda l, f: ridge(udir('x', l, f))
stripe = surf("robot_stripe", sd_stripe, 0.35, 3.9, -0.3, 0.3, 60, 14, frame='x', grow=1.022,
              mats=[blue], off=roff)
finish(stripe, t=0.016, bevel=0.005, offset=-1.0)
# groove + glow rail on the stripe centre
rail = [ell('x', l, 0.0, grow=1.022, off=0.004 + ridge(udir('x', l, 0.0)))[0] for l in [0.62 + (2.82 - 0.62) * k / 50 for k in range(51)]]
tube("robot_rail_groove", rail, 0.017, [gun], res=2)
rail2 = [ell('x', l, 0.0, grow=1.022, off=0.012 + ridge(udir('x', l, 0.0)))[0] for l in [0.64 + (2.8 - 0.64) * k / 50 for k in range(51)]]
tube("glow_robot_rail", rail2, 0.0085, [g_cyan], res=1)

# side fins of the stripe: three small vents each side near the front
for sx in (-1, 1):
    for k in range(3):
        l0 = 0.85 + k * 0.17
        pts = [ell('x', l0, sx * f, grow=1.0, off=0.006 + ridge(udir('x', l0, sx * f)))[0] for f in (0.2 + 0.012 * i for i in range(9))]
        tube(f"robot_vent_{'LR'[sx > 0]}{k}", pts, 0.012, [gun], res=1)

# ---------------------------------------------------------------- ear housings + pods with ring lights
for sx in (-1, 1):
    side = 'L' if sx > 0 else 'R'
    ac = sx * (PI / 2 + 0.06)
    tc = theta_at(0.08)
    def sd_ear(a, t, ac=ac, tc=tc):
        return sd_rbox(a, t, ac, tc, 0.40, 0.42, 0.22)
    ear = surf(f"robot_ear_{side}", sd_ear, ac - 0.6, ac + 0.6, tc - 0.6, tc + 0.6, 22, 22, frame='y',
               grow=1.03, mats=[blue])
    finish(ear, t=0.022, bevel=0.006)
    p, n = ell('y', ac, tc, grow=1.03)
    prof = [(0.0, 0.0), (0.185, 0.0), (0.185, 0.03), (0.172, 0.042), (0.165, 0.08), (0.152, 0.092),
            (0.122, 0.092), (0.122, 0.078), (0.092, 0.078), (0.092, 0.102), (0.075, 0.118), (0.0, 0.122)]
    def fm(i, j):
        return 1 if j in (5, 6, 7) else 0
    pod = lathe(f"robot_pod_{side}", prof, 36, [chrome, gun], p - n * 0.01, n, face_mat=fm)
    add_bevel(pod, 0.005, 2, 30)
    add_wn(pod)
    ring = lathe(f"pulse_robot_ring_{side}", [(0.094, 0.079), (0.12, 0.079), (0.12, 0.086), (0.094, 0.086)],
                 36, [g_blue], p - n * 0.01, n)
    # little bolts around the housing
    for k in range(6):
        aa = k / 6 * 2 * PI + 0.5
        q = p + (Vector((0, 1, 0)) * math.cos(aa) + Vector((0, 0, 1)) * math.sin(aa)) * 0.225
        bp, bn = ell_project(q, grow=1.03)
        lathe(f"robot_bolt_{side}{k}", [(0.0, 0.0), (0.022, 0.0), (0.022, 0.012), (0.014, 0.022), (0.0, 0.024)],
              16, [chrome], bp + bn * 0.012, bn)

# ---------------------------------------------------------------- wraparound visor
cv, rv = Vector((0, 0.16, -0.06)), Vector((0.75, 0.56, 0.86))
tv0, tv1 = math.acos((0.315 - 0.16) / 0.56), math.acos((0.025 - 0.16) / 0.56)
tvc, tvh = (tv0 + tv1) / 2, (tv1 - tv0) / 2
def sd_vis(a, t):
    return sd_rbox(a, t, 0.0, tvc, 1.42, tvh, 0.12)
vis = surf("glass_robot_visor", sd_vis, -1.6, 1.6, tvc - 0.4, tvc + 0.4, 52, 10, frame='y', c=cv, r=rv,
           mats=[cyan_glass])
finish(vis, t=0.012, bevel=0.003, offset=0.0)
vl = loop_of(vis)
vframe = [p for (p, n, _) in vl]
vframe = smooth_pts(resample(vframe, 0.028, cyclic=True), 1, cyclic=True)
tube("robot_visor_frame", vframe, 0.014, [gun], cyclic=True, res=1)
# glowing edge lines just inside the top and bottom of the frame
for nm, tt in (("top", tv0 + 0.05), ("bot", tv1 - 0.05)):
    pts = [ell('y', a, tt, cv, rv, off=0.009)[0] for a in [(-1.25 + 2.5 * k / 70) for k in range(71)]]
    tube(f"glow_robot_visor_{nm}", pts, 0.0055, [g_cyan], res=1)
# hinge arms from visor ends into the pods
for sx in (-1, 1):
    side = 'L' if sx > 0 else 'R'
    pa, na = ell('y', sx * 1.42, tvc, cv, rv)
    pb, nb = ell('y', sx * (PI / 2 + 0.06), theta_at(0.08), grow=1.03)
    arm = [pa.lerp(pb, k / 8) + (na.lerp(nb, k / 8)).normalized() * 0.02 for k in range(9)]
    tube(f"robot_hinge_{side}", arm, 0.03, [gun], res=2)

# ---------------------------------------------------------------- antenna with blinking bulb
pa, na = ell('x', 1.95, 0.0, grow=1.022)
axis = (na + Vector((0, 0.35, -0.25))).normalized()
lathe("robot_antenna_base", [(0.0, 0.0), (0.075, 0.0), (0.075, 0.025), (0.06, 0.04), (0.04, 0.045),
                             (0.035, 0.07), (0.022, 0.08), (0.0, 0.08)], 32, [chrome], pa + na * 0.006, axis)
add_bevel(bpy.data.objects["robot_antenna_base"], 0.004, 2, 30)
mast = [pa + axis * (0.07 + 0.25 * k / 6) for k in range(7)]
tube("robot_antenna_mast", mast, 0.011, [gun], res=1)
lathe("robot_antenna_collar", [(0.0, 0.0), (0.028, 0.0), (0.03, 0.012), (0.028, 0.024), (0.0, 0.024)], 20,
      [chrome], pa + axis * 0.31, axis)
bc = pa + axis * 0.375
lathe("blink_robot_bulb", [(0.0, -0.05)] + [(0.05 * math.sin(k / 12 * PI), -0.05 * math.cos(k / 12 * PI)) for k in range(1, 12)] + [(0.0, 0.05)],
      24, [g_red], bc, axis)

# ---------------------------------------------------------------- panel seams (dark recessed lines)
seam = mat("rubber_robot_seam", (0.02, 0.022, 0.03), 0.0, 0.6)
ts = theta_at(0.52)
pts = [ell('y', a, ts, off=0.001 + ridge(udir('y', a, ts)))[0] for a in [0.98 + (2 * PI - 1.96) * k / 70 for k in range(71)]]
pts = [p for p in pts if abs(p.x) > 0.17 or p.z > 0]
tube("robot_seam_ring", pts, 0.0065, [seam], res=1)
for sx in (-1, 1):
    a = sx * (PI / 2 + 0.06 + 0.52)
    pts = [ell('y', a, t, off=0.001)[0] for t in [theta_at(-0.12) + (theta_at(ybot(a)) - 0.03 - theta_at(-0.12)) * k / 10 for k in range(11)]]
    tube(f"robot_seam_back_{'LR'[sx > 0]}", pts, 0.0065, [seam], res=1)

# forehead sensor at the front of the stripe
ps, ns_ = ell('x', 0.47, 0.0, grow=1.022, off=ridge(udir('x', 0.47, 0.0)))
lathe("robot_sensor_rim", [(0.0, 0.0), (0.05, 0.0), (0.05, 0.014), (0.038, 0.022), (0.03, 0.016), (0.0, 0.016)], 28, [chrome], ps, ns_)
lathe("pulse_robot_sensor", [(0.0, 0.012)] + [(0.03 * math.sin(k / 8 * PI / 2), 0.012 + 0.016 * math.cos(k / 8 * PI / 2)) for k in range(8, 0, -1)][::-1] + [(0.03, 0.012)],
      24, [g_cyan], ps, ns_)

# rear vent plate with three glowing slots
def sd_rear(l, f):
    return sd_rbox(l, f, 3.25, 0.0, 0.24, 0.26, 0.1)
rear = surf("robot_rear_plate", sd_rear, 2.9, 3.6, -0.4, 0.4, 16, 16, frame='x', grow=1.022, mats=[gun])
finish(rear, t=0.016, bevel=0.005)
for k in range(3):
    l = 3.13 + k * 0.11
    pts = [ell('x', l, f, grow=1.022, off=0.004)[0] for f in [-0.17 + 0.34 * i / 12 for i in range(13)]]
    tube(f"glow_robot_slot{k}", pts, 0.012, [g_cyan], res=1)

for o in CUR['coll'].objects:
    if o.type == 'MESH' and not o.modifiers:
        add_wn(o)
print("tris", tri_count("robot")[0])
