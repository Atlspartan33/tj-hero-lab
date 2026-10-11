import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("fireman")

red = mat("paint_fire_red", (0.72, 0.02, 0.03), 0.0, 0.18, coat=1.0, coat_rough=0.03)
red_d = mat("paint_fire_darkred", (0.35, 0.01, 0.015), 0.0, 0.3, coat=1.0)
gold = mat("gold_fire", (1.0, 0.74, 0.25), 1.0, 0.18)
black = mat("paint_fire_black", (0.02, 0.02, 0.025), 0.0, 0.3, coat=0.8)
liner = mat("leather_fire_liner", (0.09, 0.045, 0.02), 0.0, 0.75)
refl = glow("glow_fire_reflect", (1.0, 0.88, 0.05), 2.2)
g_star = glow("glow_fire_star", (1.0, 0.9, 0.2), 5.0)

DC, DR = Vector((0.0, 0.2, -0.07)), Vector((0.67, 0.82, 0.77))
yb = lambda a: 0.44 - 0.13 * math.sin(a / 2) ** 2
def ribs(u):
    r = 0.0
    for c in (-0.62, -0.31, 0.31, 0.62):
        r += 0.014 * math.exp(-((u.x - c) / 0.035) ** 2)
    r += 0.03 * math.exp(-(u.x / 0.05) ** 2)          # centre comb
    return r * smoothstep(0.1, 0.4, u.y + 0.25 * abs(u.z)) + 0.04 * smoothstep(0.5, 1.0, u.y)
offy = lambda a, t: ribs(udir('y', a, t))
dome = surf("fire_dome", lambda a, t: t - theta_at(yb(a), DC, DR), -PI, PI, 0.0, 1.9, 96, 26, frame='y', wrap=True,
            c=DC, r=DR, off=offy, mats=[red, liner])
finish(dome, t=0.03, bevel=0.005, inner_offset=1, seg=2)

# ---------------------------------------------------------------- brim: short at the front, long and sloping at the back
NA, NJ = 120, 7
verts, faces, fm = [], [], []
def brim_len(a):
    c = math.cos(a)
    return 0.1 + 0.1 * (1 - c) + 0.26 * max(0.0, -c) ** 2
def brim_drop(a):
    c = math.cos(a)
    return -0.03 - 0.2 * max(0.0, -c) ** 1.5 + 0.02 * max(0.0, c)
for i in range(NA):
    a = 2 * PI * i / NA
    t = theta_at(yb(a), DC, DR)
    p0, n0 = ell('y', a, t, DC, DR, off=offy(a, t))
    out = Vector((n0.x, 0.0, n0.z)).normalized()
    L, D = brim_len(a), brim_drop(a)
    for j in range(NJ):
        u = j / (NJ - 1)
        # slight concave dish with an up-turned rolled lip
        q = p0 - n0 * 0.01 + out * (L * u) + Vector((0, 1, 0)) * (D * u ** 1.3 + 0.03 * smoothstep(0.75, 1.0, u))
        verts.append(q)
for i in range(NA):
    i1 = (i + 1) % NA
    for j in range(NJ - 1):
        faces.append([i * NJ + j, i1 * NJ + j, i1 * NJ + j + 1, i * NJ + j + 1])
brim = mesh_obj("fire_brim", verts, faces, [red, liner])
add_solid(brim, 0.026, offset=-1.0, inner_offset=1)
add_bevel(brim, 0.005, 2, 40)
add_wn(brim)
edge = [verts[i * NJ + NJ - 1] + Vector((0, -0.012, 0)) for i in range(NA)]
tube("fire_brim_lip", smooth_pts(edge, 1, cyclic=True), 0.02, [red_d], cyclic=True, res=2)

# ---------------------------------------------------------------- reflective band + gold comb ridge
def sd_band(a, t):
    y0 = yb(a)
    return smax(theta_at(y0 + 0.11, DC, DR) - t, t - theta_at(y0 + 0.035, DC, DR), 0.005)
band = surf("glow_fire_band", sd_band, -PI, PI, theta_at(0.62, DC, DR), theta_at(0.25, DC, DR), 120, 6, frame='y', wrap=True,
            c=DC, r=DR, off=lambda a, t: offy(a, t) + 0.008, mats=[refl])
finish(band, t=0.01, bevel=0.002, seg=1)
# gold comb along the crown
comb = []
for k in range(41):
    l = 0.55 + (PI - 0.35 - 0.55) * k / 40
    u = udir('x', l, 0.0)
    p, n = ell('x', l, 0.0, DC, DR, off=ribs(u) + 0.006)
    comb.append(p)
tube("fire_comb", comb, 0.026, [gold], res=2)
# end caps of the comb
for k, p in enumerate((comb[0], comb[-1])):
    lathe(f"fire_comb_end{k}", [(0.0, -0.035)] + [(0.035 * math.sin(j / 8 * PI), -0.035 * math.cos(j / 8 * PI)) for j in range(1, 8)] + [(0.0, 0.035)],
          16, [gold], p, (0, 1, 0))

# ---------------------------------------------------------------- front shield badge with glowing star
shield = []
N = 24
for k in range(N + 1):     # right half: top centre -> bottom point
    u = k / N
    if u < 0.25:
        q = u / 0.25
        x, y = 0.06 + 0.12 * math.sin(q * PI / 2), 0.24 - 0.04 * q - 0.02 * math.sin(q * PI)
    else:
        q = (u - 0.25) / 0.75
        x, y = 0.18 * (1 - q ** 1.6), 0.2 - 0.46 * q
    shield.append((x, y))
shield = [(0.0, 0.2)] + shield + [(-x, y) for (x, y) in shield[::-1]]
t_badge = theta_at(0.62, DC, DR)
pb, nb = ell('y', 0.0, t_badge, DC, DR, off=offy(0.0, t_badge))
face = Vector((0, 0.35, 1.0)).normalized()
anchor = pb + Vector((0, 0.1, 0.07))
shield = [(x * 1.3, y * 1.3) for (x, y) in shield]
sh = outline_mesh("fire_badge", shield, 0.014, 0.01, [gold], bres=2)
place_local(sh, anchor, face, (0, 1, 0), back=False)
add_wn(sh)
rim = outline_mesh("fire_badge_inner", [(x * 0.8, y * 0.8 - 0.005) for (x, y) in shield], 0.006, 0.006, [red], bres=1)
place_local(rim, anchor + face * 0.016, face, (0, 1, 0), back=False)
lathe("fire_badge_disc", [(0.0, 0.0), (0.11, 0.0), (0.117, 0.008), (0.107, 0.016), (0.0, 0.016)], 32, [black],
      anchor + face * 0.02 + Vector((0, 0.0, 0)), face)
st = outline_mesh("pulse_fire_star", star_pts(5, 0.04, 0.095), 0.008, 0.004, [g_star], bres=1)
place_local(st, anchor + face * 0.045, face, (0, 1, 0), back=False)
# bracket holding the badge to the dome
tube("fire_badge_bracket", [pb + nb * 0.01, (pb + anchor) / 2 + Vector((0, 0.0, -0.01)), anchor - face * 0.01], 0.022, [gold], res=1)
# little gold scroll banner under the star
scroll = outline_mesh("fire_badge_scroll", [(-0.15, -0.0), (0.15, 0.0), (0.17, -0.03), (0.15, -0.06), (-0.15, -0.06), (-0.17, -0.03)], 0.008, 0.006, [gold], bres=1)
place_local(scroll, anchor + face * 0.03 + Vector((0, -0.14, 0.0)), face, (0, 1, 0), scale=1.25, back=False)

finalize_coll()
print("tris", tri_count("fireman")[0])
