# hlib.py - helper library for modelling TJ's Hero Lab helmets in Blender.
# All authoring happens in HEAD SPACE (x = toward the face's left ear, y up, z out of the face,
# 1 unit = face width). hb() converts to Blender (X = x, Y = -z, Z = y).
import bpy, bmesh, math
from mathutils import Vector, Matrix

PI = math.pi
C = Vector((0.0, 0.18, -0.06))          # skull centre
R = Vector((0.66, 0.78, 0.76))          # shell radii (skull + clearance)
SKULL = Vector((0.62, 0.74, 0.72))
OUT = r"C:\Users\Terre\Code\tj-hero-lab\models\helmets"


def V(*a):
    return Vector(a[0]) if len(a) == 1 else Vector(a)


def hb(p):
    return Vector((p[0], -p[2], p[1]))


def bh(p):
    return Vector((p[0], p[2], -p[1]))


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, a, b):
    return max(a, min(b, v))


def smoothstep(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def theta_at(y, c=C, r=R, grow=1.0):
    return math.acos(clamp((y - c.y) / (r.y * grow), -1, 1))


# ---------------------------------------------------------------- SDF helpers (2D, param space)
def smax(a, b, k=0.05):
    h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0)
    return lerp(b, a, h) + k * h * (1 - h)


def smin(a, b, k=0.05):
    return -smax(-a, -b, k)


def sd_rbox(x, y, cx, cy, hx, hy, rad):
    qx = abs(x - cx) - hx + rad
    qy = abs(y - cy) - hy + rad
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - rad


def sd_ellipse(x, y, cx, cy, ax, ay):
    # approximate
    dx, dy = (x - cx) / ax, (y - cy) / ay
    k = math.hypot(dx, dy)
    return (k - 1) * min(ax, ay)


# ---------------------------------------------------------------- parametrisation of an ellipsoid
def udir(frame, s, t):
    if frame == 'y':      # s = azimuth from +z toward +x, t = polar angle from +y
        st = math.sin(t)
        return Vector((st * math.sin(s), math.cos(t), st * math.cos(s)))
    if frame == 'x':      # s = longitude from +z toward +y (around x), t = latitude toward +x
        ct = math.cos(t)
        return Vector((math.sin(t), ct * math.sin(s), ct * math.cos(s)))
    if frame == 'z':      # s = azimuth around +z from +y toward +x, t = polar from +z (front pole)
        st = math.sin(t)
        return Vector((st * math.sin(s), st * math.cos(s), math.cos(t)))
    raise ValueError(frame)


def ell(frame, s, t, c=C, r=R, grow=1.0, off=0.0):
    u = udir(frame, s, t)
    rr = Vector((r.x * grow, r.y * grow, r.z * grow))
    p = Vector((c.x + rr.x * u.x, c.y + rr.y * u.y, c.z + rr.z * u.z))
    n = Vector((u.x / rr.x, u.y / rr.y, u.z / rr.z)).normalized()
    return p + n * off, n


def ell_project(q, c=C, r=R, grow=1.0):
    """Radially project head-space point q onto the ellipsoid; returns (point, normal)."""
    rr = Vector((r.x * grow, r.y * grow, r.z * grow))
    d = q - c
    u = Vector((d.x / rr.x, d.y / rr.y, d.z / rr.z)).normalized()
    p = Vector((c.x + rr.x * u.x, c.y + rr.y * u.y, c.z + rr.z * u.z))
    n = Vector((u.x / rr.x, u.y / rr.y, u.z / rr.z)).normalized()
    return p, n


def on_y(y, a, c=C, r=R, grow=1.0, off=0.0):
    """Point on ellipsoid at head height y and azimuth a (0 = front, + toward +x)."""
    return ell('y', a, theta_at(y, c, r, grow), c, r, grow, off)


# ---------------------------------------------------------------- scene / collections
CUR = {}
LOOPS = {}


def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if not c:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def begin(hid):
    c = coll("H_" + hid)
    for o in list(c.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    purge()
    root = bpy.data.objects.new(hid, None)
    root.empty_display_size = 0.15
    c.objects.link(root)
    CUR.update(coll=c, root=root, hid=hid)
    solo(hid)
    return root


def solo(hid=None):
    vl = bpy.context.view_layer
    for lc in vl.layer_collection.children:
        if lc.name.startswith("H_"):
            lc.exclude = (hid is not None and lc.name != "H_" + hid)


def link(ob, parent=None):
    CUR['coll'].objects.link(ob)
    ob.parent = parent if parent is not None else CUR['root']
    return ob


def purge():
    try:
        bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    except Exception:
        pass


# ---------------------------------------------------------------- materials
def mat(name, color, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.05, emit=None, estr=0.0,
        alpha=1.0, spec=0.5, sheen=0.0, tex=None, normal_tex=None, normal_strength=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    col = color if len(color) == 4 else (*color, 1.0)
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = coat_rough
    bsdf.inputs['Specular IOR Level'].default_value = spec
    bsdf.inputs['Sheen Weight'].default_value = sheen
    if emit is not None:
        e = emit if len(emit) == 4 else (*emit, 1.0)
        bsdf.inputs['Emission Color'].default_value = e
        bsdf.inputs['Emission Strength'].default_value = estr
    else:
        bsdf.inputs['Emission Strength'].default_value = 0.0
    bsdf.inputs['Alpha'].default_value = alpha
    m.diffuse_color = col
    if alpha < 1.0:
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
        m.use_backface_culling = False
    # textures
    for n in [n for n in nt.nodes if n.type in ('TEX_IMAGE', 'NORMAL_MAP')]:
        nt.nodes.remove(n)
    if tex is not None:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = tex
        tn.location = (-400, 200)
        nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    if normal_tex is not None:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = normal_tex
        normal_tex.colorspace_settings.name = 'Non-Color'
        tn.location = (-600, -300)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.location = (-300, -300)
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def glow(name, color, strength=4.0):
    return mat(name, color, 0.0, 0.4, emit=color, estr=strength)


def glass(name, color=(1, 1, 1), alpha=0.15, rough=0.03):
    return mat(name, color, 0.0, rough, alpha=alpha, spec=1.0)


# ---------------------------------------------------------------- mesh building
def mesh_obj(name, verts, faces, mats=(), uvs=None, smooth=True, parent=None, origin=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([hb(v) if not isinstance(v, Vector) or True else v for v in verts], [], faces)
    if uvs is not None:
        uvl = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uvl.data[li].uv = uvs[vi]
    for m in mats:
        me.materials.append(m)
    me.validate()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    link(ob, parent)
    if origin is not None:
        set_origin(ob, origin)
    return ob


def set_origin(ob, head_pt):
    o = hb(head_pt)
    ob.data.transform(Matrix.Translation(-o))
    ob.location = o


def add_solid(ob, t, offset=-1.0, inner_offset=None, rim_offset=0):
    m = ob.modifiers.new("solid", 'SOLIDIFY')
    m.thickness = t
    m.offset = offset
    m.use_even_offset = True
    m.use_rim = True
    if inner_offset is not None:
        m.material_offset = inner_offset
    m.material_offset_rim = rim_offset
    return m


def add_bevel(ob, w, seg=3, angle=35, harden=False):
    m = ob.modifiers.new("bevel", 'BEVEL')
    m.width = w
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = harden
    m.miter_outer = 'MITER_ARC'
    return m


def add_wn(ob):
    m = ob.modifiers.new("wn", 'WEIGHTED_NORMAL')
    m.keep_sharp = True
    m.weight = 50
    return m


def add_subd(ob, lv=1):
    m = ob.modifiers.new("subd", 'SUBSURF')
    m.levels = lv
    m.render_levels = lv
    return m


def finish(ob, t=None, bevel=None, inner_offset=None, seg=3, offset=-1.0, wn=True, angle=35):
    if t:
        add_solid(ob, t, offset=offset, inner_offset=inner_offset)
    if bevel:
        add_bevel(ob, bevel, seg, angle)
    if wn:
        add_wn(ob)
    return ob


# ---------------------------------------------------------------- trimmed ellipsoid surface
def surf(name, sdf, s0, s1, t0, t1, ns, nt, frame='y', c=C, r=R, grow=1.0, off=None, wrap=False,
         mats=(), face_mat=None, relax=4, parent=None, keep=None):
    """Quad grid over (s,t) param rect of an ellipsoid, keeping faces where sdf(s,t) < 0.
    Boundary vertices are snapped onto sdf = 0 and relaxed so trimmed edges are clean curves."""
    S = [s0 + (s1 - s0) * i / ns for i in range(ns + (0 if wrap else 1))]
    T = [t0 + (t1 - t0) * j / nt for j in range(nt + 1)]
    pole = frame in ('y', 'z') and abs(t0) < 1e-9
    params, idx = [], {}

    def vid(i, j):
        if pole and j == 0:
            key = ('pole',)
            if key not in idx:
                idx[key] = len(params)
                params.append([0.0, 0.0])
            return idx[key]
        ii = i % len(S) if wrap else i
        key = (ii, j)
        if key not in idx:
            idx[key] = len(params)
            params.append([S[ii], T[j]])
        return idx[key]

    faces, fcent = [], []
    for i in range(ns):
        for j in range(nt):
            sc = s0 + (s1 - s0) * (i + 0.5) / ns
            tc = t0 + (t1 - t0) * (j + 0.5) / nt
            if sdf(sc, tc) >= 0:
                continue
            if pole and j == 0:
                f = [vid(i, 0), vid(i, 1), vid(i + 1, 1)]
            else:
                f = [vid(i, j), vid(i, j + 1), vid(i + 1, j + 1), vid(i + 1, j)]
            faces.append(f)
            fcent.append((sc, tc))
    period = (s1 - s0) if wrap else None

    def dS(a, b):  # b - a in s, wrap aware
        d = b - a
        if period:
            d = (d + period / 2) % period - period / 2
        return d

    def proj(p):
        s, t = p
        for _ in range(8):
            d = sdf(s, t)
            if abs(d) < 1e-6:
                break
            e = 1e-4
            gs = (sdf(s + e, t) - sdf(s - e, t)) / (2 * e)
            gt = (sdf(s, t + e) - sdf(s, t - e)) / (2 * e)
            g2 = gs * gs + gt * gt
            if g2 < 1e-12:
                break
            s -= d * gs / g2
            t -= d * gt / g2
        return [s, t]

    bm = bmesh.new()
    bv = [bm.verts.new((0, 0, 0)) for _ in params]
    for f in faces:
        try:
            bm.faces.new([bv[k] for k in f])
        except ValueError:
            pass
    bm.verts.index_update()
    bm.verts.ensure_lookup_table()
    # drop verts that ended unused
    bnd = [v for v in bm.verts if v.is_boundary]
    for v in bnd:
        params[v.index] = proj(params[v.index])
    near = set()
    for v in bnd:
        for e in v.link_edges:
            o = e.other_vert(v)
            if not o.is_boundary:
                near.add(o)
    for it in range(relax):
        newp = {}
        for v in bnd:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) != 2:
                continue
            p = params[v.index]
            ms = sum(dS(p[0], params[o.index][0]) for o in nb) / 2
            mt = sum(params[o.index][1] - p[1] for o in nb) / 2
            newp[v.index] = proj([p[0] + ms * 0.5, p[1] + mt * 0.5])
        for k, p in newp.items():
            params[k] = p
        for v in near:
            nb = [e.other_vert(v) for e in v.link_edges]
            p = params[v.index]
            ms = sum(dS(p[0], params[o.index][0]) for o in nb) / len(nb)
            mt = sum(params[o.index][1] - p[1] for o in nb) / len(nb)
            params[v.index] = [p[0] + ms * 0.4, p[1] + mt * 0.4]
    # positions
    pos, nrm = [], []
    for (s, t) in params:
        o = off(s, t) if off else 0.0
        p, n = ell(frame, s, t, c, r, grow, o)
        pos.append(p)
        nrm.append(n)
    for v in bm.verts:
        v.co = hb(pos[v.index])
    # orientation
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces:
        f0 = bm.faces[0]
        ctr = f0.calc_center_median()
        outward = ctr - hb(c)
        if f0.normal.dot(outward) < 0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    # material per face
    bm.faces.ensure_lookup_table()
    if face_mat:
        for f in bm.faces:
            ps = [params[v.index] for v in f.verts]
            sc = ps[0][0] + sum(dS(ps[0][0], q[0]) for q in ps) / len(ps)
            tc = sum(q[1] for q in ps) / len(ps)
            f.material_index = face_mat(sc, tc)
    # uv
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for l in f.loops:
            s, t = params[l.vert.index]
            l[uvl].uv = ((s - s0) / (s1 - s0), (t - t0) / (t1 - t0))
    # boundary loops (head space)
    loops = []
    seen = set()
    for v in bm.verts:
        if not v.is_boundary or v.index in seen:
            continue
        loop = [v]
        seen.add(v.index)
        prev, cur = None, v
        while True:
            nxt = None
            for e in cur.link_edges:
                if e.is_boundary:
                    o = e.other_vert(cur)
                    if o is not prev and o.index not in seen:
                        nxt = o
                        break
            if nxt is None:
                break
            loop.append(nxt)
            seen.add(nxt.index)
            prev, cur = cur, nxt
        loops.append([(pos[q.index].copy(), nrm[q.index].copy(), tuple(params[q.index])) for q in loop])
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    link(ob, parent)
    LOOPS[ob.name] = loops
    return ob


def loop_of(ob, k=None):
    """Longest boundary loop (or loop k) as list of (point, normal, param)."""
    L = LOOPS[ob.name]
    if k is None:
        return max(L, key=len)
    return L[k]


def sub_loop(loop, cond):
    """Contiguous run(s) of a cyclic loop satisfying cond(point, normal, param). Returns list of runs."""
    n = len(loop)
    ok = [cond(*q) for q in loop]
    if all(ok):
        return [loop + [loop[0]]]
    start = next(i for i in range(n) if not ok[i])
    runs, cur = [], []
    for k in range(1, n + 1):
        i = (start + k) % n
        if ok[i]:
            cur.append(loop[i])
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return runs


def smooth_pts(pts, it=2, cyclic=False):
    pts = [p.copy() for p in pts]
    for _ in range(it):
        q = []
        n = len(pts)
        for i in range(n):
            if not cyclic and (i == 0 or i == n - 1):
                q.append(pts[i])
                continue
            a, b = pts[(i - 1) % n], pts[(i + 1) % n]
            q.append(pts[i] * 0.5 + (a + b) * 0.25)
        pts = q
    return pts


def resample(pts, step, cyclic=False):
    P = list(pts) + ([pts[0]] if cyclic else [])
    out = [P[0].copy()]
    acc = 0.0
    for i in range(1, len(P)):
        a, b = P[i - 1], P[i]
        L = (b - a).length
        while acc + L >= step:
            t = (step - acc) / L
            a = a + (b - a) * t
            out.append(a.copy())
            L = (b - a).length
            acc = 0.0
        acc += L
    if not cyclic and (out[-1] - P[-1]).length > step * 0.3:
        out.append(P[-1].copy())
    if cyclic and (out[-1] - out[0]).length < step * 0.5:
        out.pop()
    return out


# ---------------------------------------------------------------- curves -> meshes
def _curve_to_mesh(name, cu, mats, parent=None, smooth=True):
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = tmp.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.name = name
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    link(ob, parent)
    return ob


def tube(name, pts, radius, mats, cyclic=False, radii=None, res=2, parent=None, caps=True, nurbs=False):
    """Round tube along head-space points. radii = per-point multipliers."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = res
    cu.use_fill_caps = caps
    cu.resolution_u = 4
    sp = cu.splines.new('NURBS' if nurbs else 'POLY')
    sp.points.add(len(pts) - 1)
    for k, p in enumerate(pts):
        b = hb(p)
        sp.points[k].co = (b.x, b.y, b.z, 1.0)
        if radii is not None:
            sp.points[k].radius = radii[k]
    sp.use_cyclic_u = cyclic
    if nurbs:
        sp.order_u = 4
        sp.use_endpoint_u = not cyclic
    return _curve_to_mesh(name, cu, mats, parent)


def outline_mesh(name, outline, depth, bevel, mats, bres=2):
    """Extruded, bevelled 2D outline (list of (x,y)). Returns object with local coords
    (x, y in plane, z thickness centred on 0). Not yet placed."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    cu.extrude = depth
    cu.bevel_depth = bevel
    cu.bevel_resolution = bres
    sp = cu.splines.new('POLY')
    sp.points.add(len(outline) - 1)
    for k, (x, y) in enumerate(outline):
        sp.points[k].co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    return _curve_to_mesh(name, cu, mats)


def frame_from(normal, up):
    """Tangent frame (T, B, N) in head space: N = normal, B ~ up."""
    N = Vector(normal).normalized()
    B = Vector(up) - N * Vector(up).dot(N)
    if B.length < 1e-6:
        B = Vector((0, 0, 1)) - N * N.z
    B.normalize()
    T = B.cross(N)
    return T, B, N


def place_local(ob, anchor, normal, up, scale=1.0, conform=None, lift=0.0, back=True):
    """Map the object's local mesh coords (x,y plane, z out) into head space at anchor.
    conform=(c, r, grow) wraps the plane onto that ellipsoid. back=True shifts so the back face sits at 0."""
    T, B, N = frame_from(normal, up)
    me = ob.data
    zs = [v.co.z for v in me.vertices]
    z0 = min(zs) if back else 0.0
    anchor = Vector(anchor)
    for v in me.vertices:
        x, y, z = v.co.x * scale, v.co.y * scale, (v.co.z - z0) * scale
        if conform:
            c, r, g = conform[:3]
            q = anchor + T * x + B * y
            p, n = ell_project(q, c, r, g)
            extra = 0.0
            if len(conform) > 3:
                d = p - c
                u = Vector((d.x / (r.x * g), d.y / (r.y * g), d.z / (r.z * g))).normalized()
                extra = conform[3](u)
            hp = p + n * (z + lift + extra)
        else:
            hp = anchor + T * x + B * y + N * (z + lift)
        v.co = hb(hp)
    me.update()
    return ob


def lathe(name, prof, seg, mats, base, axis, up=(0, 1, 0), a0=0.0, a1=2 * PI, parent=None,
          face_mat=None, smooth=True, close=None):
    """Revolve profile [(radius, height)] around local Z. Origin at base, local Z = axis (head space).
    face_mat(i_seg, j_prof) -> material index."""
    full = abs((a1 - a0) - 2 * PI) < 1e-6
    nseg = seg if full else seg + 1
    verts, faces, rings = [], [], []
    for (rad, hgt) in prof:
        if rad <= 1e-7:
            rings.append([len(verts)])
            verts.append(Vector((0, 0, hgt)))
            continue
        ring = []
        for i in range(nseg):
            a = a0 + (a1 - a0) * i / seg
            ring.append(len(verts))
            verts.append(Vector((rad * math.cos(a), rad * math.sin(a), hgt)))
        rings.append(ring)
    fm = []
    for j in range(len(rings) - 1):
        A, B = rings[j], rings[j + 1]
        for i in range(seg):
            i1 = (i + 1) % nseg if full else i + 1
            if len(A) == 1 and len(B) == 1:
                continue
            if len(A) == 1:
                f = [A[0], B[i], B[i1]]
            elif len(B) == 1:
                f = [A[i], B[0], A[i1]]
                f = [A[i], A[i1], B[0]][::-1]
                f = [A[i1], A[i], B[0]][::-1]
            else:
                f = [A[i], A[i1], B[i1], B[i]]
            faces.append(f)
            fm.append(face_mat(i, j) if face_mat else 0)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    for k, poly in enumerate(me.polygons):
        poly.material_index = fm[k] if k < len(fm) else 0
    for m in mats:
        me.materials.append(m)
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    link(ob, parent)
    # orient: local Z -> axis, local X -> perpendicular toward 'up' x axis
    Z = hb(Vector(axis)).normalized()
    upb = hb(Vector(up))
    X = upb.cross(Z)
    if X.length < 1e-6:
        X = Vector((1, 0, 0)).cross(Z) if abs(Z.x) < 0.9 else Vector((0, 1, 0)).cross(Z)
    X.normalize()
    Y = Z.cross(X)
    M = Matrix((X, Y, Z)).transposed().to_4x4()
    M.translation = hb(Vector(base))
    ob.matrix_world = M
    # fix normals outward
    me.update()
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    return ob


def bake_world(ob):
    """Put the object's world transform into its mesh; object becomes identity (origin at head origin)."""
    mw = ob.matrix_world.copy()
    ob.data.transform(mw)
    ob.matrix_world = Matrix.Identity(4)
    return ob


def pivot_empty(name, head_pt, parent=None, rot=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.08
    e.location = hb(head_pt)
    if rot is not None:
        e.rotation_euler = rot
    link(e, parent)
    return e


def reparent(ob, new_parent):
    """Re-parent keeping world placement, baking into mesh/local so the parent inverse stays identity."""
    bpy.context.view_layer.update()
    mw = ob.matrix_world.copy()
    pw = new_parent.matrix_world.copy()
    local = pw.inverted() @ mw
    ob.parent = new_parent
    ob.matrix_parent_inverse = Matrix.Identity(4)
    if ob.type == 'MESH' and ob.data.users == 1:
        ob.data.transform(local)
        ob.matrix_basis = Matrix.Identity(4)
    else:
        ob.matrix_basis = local
    return ob


def join(name, objs):
    """Join mesh objects (modifiers applied first) into one."""
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    mats, mindex = [], {}
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.transform(o.matrix_world)
        remap = []
        for m in o.data.materials:
            if m.name not in mindex:
                mindex[m.name] = len(mats)
                mats.append(m)
            remap.append(mindex[m.name])
        tmp = bmesh.new()
        tmp.from_mesh(me)
        for f in tmp.faces:
            f.material_index = remap[f.material_index] if remap else 0
        me2 = bpy.data.meshes.new("tmpjoin")
        tmp.to_mesh(me2)
        tmp.free()
        bm.from_mesh(me2)
        bpy.data.meshes.remove(me2)
        ev.to_mesh_clear()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    parent = objs[0].parent
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    ob = bpy.data.objects.new(name, me)
    link(ob, parent)
    return ob


def mirror_x(ob, name):
    """Duplicate a mesh object mirrored across head x = 0 (Blender X)."""
    me = ob.data.copy()
    me.name = name
    S = Matrix.Scale(-1, 4, Vector((1, 0, 0)))
    me.transform(ob.matrix_world)
    me.transform(S)
    me.flip_normals()
    o2 = bpy.data.objects.new(name, me)
    link(o2, ob.parent)
    if ob.parent is not None and ob.parent != CUR['root']:
        pass
    for md in ob.modifiers:
        n = o2.modifiers.new(md.name, md.type)
        for prop in md.bl_rna.properties:
            if not prop.is_readonly and prop.identifier not in ('name', 'type'):
                try:
                    setattr(n, prop.identifier, getattr(md, prop.identifier))
                except Exception:
                    pass
    return o2


# ---------------------------------------------------------------- stats / export / preview
def tri_count(hid):
    root = bpy.data.objects[hid]
    dg = bpy.context.evaluated_depsgraph_get()
    tot = 0
    per = {}
    for o in root.children_recursive:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        ev.to_mesh_clear()
        per[o.name] = n
        tot += n
    return tot, per


def skull_check(hid, margin=0.0):
    """Report objects with vertices inside the skull ellipsoid (excluding the face region)."""
    root = bpy.data.objects[hid]
    dg = bpy.context.evaluated_depsgraph_get()
    bad = {}
    for o in root.children_recursive:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        mw = o.matrix_world
        worst = 9
        for v in me.vertices:
            p = bh(mw @ v.co)
            d = p - C
            k = math.sqrt((d.x / SKULL.x) ** 2 + (d.y / SKULL.y) ** 2 + (d.z / SKULL.z) ** 2)
            worst = min(worst, k)
        ev.to_mesh_clear()
        if worst < 1.0 + margin:
            bad[o.name] = round(worst, 3)
    return bad


def export(hid):
    import os
    solo(hid)
    root = bpy.data.objects[hid]
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + list(root.children_recursive):
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    path = os.path.join(OUT, hid + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False,
                              export_extras=False)
    return path, os.path.getsize(path)


def verify_glb(hid):
    import os
    path = os.path.join(OUT, hid + ".glb")
    sc = coll("_scratch")
    lc = bpy.context.view_layer.layer_collection.children["_scratch"]
    lc.exclude = False
    bpy.context.view_layer.active_layer_collection = lc
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    mn = Vector((9, 9, 9))
    mx = Vector((-9, -9, -9))
    tris = 0
    names = []
    for o in new:
        names.append(o.name)
        if o.type != 'MESH':
            continue
        tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            for k in range(3):
                mn[k] = min(mn[k], w[k])
                mx[k] = max(mx[k], w[k])
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(sc)
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection
    purge()
    # report in head space
    hmn = (mn.x, mn.z, -mx.y)
    hmx = (mx.x, mx.z, -mn.y)
    return dict(tris=tris, head_min=[round(a, 3) for a in hmn], head_max=[round(a, 3) for a in hmx],
                objects=len(names), size=os.path.getsize(path))


def preview(hid, res=600, path=None):
    import os
    solo(hid)
    sc = bpy.context.scene
    cam = bpy.data.objects.get("cam_preview")
    sc.camera = cam
    # auto-fit: frame the helmet's bounds (plus the face) from a fixed front-3/4 direction
    bpy.context.view_layer.update()
    root = bpy.data.objects[hid]
    mn = Vector((1e9, 1e9, 1e9))
    mx = -mn
    for o in list(root.children_recursive) + [bpy.data.objects["head_ref"]]:
        if o.type != 'MESH':
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            for k in range(3):
                mn[k] = min(mn[k], w[k])
                mx[k] = max(mx[k], w[k])
    ctr = (mn + mx) / 2
    size = max(mx - mn)
    d = Vector((2.6, -4.3, 1.03)).normalized()
    cam.data.lens = 50
    dist = 4.1
    cam.location = ctr + d * dist
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = path or os.path.join(OUT, "preview", hid + ".png")
    bpy.ops.render.render(write_still=True)
    return sc.render.filepath


def path_frames(path, side_hint):
    """Arc-length table + frames along a head-space polyline."""
    P = [Vector(p) for p in path]
    L = [0.0]
    for i in range(1, len(P)):
        L.append(L[-1] + (P[i] - P[i - 1]).length)
    fr = []
    for i in range(len(P)):
        T = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        sh = Vector(side_hint(i / (len(P) - 1)) if callable(side_hint) else side_hint)
        S = (sh - T * sh.dot(T)).normalized()
        N = S.cross(T)
        fr.append((T, S, N))
    return P, L, fr


def bend_along(ob, path, side_hint=(1, 0, 0), y0=None, y1=None, scale=1.0, zscale=1.0, cup=0.0):
    """Map local mesh coords (x side, y along, z normal) onto a head-space path.
    Local y in [y0, y1] spans the full path length; x and z are scaled by `scale` / `zscale`."""
    P, L, fr = path_frames(path, side_hint)
    me = ob.data
    ys = [v.co.y for v in me.vertices]
    y0 = min(ys) if y0 is None else y0
    y1 = max(ys) if y1 is None else y1
    tot = L[-1]
    for v in me.vertices:
        u = clamp((v.co.y - y0) / (y1 - y0), 0, 1) * tot
        k = 0
        while k < len(L) - 2 and L[k + 1] < u:
            k += 1
        seg = max(L[k + 1] - L[k], 1e-9)
        f = clamp((u - L[k]) / seg, 0, 1)
        p = P[k].lerp(P[k + 1], f)
        T = fr[k][0].lerp(fr[k + 1][0], f).normalized()
        S = fr[k][1].lerp(fr[k + 1][1], f).normalized()
        N = S.cross(T).normalized()
        hp = p + S * (v.co.x * scale) + N * (v.co.z * zscale - cup * (v.co.x * scale) ** 2)
        v.co = hb(hp)
    me.update()
    return ob


def bez(p0, p1, p2, p3, n):
    out = []
    for k in range(n + 1):
        t = k / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        out.append(Vector(p0) * a + Vector(p1) * b + Vector(p2) * c + Vector(p3) * d)
    return out


def ring_pts(n, rx, ry=None, cx=0.0, cy=0.0, a0=0.0):
    ry = rx if ry is None else ry
    return [(cx + rx * math.cos(a0 + 2 * PI * k / n), cy + ry * math.sin(a0 + 2 * PI * k / n)) for k in range(n)]


def star_pts(n, r0, r1, a0=PI / 2):
    return [((r1 if k % 2 == 0 else r0) * math.cos(a0 + PI * k / n), (r1 if k % 2 == 0 else r0) * math.sin(a0 + PI * k / n)) for k in range(2 * n)]


def finalize_coll():
    for o in CUR['coll'].objects:
        if o.type == 'MESH' and not any(m.type == 'WEIGHTED_NORMAL' for m in o.modifiers):
            add_wn(o)


SPECIAL = ('glow_', 'blink_', 'pulse_', 'sway_', 'spin_', 'glass_')


def _join(objs, name):
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def consolidate(hid):
    """Apply modifiers and merge parts to keep draw calls low:
    static parts -> <hid>_body, glow_ parts per material -> glow_<hid>_<mat>, children of each sway_/spin_ empty -> one mesh."""
    import contextlib, io
    solo(hid)
    bpy.context.view_layer.update()
    root = bpy.data.objects[hid]
    kids = [o for o in root.children if o.type == 'MESH']
    static = [o for o in kids if not o.name.startswith(SPECIAL)]
    glows = [o for o in kids if o.name.startswith('glow_')]
    _join(static, hid + "_body")
    bym = {}
    for o in glows:
        key = o.data.materials[0].name if o.data.materials else 'x'
        bym.setdefault(key, []).append(o)
    for k, objs in bym.items():
        _join(objs, "glow_%s_%s" % (hid, k.replace('glow_', '').replace(hid + '_', '')))
    for e in [o for o in root.children_recursive if o.type == 'EMPTY' and o.name.startswith(('sway_', 'spin_'))]:
        ch = [o for o in e.children if o.type == 'MESH' and not o.name.startswith(SPECIAL)]
        _join(ch, e.name.split('_', 1)[1] + "_mesh")
    # remaining specials: just apply modifiers
    rest = [o for o in root.children_recursive if o.type == 'MESH' and o.modifiers]
    if rest:
        _join_each = rest
        for o in _join_each:
            bpy.ops.object.select_all(action='DESELECT')
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.convert(target='MESH')
    bpy.ops.object.select_all(action='DESELECT')
    purge()
    return [o.name for o in root.children_recursive]


def ship(hid, res=600):
    """consolidate -> preview -> export -> verify, quietly."""
    import contextlib, io
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        names = consolidate(hid)
        tris = tri_count(hid)[0]
        preview(hid, res)
        path, size = export(hid)
        v = verify_glb(hid)
    return dict(names=names, tris=tris, size=size, verify=v)
