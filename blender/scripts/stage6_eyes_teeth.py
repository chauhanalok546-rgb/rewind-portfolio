"""Stage 6: real 3D eyes (sclera + iris, skinned to the eye bones), openings cut into the skin through a mask texture,
eyeliner painted around the openings, and teeth + tongue that appear with the mouth opening (morph targets derived from the mouth decal)."""
import bpy, bmesh, math, numpy as np
from mathutils import Vector
S = "/private/tmp/claude-501/-Users-alokchauhan-Documents-timetravel-portfolio/123eee09-8ca3-4ca7-a35c-368a2fe051a4/scratchpad/avatar/"
bpy.ops.wm.open_mainfile(filepath=S + "stage5.blend")
arm = bpy.data.objects['Armature']; body = bpy.data.objects['avaturn_body']; dec = bpy.data.objects['mouth_decal']

def mat(name, col, rough=0.4, tex=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*[c ** 2.2 for c in col], 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = 0
    if tex:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = tex; m.node_tree.links.new(t.outputs['Color'], b.inputs['Base Color'])
    return m

def skin_to(obj, bone):
    obj.parent = arm; vg = obj.vertex_groups.new(name=bone); vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    mo = obj.modifiers.new('Armature', 'ARMATURE'); mo.object = arm
    for p in obj.data.polygons: p.use_smooth = True

def ray_y(x, z):
    ok, loc, n, i = body.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0))); return loc.y if ok else -0.067

# ------------------------------------------------------------------ 1. eyeballs
R = 0.0118; R_IRIS = 0.0058; EYE_Z = 1.7195; EYE_X = 0.035
# iris texture: pupil, golden collarette, brown fibres, dark limbal ring
N = 256; yy, xx = np.mgrid[0:N, 0:N]; u = (xx + 0.5) / N - 0.5; v = (yy + 0.5) / N - 0.5
rr = np.sqrt(u * u + v * v) / 0.5; ang = np.arctan2(v, u); rng = np.random.RandomState(5)
fib = 0.5 + 0.5 * np.sin(ang * 46 + rng.rand(N, N) * 1.2) * (0.6 + 0.4 * np.sin(ang * 9 + 1.0))
sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
inner = np.array([0.20, 0.09, 0.035]); outer = np.array([0.42, 0.24, 0.11]); gold = np.array([0.62, 0.40, 0.17])
col = inner[None, None, :] * (1 - sm(0.3, 0.85, rr))[..., None] + outer[None, None, :] * sm(0.3, 0.85, rr)[..., None]
col = col * (0.72 + 0.5 * fib)[..., None]
col = col + (gold - col) * (np.exp(-((rr - 0.5) ** 2) / 0.004) * 0.45)[..., None]
col = col * (1 - 0.75 * sm(0.80, 0.99, rr))[..., None]
col = col * sm(0.33, 0.40, rr)[..., None] + np.array([0.008, 0.008, 0.010])[None, None, :] * (1 - sm(0.33, 0.40, rr))[..., None]
rgba = np.dstack([np.clip(col, 0, 1), np.ones((N, N))]).astype(np.float32)
iris_img = bpy.data.images.new("iris_tex", N, N, alpha=False); iris_img.pixels = rgba.ravel().tolist()
iris_img.filepath_raw = S + "iris_tex.png"; iris_img.file_format = 'PNG'; iris_img.save()
iris_img = bpy.data.images.load(S + "iris_tex.png"); iris_img.pack()
M_SCL = mat('eye_sclera', (0.93, 0.92, 0.89), 0.28); M_IRIS = mat('eye_iris', (1, 1, 1), 0.3, iris_img)

def build_eye(name, x):
    ys = ray_y(x, EYE_Z); yc = ys + 0.0015 + R                                  # front pole sits 1.5 mm behind the skin plane
    c = Vector((x, yc, EYE_Z))
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=28, radius=R)
    bmesh.ops.translate(bm, verts=bm.verts, vec=c); me = bpy.data.meshes.new(name + '_sclera'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name + '_sclera', me); bpy.context.scene.collection.objects.link(o); me.materials.append(M_SCL); skin_to(o, name)
    # iris: a shallow spherical cap facing front (-Y), planar UVs
    RC = R * 1.006; verts = [c + Vector((0, -RC, 0))]; faces = []; uvs = [(0.5, 0.5)]
    RINGS, SEG = 12, 48
    for r in range(1, RINGS + 1):
        rho = R_IRIS * r / RINGS
        for s in range(SEG):
            a = 2 * math.pi * s / SEG; px, pz = rho * math.cos(a), rho * math.sin(a)
            verts.append(c + Vector((px, -math.sqrt(RC * RC - rho * rho), pz))); uvs.append((0.5 + px / (2 * R_IRIS), 0.5 + pz / (2 * R_IRIS)))
    for s in range(SEG): faces.append((0, 1 + s, 1 + (s + 1) % SEG))
    for r in range(1, RINGS):
        for s in range(SEG):
            a0 = 1 + (r - 1) * SEG + s; a1 = 1 + (r - 1) * SEG + (s + 1) % SEG; b0 = 1 + r * SEG + s; b1 = 1 + r * SEG + (s + 1) % SEG
            faces.append((a0, b0, b1, a1))
    mi = bpy.data.meshes.new(name + '_iris'); mi.from_pydata([tuple(v) for v in verts], [], faces); mi.update()
    uv = mi.uv_layers.new(name='UVMap')
    for lp in mi.loops: uv.data[lp.index].uv = uvs[lp.vertex_index]
    oi = bpy.data.objects.new(name + '_iris', mi); bpy.context.scene.collection.objects.link(oi); mi.materials.append(M_IRIS); skin_to(oi, name)
    return c

centres = {}
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
for bone, x in (('LeftEye', -EYE_X), ('RightEye', EYE_X)): centres[bone] = build_eye(bone, x)
bpy.ops.object.mode_set(mode='EDIT')
for bone, c in centres.items():
    b = arm.data.edit_bones[bone]; b.head = c; b.tail = c + Vector((0, -0.02, 0))        # the eyeball turns about its own centre
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ 2. openings in the skin (mask texture) + eyeliner
AX, AZ = 0.0124, 0.0050
me = body.data; uvl = me.uv_layers.active.data
mat_b = bpy.data.materials['avaturn_body_material']
node = [n for n in mat_b.node_tree.nodes if n.type == 'TEX_IMAGE' and any(l.to_socket.name == 'Base Color' for o in n.outputs for l in o.links)][0]
im = node.image; W1, H1 = im.size; px = np.array(im.pixels[:], dtype=np.float32).reshape(H1, W1, 4)
W2 = 2048; mask = np.ones((W2, W2), np.float32)
def tilt(x, z, cx, cz, sgn):                       # outer corner a little lower than the inner corner
    dx, dz = x - cx, z - cz; t = math.radians(-5 * sgn)
    return dx * math.cos(t) - dz * math.sin(t), dx * math.sin(t) + dz * math.cos(t)
def tri_pixels(uv, W, H):
    x0, x1 = int(max(0, min(u[0] for u in uv) - 1)), int(min(W - 1, max(u[0] for u in uv) + 1)); y0, y1 = int(max(0, min(u[1] for u in uv) - 1)), int(min(H - 1, max(u[1] for u in uv) + 1))
    X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    den = (uv[1][1] - uv[2][1]) * (uv[0][0] - uv[2][0]) + (uv[2][0] - uv[1][0]) * (uv[0][1] - uv[2][1])
    if abs(den) < 1e-9: return None
    l1 = ((uv[1][1] - uv[2][1]) * (X - uv[2][0]) + (uv[2][0] - uv[1][0]) * (Y - uv[2][1])) / den
    l2 = ((uv[2][1] - uv[0][1]) * (X - uv[2][0]) + (uv[0][0] - uv[2][0]) * (Y - uv[2][1])) / den
    l3 = 1 - l1 - l2; m = (l1 >= -0.001) & (l2 >= -0.001) & (l3 >= -0.001)
    return x0, x1, y0, y1, l1, l2, l3, m
for poly in me.polygons:
    vs = [me.vertices[i].co for i in poly.vertices]
    if min(v.y for v in vs) > -0.03 or max(v.z for v in vs) < 1.69 or min(v.z for v in vs) > 1.75 or min(abs(v.x) for v in vs) > 0.07: continue
    loops = [uvl[i].uv for i in poly.loop_indices]
    for k in range(1, len(loops) - 1):
        tri = [0, k, k + 1]; P = [vs[t] for t in tri]
        for (W, H, arr, kind) in ((W2, W2, mask, 'mask'), (W1, H1, px, 'liner')):
            r = tri_pixels([(loops[t].x * W, loops[t].y * H) for t in tri], W, H)
            if r is None: continue
            x0, x1, y0, y1, l1, l2, l3, m = r
            wx = l1 * P[0].x + l2 * P[1].x + l3 * P[2].x; wz = l1 * P[0].z + l2 * P[1].z + l3 * P[2].z
            for sgn in (-1, 1):
                cx = sgn * EYE_X; dx, dz = tilt(wx, wz, cx, EYE_Z, sgn)
                rho = np.sqrt((dx / AX) ** 2 + (dz / AZ) ** 2)
                if kind == 'mask':
                    sub = arr[y0:y1 + 1, x0:x1 + 1]; sub[(rho < 1.0) & m] = 0.0
                else:
                    az_ring = np.where(dz > 0, 1.0, 0.0)                                # thicker lash line on the upper lid
                    ring = np.clip((rho - 0.98) / 0.08, 0, 1) * (1 - np.clip((rho - (1.12 + 0.20 * az_ring)) / 0.10, 0, 1)) * m
                    sub = arr[y0:y1 + 1, x0:x1 + 1]
                    for c3 in range(3): sub[..., c3] = sub[..., c3] * (1 - 0.82 * ring) + 0.02 * 0.82 * ring
# write the mask (white = skin, black = opening) and the painted skin texture
mimg = bpy.data.images.new("eye_mask", W2, W2, alpha=False)
mimg.pixels = np.dstack([mask, mask, mask, np.ones_like(mask)]).astype(np.float32).ravel().tolist()
mimg.filepath_raw = S + "eye_mask.png"; mimg.file_format = 'PNG'; mimg.save()
tmp = bpy.data.images.new("face_liner_tmp", W1, H1, alpha=False); tmp.pixels = px.ravel().tolist()
tmp.filepath_raw = S + "face_liner.png"; tmp.file_format = 'PNG'; tmp.save()
ni = bpy.data.images.load(S + "face_liner.png"); ni.colorspace_settings.name = 'sRGB'; ni.pack(); node.image = ni
print("eye mask opening pixels:", int((mask < 0.5).sum()))

# ------------------------------------------------------------------ 3. teeth + tongue (morph targets that follow the mouth decal)
kb = dec.data.shape_keys.key_blocks; NX, NZ = 11, 5
M_TEETH = mat('teeth', (0.86, 0.83, 0.75), 0.4); M_TONGUE = mat('tongue', (0.70, 0.29, 0.32), 0.45)
def decal_geo(name):
    d = kb[name].data
    top = d[(NZ - 1) * NX + NX // 2].co.z; bot = d[NX // 2].co.z
    return top, bot, abs(d[NX - 1].co.x), d[2 * NX + NX // 2].co.y
NT = 8
def build_cubes(count):
    bm = bmesh.new(); ranges = []
    for i in range(count):
        s = len(bm.verts); g = bmesh.ops.create_cube(bm, size=1.0); ranges.append((s, len(bm.verts)))
    return bm, ranges
bmT, rngT = build_cubes(NT * 2)
P0 = Vector((0, -0.0875, 1.6565))
for v in bmT.verts: v.co = P0
meT = bpy.data.meshes.new('teeth'); bmT.to_mesh(meT)
bmT.free(); oT = bpy.data.objects.new('teeth', meT); bpy.context.scene.collection.objects.link(oT); meT.materials.append(M_TEETH); skin_to(oT, 'Head')
bmG = bmesh.new(); bmesh.ops.create_uvsphere(bmG, u_segments=20, v_segments=12, radius=1.0)
unit = [v.co.copy() for v in bmG.verts]
for v in bmG.verts: v.co = P0
meG = bpy.data.meshes.new('tongue'); bmG.to_mesh(meG); polys_g = len(meG.polygons)
bmG.free(); oG = bpy.data.objects.new('tongue', meG); bpy.context.scene.collection.objects.link(oG); meG.materials.append(M_TONGUE); skin_to(oG, 'Head')
oT.shape_key_add(name='Basis'); oG.shape_key_add(name='Basis')
cube = [Vector((sx * 0.5, sy * 0.5, sz * 0.5)) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
made = 0
for name in [k.name for k in kb if k.name != 'Basis']:
    top, bot, hw, ycen = decal_geo(name); gap = top - bot
    if gap < 0.0012: continue
    mid = (top + bot) / 2; hwt = 0.8 * hw
    skt = oT.shape_key_add(name=name, from_mix=False)
    # build every tooth first from the collapsed point, then place it
    pos = [P0.copy() for _ in range(len(meT.vertices))]
    for part in (0, 1):                                                         # 0 upper row, 1 lower row
        for i in range(NT):
            xs = -hwt + (2 * hwt) * (i + 0.5) / NT; ell = math.sqrt(max(0.0, 1 - (xs / hw) ** 2)); half = gap * ell / 2
            if part == 0: th = min(0.0058, 0.50 * gap * ell); cz = mid + half - th / 2
            else: th = min(0.0040, 0.36 * gap * ell); cz = mid - half + th / 2
            tw = (2 * hwt) / NT * 0.94; td = 0.0016; cy = ycen - 0.0007 + 0.0017 * (xs / hwt) ** 2
            s0, s1 = rngT[part * NT + i]
            for vi, off in zip(range(s0, s1), cube): pos[vi] = Vector((xs + off.x * tw, cy + off.y * td, cz + off.z * th))
    for i, p in enumerate(pos): skt.data[i].co = p
    made += 1
    if gap > 0.006:
        skg = oG.shape_key_add(name=name, from_mix=False)
        cz = bot + 0.40 * gap
        for i, u in enumerate(unit): skg.data[i].co = Vector((u.x * 0.38 * hw, ycen + 0.0004 + u.y * 0.0015, cz + u.z * 0.30 * gap))
print("teeth morph targets:", made)
for o in bpy.data.objects: o.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=S + "stage6.blend")
bpy.ops.export_scene.gltf(filepath=S + "alok_avatar_v4.glb", export_format='GLB', export_image_format='WEBP', export_image_quality=82, export_morph=True, export_skins=True, export_yup=True, export_apply=False, use_selection=False)
print("done")
