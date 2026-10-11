import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("crown")

gold = mat("gold_crown", (1.0, 0.76, 0.28), 1.0, 0.16)
gold_d = mat("gold_crown_deep", (0.82, 0.52, 0.14), 1.0, 0.26)
velvet = mat("fabric_crown_velvet", (0.32, 0.0, 0.03), 0.0, 0.8, sheen=0.3)
ermine = mat("fabric_crown_ermine", (0.93, 0.92, 0.88), 0.0, 0.9, sheen=0.8)
spot = mat("fabric_crown_spot", (0.02, 0.02, 0.02), 0.0, 0.8)
pearl = mat("pearl_crown", (0.95, 0.93, 0.9), 0.1, 0.22, coat=1.0, sheen=0.5)
gems = [mat("gem_crown_ruby", (0.85, 0.0, 0.08), 0.0, 0.05, coat=1.0, emit=(0.6, 0.0, 0.05), estr=0.4),
        mat("gem_crown_sapphire", (0.02, 0.2, 0.95), 0.0, 0.05, coat=1.0, emit=(0.0, 0.1, 0.6), estr=0.4),
        mat("gem_crown_emerald", (0.0, 0.7, 0.3), 0.0, 0.05, coat=1.0, emit=(0.0, 0.4, 0.15), estr=0.4),
        mat("gem_crown_amethyst", (0.5, 0.1, 0.9), 0.0, 0.05, coat=1.0, emit=(0.3, 0.05, 0.5), estr=0.4)]
g_star = glow("glow_crown_star", (1.0, 0.95, 0.75), 5.0)

# crown frame (head space): centre O, local up U (tilted back), X = head x, F = forward
O = Vector((0.0, 0.65, -0.1))
U = Vector((0.0, 0.985, -0.17)).normalized()    # tilted back: rests on the back of the skull, front rides above the forehead
X = Vector((1.0, 0.0, 0.0))
F = X.cross(U).normalized() * -1
if F.z < 0:
    F = -F
RX, RZ = 0.565, 0.625

def cpt(phi, s=1.0, dr=0.0, h=0.0):
    """Point on the crown's elliptical cylinder: phi=0 front, + toward +x."""
    return O + X * ((s * RX + dr) * math.sin(phi)) + F * ((s * RZ + dr) * math.cos(phi)) + U * h

def cnorm(phi):
    return (X * (math.sin(phi) / RX) + F * (math.cos(phi) / RZ)).normalized()

def ering(name, prof, mats_, n=96, face_mat=None, cyclic_prof=False):
    verts, faces, fm = [], [], []
    for i in range(n):
        phi = 2 * PI * i / n
        for (s, dr, h) in prof:
            verts.append(cpt(phi, s, dr, h))
    m = len(prof)
    for i in range(n):
        i1 = (i + 1) % n
        for j in range(m - 1 + (1 if cyclic_prof else 0)):
            j1 = (j + 1) % m
            faces.append([i * m + j, i1 * m + j, i1 * m + j1, i * m + j1])
            fm.append(face_mat(i, j) if face_mat else 0)
    ob = mesh_obj(name, verts, faces, mats_)
    for k, p in enumerate(ob.data.polygons):
        p.material_index = fm[k]
    return ob

# ---------------------------------------------------------------- band: rolled rims + jewel channel
band_prof = [(1.0, -0.005, -0.115), (1.0, 0.02, -0.12), (1.0, 0.04, -0.105), (1.0, 0.042, -0.085), (1.0, 0.025, -0.075),
             (1.0, 0.03, -0.06), (1.0, 0.032, 0.06), (1.0, 0.025, 0.075), (1.0, 0.042, 0.085), (1.0, 0.04, 0.105),
             (1.0, 0.02, 0.12), (1.0, -0.005, 0.115)]
band = ering("crown_band", band_prof, [gold], n=120)
add_solid(band, 0.02, offset=-1.0)
add_bevel(band, 0.003, 1, 40)
add_wn(band)

# ---------------------------------------------------------------- ermine roll under the band
erm_prof = [(1.0, 0.0 + 0.055 * math.cos(b), -0.15 + 0.045 * math.sin(b)) for b in [2 * PI * k / 12 for k in range(12)]]
erm = ering("crown_ermine", erm_prof, [ermine], n=96, cyclic_prof=True)
add_wn(erm)
for k in range(10):
    phi = 2 * PI * (k + 0.5) / 10
    p = cpt(phi, 1.0, 0.1, -0.15)
    nn = cnorm(phi)
    tail = outline_mesh(f"crown_spot{k}", [(0.0, 0.03), (0.012, 0.0), (0.006, -0.025), (-0.006, -0.025), (-0.012, 0.0)], 0.004, 0.003, [spot])
    place_local(tail, p, nn, U, lift=-0.003)

# ---------------------------------------------------------------- points: 8 curved fleur spikes on the band top
def spike_outline():
    pts = []
    N = 14
    for k in range(N + 1):            # right edge, base -> tip
        u = k / N
        w = 0.125 * (1 - u) ** 1.1 + 0.04 * math.sin(PI * min(1, u * 1.6)) * (1 - u)
        if 0.45 < u < 0.62:
            w += 0.03 * math.sin((u - 0.45) / 0.17 * PI)
        pts.append((w, 0.4 * u))
    return pts + [(-x, y) for (x, y) in pts[::-1][1:-1]]
NS = 8
for k in range(NS):
    phi0 = 2 * PI * k / NS
    sp = outline_mesh(f"crown_spike{k}", spike_outline(), 0.008, 0.006, [gold], bres=2)
    me = sp.data
    for v in me.vertices:
        x, y, z = v.co
        phi = phi0 + x / ((RX + RZ) / 2)
        p = cpt(phi, 1.0, 0.02 + z + 0.12 * y, 0.11 + y)
        v.co = hb(p)
    me.update()
    add_wn(sp)
    # pearl on the tip + small pearl between points
    for (ph, dr, h, r) in ((phi0, 0.02 + 0.12 * 0.41, 0.11 + 0.425, 0.036), (phi0 + PI / NS, 0.03, 0.155, 0.024)):
        c = cpt(ph, 1.0, dr, h)
        lathe(f"crown_pearl{k}_{int(h * 100)}", [(0.0, -r)] + [(r * math.sin(j / 8 * PI), -r * math.cos(j / 8 * PI)) for j in range(1, 8)] + [(0.0, r)],
              16, [pearl], c, U)

# ---------------------------------------------------------------- jewels with gold bezels around the band
for k in range(NS):
    phi = 2 * PI * k / NS + PI / NS
    nn = cnorm(phi)
    p = cpt(phi, 1.0, 0.03, 0.0)
    lathe(f"crown_bezel{k}", [(0.0, 0.0), (0.06, 0.0), (0.064, 0.012), (0.058, 0.022), (0.048, 0.018), (0.0, 0.018)], 24, [gold_d], p, nn)
    gem = lathe(f"crown_gem{k}", [(0.0, 0.01), (0.048, 0.012), (0.05, 0.022), (0.036, 0.042), (0.0, 0.048)], 8,
                [gems[k % 4]], p, nn, smooth=False)
# big front jewel (taller, faceted) with glint
pf = cpt(0.0, 1.0, 0.03, 0.0)
nf = cnorm(0.0)

# ---------------------------------------------------------------- velvet cap + four gold arches + orb with glowing star
cap_prof = [(0.97, -0.01, 0.1), (0.95, 0.0, 0.17), (0.88, 0.0, 0.25), (0.74, 0.0, 0.32), (0.55, 0.0, 0.37), (0.32, 0.0, 0.395),
            (0.12, 0.0, 0.405), (0.0, 0.0, 0.405)]
cap = ering("crown_cap", cap_prof, [velvet], n=64)
# puff between arches
for v in cap.data.vertices:
    p = bh(v.co)
    d = p - O
    phi = math.atan2(d.dot(X), d.dot(F))
    h = d.dot(U)
    if h > 0.15:
        k = 0.05 * (0.5 - 0.5 * math.cos(4 * phi)) * smoothstep(0.15, 0.3, h) * (1 - smoothstep(0.37, 0.41, h))
        v.co = hb(p + U * k)
cap.data.update()
add_wn(cap)
for k in range(4):
    phi = 2 * PI * k / 4
    pts = []
    for j in range(17):
        u = j / 16
        s = math.cos(u * PI / 2) * 1.0
        h = 0.12 + 0.36 * math.sin(u * PI / 2) ** 0.8
        pts.append(cpt(phi, s, 0.03 * (1 - u), h))
    tube(f"crown_arch{k}", pts, 0.024, [gold], res=2)
    for j in (4, 8, 12):
        u = j / 16
        c = cpt(phi, math.cos(u * PI / 2), 0.03 * (1 - u) + 0.022, 0.12 + 0.36 * math.sin(u * PI / 2) ** 0.8)
        lathe(f"crown_archpearl{k}_{j}", [(0.0, -0.02)] + [(0.02 * math.sin(i / 6 * PI), -0.02 * math.cos(i / 6 * PI)) for i in range(1, 6)] + [(0.0, 0.02)],
              12, [pearl], c, U)
ptop = O + U * 0.49
lathe("crown_orb", [(0.0, -0.01), (0.03, -0.008), (0.06, 0.02), (0.075, 0.06), (0.06, 0.1), (0.03, 0.12), (0.0, 0.125)], 28, [gold], ptop, U)
lathe("crown_orb_ring", [(0.073, 0.05), (0.085, 0.05), (0.085, 0.07), (0.073, 0.07)], 28, [gold_d], ptop, U)
star = outline_mesh("pulse_crown_star", star_pts(5, 0.035, 0.085), 0.012, 0.008, [g_star], bres=1)
place_local(star, ptop + U * 0.18, F, U, back=False)

finalize_coll()
print("tris", tri_count("crown")[0])
