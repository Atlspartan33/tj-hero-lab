import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("astro")

gl = mat("glass_astro_dome", (0.85, 0.93, 1.0), 0.0, 0.02, alpha=0.12, spec=1.0)
white = mat("paint_astro_white", (0.92, 0.93, 0.95), 0.0, 0.42, coat=0.4)
pad = mat("fabric_astro_pad", (0.86, 0.87, 0.9), 0.0, 0.75, sheen=0.4)
chrome = mat("chrome_astro", (0.9, 0.92, 0.95), 1.0, 0.14)
blue = mat("paint_astro_blue", (0.03, 0.2, 0.75), 0.0, 0.3, coat=1.0)
orange = mat("paint_astro_orange", (1.0, 0.35, 0.03), 0.0, 0.3, coat=1.0)
dark = mat("rubber_astro_dark", (0.03, 0.035, 0.045), 0.0, 0.6)
g_red = glow("glow_astro_red", (1.0, 0.12, 0.1), 5.0)
g_grn = glow("glow_astro_green", (0.2, 1.0, 0.4), 5.0)
g_blu = glow("glow_astro_blue", (0.2, 0.6, 1.0), 5.0)

# ---------------------------------------------------------------- fishbowl dome
DC, DR = Vector((0.0, 0.08, 0.02)), Vector((1.0, 1.05, 1.0))
Y_RING = -0.84
tcut = math.acos((Y_RING - DC.y) / DR.y)
dome = surf("glass_astro_dome", lambda a, t: t - tcut, -PI, PI, 0.0, tcut + 0.08, 72, 40, frame='y', wrap=True,
            c=DC, r=DR, mats=[gl])
finish(dome, t=0.014, bevel=0.003, offset=0.0, seg=2)
rb = math.sin(tcut) * DR.x            # ring radius at the base of the dome

# locking ring at the dome base (chrome) + blue band + latches
lathe("astro_lockring", [(rb - 0.03, 0.0), (rb + 0.05, 0.0), (rb + 0.065, 0.015), (rb + 0.065, 0.05), (rb + 0.05, 0.065),
                         (rb - 0.01, 0.065), (rb - 0.03, 0.04)], 72, [chrome], (0, Y_RING - 0.055, DC.z), (0, 1, 0))
lathe("astro_blueband", [(rb + 0.064, 0.022), (rb + 0.074, 0.024), (rb + 0.074, 0.042), (rb + 0.064, 0.044)], 72, [blue],
      (0, Y_RING - 0.055, DC.z), (0, 1, 0))
for k in range(8):
    a = 2 * PI * (k + 0.5) / 8
    d = Vector((math.sin(a), 0, math.cos(a)))
    p = Vector((0, Y_RING - 0.02, DC.z)) + d * (rb + 0.07)
    lathe(f"astro_latch{k}", [(0.0, 0.0), (0.028, 0.0), (0.028, 0.02), (0.02, 0.03), (0.0, 0.03)], 16, [chrome], p, d)

# ---------------------------------------------------------------- padded collar (quilted torus)
R0, RX, RY = 0.74, 0.22, 0.12
YC = -0.98
NA, NB, Q = 96, 16, 12
verts, faces = [], []
for i in range(NA):
    a = 2 * PI * i / NA
    q = abs(math.sin(Q * a / 2)) ** 0.35
    puff = 0.74 + 0.26 * q
    for j in range(NB):
        b = 2 * PI * j / NB
        rr = R0 + RX * puff * math.cos(b)
        y = YC + RY * puff * math.sin(b) * (1.0 if math.sin(b) > 0 else 0.7)
        verts.append((rr * math.sin(a), y, DC.z + rr * math.cos(a)))
for i in range(NA):
    for j in range(NB):
        i1, j1 = (i + 1) % NA, (j + 1) % NB
        faces.append([i * NB + j, i1 * NB + j, i1 * NB + j1, i * NB + j1])
col = mesh_obj("astro_collar", verts, faces, [pad])
add_wn(col)
# quilting seams (dark-ish piping) between pads
for k in range(Q):
    a = 2 * PI * k / Q
    pts = []
    for j in range(0, 9):
        b = -0.1 + (PI + 0.2) * j / 8
        rr = R0 + RX * 0.76 * math.cos(b)
        y = YC + RY * 0.76 * math.sin(b)
        pts.append(Vector((rr * math.sin(a), y, DC.z + rr * math.cos(a))))
    tube(f"astro_seam{k}", pts, 0.008, [white], res=1)
# outer trim ring
lathe("astro_collar_trim", [(R0 + RX * 0.95, YC - 0.03), (R0 + RX + 0.02, YC - 0.03), (R0 + RX + 0.02, YC + 0.0), (R0 + RX * 0.95, YC + 0.0)],
      96, [orange], (0, 0, DC.z), (0, 1, 0))

# ---------------------------------------------------------------- chest control panel with status lights
pa = Vector((0, YC + 0.02, DC.z + R0 + 0.02))
nrm = Vector((0, 0.75, 0.66)).normalized()
rr_pts = []
for (cx, cy, a0) in [(0.17, 0.06, 0), (-0.17, 0.06, PI / 2), (-0.17, -0.06, PI), (0.17, -0.06, 1.5 * PI)]:
    for k in range(6):
        a = a0 + (PI / 2) * k / 5
        rr_pts.append((cx + 0.035 * math.cos(a), cy + 0.035 * math.sin(a)))
panel = outline_mesh("astro_panel", rr_pts, 0.02, 0.012, [white], bres=2)
place_local(panel, pa, nrm, (0, 0.66, -0.75), lift=0.0)
add_wn(panel)
inset = outline_mesh("astro_panel_face", [(x * 0.86, y * 0.78) for (x, y) in rr_pts], 0.004, 0.004, [dark], bres=1)
place_local(inset, pa, nrm, (0, 0.66, -0.75), lift=0.05)
T, B, N = frame_from(nrm, (0, 0.66, -0.75))
for k, (x, m, nm) in enumerate([(-0.11, g_red, "blink_astro_light_red"), (-0.03, g_grn, "blink_astro_light_green"),
                                  (0.05, g_blu, "pulse_astro_light_blue")]):
    p = pa + T * x + B * 0.02 + N * 0.055
    lathe(nm, [(0.0, 0.0), (0.026, 0.0)] + [(0.026 * math.cos(j / 5 * PI / 2), 0.018 * math.sin(j / 5 * PI / 2) + 0.004) for j in range(1, 5)] + [(0.0, 0.022)],
          18, [m], p, N)
    lathe(f"astro_bezel{k}", [(0.024, 0.0), (0.034, 0.0), (0.034, 0.008), (0.024, 0.008)], 18, [chrome], p, N)
for k in range(4):
    p = pa + T * (0.12 + (k % 2) * 0.03) + B * (0.035 - (k // 2) * 0.04) + N * 0.055
    lathe(f"astro_button{k}", [(0.0, 0.0), (0.012, 0.0), (0.012, 0.01), (0.0, 0.012)], 12, [orange if k % 2 else blue], p, N)
# small bar of glowing level segments
for k in range(5):
    p = pa + T * (-0.12 + k * 0.045) + B * (-0.045) + N * 0.052
    seg = outline_mesh(f"glow_astro_bar{k}", [(-0.016, -0.008), (0.016, -0.008), (0.016, 0.008), (-0.016, 0.008)], 0.003, 0.002, [g_grn if k < 3 else g_blu], bres=1)
    place_local(seg, p, N, B, lift=0.0)

# ---------------------------------------------------------------- hose connectors on the collar sides
for sx in (-1, 1):
    d = Vector((sx * 0.92, 0.25, 0.3)).normalized()
    p = Vector((sx * (R0 + 0.02) * 0.95, YC + 0.06, DC.z + 0.25))
    lathe(f"astro_hose_{'LR'[sx > 0]}", [(0.0, -0.02), (0.06, -0.02), (0.06, 0.03), (0.048, 0.04), (0.048, 0.08), (0.056, 0.09),
                                         (0.056, 0.11), (0.04, 0.12), (0.0, 0.12)], 24, [chrome], p, d,
          face_mat=lambda i, j: 0)
    lathe(f"astro_hose_ring_{'LR'[sx > 0]}", [(0.05, 0.05), (0.058, 0.05), (0.058, 0.07), (0.05, 0.07)], 24,
          [blue if sx > 0 else orange], p, d)

# helmet lamps on the lock ring
g_lamp = glow("glow_astro_lamp", (1.0, 0.95, 0.8), 4.0)
for sx in (-1, 1):
    a = sx * 0.95
    d = Vector((math.sin(a), 0.0, math.cos(a)))
    p = Vector((0, Y_RING - 0.02, DC.z)) + d * (rb + 0.06)
    fwd = (d * 0.45 + Vector((0, 0.15, 1.0))).normalized()
    lathe(f"astro_lamp_{'LR'[sx > 0]}", [(0.0, -0.06), (0.05, -0.06), (0.06, -0.02), (0.06, 0.03), (0.052, 0.04), (0.0, 0.04)],
          24, [white], p + fwd * 0.03 + Vector((0, 0.05, 0)), fwd)
    lathe(f"glow_astro_lamp_{'LR'[sx > 0]}", [(0.0, 0.035), (0.045, 0.035), (0.04, 0.045), (0.0, 0.05)], 24, [g_lamp],
          p + fwd * 0.03 + Vector((0, 0.05, 0)), fwd)

finalize_coll()
print("tris", tri_count("astro")[0])
