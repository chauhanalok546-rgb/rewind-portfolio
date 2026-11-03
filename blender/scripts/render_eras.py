"""Renders short establishing shots for the five eras (Eevee, stylised, unlit emission colours so they match the film's palette).
Run:  Blender -b --python render_eras.py -- <outdir> [scene1 scene3 ...]   then ffmpeg boomerangs and compresses each clip."""
import bpy, math, random, sys
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0]; ONLY = argv[1:]
W, H, FPS, FRAMES = 960, 540, 24, 72

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.fps = FPS
    sc.frame_start = 1; sc.frame_end = FRAMES; sc.eevee.taa_render_samples = 16
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.new("w"); w.use_nodes = True; sc.world = w
    return sc

def c(hexs):
    h = hexs.lstrip('#'); r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    f = lambda x: x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1)

def emit(name, col, strength=1.0, alpha=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = col; e.inputs[1].default_value = strength
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    if alpha < 1:
        t = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = alpha
        nt.links.new(t.outputs[0], mx.inputs[1]); nt.links.new(e.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], o.inputs[0])
        m.surface_render_method = 'BLENDED'
    else: nt.links.new(e.outputs[0], o.inputs[0])
    return m

def gradient_plane(stops, z=-60, size=400):
    """vertical colour gradient backdrop"""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, z, 20), rotation=(math.pi / 2, 0, 0)); p = bpy.context.object; p.scale = (size, size, 1)
    m = bpy.data.materials.new("sky"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB'); em = nt.nodes.new('ShaderNodeEmission'); o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(tc.outputs['UV'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs[0]); nt.links.new(ramp.outputs[0], em.inputs[0]); nt.links.new(em.outputs[0], o.inputs[0])
    el = ramp.color_ramp.elements
    while len(el) < len(stops): el.new(0.5)
    for i, (pos, col) in enumerate(stops): el[i].position = pos; el[i].color = col
    p.data.materials.append(m); return p

def ridge(name, z, base, amp, col, seed, span=200, steps=120, snow=None):
    """a silhouette ridge: a strip of triangles with a noisy skyline"""
    random.seed(seed); xs = [(-span / 2) + span * i / steps for i in range(steps + 1)]
    ph = [random.uniform(0, 6.28) for _ in range(4)]
    hs = [base + amp * (0.5 * math.sin(x * 0.05 + ph[0]) + 0.3 * math.sin(x * 0.13 + ph[1]) + 0.2 * math.sin(x * 0.31 + ph[2]) + 0.1 * abs(math.sin(x * 0.7 + ph[3]))) for x in xs]
    me = bpy.data.meshes.new(name); verts = []; faces = []
    for i, x in enumerate(xs): verts += [(x, z, -10), (x, z, hs[i])]
    for i in range(steps): faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    me.from_pydata(verts, [], faces); o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.data.materials.append(emit(name, col)); return o

def disc(loc, r, col, strength=1, alpha=1):
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=r, fill_type='NGON', location=loc, rotation=(math.pi / 2, 0, 0))
    o = bpy.context.object; o.data.materials.append(emit("d", col, strength, alpha)); return o

def quad(loc, w, h, mat):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(math.pi / 2, 0, 0)); o = bpy.context.object; o.scale = (w, h, 1); o.data.materials.append(mat); return o

def camera(start, end, lens=35, look=(0, 0, 8)):
    sc = bpy.context.scene
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); bpy.context.collection.objects.link(cam); sc.camera = cam; cam.data.lens = lens
    cam.rotation_euler = (math.pi / 2, 0, math.pi)
    cam.location = start; cam.keyframe_insert('location', frame=1); cam.location = end; cam.keyframe_insert('location', frame=FRAMES)
    for fc in cam.animation_data.action.fcurves if hasattr(cam.animation_data.action, 'fcurves') else []:
        for k in fc.keyframe_points: k.interpolation = 'LINEAR'
    return cam

def drift(o, a, b):
    o.location = a; o.keyframe_insert('location', frame=1); o.location = b; o.keyframe_insert('location', frame=FRAMES)

def dust(n, box, col, strength=1.5, size=(0.06, 0.16), z=(-8, 4), seed=1, dir=(0.0, 0.0, 6.0)):
    random.seed(seed); m = emit("dust", col, strength)
    for _ in range(n):
        x = random.uniform(-box[0], box[0]); y = random.uniform(z[0], z[1]); zz = random.uniform(0, box[1]); s = random.uniform(*size)
        o = quad((x, y, zz), s, s, m); drift(o, (x, y, zz), (x + dir[0] * random.uniform(.5, 1.5), y, zz + dir[2] * random.uniform(.5, 1.5)))

# ---------- the five eras ----------
def scene1():   # 2015 Uttarkashi, golden morning in the mountains
    gradient_plane([(0, c('#f9efe0')), (0.45, c('#ffe6c4')), (1, c('#ffcf9e'))])
    disc((16, -55, 30), 8, c('#fff3d6'), 1.1); disc((16, -56, 30), 13, c('#ffd28a'), 1.0, 0.25)
    for i, (z, base, amp, col) in enumerate([(-50, 14, 12, '#b6c3d6'), (-38, 9, 12, '#8da3c1'), (-26, 5, 10, '#647fa6'), (-14, 1, 8, '#3f5a82')]):
        ridge(f"r{i}", z, base, amp, c(col), 10 + i)
    dust(60, (40, 30), c('#fff4d8'), 2.0, (0.04, 0.1), seed=3, dir=(2, 0, 3))
    camera((-3, 10, 12), (3, 10, 12.4), 30)

def scene2():   # 2023 the school hall: dark room, one warm spotlight, dust
    gradient_plane([(0, c('#0b111c')), (0.55, c('#151f33')), (1, c('#3a4a68'))])
    for i, x in enumerate([-30, -18, -6, 6, 18, 30]): quad((x, -35, 6), 1.2, 22, emit("col", c('#1b2740'), 1))
    cone = quad((9, -20, 14), 22, 40, emit("spot", c('#fff0c8'), 1.4, 0.06)); cone.rotation_euler = (math.pi / 2, math.radians(12), 0)
    disc((12, -19, 0.1), 11, c('#ffe9b5'), 1.0, 0.07).rotation_euler = (0, 0, 0)
    dust(90, (30, 24), c('#fff2cc'), 2.5, (0.04, 0.1), z=(-30, -5), seed=5, dir=(0.6, 0, 1.5))
    camera((-2, 12, 9), (2, 12, 9.4), 32)

def scene3():   # 2024 Dehradun at dusk: skyline, lit windows, road lights
    gradient_plane([(0, c('#d8c9b4')), (0.35, c('#4a5f84')), (1, c('#2a3b5a'))])
    random.seed(21)
    for layer, (z, col, wmax, hmax, glow) in enumerate([(-40, '#243556', 7, 26, 0.3), (-26, '#1b2a46', 6, 20, 0.6), (-14, '#11192b', 5, 14, 1)]):
        x = -80
        while x < 80:
            w = random.uniform(3, wmax); h = random.uniform(5, hmax)
            quad((x + w / 2, z, h / 2 - 2), w, h, emit("b", c(col), 1))
            for _ in range(int(w * h / 14)):
                if random.random() < 0.35: quad((x + random.uniform(0.4, w - 0.4), z + 0.2, random.uniform(-1.5, h - 2.5)), 0.5, 0.6, emit("w", c('#ffb020'), 2.2 * glow))
            x += w + random.uniform(0.2, 1.5)
    quad((0, -8, -2.2), 220, 4, emit("road", c('#11192b'), 1))
    for k in range(10):
        o = quad((-60 + k * 14, -7.6, -1.6), 2.2, 0.35, emit("headlight", c('#ffb020'), 3)); drift(o, (-60 + k * 14, -7.6, -1.6), (-60 + k * 14 + 30, -7.6, -1.6))
    dust(40, (40, 18), c('#ffe6c4'), 1.2, (0.03, 0.07), z=(-20, -5), seed=8, dir=(1.5, 0, 1))
    camera((-3, 10, 7), (3, 10, 7.3), 32)

def scene4():   # 2026 NST: falling code columns, cyan grid
    gradient_plane([(0, c('#070c16')), (0.6, c('#0c1830')), (1, c('#12213a'))])
    random.seed(33); cyan = c('#00b4ff')
    for depth, (z, a, size) in enumerate([(-40, 0.35, 0.5), (-26, 0.6, 0.38), (-14, 1.0, 0.28)]):
        for _ in range(55):
            x = random.uniform(-45, 45); y0 = random.uniform(8, 40); n = random.randint(5, 14)
            for k in range(n):
                zz = y0 - k * size * 2.2; m = emit("code", c('#baf0ff') if k == 0 else cyan, (3 if k == 0 else 1.6) * a * (1 - k / n))
                o = quad((x, z, zz), size * 0.55, size * 1.1, m); drift(o, (x, z, zz), (x, z, zz - 18 * (1 + depth * 0.4)))
    for i in range(-6, 7): quad((i * 12, -45, 0), 0.08, 90, emit("g", cyan, 0.5, 0.4))
    disc((22, -44, 22), 9, c('#ffb020'), 0.6, 0.04)
    camera((-2, 10, 12), (2, 10, 12.2), 32)

def scene5():   # 2030 the future: deep space, drifting stars, two soft nebula glows
    gradient_plane([(0, c('#070c16')), (0.5, c('#0c1630')), (1, c('#16264a'))])
    disc((20, -70, 30), 40, c('#00b4ff'), 0.5, 0.10); disc((-25, -72, 14), 32, c('#ffb020'), 0.5, 0.08)
    random.seed(44)
    for _ in range(420):
        z = random.uniform(-60, -8); s = random.uniform(0.05, 0.22) * (1 + (z + 60) / -60)
        col = random.choice(['#ffffff', '#cfe8ff', '#ffe6bd', '#9fdcff'])
        o = quad((random.uniform(-60, 60), z, random.uniform(-10, 45)), s, s, emit("s", c(col), random.uniform(2, 6)))
        d = random.uniform(1, 5) * (1 + (z + 60) / -30); drift(o, o.location.copy(), (o.location.x + d, o.location.y, o.location.z))
    camera((-4, 10, 18), (4, 10, 18.4), 30)

SCENES = {"scene1": scene1, "scene2": scene2, "scene3": scene3, "scene4": scene4, "scene5": scene5}
for name, fn in SCENES.items():
    if ONLY and name not in ONLY: continue
    sc = reset(); fn()
    sc.render.filepath = f"{OUT}/{name}/f_"; bpy.ops.render.render(animation=True)
    print("rendered", name)
