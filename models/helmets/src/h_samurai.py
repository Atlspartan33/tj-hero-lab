import bpy, math, importlib, sys
sys.path.insert(0, r"C:\Users\Terre\Code\tj-hero-lab\models\helmets\src")
import hlib
importlib.reload(hlib)
from hlib import *

root = begin("samurai")

black = mat("lacquer_samurai_black", (0.02, 0.02, 0.025), 0.0, 0.16, coat=1.0, coat_rough=0.03)
red = mat("lacquer_samurai_red", (0.55, 0.01, 0.015), 0.0, 0.2, coat=1.0, coat_rough=0.04)
gold = mat("gold_samurai", (1.0, 0.74, 0.26), 1.0, 0.2)
cord = mat("fabric_samurai_cord", (0.95, 0.7, 0.2), 0.3, 0.45, sheen=0.4)
liner = mat("fabric_samurai_liner", (0.25, 0.03, 0.03), 0.0, 0.85)
g_sun = glow("glow_samurai_sun", (1.0, 0.12, 0.06), 5.0)

TH = 0.03
ybot = lambda a: 0.42 - 0.12 * math.sin(a / 2) ** 2
def shape(u):
    ridges = 0.009 * (0.5 + 0.5 * math.cos(28 * math.atan2(u.x, u.z))) ** 6 * smoothstep(0.98, 0.6, u.y)
    flat = 0.03 * smoothstep(0.4, 1.0, u.y)
    return ridges + flat
offy = lambda a, t: shape(udir('y', a, t))
bowl = surf("samurai_bowl", lambda a, t: t - theta_at(ybot(a) - 0.03), -PI, PI, 0.0, 1.7, 112, 26, frame='y', wrap=True,
            off=offy, mats=[black, liner])
finish(bowl, t=TH, bevel=0.005, inner_offset=1, seg=2)
# gold rim band around the bowl edge
pts = []
for k in range(121):
    a = -PI + 2 * PI * k / 120
    t = theta_at(ybot(a))
    pts.append(ell('y', a, t, off=offy(a, t) + 0.006)[0])
tube("samurai_rim", pts, 0.022, [gold], res=2)
# tehen: gold ring at the apex
lathe("samurai_tehen", [(0.0, -0.01), (0.09, -0.01), (0.1, 0.008), (0.085, 0.022), (0.06, 0.03), (0.06, 0.012), (0.035, 0.012),
                        (0.035, 0.035), (0.0, 0.035)], 32, [gold], ell('y', 0, 0, off=shape(Vector((0, 1, 0))))[0], (0, 1, 0))

# ---------------------------------------------------------------- mabizashi: forward brim over the brow
tv0, tv1 = theta_at(0.5), theta_at(0.4)
def sd_brim(a, t):
    return smax(abs(a) - 1.15, abs(t - (tv0 + tv1) / 2) - (tv1 - tv0) / 2, 0.06)
brim = surf("samurai_brim", sd_brim, -1.3, 1.3, tv0 - 0.06, tv1 + 0.06, 48, 6, frame='y',
            off=lambda a, t: offy(a, t) + 0.012 + 0.75 * max(0.0, t - tv0) * math.cos(a * 0.9), mats=[black])
finish(brim, t=0.022, bevel=0.005, seg=2)
lb_ = loop_of(brim)
run = sub_loop(lb_, lambda p, n, prm: prm[1] > (tv0 + tv1) / 2 + 0.01)
for k, r_ in enumerate(run):
    tube(f"samurai_brim_edge{k}", smooth_pts(resample([p - n * 0.011 for (p, n, _) in r_], 0.03), 1), 0.016, [gold], res=1)

# ---------------------------------------------------------------- shikoro: four flared lames around the back and sides
lames = [(0.36, 0.20), (0.22, 0.06), (0.08, -0.08), (-0.06, -0.22)]
for k, (y0, y1) in enumerate(lames):
    t0, t1 = theta_at(y0), theta_at(y1)
    am = 1.2 - 0.06 * k
    def sd_l(a, t, t0=t0, t1=t1, am=am):
        aa = a % (2 * PI)
        return smax(abs(t - (t0 + t1) / 2) - (t1 - t0) / 2, smax(am - aa, aa - (2 * PI - am), 0.08), 0.03)
    base = 0.03 + 0.075 * k + 0.012 * k * k
    def off_l(a, t, t0=t0, base=base):
        return base + 0.55 * max(0.0, t - t0)
    lm = surf(f"samurai_lame{k}", sd_l, am - 0.1, 2 * PI - am + 0.1, t0 - 0.05, t1 + 0.05, 72, 6, frame='y',
              off=off_l, mats=[red if k % 2 == 0 else black, liner])
    finish(lm, t=0.022, bevel=0.005, inner_offset=1, seg=2)
    # lower edge cord
    lpl = loop_of(lm)
    for j, r_ in enumerate(sub_loop(lpl, lambda p, n, prm, t1=t1: prm[1] > t1 - 0.02)):
        tube(f"samurai_lamecord{k}_{j}", smooth_pts(resample([p - n * 0.011 for (p, n, _) in r_], 0.03), 1), 0.012, [cord], res=1)
    # vertical lacing knots
    nlace = 14
    for i in range(nlace):
        a = am + 0.12 + (2 * PI - 2 * am - 0.24) * i / (nlace - 1)
        q = [ell('y', a, t, off=off_l(a, t) + 0.004)[0] for t in (t0 + 0.02, (t0 + t1) / 2, t1 - 0.01)]
        tube(f"samurai_lace{k}_{i}", q, 0.009, [cord], res=1)
    # turned-back front corners (fukigaeshi shape on the top lame only)

# ---------------------------------------------------------------- fukigaeshi: turned-back flaps at the temples
for sx in (-1, 1):
    side = 'LR'[sx > 0]
    ac = sx * 1.32
    tf0, tf1 = theta_at(0.46), theta_at(0.18)
    def sd_f(a, t, ac=ac):
        return sd_rbox(a, t, ac, (tf0 + tf1) / 2, 0.2, (tf1 - tf0) / 2, 0.12)
    def off_f(a, t, ac=ac, sx=sx):
        # flare outward toward the front edge (turned back)
        return 0.06 + 0.35 * max(0.0, -(a - ac) * sx + 0.2) ** 1.4
    fl = surf(f"samurai_flap_{side}", sd_f, ac - 0.3, ac + 0.3, tf0 - 0.1, tf1 + 0.1, 20, 16, frame='y', off=off_f, mats=[red, black])
    finish(fl, t=0.024, bevel=0.006, inner_offset=1, seg=2)
    lpf = loop_of(fl)
    tube(f"samurai_flap_trim_{side}", smooth_pts(resample([p - n * 0.012 for (p, n, _) in lpf], 0.025, cyclic=True), 2, cyclic=True),
         0.017, [gold], cyclic=True, res=1)
    # gold mon (crest disc) on the flap
    pm, nm = ell('y', ac, (tf0 + tf1) / 2, off=off_f(ac, (tf0 + tf1) / 2) + 0.004)
    lathe(f"samurai_mon_{side}", [(0.0, 0.0), (0.075, 0.0), (0.078, 0.01), (0.07, 0.016), (0.055, 0.016), (0.05, 0.01),
                                  (0.03, 0.01), (0.026, 0.02), (0.0, 0.024)], 32, [gold], pm, nm)

# ---------------------------------------------------------------- maedate: gold crescent crest + red sun
N = 48
cen = []
for k in range(N + 1):
    u = k / N
    a = PI * (1.1 - 1.2 * u)
    cen.append(Vector((0.37 * math.cos(a), 0.5 - 0.46 * math.sin(a), 0.0)))
outer, inner = [], []
for k in range(N + 1):
    u = k / N
    tg = (cen[min(k + 1, N)] - cen[max(k - 1, 0)]).normalized()
    nn = Vector((tg.y, -tg.x, 0.0))          # points away from the centre of the U
    h = 0.11 * math.sin(PI * u) ** 0.75 + 0.002
    outer.append(cen[k] + nn * h * 0.5)
    inner.append(cen[k] - nn * h * 0.5)
cres = [(p.x, p.y) for p in outer] + [(p.x, p.y) for p in inner[::-1][1:-1]]
cr = outline_mesh("samurai_crest", cres, 0.008, 0.007, [gold], bres=2)
pc, nc = ell('y', 0.0, theta_at(0.6), off=offy(0.0, theta_at(0.6)))
anchor = pc + nc * 0.07 + Vector((0, -0.02, 0.0))
fwd = Vector((0, 0.32, 1.0)).normalized()
place_local(cr, anchor, fwd, (0, 1, 0), scale=0.8, back=False)
add_wn(cr)
# holder plate
hp = outline_mesh("samurai_crest_holder", [(-0.09, -0.08), (0.09, -0.08), (0.06, 0.06), (-0.06, 0.06)], 0.01, 0.008, [gold])
place_local(hp, pc + nc * 0.035 + Vector((0, 0.0, 0)), nc, (0, 1, 0), lift=-0.01)
lathe("samurai_sun_rim", [(0.0, -0.012), (0.082, -0.012), (0.09, 0.0), (0.082, 0.014), (0.0, 0.014)], 32, [gold],
      anchor + fwd * 0.015 + Vector((0, 0.035, 0)), fwd)
lathe("pulse_samurai_sun", [(0.0, 0.014), (0.07, 0.014)] + [(0.07 * math.cos(j / 6 * PI / 2), 0.014 + 0.02 * math.sin(j / 6 * PI / 2)) for j in range(1, 6)] + [(0.0, 0.034)],
      32, [g_sun], anchor + fwd * 0.015 + Vector((0, 0.035, 0)), fwd)

finalize_coll()
print("tris", tri_count("samurai")[0])
