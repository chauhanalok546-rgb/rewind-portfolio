"""Shared helpers for the cinematic era renders (Blender 5.x, Eevee). Procedural only: no downloaded assets."""
import bpy, bmesh, math, random, sys, time
import numpy as np
from mathutils import Vector

def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return dict(which=a[0], out=a[1], scale=float(a[2]) if len(a) > 2 else 1.0, frames=int(a[3]) if len(a) > 3 else 72, only_frame=int(a[4]) if len(a) > 4 else 0)

def setattr_safe(o, **kw):
    for k, v in kw.items():
        try: setattr(o, k, v)
        except Exception as e: print("  (skipped %s: %s)" % (k, str(e)[:50]))

def setup(scale=1.0, frames=72):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = int(1920 * scale); sc.render.resolution_y = int(1080 * scale); sc.render.resolution_percentage = 100
    sc.render.fps = 24; sc.frame_start = 1; sc.frame_end = frames
    sc.render.image_settings.file_format = 'PNG'; sc.render.film_transparent = False
    setattr_safe(sc.eevee, taa_render_samples=32, use_raytracing=False, use_shadows=True, shadow_ray_count=2, shadow_step_count=6,
                 volumetric_tile_size='2', volumetric_samples=64, use_volumetric_shadows=True, volumetric_shadow_samples=24, fast_gi_method='GLOBAL_ILLUMINATION')
    try: sc.eevee.ray_tracing_options.resolution_scale = '2'
    except Exception: pass
    for vt, look in (('AgX', 'AgX - Medium High Contrast'), ('AgX', 'Medium High Contrast')):
        try: sc.view_settings.view_transform = vt; sc.view_settings.look = look; break
        except Exception: pass
    setattr_safe(sc.view_settings, exposure=-0.6)
    return sc

def world_sky(sc, elevation=15, rotation=0, density=0.006, air=1.0, dust=1.2, strength=1.0, anis=0.55):
    w = bpy.data.worlds.new("w"); w.use_nodes = True; sc.world = w; nt = w.node_tree; nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'MULTIPLE_SCATTERING'
    setattr_safe(sky, sun_elevation=math.radians(elevation), sun_rotation=math.radians(rotation), air_density=air, dust_density=dust, ozone_density=1.0, sun_disc=True)
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputWorld'); nt.links.new(sky.outputs[0], bg.inputs['Color']); nt.links.new(bg.outputs[0], out.inputs['Surface'])
    if density > 0:
        vs = nt.nodes.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value = density; vs.inputs['Anisotropy'].default_value = anis
        vs.inputs['Color'].default_value = (0.9, 0.93, 1.0, 1); nt.links.new(vs.outputs[0], out.inputs['Volume'])
    return w

def world_flat(sc, color=(0.01, 0.015, 0.03), strength=1.0, density=0.0, vol_color=(0.6, 0.8, 1.0), anis=0.4):
    w = bpy.data.worlds.new("w"); w.use_nodes = True; sc.world = w; nt = w.node_tree; nt.nodes.clear()
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Color'].default_value = (*color, 1); bg.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputWorld'); nt.links.new(bg.outputs[0], out.inputs['Surface'])
    if density > 0:
        vs = nt.nodes.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value = density; vs.inputs['Anisotropy'].default_value = anis
        vs.inputs['Color'].default_value = (*vol_color, 1); nt.links.new(vs.outputs[0], out.inputs['Volume'])
    return w

def mat(name, color, rough=0.5, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0, spec=0.5, objcolor=False, coat=0.0, trans=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    def put(k, v):
        if k in b.inputs: b.inputs[k].default_value = v
    put('Base Color', (*color[:3], 1)); put('Roughness', rough); put('Metallic', metal); put('Alpha', alpha); put('Coat Weight', coat); put('Transmission Weight', trans)
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = spec
    if emit is not None: put('Emission Color', (*emit[:3], 1)); put('Emission Strength', emit_strength)
    if objcolor:                                   # every instance can have its own tint
        oi = nt.nodes.new('ShaderNodeObjectInfo'); mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0; mix.inputs[6].default_value = (*color[:3], 1)
        nt.links.new(oi.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    if alpha < 1.0:
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    return m

def emission(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = (*color[:3], 1); e.inputs['Strength'].default_value = strength
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs['Surface']); return m

def link(o): bpy.context.collection.objects.link(o); return o

def obj_from(name, verts, faces, material=None, smooth=True):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); link(o)
    if material: me.materials.append(material)
    return o

def box(name, size, loc, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if material: o.data.materials.append(material)
    return o

def cyl(name, r, h, loc, material, verts=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=loc, rotation=rot); o = bpy.context.object; o.name = name
    if material: o.data.materials.append(material)
    return o

def sphere(name, r, loc, material, seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=loc); o = bpy.context.object; o.name = name
    for p in o.data.polygons: p.use_smooth = True
    if material: o.data.materials.append(material)
    return o

def sun(strength, color, rot_deg, angle=0.6):
    l = bpy.data.lights.new("sun", 'SUN'); l.energy = strength; l.color = color; l.angle = math.radians(angle)
    o = bpy.data.objects.new("sun", l); link(o); o.rotation_euler = [math.radians(v) for v in rot_deg]; return o

def point(name, loc, strength, color, radius=0.1, kind='POINT'):
    l = bpy.data.lights.new(name, kind); l.energy = strength; l.color = color; setattr_safe(l, shadow_soft_size=radius)
    o = bpy.data.objects.new(name, l); link(o); o.location = loc; return o

def area(name, loc, rot_deg, size, strength, color, shape='RECTANGLE', sy=None):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = strength; l.color = color; l.shape = shape; l.size = size
    if sy: l.size_y = sy
    o = bpy.data.objects.new(name, l); link(o); o.location = loc; o.rotation_euler = [math.radians(v) for v in rot_deg]; return o

def spot(name, loc, rot_deg, strength, color, angle=40, blend=0.4, radius=0.1):
    l = bpy.data.lights.new(name, 'SPOT'); l.energy = strength; l.color = color; l.spot_size = math.radians(angle); l.spot_blend = blend; l.shadow_soft_size = radius
    o = bpy.data.objects.new(name, l); link(o); o.location = loc; o.rotation_euler = [math.radians(v) for v in rot_deg]; return o

def camera(sc, start, end, look_start, look_end, lens=35, fstop=2.8, focus=None, frames=72):
    cd = bpy.data.cameras.new("cam"); cd.lens = lens; cd.clip_start = 0.1; cd.clip_end = 3000
    o = bpy.data.objects.new("cam", cd); link(o); sc.camera = o
    cd.dof.use_dof = fstop > 0
    if fstop > 0: cd.dof.aperture_fstop = fstop
    tgt = bpy.data.objects.new("tgt", None); link(tgt)
    c = o.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    cd.dof.focus_object = tgt if focus is None else None
    if focus is not None: cd.dof.focus_distance = focus
    for f, loc, lk in ((1, start, look_start), (frames, end, look_end)):
        o.location = loc; o.keyframe_insert('location', frame=f); tgt.location = lk; tgt.keyframe_insert('location', frame=f)
    for ob in (o, tgt):
        try:
            for fc in ob.animation_data.action.fcurves:
                for k in fc.keyframe_points: k.interpolation = 'LINEAR'
        except Exception: pass
    return o

# ---------- procedural noise
def _lattice(seed, n=512):
    r = np.random.RandomState(seed); return r.rand(n, n).astype(np.float32)
def value_noise(x, y, seed=1, n=512):
    L = _lattice(seed, n); xi = np.floor(x).astype(int); yi = np.floor(y).astype(int); xf = x - xi; yf = y - yi
    u = xf * xf * (3 - 2 * xf); v = yf * yf * (3 - 2 * yf)
    a = L[yi % n, xi % n]; b = L[yi % n, (xi + 1) % n]; c = L[(yi + 1) % n, xi % n]; d = L[(yi + 1) % n, (xi + 1) % n]
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
def fbm(x, y, oct=5, seed=1, lac=2.0, gain=0.5):
    t = np.zeros_like(x, dtype=np.float32); amp = 0.5; fr = 1.0
    for i in range(oct): t += amp * value_noise(x * fr, y * fr, seed + i); fr *= lac; amp *= gain
    return t
def ridged(x, y, oct=5, seed=1):
    t = np.zeros_like(x, dtype=np.float32); amp = 0.5; fr = 1.0
    for i in range(oct): t += amp * (1 - np.abs(2 * value_noise(x * fr, y * fr, seed + i) - 1)); fr *= 2.1; amp *= 0.5
    return t
def sstep(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def grid_mesh(name, xs, ys, zs, colors=None, material=None):
    nx, ny = len(xs), len(ys); X, Y = np.meshgrid(xs, ys)
    verts = np.stack([X.ravel(), Y.ravel(), zs.ravel()], 1)
    idx = np.arange(nx * ny).reshape(ny, nx)
    faces = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], 1)
    me = bpy.data.meshes.new(name); me.from_pydata(verts.tolist(), [], faces.tolist()); me.update()
    for p in me.polygons: p.use_smooth = True
    if colors is not None:
        ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'POINT'); flat = np.concatenate([colors, np.ones((len(colors), 1))], 1).astype(np.float32).ravel(); ca.data.foreach_set('color', flat)
    o = bpy.data.objects.new(name, me); link(o)
    if material: me.materials.append(material)
    return o

def vertex_color_material(name, rough=0.9, spec=0.2):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'col'; nt.links.new(a.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in b.inputs: b.inputs['Specular IOR Level'].default_value = spec
    return m

def render(sc, out, only_frame=0):
    t0 = time.time()
    if only_frame:
        sc.frame_set(only_frame); sc.render.filepath = out + "_test.png"; bpy.ops.render.render(write_still=True)
    else:
        sc.render.filepath = out + "/f_"; bpy.ops.render.render(animation=True)
    print("RENDER SECONDS", round(time.time() - t0, 1))


def depth_haze(m, haze, y0, y1, glow=0.3, axis=1):
    """atmospheric perspective: the further along `axis` (world Y by default) a surface is, the more it dissolves into the haze colour and picks up a little scattered light"""
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mr = nt.nodes.new('ShaderNodeMapRange')
    nt.links.new(geo.outputs['Position'], sep.inputs[0]); nt.links.new(sep.outputs[axis], mr.inputs['Value'])
    mr.inputs['From Min'].default_value = y0; mr.inputs['From Max'].default_value = y1; mr.clamp = True
    f = mr.outputs['Result']
    # smoother falloff
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 0.8; nt.links.new(f, pw.inputs[0]); f = pw.outputs[0]
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs[7].default_value = (*haze, 1); nt.links.new(f, mix.inputs[0])
    src = b.inputs['Base Color']
    if src.is_linked: nt.links.new(src.links[0].from_socket, mix.inputs[6])
    else: mix.inputs[6].default_value = src.default_value
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    em = nt.nodes.new('ShaderNodeMix'); em.data_type = 'RGBA'; em.inputs[6].default_value = (0, 0, 0, 1); em.inputs[7].default_value = (*haze, 1); nt.links.new(f, em.inputs[0])
    nt.links.new(em.outputs[2], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = glow


def shaft(name, p0, p1, w0, w1, color, strength=1.0):
    """a faked beam of light: a long tapering quad whose glow fades along its length and sideways (no volumetrics needed)"""
    d = Vector(p1) - Vector(p0); L = d.length; d.normalize()
    side = d.cross(Vector((0, 0, 1))); side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
    v = [Vector(p0) - side * w0 / 2, Vector(p0) + side * w0 / 2, Vector(p1) + side * w1 / 2, Vector(p1) - side * w1 / 2]
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(x) for x in v], [], [(0, 1, 2, 3)]); me.update()
    uv = me.uv_layers.new(name='uv'); 
    for i, l in enumerate(me.loops): uv.data[i].uv = [(0, 0), (1, 0), (1, 1), (0, 1)][i]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['UV'], sep.inputs[0])
    # sideways: a soft bell; along: bright at the source, fading out
    sx = nt.nodes.new('ShaderNodeMath'); sx.operation = 'SUBTRACT'; nt.links.new(sep.outputs[0], sx.inputs[0]); sx.inputs[1].default_value = 0.5
    sa = nt.nodes.new('ShaderNodeMath'); sa.operation = 'ABSOLUTE'; nt.links.new(sx.outputs[0], sa.inputs[0])
    sm = nt.nodes.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; sm.inputs[1].default_value = 2.0; nt.links.new(sa.outputs[0], sm.inputs[0])
    si = nt.nodes.new('ShaderNodeMath'); si.operation = 'SUBTRACT'; si.inputs[0].default_value = 1.0; nt.links.new(sm.outputs[0], si.inputs[1])
    sp = nt.nodes.new('ShaderNodeMath'); sp.operation = 'POWER'; sp.inputs[1].default_value = 1.8; nt.links.new(si.outputs[0], sp.inputs[0])
    la = nt.nodes.new('ShaderNodeMath'); la.operation = 'SUBTRACT'; la.inputs[0].default_value = 1.0; nt.links.new(sep.outputs[1], la.inputs[1])
    lp = nt.nodes.new('ShaderNodeMath'); lp.operation = 'POWER'; lp.inputs[1].default_value = 1.3; nt.links.new(la.outputs[0], lp.inputs[0])
    al = nt.nodes.new('ShaderNodeMath'); al.operation = 'MULTIPLY'; nt.links.new(sp.outputs[0], al.inputs[0]); nt.links.new(lp.outputs[0], al.inputs[1])
    al2 = nt.nodes.new('ShaderNodeMath'); al2.operation = 'MULTIPLY'; al2.inputs[1].default_value = 0.35 * strength; nt.links.new(al.outputs[0], al2.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = 2.0
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(al2.outputs[0], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    try: m.use_transparency_overlap = False; m.shadow_method = 'NONE'
    except Exception: pass
    me.materials.append(m); o = bpy.data.objects.new(name, me); link(o)
    try: o.visible_shadow = False
    except Exception: pass
    return o

def dust(n, box, color=(1, 0.9, 0.7), strength=8, size=0.03, seed=2):
    random.seed(seed); m = emission("dust", color, strength); me = None
    bpy.ops.mesh.primitive_ico_sphere_add(radius=size, subdivisions=1, location=(0, 0, -100)); base = bpy.context.object; base.data.materials.append(m)
    for i in range(n):
        o = bpy.data.objects.new("d", base.data); link(o)
        o.location = (random.uniform(*box[0]), random.uniform(*box[1]), random.uniform(*box[2])); s = random.uniform(0.5, 1.8); o.scale = (s, s, s)
    return base
